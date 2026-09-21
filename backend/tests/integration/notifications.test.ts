import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness, type TestUser } from "../helpers/harness";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("notifications", () => {
  let h: Harness;

  const list = async (user: TestUser, query = "") => (await h.api.get(`/notifications${query}`, { token: user.token })).body.data;
  const ofType = async (user: TestUser, type: string) => (await list(user)).notifications.filter((n: { type: string }) => n.type === type);

  before(async () => {
    h = await startHarness();
  });
  after(() => h.stop());

  describe("likes and matches", () => {
    let alice: TestUser;
    let bob: TestUser;

    before(async () => {
      alice = await h.createUser({ name: "Alice Anderson", profile: true, verified: true });
      bob = await h.createUser({ name: "Bob Baker", profile: true, verified: true });
    });

    it("notifies the person who was liked — and only them", async () => {
      assert.equal((await list(bob)).unreadCount, 0);

      await h.api.post(`/likes/send/${bob.id}`, undefined, { token: alice.token });
      await h.settle();

      const bobs = await list(bob);
      assert.equal(bobs.unreadCount, 1);
      const [n] = bobs.notifications;
      assert.equal(n.type, "like_received");
      assert.equal(n.title, "Someone likes you");
      assert.match(n.message, /^Alice liked your profile/);
      assert.equal(n.isRead, false);
      assert.equal(n.userId, bob.id);
      assert.ok(n.createdAt && n.updatedAt);
      assert.equal(n.metadata.senderId, alice.id);
      assert.equal((await list(alice)).notifications.length, 0, "the sender is not notified");
    });

    it("tells both people about a match, and emails them", async () => {
      const incoming = await h.api.get("/likes/incoming", { token: bob.token });
      await h.api.post(`/likes/accept/${incoming.body.data.likes[0].likeId}`, undefined, { token: bob.token });
      await h.settle();

      for (const [user, other] of [[alice, "Bob"], [bob, "Alice"]] as const) {
        const matches = await ofType(user, "match_created");
        assert.equal(matches.length, 1);
        assert.equal(matches[0].title, "It's a match!");
        assert.match(matches[0].message, new RegExp(`You and ${other} both said yes`));
      }

      const emails = h.outbox.filter((m) => /match/i.test(m.subject));
      assert.deepEqual(emails.map((m) => m.to).sort(), [alice.email, bob.email].sort());
      assert.ok(emails.every((m) => m.html.includes("/matches") && m.text.length > 20));
    });

    it("doesn't create a second match notification when the same match is re-accepted", async () => {
      const before = (await ofType(alice, "match_created")).length;
      const incoming = await h.api.get("/likes/incoming", { token: bob.token });
      assert.equal(incoming.body.data.likes.length, 0);
      assert.equal((await ofType(alice, "match_created")).length, before);
    });
  });

  describe("real time", () => {
    it("pushes a new notification to the recipient's open socket, with the badge count", async () => {
      const sender = await h.createUser({ name: "Rita Sender", profile: true });
      const receiver = await h.createUser({ name: "Ravi Receiver", profile: true });

      const socket = await h.connectSocket(receiver.token, { purpose: "notifications" });
      const pending = h.nextEvent<{ notification: { type: string; title: string; isRead: boolean }; unreadCount: number }>(socket, "notification");

      await h.api.post(`/likes/send/${receiver.id}`, undefined, { token: sender.token });
      const event = await pending;

      assert.equal(event.notification.type, "like_received");
      assert.equal(event.notification.isRead, false);
      assert.equal(event.unreadCount, 1);
    });

    it("syncs the badge across tabs when notifications are read", async () => {
      const sender = await h.createUser({ name: "Sync Sender", profile: true });
      const receiver = await h.createUser({ name: "Sync Receiver", profile: true });
      await h.api.post(`/likes/send/${sender.id}`, undefined, { token: receiver.token }); // gives `sender` a like
      await h.api.post(`/likes/send/${receiver.id}`, undefined, { token: sender.token });
      await h.settle();

      const tabOne = await h.connectSocket(receiver.token, { purpose: "notifications" });
      const tabTwo = await h.connectSocket(receiver.token, { purpose: "notifications" });
      const seenOnTabTwo = h.nextEvent<{ unreadCount: number }>(tabTwo, "notification_count");
      void tabOne;

      const all = await list(receiver);
      const unreadId = all.notifications.find((n: { isRead: boolean }) => !n.isRead).id;
      await h.api.post(`/notifications/${unreadId}/read`, undefined, { token: receiver.token });

      assert.equal((await seenOnTabTwo).unreadCount, all.unreadCount - 1);
    });

    it("keeps notification-only sockets out of chat presence", async () => {
      const a = await h.createUser({ name: "Pat Presence", profile: true });
      const b = await h.createUser({ name: "Quinn Quiet", profile: true });
      const { matchId } = await h.makeMatch(a, b);
      const conversation = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: a.token })).body.data.conversation;

      const chatSocket = await h.connectSocket(a.token);
      chatSocket.emit("join_conversation", { conversationId: conversation.id });
      await sleep(150);

      const presence: string[] = [];
      chatSocket.on("user_online", ({ userId }: { userId: string }) => presence.push(`online:${userId}`));

      await h.connectSocket(b.token, { purpose: "notifications" }); // the app-wide bell
      await sleep(300);
      assert.deepEqual(presence, [], "browsing the site is not 'online in chat'");

      await h.connectSocket(b.token); // opening the messages screen
      await sleep(300);
      assert.deepEqual(presence, [`online:${b.id}`]);
    });
  });

  describe("messages", () => {
    let sender: TestUser;
    let receiver: TestUser;
    let conversationId: string;

    before(async () => {
      sender = await h.createUser({ name: "Mia Messenger", profile: true, verified: true });
      receiver = await h.createUser({ name: "Noah Notified", profile: true, verified: true });
      const { matchId } = await h.makeMatch(sender, receiver);
      conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: sender.token })).body.data.conversation.id;
    });

    const send = (content: string) => h.api.post("/messages/send", { conversationId, content }, { token: sender.token });

    it("merges a burst of messages into one live notification with a count and the latest preview", async () => {
      await send("first");
      await send("second");
      await send("third message here");
      await h.settle();

      const messages = await ofType(receiver, "message_received");
      assert.equal(messages.length, 1);
      assert.equal(messages[0].metadata.count, 3);
      assert.equal(messages[0].message, "third message here");
      assert.equal(messages[0].title, "New message from Mia");
      assert.equal(messages[0].metadata.conversationId, conversationId);
    });

    it("starts a fresh notification once the old one is read", async () => {
      const [existing] = await ofType(receiver, "message_received");
      await h.api.post(`/notifications/${existing.id}/read`, undefined, { token: receiver.token });
      await send("after reading");
      await h.settle();

      const messages = await ofType(receiver, "message_received");
      assert.equal(messages.length, 2);
      assert.equal(messages.filter((n: { isRead: boolean }) => !n.isRead).length, 1);
    });

    it("emails an offline recipient at most once per half hour per conversation", async () => {
      const emails = h.outbox.filter((m) => m.to === receiver.email && /message/i.test(m.subject));
      assert.equal(emails.length, 1, "four messages, but one email");
      assert.match(emails[0]!.html, /messages\?|\/messages/);
    });

    it("stays silent when the recipient already has the conversation open", async () => {
      const socket = await h.connectSocket(receiver.token);
      socket.emit("join_conversation", { conversationId });
      await sleep(200);

      const before = (await list(receiver)).notifications.length;
      await send("you are looking at this right now");
      await h.settle();
      assert.equal((await list(receiver)).notifications.length, before);
      const merged = await ofType(receiver, "message_received");
      assert.ok(merged.every((n: { message: string }) => n.message !== "you are looking at this right now"));
      socket.disconnect();
    });
  });

  describe("managing notifications", () => {
    let owner: TestUser;
    let stranger: TestUser;

    before(async () => {
      owner = await h.createUser({ name: "Olive Owner", profile: true });
      stranger = await h.createUser({ name: "Sam Stranger", profile: true });
      const likers = await h.seedUsers(4, { profile: true });
      for (const liker of likers) await h.api.post(`/likes/send/${owner.id}`, undefined, { token: liker.token });
      await h.settle();
    });

    it("lists newest first with pagination and an unread filter", async () => {
      const all = await list(owner, "?limit=3");
      assert.equal(all.notifications.length, 3);
      assert.equal(all.pagination.total, 4);
      assert.equal(all.pagination.hasMore, true);
      assert.equal(all.unreadCount, 4);

      const times = all.notifications.map((n: { updatedAt: string }) => Date.parse(n.updatedAt));
      assert.deepEqual([...times].sort((a, b) => b - a), times);

      const page2 = await list(owner, "?limit=3&page=2");
      assert.equal(page2.notifications.length, 1);
      assert.equal((await list(owner, "?unreadOnly=true")).notifications.length, 4);
      assert.equal((await h.api.get("/notifications?limit=500", { token: owner.token })).status, 422);
    });

    it("marks one read, then all read, and keeps the counter honest", async () => {
      const { notifications } = await list(owner);
      const one = await h.api.post(`/notifications/${notifications[0].id}/read`, undefined, { token: owner.token });
      assert.equal(one.status, 200);
      assert.equal(one.body.data.notification.isRead, true);
      assert.equal((await h.api.get("/notifications/unread-count", { token: owner.token })).body.data.unreadCount, 3);
      assert.equal((await list(owner, "?unreadOnly=true")).notifications.length, 3);

      const all = await h.api.post("/notifications/read-all", undefined, { token: owner.token });
      assert.equal(all.body.data.updated, 3);
      assert.equal((await list(owner)).unreadCount, 0);
    });

    it("never lets one user touch another's notifications", async () => {
      const { notifications } = await list(owner);
      const id = notifications[0].id;
      assert.equal((await h.api.post(`/notifications/${id}/read`, undefined, { token: stranger.token })).status, 404);
      assert.equal((await h.api.del(`/notifications/${id}`, { token: stranger.token })).status, 404);
      assert.equal((await h.api.post("/notifications/not-an-id/read", undefined, { token: owner.token })).status, 400);
      assert.equal((await h.api.get("/notifications")).status, 401);
    });

    it("deletes a notification", async () => {
      const { notifications } = await list(owner);
      assert.equal((await h.api.del(`/notifications/${notifications[0].id}`, { token: owner.token })).status, 200);
      assert.equal((await list(owner)).pagination.total, 3);
    });
  });

  describe("preferences and switches", () => {
    it("respects a user's muted notification types", async () => {
      const [target] = await h.seedUsers(1, { profile: true, prefix: "Muter" });
      const liker = await h.createUser({ name: "Lee Liker", profile: true });

      const defaults = await h.api.get("/account/settings", { token: target!.token });
      assert.deepEqual(defaults.body.data.settings.notifications, { like: true, match: true, message: true, profileView: true, aiRecommendation: true });

      const saved = await h.api.put("/account/settings", { notifications: { like: false } }, { token: target!.token });
      assert.equal(saved.body.data.settings.notifications.like, false);
      assert.equal(saved.body.data.settings.notifications.match, true, "other preferences keep their values");

      await h.api.post(`/likes/send/${target!.id}`, undefined, { token: liker.token });
      await h.settle();
      assert.equal((await list(target!)).notifications.length, 0);
    });

    it("rejects malformed or unknown settings", async () => {
      const [user] = await h.seedUsers(1);
      assert.equal((await h.api.put("/account/settings", { notifications: { like: "no" } }, { token: user!.token })).status, 422);
      assert.equal((await h.api.put("/account/settings", { admin: true }, { token: user!.token })).status, 422);
    });

    it("stops creating notifications when the feature flag is switched off", async () => {
      const [target] = await h.seedUsers(1, { profile: true, prefix: "Flagged" });
      const liker = await h.createUser({ name: "Flag Liker", profile: true });
      await h.setFlag("notifications", false);

      await h.api.post(`/likes/send/${target!.id}`, undefined, { token: liker.token });
      await h.settle();
      assert.equal((await list(target!)).notifications.length, 0);

      await h.setFlag("notifications", true);
    });
  });

  describe("profile views", () => {
    it("records one view per viewer per day and rolls them into one notification", async () => {
      const [target, viewerOne, viewerTwo] = await h.seedUsers(3, { profile: true, prefix: "Viewed" });

      const first = await h.api.post(`/growth/profile-views/${target!.id}`, undefined, { token: viewerOne!.token });
      assert.equal(first.body.data.recorded, true);
      const repeat = await h.api.post(`/growth/profile-views/${target!.id}`, undefined, { token: viewerOne!.token });
      assert.equal(repeat.body.data.recorded, false, "refreshing can't spam");
      await h.api.post(`/growth/profile-views/${target!.id}`, undefined, { token: viewerTwo!.token });
      await h.settle();

      const views = await ofType(target!, "profile_viewed");
      assert.equal(views.length, 1);
      assert.equal(views[0].metadata.count, 2);
      assert.doesNotMatch(views[0].message, /Seed/, "viewers stay anonymous");
    });

    it("ignores self-views, missing profiles and a disabled feature", async () => {
      const [me, other, noProfile] = [
        ...(await h.seedUsers(2, { profile: true, prefix: "SelfView" })),
        ...(await h.seedUsers(1, { prefix: "Bare" })),
      ];
      assert.equal((await h.api.post(`/growth/profile-views/${me!.id}`, undefined, { token: me!.token })).body.data.recorded, false);
      assert.equal((await h.api.post(`/growth/profile-views/${noProfile!.id}`, undefined, { token: me!.token })).body.data.recorded, false);

      await h.setFlag("profile_views", false);
      assert.equal((await h.api.post(`/growth/profile-views/${other!.id}`, undefined, { token: me!.token })).body.data.recorded, false);
      await h.setFlag("profile_views", true);
      assert.equal((await h.api.post("/growth/profile-views/nope", undefined, { token: me!.token })).status, 400);
    });
  });

  describe("AI recommendations", () => {
    it("announces finished analysis, and alerts strong matches about a newcomer (merged per day)", async () => {
      // Seeded to mirror what the scripted interview below produces, so they're a near-perfect match for the newcomer.
      const similar = {
        traitScores: { openness: 85, conscientiousness: 63, extraversion: 50, agreeableness: 80, emotionalStability: 73 },
        interests: ["travel", "photography", "hiking", "cooking"],
        values: ["loyalty", "honesty", "personal growth", "family", "kindness"],
        lifestyleTraits: ["balanced", "outdoorsy", "active", "career-driven", "health-conscious"],
        emotionalTraits: ["emotionally mature", "calm"],
        relationshipGoals: ["long-term commitment", "family"],
      };
      const [existingOne, existingTwo] = await h.seedUsers(2, { profile: true, aiProfile: similar, prefix: "Analysed" });
      const newcomer = await h.createUser({ name: "Nina Newcomer", profile: true });
      await h.completeInterview(newcomer);

      const ready = await ofType(newcomer, "ai_recommendation");
      assert.equal(ready.length, 1);
      assert.equal(ready[0].title, "Your AI matches are ready");

      // The two already-analysed users are a strong match for the newcomer (same profile shape).
      for (const existing of [existingOne!, existingTwo!]) {
        const alerts = await ofType(existing, "ai_recommendation");
        assert.equal(alerts.length, 1, "one merged alert");
        assert.equal(alerts[0].title, "A new high-compatibility match");
        assert.ok(alerts[0].metadata.topScore >= 80);
      }

      // A second newcomer the same day merges into the existing unread alert instead of adding another.
      const second = await h.createUser({ name: "Omar Second", profile: true });
      await h.completeInterview(second);
      const merged = await ofType(existingOne!, "ai_recommendation");
      assert.equal(merged.length, 1);
      assert.ok(merged[0].metadata.count >= 2);
    });
  });
});
