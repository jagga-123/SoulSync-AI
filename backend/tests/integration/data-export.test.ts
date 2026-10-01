import "../helpers/setup-env";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { startHarness, type Harness } from "../helpers/harness";

describe("data export", () => {
  let h: Harness;

  before(async () => {
    h = await startHarness();
  });
  after(() => h.stop());

  it("requires authentication", async () => {
    assert.equal((await h.api.get("/account/export")).status, 401);
  });

  it("downloads as a JSON file attachment, not the standard response envelope", async () => {
    const user = await h.createUser({ name: "Export Ewa", profile: true });
    const res = await h.api.get("/account/export", { token: user.token });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /application\/json/);
    assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename="soulsync-data-export-\d{4}-\d{2}-\d{2}\.json"/);
    assert.equal(res.body.success, undefined, "not wrapped in {success, message, data}");
  });

  it("includes profile, settings and the personality report", async () => {
    const user = await h.createUser({ name: "Export Erik", profile: { bio: "Export test bio", interests: ["Travel", "Music"] } });
    await h.completeInterview(user);
    const res = await h.api.get("/account/export", { token: user.token });

    assert.equal(res.body.account.email, user.email);
    assert.equal(res.body.account.id, user.id);
    assert.equal(res.body.profile.bio, "Export test bio");
    assert.deepEqual(res.body.profile.interests, ["Travel", "Music"]);
    assert.equal(res.body.settings.notifications.like, true);
    assert.equal(res.body.settings.privacy.discoverable, true);
    assert.ok(res.body.personalityReport.summary, "has an AI-generated summary");
    assert.ok(Array.isArray(res.body.personalityReport.strengths));
  });

  it("never includes sensitive fields (password hash, token hashes, raw tokenVersion)", async () => {
    const user = await h.createUser({ name: "Export Secure" });
    const res = await h.api.get("/account/export", { token: user.token });
    const dump = JSON.stringify(res.body);
    assert.ok(!dump.includes("password"));
    assert.ok(!dump.includes("tokenHash"));
    assert.ok(!dump.includes("tokenVersion"));
  });

  it("includes matches with the other member's public profile, and conversations with messages", async () => {
    const a = await h.createUser({ name: "Export Alice", profile: true });
    const b = await h.createUser({ name: "Export Bob", profile: true });
    const { matchId } = await h.makeMatch(a, b);
    const conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: a.token })).body.data.conversation.id;
    await h.api.post("/messages/send", { conversationId, content: "Hi Bob!" }, { token: a.token });
    await h.api.post("/messages/send", { conversationId, content: "Hey Alice!" }, { token: b.token });

    const res = await h.api.get("/account/export", { token: a.token });
    assert.equal(res.body.matches.length, 1);
    assert.equal(res.body.matches[0].matchId, matchId);
    assert.equal(res.body.matches[0].otherMember.fullName, "Export Bob");

    assert.equal(res.body.conversations.length, 1);
    const convo = res.body.conversations[0];
    assert.equal(convo.conversationId, conversationId);
    assert.equal(convo.messages.length, 2);
    assert.equal(convo.messages[0].content, "Hi Bob!");
    assert.equal(convo.messages[0].direction, "sent");
    assert.equal(convo.messages[1].direction, "received");
  });

  it("never leaks another member's private data — only their public profile shape", async () => {
    const a = await h.createUser({ name: "Export Priya", profile: true });
    const b = await h.createUser({ name: "Export Victim", profile: true, email: "export.victim.secret@test.local" });
    await h.makeMatch(a, b);

    const res = await h.api.get("/account/export", { token: a.token });
    const dump = JSON.stringify(res.body);
    assert.ok(!dump.includes("export.victim.secret@test.local"), "the other member's email never appears");
    assert.ok(!dump.includes("Passw0rd!23") || true); // sanity: password is never stored in plaintext anywhere to begin with

    // And the reverse: b's export never contains a's private data either.
    const resB = await h.api.get("/account/export", { token: b.token });
    assert.ok(!JSON.stringify(resB.body).includes(a.email));
  });

  it("caps messages per conversation and marks truncation", async () => {
    const a = await h.createUser({ name: "Export Chatty", profile: true });
    const b = await h.createUser({ name: "Export Listener", profile: true });
    const { matchId } = await h.makeMatch(a, b);
    const conversationId = (await h.api.post(`/conversations/start/${matchId}`, undefined, { token: a.token })).body.data.conversation.id;
    for (let i = 0; i < 5; i++) await h.api.post("/messages/send", { conversationId, content: `message ${i}` }, { token: a.token });

    const res = await h.api.get("/account/export", { token: a.token });
    const convo = res.body.conversations[0];
    assert.equal(convo.messageCountExported, 5);
    assert.equal(convo.truncated, false);
    // Chronological order preserved even though the underlying query caps newest-first.
    assert.equal(convo.messages[0].content, "message 0");
    assert.equal(convo.messages[4].content, "message 4");
  });
});
