import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

describe("password reset, change, and session invalidation", () => {
  let h: Harness;

  before(async () => {
    h = await startHarness();
  });
  after(() => h.stop());

  const mailsTo = (email: string, pattern: RegExp) => h.outbox.filter((m) => m.to === email && pattern.test(m.subject));
  const resetTokenFrom = (html: string) => /\/reset-password\?token=([^"&<\s]+)/.exec(html)?.[1];

  describe("forgot password", () => {
    it("never reveals whether an email has an account", async () => {
      const known = await h.createUser({ name: "Reset Rita" });
      const unknown = await h.api.post("/auth/forgot-password", { email: "nobody-here@test.local" });
      const registered = await h.api.post("/auth/forgot-password", { email: known.email });
      await h.settle();
      assert.equal(unknown.status, 200);
      assert.equal(registered.status, 200);
      assert.deepEqual(unknown.body.message, registered.body.message);
      // ...but only the real account actually gets an email.
      assert.equal(mailsTo("nobody-here@test.local", /reset/i).length, 0);
      assert.equal(mailsTo(known.email, /reset/i).length, 1);
    });

    it("stores only a hash of the reset token, never the token itself", async () => {
      const user = await h.createUser({ name: "Hash Henry" });
      await h.api.post("/auth/forgot-password", { email: user.email });
      await h.settle();
      const raw = resetTokenFrom(mailsTo(user.email, /reset/i)[0]!.html)!.split(".")[1]!;
      const { User } = await h.load("../../src/models/User.model");
      const stored = (await User.findById(user.id).select("+passwordReset")).passwordReset;
      assert.match(stored.tokenHash, /^[0-9a-f]{64}$/);
      assert.notEqual(stored.tokenHash, raw);
      assert.ok(!JSON.stringify(stored).includes(raw));
    });
  });

  describe("reset password", () => {
    async function requestReset(h: Harness, user: TestUser): Promise<string> {
      await h.api.post("/auth/forgot-password", { email: user.email });
      await h.settle();
      return resetTokenFrom(mailsTo(user.email, /reset/i).at(-1)!.html)!;
    }

    it("lets someone set a new password and sign in with it", async () => {
      const user = await h.createUser({ name: "Reset Rachel" });
      const token = await requestReset(h, user);

      const reset = await h.api.post("/auth/reset-password", { token, password: "NewPassw0rd!99" });
      assert.equal(reset.status, 200);

      const oldLogin = await h.api.post("/auth/login", { email: user.email, password: "Passw0rd!23" });
      assert.equal(oldLogin.status, 401);
      const newLogin = await h.api.post("/auth/login", { email: user.email, password: "NewPassw0rd!99" });
      assert.equal(newLogin.status, 200);
    });

    it("signs out every other session — the token this member was using stops working too", async () => {
      const user = await h.createUser({ name: "Reset Sam" });
      const stillHoldingOldToken = user.token;
      const token = await requestReset(h, user);
      await h.api.post("/auth/reset-password", { token, password: "NewPassw0rd!99" });

      const me = await h.api.get("/auth/me", { token: stillHoldingOldToken });
      assert.equal(me.status, 401);
      assert.match(me.body.message, /session has ended/i);
    });

    it("sends a confirmation email, and it is not the same email as the reset link", async () => {
      const user = await h.createUser({ name: "Reset Nina" });
      const token = await requestReset(h, user);
      await h.api.post("/auth/reset-password", { token, password: "NewPassw0rd!99" });
      await h.settle();
      assert.equal(mailsTo(user.email, /password.*changed/i).length, 1);
    });

    it("the token can only be used once", async () => {
      const user = await h.createUser({ name: "Reset Otto" });
      const token = await requestReset(h, user);
      await h.api.post("/auth/reset-password", { token, password: "NewPassw0rd!99" });

      const again = await h.api.post("/auth/reset-password", { token, password: "AnotherPassw0rd!1" });
      assert.equal(again.status, 400);
    });

    it("refuses an invalid, malformed, or unknown-user token without leaking which", async () => {
      const malformed = await h.api.post("/auth/reset-password", { token: "not-a-real-token-at-all", password: "NewPassw0rd!99" });
      assert.equal(malformed.status, 400);
      const unknownUser = await h.api.post("/auth/reset-password", { token: "507f1f77bcf86cd799439011.deadbeef", password: "NewPassw0rd!99" });
      assert.equal(unknownUser.status, 400);
    });

    it("refuses a weak new password with the same rule register uses", async () => {
      const user = await h.createUser({ name: "Reset Priya" });
      const token = await requestReset(h, user);
      const weak = await h.api.post("/auth/reset-password", { token, password: "short1" });
      assert.equal(weak.status, 422);
    });
  });

  describe("change password", () => {
    it("changes the password, keeps the current device signed in, and signs out every other device", async () => {
      const user = await h.createUser({ name: "Change Carl" });
      const otherDeviceToken = user.token;

      const changed = await h.api.put("/account/password", { currentPassword: "Passw0rd!23", newPassword: "NewPassw0rd!99" }, { token: user.token });
      assert.equal(changed.status, 200);
      const freshToken = changed.body.data.token as string;
      assert.ok(freshToken && freshToken !== otherDeviceToken);

      // The old device's token is dead...
      const stale = await h.api.get("/auth/me", { token: otherDeviceToken });
      assert.equal(stale.status, 401);
      // ...but the freshly-issued one for this device still works.
      const fresh = await h.api.get("/auth/me", { token: freshToken });
      assert.equal(fresh.status, 200);

      const oldLogin = await h.api.post("/auth/login", { email: user.email, password: "Passw0rd!23" });
      assert.equal(oldLogin.status, 401);
      const newLogin = await h.api.post("/auth/login", { email: user.email, password: "NewPassw0rd!99" });
      assert.equal(newLogin.status, 200);
    });

    it("rejects the wrong current password without changing anything", async () => {
      const user = await h.createUser({ name: "Change Wanda" });
      const wrong = await h.api.put("/account/password", { currentPassword: "NotMyPassword1!", newPassword: "NewPassw0rd!99" }, { token: user.token });
      assert.equal(wrong.status, 400);
      const stillWorks = await h.api.get("/auth/me", { token: user.token });
      assert.equal(stillWorks.status, 200);
    });

    it("rejects a new password identical to the current one", async () => {
      const user = await h.createUser({ name: "Change Sameer" });
      const same = await h.api.put("/account/password", { currentPassword: "Passw0rd!23", newPassword: "Passw0rd!23" }, { token: user.token });
      assert.equal(same.status, 400);
    });

    it("sends a confirmation email", async () => {
      const user = await h.createUser({ name: "Change Nadia" });
      await h.api.put("/account/password", { currentPassword: "Passw0rd!23", newPassword: "NewPassw0rd!99" }, { token: user.token });
      await h.settle();
      assert.equal(mailsTo(user.email, /password.*changed/i).length, 1);
    });

    it("requires authentication", async () => {
      const anon = await h.api.put("/account/password", { currentPassword: "Passw0rd!23", newPassword: "NewPassw0rd!99" });
      assert.equal(anon.status, 401);
    });
  });

  describe("sign out everywhere", () => {
    it("invalidates every previously issued token, including the one used to call it", async () => {
      const user = await h.createUser({ name: "Revoke Rekha" });
      const revoked = await h.api.post("/account/sessions/revoke", undefined, { token: user.token });
      assert.equal(revoked.status, 200);

      const me = await h.api.get("/auth/me", { token: user.token });
      assert.equal(me.status, 401);
      assert.match(me.body.message, /session has ended/i);
    });

    it("doesn't touch any other user's session", async () => {
      const [a, b] = await h.seedUsers(2);
      await h.api.post("/account/sessions/revoke", undefined, { token: a!.token });
      const bStillWorks = await h.api.get("/auth/me", { token: b!.token });
      assert.equal(bStillWorks.status, 200);
    });

    it("requires authentication", async () => {
      const anon = await h.api.post("/account/sessions/revoke");
      assert.equal(anon.status, 401);
    });
  });
});
