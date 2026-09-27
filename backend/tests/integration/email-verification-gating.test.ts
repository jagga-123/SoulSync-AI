import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness } from "../helpers/harness";

describe("email verification gating", () => {
  let h: Harness;

  before(async () => {
    h = await startHarness();
  });
  after(() => h.stop());

  describe("actions that reach another member", () => {
    it("blocks an unverified member from sending a like", async () => {
      const sender = await h.createUser({ name: "Unverified Ivan", profile: true, verified: false });
      const target = await h.createUser({ name: "Target Tara", profile: true });
      const res = await h.api.post(`/likes/send/${target.id}`, undefined, { token: sender.token });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "EMAIL_NOT_VERIFIED");
    });

    it("blocks an unverified member from starting a conversation, even on a real match", async () => {
      const a = await h.createUser({ name: "Match Mia", profile: true });
      const b = await h.createUser({ name: "Match Milo", profile: true, verified: false });
      const { matchId } = await h.makeMatch(a, b);
      const res = await h.api.post(`/conversations/start/${matchId}`, undefined, { token: b.token });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "EMAIL_NOT_VERIFIED");
    });

    it("blocks an unverified member from sending a message over the REST API", async () => {
      const [a, b] = await h.seedUsers(2, { profile: true });
      const { matchId } = await h.makeMatch(a!, b!);
      const conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: a!.token })).body.data.conversation.id;
      const { User } = await h.load("../../src/models/User.model");
      await User.updateOne({ _id: a!.id }, { $set: { emailVerified: false } });

      const res = await h.api.post("/messages/send", { conversationId, content: "hi" }, { token: a!.token });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "EMAIL_NOT_VERIFIED");
    });

    it("also blocks it over the socket path, which bypasses the REST route entirely", async () => {
      const [a, b] = await h.seedUsers(2, { profile: true });
      const { matchId } = await h.makeMatch(a!, b!);
      const conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: a!.token })).body.data.conversation.id;
      const { User } = await h.load("../../src/models/User.model");
      await User.updateOne({ _id: a!.id }, { $set: { emailVerified: false } });

      const socket = await h.connectSocket(a!.token);
      const ack = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        socket.emit("send_message", { conversationId, content: "hi" }, resolve);
      });
      assert.equal(ack.success, false);
      assert.match(ack.error ?? "", /verify your email/i);
    });

    it("a verified member is unaffected: can like, start a conversation, and message on both REST and socket", async () => {
      const [a, b] = await h.seedUsers(2, { profile: true });
      const like = await h.api.post(`/likes/send/${b!.id}`, undefined, { token: a!.token });
      assert.equal(like.status, 201);
      const incoming = await h.api.get("/likes/incoming", { token: b!.token });
      const accepted = await h.api.post(`/likes/accept/${incoming.body.data.likes[0].likeId}`, undefined, { token: b!.token });
      const matchId = accepted.body.data.match.matchId;

      const started = await h.api.post(`/conversations/start/${matchId}`, undefined, { token: a!.token });
      assert.equal(started.status, 200);
      const conversationId = started.body.data.conversation.id;
      assert.equal((await h.api.post("/messages/send", { conversationId, content: "hi" }, { token: a!.token })).status, 201);

      const socket = await h.connectSocket(a!.token);
      const ack = await new Promise<{ success: boolean }>((resolve) => socket.emit("send_message", { conversationId, content: "hi again" }, resolve));
      assert.equal(ack.success, true);
    });
  });

  describe("visibility", () => {
    it("Discover never shows an unverified member", async () => {
      const viewer = await h.createUser({ name: "Viewer Vik", profile: true });
      const unverified = await h.createUser({ name: "Hidden Hana", profile: true, verified: false });
      const res = await h.api.get("/discover", { token: viewer.token });
      const ids = (res.body.data.users as Array<{ id: string }>).map((u) => u.id);
      assert.ok(!ids.includes(unverified.id));
    });

    it("AI recommendations never suggest an unverified member", async () => {
      const viewer = await h.createUser({ name: "Viewer Val", profile: true });
      await h.completeInterview(viewer);
      await h.seedUsers(3, { profile: true, aiProfile: true, prefix: "Candidate" });
      const [unverifiedCandidate] = await h.seedUsers(1, { profile: true, aiProfile: true, prefix: "Hidden", verified: false });

      const res = await h.api.get("/ai/recommendations", { token: viewer.token });
      const ids = (res.body.data.recommendations as Array<{ user: { id: string } }>).map((r) => r.user.id);
      assert.ok(!ids.includes(unverifiedCandidate!.id));
    });
  });
});
