# Moderation Runbook

This describes how to use SoulSync's actual moderation tools — nothing here is aspirational. Every
screen, button, and rule below exists in the running product today (`backend/src/services/report.service.ts`,
`backend/src/controllers/admin.controller.ts`, `backend/src/controllers/safety.controller.ts`, and the
`/admin` pages in the frontend). If a tool described elsewhere in SoulSync's docs isn't mentioned
here, assume it isn't built yet and don't promise it to a member.

## Who this is for

Anyone with the `admin` role. You get that role one of two ways: your email was listed in the
server's `ADMIN_EMAILS` setting when you registered, or an existing admin added you there and you
verified your email afterward (it's applied automatically, you don't need to re-register). If you
can't reach `/admin`, you don't have the role yet — ask whoever manages the Render environment
variables to add your email to `ADMIN_EMAILS`.

## 1. Where reports come from

A member can report another member from two places in the app: their profile, or a specific
message inside a conversation. Every report carries one reason, chosen from a fixed list:

- **Spam**
- **Harassment**
- **Fake profile**
- **Inappropriate content**
- **Underage**
- **Scam** (financial fraud attempts)
- **Other**

If the report was filed from a conversation, it's automatically linked to that conversation and
(if filed on a specific message) that exact message — you'll see it in the report detail. A member
can't report the same person twice for the same thing within 24 hours while a report is still open
(`pending` or `reviewing`); they'll be told "we're already reviewing it" instead of filing a
duplicate.

## 2. The moderation queue (`/admin/moderation`)

This is your main screen. It lists every report, newest first, with four tabs: **Pending**
(covers both not-yet-started and in-review reports), **Resolved**, **Dismissed**, and **All**.
Each row shows:

- Who reported whom, and the reason.
- **How many different people have reported this same person** — this is your strongest triage
  signal. One "spam" report from one person might be a misunderstanding; three different people
  reporting the same account is not.

Click into a report to see the full picture:

- The reporter's and reported member's account info (name, email, current status).
- If the report came from a conversation: **the reported member's last 10 messages in that
  specific conversation**, with the actual flagged message marked. You're shown their side of
  that conversation only — not the reporter's full inbox.
- How many *other* reports exist against this same person, independent of this one.
- Any photo/profile info already on file for them.

## 3. Working a report

1. **Open it.** The first time you view a `pending` report, click **Mark as in review** — this just
   signals to any other moderator that someone's already looking at it, so you don't duplicate
   work. It's a manual button; opening the report doesn't do this for you automatically.
2. **Read the context.** For a message-based report, read the flagged message and the
   surrounding messages from the same person. For a profile-based report, check their profile
   details and prior report history.
