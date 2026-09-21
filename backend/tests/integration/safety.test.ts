import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

describe("safety: blocking, reporting and moderation", () => {
  let h: Harness;
  let admin: TestUser;

  before(async () => {
    h = await startHarness();
    admin = await h.makeAdmin(await h.createUser({ name: "Moderator Mo", profile: true }));
  });
  after(() => h.stop());

  const ids = (users: Array<{ id: string }>) => users.map((u) => u.id);

  describe("blocking", () => {
    let me: TestUser;
    let blocked: TestUser;
    let bystander: TestUser;

    before(async () => {
      me = await h.createUser({ name: "Blocker Bea", profile: true });
      blocked = await h.createUser({ name: "Blocked Ben", profile: true });
      bystander = await h.createUser({ name: "Bystander Bo", profile: true });
    });

    it("blocks someone, listing them, and idempotently", async () => {
      assert.equal((await h.api.post("/safety/blocks", { userId: blocked.id }, { token: me.token })).status, 200);
      assert.equal((await h.api.post("/safety/blocks", { userId: blocked.id }, { token: me.token })).status, 200, "blocking twice is fine");

      const list = await h.api.get("/safety/blocks", { token: me.token });
      assert.equal(list.body.data.blocks.length, 1);
      assert.equal(list.body.data.blocks[0].user.id, blocked.id);
      assert.equal((await h.api.get("/safety/blocks", { token: blocked.token })).body.data.blocks.length, 0, "the blocked person sees nothing");
    });

    it("validates who can be blocked", async () => {
      assert.equal((await h.api.post("/safety/blocks", { userId: me.id }, { token: me.token })).status, 400);
      assert.equal((await h.api.post("/safety/blocks", { userId: "5f".repeat(12) }, { token: me.token })).status, 404);
      assert.equal((await h.api.post("/safety/blocks", { userId: "nope" }, { token: me.token })).status, 422);
      assert.equal((await h.api.post("/safety/blocks", { userId: blocked.id })).status, 401);
    });

    it("hides each side from the other in Discover and recommendations", async () => {
      await h.seedUsers(0);
      for (const [viewer, hidden] of [[me, blocked], [blocked, me]] as const) {
        const discover = await h.api.get("/discover?limit=50", { token: viewer.token });
        assert.ok(!ids(discover.body.data.users).includes(hidden.id), "blocked pair must not see each other in Discover");
      }
      const seen = await h.api.get("/discover?limit=50", { token: bystander.token });
      assert.ok(ids(seen.body.data.users).includes(me.id) && ids(seen.body.data.users).includes(blocked.id), "third parties are unaffected");
    });

    it("hides them from AI recommendations too", async () => {
      const [a, b] = await h.seedUsers(2, { profile: true, aiProfile: true, prefix: "Rec" });
      const viewer = await h.createUser({ name: "Rec Viewer", profile: true });
      await h.completeInterview(viewer);
      const before = await h.api.get("/ai/recommendations?limit=30", { token: viewer.token });
      assert.ok(ids(before.body.data.recommendations.map((r: { user: { id: string } }) => r.user)).includes(a!.id));

      await h.api.post("/safety/blocks", { userId: a!.id }, { token: viewer.token });
      await h.api.post("/safety/blocks", { userId: viewer.id }, { token: b!.token }); // blocked *by* them
      const after = await h.api.get("/ai/recommendations?limit=30", { token: viewer.token });
      const shown = ids(after.body.data.recommendations.map((r: { user: { id: string } }) => r.user));
      assert.ok(!shown.includes(a!.id) && !shown.includes(b!.id), "both directions are hidden");
    });

    it("stops likes in both directions with a neutral error that doesn't reveal who blocked whom", async () => {
      const fromBlocker = await h.api.post(`/likes/send/${blocked.id}`, undefined, { token: me.token });
      const fromBlocked = await h.api.post(`/likes/send/${me.id}`, undefined, { token: blocked.token });
      for (const res of [fromBlocker, fromBlocked]) {
        assert.equal(res.status, 403);
        assert.equal(res.body.error.code, "BLOCKED");
      }
      assert.equal(fromBlocker.body.message, fromBlocked.body.message, "same wording either way");
      assert.doesNotMatch(JSON.stringify(fromBlocked.body), /blocked (you|by)/i);
    });

    it("ends an existing chat and hides the match from both sides", async () => {
      const [x, y] = [await h.createUser({ name: "Xena Chat", profile: true }), await h.createUser({ name: "Yuri Chat", profile: true })];
      const { matchId } = await h.makeMatch(x, y);
      const conversation = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: x.token })).body.data.conversation;
      assert.equal((await h.api.post("/messages/send", { conversationId: conversation.id, content: "hello" }, { token: x.token })).status, 201);
      assert.ok(ids((await h.api.get("/matches", { token: y.token })).body.data.matches.map((m: { user: { id: string } }) => m.user)).includes(x.id));

      await h.api.post("/safety/blocks", { userId: x.id }, { token: y.token });

      const sent = await h.api.post("/messages/send", { conversationId: conversation.id, content: "still there?" }, { token: x.token });
      assert.equal(sent.status, 403);
      assert.equal(sent.body.error.code, "BLOCKED");
      assert.equal((await h.api.post("/messages/send", { conversationId: conversation.id, content: "hey" }, { token: y.token })).status, 403);
      assert.equal((await h.api.post(`/conversations/start/${matchId}`, undefined, { token: x.token })).status, 403);

      for (const [viewer, other] of [[x, y], [y, x]] as const) {
        const matches = (await h.api.get("/matches", { token: viewer.token })).body.data.matches;
        assert.ok(!matches.some((m: { user: { id: string } }) => m.user.id === other.id));
        const conversations = (await h.api.get("/conversations", { token: viewer.token })).body.data.conversations;
        assert.ok(!conversations.some((c: { otherUser: { id: string } }) => c.otherUser?.id === other.id), "no conversation with a blocked person");
      }
    });

    it("suppresses profile-view notifications from a blocked viewer", async () => {
      const res = await h.api.post(`/growth/profile-views/${me.id}`, undefined, { token: blocked.token });
      assert.equal(res.body.data.recorded, false);
    });

    it("unblocking restores everything", async () => {
      assert.equal((await h.api.del(`/safety/blocks/${blocked.id}`, { token: me.token })).status, 200);
      assert.equal((await h.api.get("/safety/blocks", { token: me.token })).body.data.blocks.length, 0);
      const discover = await h.api.get("/discover?limit=50", { token: me.token });
      assert.ok(ids(discover.body.data.users).includes(blocked.id));
      assert.equal((await h.api.post(`/likes/send/${blocked.id}`, undefined, { token: me.token })).status, 201);
      assert.equal((await h.api.del(`/safety/blocks/${blocked.id}`, { token: me.token })).status, 200, "unblocking twice is fine");
    });

    it("can be switched off with the blocking flag", async () => {
      await h.setFlag("blocking", false);
      const res = await h.api.post("/safety/blocks", { userId: bystander.id }, { token: me.token });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, "FEATURE_DISABLED");
      await h.setFlag("blocking", true);
    });
  });

  describe("reporting", () => {
    let reporter: TestUser;
    let offender: TestUser;
    let conversationId: string;
    let offendingMessageId: string;

    before(async () => {
      reporter = await h.createUser({ name: "Reporter Ray", profile: true });
      offender = await h.createUser({ name: "Offender Oz", profile: true });
      const { matchId } = await h.makeMatch(reporter, offender);
      conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: reporter.token })).body.data.conversation.id;
      const sent = await h.api.post("/messages/send", { conversationId, content: "send me your bank details" }, { token: offender.token });
      offendingMessageId = sent.body.data.message.id;
    });

    it("validates the report", async () => {
      const send = (body: object) => h.api.post("/safety/reports", body, { token: reporter.token });
      assert.equal((await send({ userId: offender.id, reason: "not-a-reason" })).status, 422);
      assert.equal((await send({ userId: offender.id, reason: "scam", details: "x".repeat(1001) })).status, 422);
      assert.equal((await send({ userId: reporter.id, reason: "spam" })).status, 400, "no self-reports");
      assert.equal((await send({ userId: "5f".repeat(12), reason: "spam" })).status, 404);
      assert.equal((await h.api.post("/safety/reports", { userId: offender.id, reason: "spam" })).status, 401);
    });

    it("rejects context that doesn't belong to the two people involved", async () => {
      const [p, q] = [await h.createUser({ name: "Pia Other", profile: true }), await h.createUser({ name: "Quin Other", profile: true })];
      const { matchId } = await h.makeMatch(p, q);
      const foreign = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: p.token })).body.data.conversation.id;
      const wrongConversation = await h.api.post("/safety/reports", { userId: offender.id, reason: "scam", conversationId: foreign }, { token: reporter.token });
      assert.equal(wrongConversation.status, 400);

      const ownMessage = (await h.api.post("/messages/send", { conversationId, content: "my own words" }, { token: reporter.token })).body.data.message.id;
      const wrongSender = await h.api.post("/safety/reports", { userId: offender.id, reason: "scam", conversationId, messageId: ownMessage }, { token: reporter.token });
      assert.equal(wrongSender.status, 400, "can't 'report' your own message as theirs");
    });

    it("files a report with chat context, and refuses a duplicate while it's open", async () => {
      const filed = await h.api.post(
        "/safety/reports",
        { userId: offender.id, reason: "scam", details: "Asked for bank details", conversationId, messageId: offendingMessageId },
        { token: reporter.token },
      );
      assert.equal(filed.status, 201);
      assert.ok(filed.body.data.reportId);

      const duplicate = await h.api.post("/safety/reports", { userId: offender.id, reason: "spam" }, { token: reporter.token });
      assert.equal(duplicate.status, 409);
    });

    it("keeps the moderation queue admin-only", async () => {
      assert.equal((await h.api.get("/admin/reports")).status, 401);
      assert.equal((await h.api.get("/admin/reports", { token: reporter.token })).status, 403);
      assert.equal((await h.api.post("/admin/reports/5f5f5f5f5f5f5f5f5f5f5f5f/resolve", { action: "dismiss" }, { token: reporter.token })).status, 403);
    });

    it("shows the queue with reporter, reported user and status counts", async () => {
      const queue = await h.api.get("/admin/reports", { token: admin.token });
      assert.equal(queue.status, 200);
      const [report] = queue.body.data.reports;
      assert.equal(report.status, "pending");
      assert.equal(report.reason, "scam");
      assert.equal(report.reporter.email, reporter.email);
      assert.equal(report.reported.email, offender.email);
      assert.equal(report.distinctReporters, 1);
      assert.equal(queue.body.data.counts.pending, 1);
      assert.equal((await h.api.get("/admin/reports?status=resolved", { token: admin.token })).body.data.reports.length, 0);
    });

    it("gives a moderator the context: the reported person's messages, with the flagged one marked", async () => {
      const { reports } = (await h.api.get("/admin/reports", { token: admin.token })).body.data;
      const detail = await h.api.get(`/admin/reports/${reports[0].id}`, { token: admin.token });
      assert.equal(detail.status, 200);
      const flagged = detail.body.data.messages.find((m: { isReported: boolean }) => m.isReported);
      assert.equal(flagged.content, "send me your bank details");
      assert.ok(detail.body.data.messages.every((m: { content: string }) => m.content !== "my own words"), "the reporter's own messages aren't disclosed");
      assert.equal(detail.body.data.reported.email, offender.email);
    });

    it("moves a report to 'reviewing', which still counts as open", async () => {
      const { reports } = (await h.api.get("/admin/reports", { token: admin.token })).body.data;
      assert.equal((await h.api.post(`/admin/reports/${reports[0].id}/review`, undefined, { token: admin.token })).status, 200);
      const open = await h.api.get("/admin/reports", { token: admin.token });
      assert.equal(open.body.data.reports[0].status, "reviewing");
    });

    it("hiding a message masks it in chat and in the conversation preview", async () => {
      const { reports } = (await h.api.get("/admin/reports", { token: admin.token })).body.data;
      const resolved = await h.api.post(`/admin/reports/${reports[0].id}/resolve`, { action: "hide_message", note: "Scam attempt" }, { token: admin.token });
      assert.equal(resolved.status, 200);
      assert.equal(resolved.body.data.report.status, "resolved");
      assert.equal(resolved.body.data.report.resolution.action, "message_hidden");

      const chat = await h.api.get(`/conversations/${conversationId}/messages`, { token: reporter.token });
      const hidden = chat.body.data.messages.find((m: { id: string }) => m.id === offendingMessageId);
      assert.equal(hidden.content, "[Message removed by moderators]");
      assert.ok(!JSON.stringify(chat.body).includes("bank details"));

      const twice = await h.api.post(`/admin/reports/${reports[0].id}/resolve`, { action: "dismiss" }, { token: admin.token });
      assert.equal(twice.status, 409, "a closed report stays closed");
    });

    it("moves closed reports to Resolved", async () => {
      const resolved = await h.api.get("/admin/reports?status=resolved", { token: admin.token });
      assert.equal(resolved.body.data.reports.length, 1);
      assert.equal((await h.api.get("/admin/reports", { token: admin.token })).body.data.reports.length, 0);
    });

    it("refuses 'hide message' on a report with no message, and records who resolved what", async () => {
      const other = await h.createUser({ name: "Generic Gus", profile: true });
      await h.api.post("/safety/reports", { userId: other.id, reason: "spam" }, { token: reporter.token });
      const { reports } = (await h.api.get("/admin/reports", { token: admin.token })).body.data;
      assert.equal((await h.api.post(`/admin/reports/${reports[0].id}/resolve`, { action: "hide_message" }, { token: admin.token })).status, 400);
      assert.equal((await h.api.post(`/admin/reports/${reports[0].id}/resolve`, { action: "dismiss", note: "Nothing there" }, { token: admin.token })).status, 200);

      const log = (await h.api.get("/admin/audit-log", { token: admin.token })).body.data.entries;
      const entry = log.find((e: { action: string }) => e.action === "report.dismiss");
      assert.equal(entry.actorEmail, admin.email);
      assert.equal(entry.metadata.note, "Nothing there");
    });

    it("tells the reporter (in-app) that their report was reviewed", async () => {
      await h.settle();
      const { notifications } = (await h.api.get("/notifications", { token: reporter.token })).body.data;
      assert.ok(notifications.some((n: { type: string; title: string }) => n.type === "safety" && n.title === "We reviewed your report"));
    });
  });

  describe("suspension", () => {
    let target: TestUser;
    let reporter: TestUser;

    before(async () => {
      target = await h.createUser({ name: "Trouble Tim", profile: true });
      reporter = await h.createUser({ name: "Witness Wu", profile: true });
    });

    it("suspends via a report: the account can't log in, use its token, or open a socket", async () => {
      const socket = await h.connectSocket(target.token);
      const closed = new Promise<void>((resolve) => socket.on("disconnect", () => resolve()));

      await h.api.post("/safety/reports", { userId: target.id, reason: "harassment", details: "Repeated abuse" }, { token: reporter.token });
      const { reports } = (await h.api.get("/admin/reports", { token: admin.token })).body.data;
      const report = reports.find((r: { reported: { email: string } }) => r.reported.email === target.email);
      const res = await h.api.post(`/admin/reports/${report.id}/resolve`, { action: "suspend", note: "Harassment" }, { token: admin.token });
      assert.equal(res.status, 200);

      await closed; // live sessions are cut immediately

      const login = await h.api.post("/auth/login", { email: target.email, password: "Passw0rd!23" });
      assert.equal(login.status, 403);
      assert.equal(login.body.error.code, "ACCOUNT_SUSPENDED");
      assert.match(login.body.message, /suspended/i);

      const withToken = await h.api.get("/auth/me", { token: target.token });
      assert.equal(withToken.status, 403);
      assert.equal(withToken.body.error.code, "ACCOUNT_SUSPENDED");

      await assert.rejects(h.connectSocket(target.token), "the socket handshake refuses suspended users");
    });

    it("can be reversed", async () => {
      assert.equal((await h.api.post(`/admin/users/${target.id}/unsuspend`, undefined, { token: admin.token })).status, 200);
      assert.equal((await h.api.post("/auth/login", { email: target.email, password: "Passw0rd!23" })).status, 200);
    });

    it("requires a reason to suspend directly, and never touches admins", async () => {
      assert.equal((await h.api.post(`/admin/users/${target.id}/suspend`, {}, { token: admin.token })).status, 422);
      assert.equal((await h.api.post(`/admin/users/${target.id}/suspend`, { reason: "Spamming" }, { token: admin.token })).status, 200);
      assert.equal((await h.api.get(`/admin/users/${target.id}`, { token: admin.token })).body.data.user.status, "suspended");

      const otherAdmin = await h.makeAdmin(await h.createUser({ name: "Second Admin" }));
      const attempt = await h.api.post(`/admin/users/${otherAdmin.id}/suspend`, { reason: "coup" }, { token: admin.token });
      assert.equal(attempt.status, 403);
      const del = await h.api.post(`/admin/users/${otherAdmin.id}/delete`, { confirmEmail: otherAdmin.email }, { token: admin.token });
      assert.equal(del.status, 403);
    });
  });

  describe("deleting an account", () => {
    it("removes the user and everything tied to them, but keeps payment records", async () => {
      const victim = await h.createUser({ name: "Doomed Dan", profile: true });
      const friend = await h.createUser({ name: "Friend Fay", profile: true });
      const { matchId } = await h.makeMatch(victim, friend);
      const conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: friend.token })).body.data.conversation.id;
      await h.api.post("/messages/send", { conversationId, content: "bye" }, { token: victim.token });
      await h.api.post("/safety/blocks", { userId: friend.id }, { token: victim.token });
      await h.api.post(`/growth/profile-views/${friend.id}`, undefined, { token: victim.token });
      await h.settle();

      const models = await h.load("../../src/models/Payment.model");
      await models.Payment.create({
        userId: victim.id, provider: "mock", providerPaymentId: `pay_${Date.now()}`, plan: "premium", interval: "monthly",
        amount: 499, currency: "usd", status: "succeeded", description: "Premium (monthly)",
      });

      const wrongEmail = await h.api.post(`/admin/users/${victim.id}/delete`, { confirmEmail: "someone@else.test" }, { token: admin.token });
      assert.equal(wrongEmail.status, 400, "the typed email must match");

      const deleted = await h.api.post(`/admin/users/${victim.id}/delete`, { confirmEmail: victim.email.toUpperCase() }, { token: admin.token });
      assert.equal(deleted.status, 200);
      assert.equal(deleted.body.data.deletedMessages, 1);

      const [{ User }, { Profile }, { Match }, { Message }, { Conversation }, { Notification }, { Block }] = await Promise.all([
        h.load("../../src/models/User.model"), h.load("../../src/models/Profile.model"), h.load("../../src/models/Match.model"),
        h.load("../../src/models/Message.model"), h.load("../../src/models/Conversation.model"),
        h.load("../../src/models/Notification.model"), h.load("../../src/models/Block.model"),
      ]);
      assert.equal(await User.countDocuments({ _id: victim.id }), 0);
      assert.equal(await Profile.countDocuments({ userId: victim.id }), 0);
      assert.equal(await Match.countDocuments({ $or: [{ userOne: victim.id }, { userTwo: victim.id }] }), 0);
      assert.equal(await Conversation.countDocuments({ _id: conversationId }), 0);
      assert.equal(await Message.countDocuments({ conversationId }), 0);
      assert.equal(await Notification.countDocuments({ userId: victim.id }), 0);
      assert.equal(await Block.countDocuments({ blockerId: victim.id }), 0);
      assert.equal(await models.Payment.countDocuments({ userId: victim.id }), 1, "payment history is retained for accounting");

      assert.equal((await h.api.get("/auth/me", { token: victim.token })).status, 401, "the old token is dead");
      assert.equal((await h.api.get("/matches", { token: friend.token })).body.data.matches.length, 0);
      const audit = (await h.api.get("/admin/audit-log", { token: admin.token })).body.data.entries;
      assert.ok(audit.some((e: { action: string; targetId: string }) => e.action === "user.delete" && e.targetId === victim.id));
    });
  });
});
