import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness } from "../helpers/harness";

describe("hide profile (discoverability)", () => {
  let h: Harness;

  before(async () => {
    h = await startHarness();
  });
  after(() => h.stop());

  const hide = (token: string) => h.api.put("/account/settings", { privacy: { discoverable: false } }, { token });
  const show = (token: string) => h.api.put("/account/settings", { privacy: { discoverable: true } }, { token });

  it("defaults to discoverable, and the toggle round-trips through GET/PUT settings", async () => {
    const user = await h.createUser({ name: "Default Dana", profile: true });
    const initial = await h.api.get("/account/settings", { token: user.token });
    assert.equal(initial.body.data.settings.privacy.discoverable, true);

    const hidden = await hide(user.token);
    assert.equal(hidden.status, 200);
    assert.equal(hidden.body.data.settings.privacy.discoverable, false);

    const shown = await show(user.token);
    assert.equal(shown.body.data.settings.privacy.discoverable, true);
  });

  it("a hidden account never appears in Discover", async () => {
    const viewer = await h.createUser({ name: "Viewer Vik", profile: true });
    const target = await h.createUser({ name: "Hiding Hana", profile: true });
    await hide(target.token);

    const res = await h.api.get("/discover", { token: viewer.token });
    const ids = (res.body.data.users as Array<{ id: string }>).map((u) => u.id);
    assert.ok(!ids.includes(target.id));
  });

  it("a hidden account never appears in AI recommendations", async () => {
    const viewer = await h.createUser({ name: "Viewer Vlad", profile: true });
    await h.completeInterview(viewer);
    const [candidate] = await h.seedUsers(1, { profile: true, aiProfile: true, prefix: "Hidden" });
    const { UserSettings } = await h.load("../../src/models/UserSettings.model");
    await UserSettings.findOneAndUpdate({ userId: candidate!.id }, { $set: { "privacy.discoverable": false } }, { upsert: true });

    const res = await h.api.get("/ai/recommendations", { token: viewer.token });
    const ids = (res.body.data.recommendations as Array<{ user: { id: string } }>).map((r) => r.user.id);
    assert.ok(!ids.includes(candidate!.id));
  });

  it("a hidden account cannot receive a new like — same response as a nonexistent user", async () => {
    const sender = await h.createUser({ name: "Sender Sam", profile: true });
    const target = await h.createUser({ name: "Hiding Hugo", profile: true });
    await hide(target.token);

    const likeHidden = await h.api.post(`/likes/send/${target.id}`, undefined, { token: sender.token });
    const likeNonexistent = await h.api.post(`/likes/send/${"5f".repeat(12)}`, undefined, { token: sender.token });
    assert.equal(likeHidden.status, 404);
    assert.equal(likeHidden.status, likeNonexistent.status);
    assert.equal(likeHidden.body.message, likeNonexistent.body.message, "doesn't leak that the account exists but is hidden");
  });

  it("existing matches and conversations keep working after one party hides", async () => {
    const a = await h.createUser({ name: "Match Mona", profile: true });
    const b = await h.createUser({ name: "Match Bo", profile: true });
    const { matchId } = await h.makeMatch(a, b);
    const conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: a.token })).body.data.conversation.id;

    await hide(b.token);

    // The match and the conversation are both still fully usable on both sides.
    const matches = await h.api.get("/matches", { token: a.token });
    assert.ok((matches.body.data.matches as Array<{ matchId: string }>).some((m) => m.matchId === matchId));
    const sent = await h.api.post("/messages/send", { conversationId, content: "still here" }, { token: b.token });
    assert.equal(sent.status, 201);
    const reply = await h.api.post("/messages/send", { conversationId, content: "me too" }, { token: a.token });
    assert.equal(reply.status, 201);
  });

  it("re-enabling visibility restores discoverability immediately", async () => {
    const viewer = await h.createUser({ name: "Viewer Vera", profile: true });
    const target = await h.createUser({ name: "Toggle Tara", profile: true });
    await hide(target.token);
    assert.ok(!(await h.api.get("/discover", { token: viewer.token })).body.data.users.some((u: { id: string }) => u.id === target.id));

    await show(target.token);
    const after = await h.api.get("/discover", { token: viewer.token });
    assert.ok((after.body.data.users as Array<{ id: string }>).some((u) => u.id === target.id));
  });
});