3. **Decide and resolve.** Every report is closed with exactly one action:

   | Action (exact button label) | What it actually does |
   |---|---|
   | **Dismiss** | Closes the report with no action. Use when the report doesn't hold up. |
   | **Warn** | Records your note on the report as "warned." **It does not currently email or notify the member in any way** — the in-app help text used to say otherwise; that's been corrected. Treat it as an internal note to yourself and other moderators ("told to cut it out, watching for a repeat"), not a real warning delivered to the person. If you need the member to actually hear from you, you'll need to reach them outside this flow for now. |
   | **Hide the reported message** | Only available when the report is linked to a specific message. Masks that one message's content everywhere it's shown (replaced with "[Message removed by moderators]"), including in the conversation's preview text if it was the most recent message. The conversation and the rest of its history are untouched. |
   | **Suspend the account** | Immediately suspends the account: they're logged out of any open connection, and every future sign-in attempt is refused with a message telling them to contact support, until you (or another admin) unsuspend them. Your resolution note becomes the suspension reason shown to them. This does **not** delete anything — matches, messages, and their profile all survive, waiting for them if unsuspended. |
   | **Delete the account** | **Permanent and immediate.** Deletes the account and everything tied to it — profile, AI interview and personality report, matches, conversations, messages, likes, photos (including from Cloudinary, if that's how this deployment stores them). There is no undo. Use this for severe or repeat violations, not as a default. |

   Whichever action you pick, write a real note — it's stored permanently on the report and is
   the only explanation anyone (including a future you) will have for why this was resolved this
   way.

4. Once resolved, the report moves to the **Resolved** or **Dismissed** tab and drops out of
   **Pending**.

## 4. Escalation — when to act alone vs. wait

- A single report with a vague reason and no prior history on that account: read it carefully, but
  it's fine to dismiss if nothing in the context supports it.
- A single report with **clear evidence** (an actual scam message, explicit harassment, a
  flagged message that speaks for itself): act on it — suspend or delete as the severity warrants.
  You don't need to wait for a second report to act on something you can see directly.
- **Underage** reports: treat as high-priority regardless of how many reports exist. Suspend
  immediately while you review, rather than leaving the account active during review.
- Multiple reports from **different** people against the same account (the distinct-reporter count
  in the queue) is a strong signal on its own, even if any single report looks minor — a pattern
  across strangers is harder to fake than one person's grudge.
- If you're unsure, **suspend rather than delete.** Suspension is fully reversible; deletion is
  not. You can always escalate from suspended to deleted later once you're certain.

## 5. User-facing self-service tools (so you know what members can already do themselves)

Members don't need you for everything:

- **Block**: immediate, two-way (neither can see, message, or appear to the other), reversible by
  the blocker any time from their own Settings. Most interpersonal friction resolves this way
  without ever reaching you.
- **Delete their own account**: a member can permanently delete their own account from Settings
  (with a password + typed confirmation). If someone tells you "I already deleted my account" —
  that's real; there's nothing left for you to find.
- **Hide their own profile**: a member can turn off their own discoverability from Settings
  (Privacy → "Show my profile"). This is not a moderation action and isn't visible to you as a
  report — it's just a normal account setting.

## 6. Account management outside the report flow (`/admin/users`)

You can suspend, unsuspend, or delete any account directly from the user list, without a report
needing to exist first — useful when you've spotted something yourself, or a report came in
through a channel other than the in-app form (see §8).

Deleting a user here requires **typing their exact email address to confirm** — this is
deliberate friction so that deleting the wrong account from a long list takes a real, considered
action, not a misclick.

## 7. Evidence preservation

Every suspend, unsuspend, and delete you perform — whether through a report's resolve action or
directly from the user list — is written to a permanent audit log (`/admin/audit-log`), recording
who did it, when, and what the action was. This is your record if a decision is ever questioned
later. It is **not** a substitute for writing a clear resolution note at the time — the audit log
records *that* something happened, your note records *why*.

One real limitation to know: once an account is deleted, its messages and profile are gone for
good — the audit log keeps the *fact* that you deleted it and your note, but not a copy of what
you saw. For anything you suspect might need to be revisited later (a borderline call, a pattern
you're tracking), prefer **suspend** over **delete**, or copy the relevant details into your
resolution note before you delete.

## 8. Reports that don't come through the app

Not everyone will use the in-app report button — some will email the support address directly
(see `/contact`), especially for something urgent. Treat these the same way: find the account
(`/admin/users`, search by name or email), read whatever context you have, and act through the
same suspend/delete tools in §6. There's no way to retroactively attach an email report to the
queue — just act on it directly and keep the original email as your record of what was reported.

## 9. Immediate danger

SoulSync's tools — block, report, suspend, delete — address behavior **on the platform**. They are
not an emergency response system and have no connection to law enforcement or crisis services. If
a member reports something indicating they or someone else is in immediate physical danger, that
is **not** primarily a moderation task: direct them to local emergency services first. Act on the
account (suspend immediately is reasonable) as a secondary step, not instead of that.

## 10. Quick reference

| I want to... | Go to |
|---|---|
| See what's waiting for review | `/admin/moderation`, **Pending** tab |
| Review one report in detail | Click any report in the queue |
| Suspend/unsuspend/delete an account directly | `/admin/users`, search, open the account |
| Check what a specific moderator decided and when | `/admin/audit-log` |
| Confirm a member really deleted their own account | They're simply no longer searchable in `/admin/users` |
