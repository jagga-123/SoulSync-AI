import "../helpers/setup-env";
import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import sharp from "sharp";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

const jpeg = (width: number, height: number) => sharp({ create: { width, height, channels: 3, background: { r: 200, g: 80, b: 120 } } }).jpeg().toBuffer();

describe("self-service account deletion (local storage)", () => {
  let h: Harness;
  let dir: string;

  before(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "soulsync-delete-"));
    h = await startHarness({ env: { LOCAL_UPLOADS: "on", UPLOAD_DIR: dir } });
  });
  after(async () => {
    await h.stop();
    await rm(dir, { recursive: true, force: true });
  });

  const filesOf = (user: TestUser) => readdir(path.join(dir, "profiles", user.id)).catch(() => [] as string[]);

  it("requires authentication", async () => {
    const res = await h.api.post("/account/delete", { password: "Passw0rd!23", confirm: "DELETE" });
    assert.equal(res.status, 401);
  });

  it("requires the literal word DELETE to confirm", async () => {
    const user = await h.createUser({ name: "Careless Cara" });
    const res = await h.api.post("/account/delete", { password: "Passw0rd!23", confirm: "delete" }, { token: user.token });
    assert.equal(res.status, 422);
    assert.equal((await h.api.get("/auth/me", { token: user.token })).status, 200, "account untouched");
  });

  it("rejects the wrong password without deleting anything", async () => {
    const user = await h.createUser({ name: "Careful Farah" });
    const res = await h.api.post("/account/delete", { password: "NotMyPassword1!", confirm: "DELETE" }, { token: user.token });
    assert.equal(res.status, 400);
    assert.equal((await h.api.get("/auth/me", { token: user.token })).status, 200, "account untouched");
  });

  it("blocks an admin from self-deleting (demote first, same rule as moderation)", async () => {
    const admin = await h.makeAdmin(await h.createUser({ name: "Root Admin" }));
    const res = await h.api.post("/account/delete", { password: "Passw0rd!23", confirm: "DELETE" }, { token: admin.token });
    assert.equal(res.status, 403);
  });

  it("deletes the account, its photo, and everything tied to it — and signs the caller out", async () => {
    const ada = await h.createUser({ name: "Ada Deletes", profile: true });
    const bea = await h.createUser({ name: "Bea Stays", profile: true });
    const { matchId } = await h.makeMatch(ada, bea);
    const conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: ada.token })).body.data.conversation.id;
    const sent = await h.api.post("/messages/send", { conversationId, content: "hi Bea" }, { token: ada.token });
    assert.equal(sent.status, 201);

    const upload = await h.api.post("/uploads/profile-photo", undefined, { token: ada.token, raw: await jpeg(300, 300), headers: { "Content-Type": "image/jpeg" } });
    assert.equal(upload.status, 201);
    assert.equal((await filesOf(ada)).length, 2, "full image + thumbnail written to disk");
    await h.api.put("/profile", { profileImage: upload.body.data.url }, { token: ada.token });

    const del = await h.api.post("/account/delete", { password: "Passw0rd!23", confirm: "DELETE" }, { token: ada.token });
    assert.equal(del.status, 200);

    // Signed out immediately: the token that just deleted the account no longer works.
    assert.equal((await h.api.get("/auth/me", { token: ada.token })).status, 401);
    assert.equal((await h.api.post("/auth/login", { email: ada.email, password: "Passw0rd!23" })).status, 401);

    // The photo is gone from disk...
    assert.equal((await filesOf(ada)).length, 0);
    // ...and so is everything the cascade is responsible for.
    const [{ User }, { Profile }, { Match }, { Conversation }, { Message }] = await Promise.all([
      h.load("../../src/models/User.model"),
      h.load("../../src/models/Profile.model"),
      h.load("../../src/models/Match.model"),
      h.load("../../src/models/Conversation.model"),
      h.load("../../src/models/Message.model"),
    ]);
    assert.equal(await User.findById(ada.id), null);
    assert.equal(await Profile.findOne({ userId: ada.id }), null);
    assert.equal(await Match.findOne({ $or: [{ userOne: ada.id }, { userTwo: ada.id }] }), null);
    assert.equal(await Conversation.findById(conversationId), null, "the conversation is gone");
    assert.equal(await Message.findOne({ conversationId }), null, "its messages are gone too");

    // Bea is untouched — still a real, signed-in account.
    assert.equal((await h.api.get("/auth/me", { token: bea.token })).status, 200);
  });
});
