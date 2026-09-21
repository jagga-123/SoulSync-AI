import { appUrl } from "../../config/env";

/**
 * Email templates. Each returns { subject, html, text }. Two rules apply
 * throughout: every piece of user-supplied data is HTML-escaped (a display
 * name like `<script>` must never reach an inbox as markup), and every
 * template ships a plain-text alternative.
 */

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface LayoutOptions {
  preheader: string;
  heading: string;
  /** Trusted HTML — build it from escaped pieces only. */
  bodyHtml: string;
  cta?: { label: string; url: string };
  /** Present on non-transactional emails. */
  unsubscribeUrl?: string;
  footerNote?: string;
}

const BRAND_GRADIENT = "linear-gradient(135deg,#ff4d8d,#7c3aed)";

function layout(options: LayoutOptions): string {
  const cta = options.cta
    ? `<tr><td align="center" style="padding:8px 0 28px">
         <a href="${escapeHtml(options.cta.url)}" style="display:inline-block;padding:13px 28px;border-radius:999px;background:#7c3aed;background-image:${BRAND_GRADIENT};color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">${escapeHtml(options.cta.label)}</a>
       </td></tr>`
    : "";
  const unsubscribe = options.unsubscribeUrl
    ? `<a href="${escapeHtml(options.unsubscribeUrl)}" style="color:#8b93ad">Unsubscribe</a> · `
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(options.heading)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(options.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f9"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden">
    <tr><td style="background:#0b1026;background-image:${BRAND_GRADIENT};padding:26px 32px;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.3px">SoulSync AI</td></tr>
    <tr><td style="padding:32px 32px 8px">
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0b1026">${escapeHtml(options.heading)}</h1>
      <div style="font-size:15px;line-height:1.65;color:#3a4160">${options.bodyHtml}</div>
    </td></tr>
    ${cta}
    <tr><td style="padding:0 32px 28px;font-size:12px;line-height:1.6;color:#8b93ad;border-top:1px solid #eceef6">
      <p style="margin:18px 0 0">${options.footerNote ? `${escapeHtml(options.footerNote)}<br>` : ""}${unsubscribe}SoulSync AI, Inc.</p>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

export interface TemplateData {
  welcome: { name: string };
  "verify-email": { name: string; verifyUrl: string };
  match: { name: string; matchName: string; score?: number };
  "new-message": { name: string; senderName: string; preview: string; count: number };
  "weekly-report": {
    name: string;
    hasAIProfile: boolean;
    stats: { newLikes: number; newMatches: number; unreadMessages: number };
    recommendations: Array<{ name: string; score: number; reason: string }>;
  };
  invite: { inviterName: string; inviteUrl: string };
  "waitlist-confirmation": { position: number };
  "waitlist-invite": { inviteUrl: string };
  "subscription-started": { name: string; planName: string; expiry: string };
  "subscription-canceled": { name: string; planName: string; expiry: string };
  "account-suspended": { name: string; reason: string };
}

export type TemplateName = keyof TemplateData;

type Renderer<K extends TemplateName> = (data: TemplateData[K], unsubscribeUrl?: string) => RenderedEmail;

export const TEMPLATES: { [K in TemplateName]: Renderer<K> } = {
  welcome: ({ name }) => ({
    subject: "Welcome to SoulSync AI",
    html: layout({
      preheader: "Let's find someone who really gets you.",
      heading: `Welcome, ${firstName(name)}`,
      bodyHtml: `<p style="margin:0 0 12px">You're in. SoulSync AI matches people on who they really are — not just a photo — so the best next step is a short conversation with our AI interviewer.</p>
        <p style="margin:0">It takes about 10 minutes and builds your personality profile and your first AI-scored matches.</p>`,
      cta: { label: "Get started", url: `${appUrl}/dashboard` },
    }),
    text: `Welcome, ${firstName(name)}!\n\nSoulSync AI matches people on who they really are. The best next step is a short chat with our AI interviewer (about 10 minutes).\n\nGet started: ${appUrl}/dashboard\n`,
  }),

  "verify-email": ({ name, verifyUrl }) => ({
    subject: "Verify your email for SoulSync AI",
    html: layout({
      preheader: "Confirm your email address to finish setting up your account.",
      heading: "Confirm your email",
      bodyHtml: `<p style="margin:0 0 12px">Hi ${escapeHtml(firstName(name))}, please confirm this is your email address. The link works for 24 hours.</p>
        <p style="margin:0;color:#8b93ad;font-size:13px">If you didn't create a SoulSync AI account, you can ignore this email.</p>`,
      cta: { label: "Verify email", url: verifyUrl },
    }),
    text: `Hi ${firstName(name)},\n\nConfirm your email address (link valid for 24 hours):\n${verifyUrl}\n\nIf you didn't create an account, ignore this email.\n`,
  }),

  match: ({ name, matchName, score }, unsubscribeUrl) => ({
    subject: `It's a match with ${matchName}`,
    html: layout({
      preheader: `You and ${matchName} both said yes.`,
      heading: `You matched with ${matchName}`,
      bodyHtml: `<p style="margin:0 0 12px">Great news, ${escapeHtml(firstName(name))} — you and <strong>${escapeHtml(matchName)}</strong> both said yes.${
        score !== undefined ? ` Your AI compatibility is <strong>${score}%</strong>.` : ""
      }</p><p style="margin:0">Say hello while the spark is fresh.</p>`,
      cta: { label: "Start the conversation", url: `${appUrl}/matches` },
      unsubscribeUrl,
      footerNote: "You're receiving this because you have match alerts turned on.",
    }),
    text: `You matched with ${matchName}!${score !== undefined ? ` AI compatibility: ${score}%.` : ""}\n\nStart the conversation: ${appUrl}/matches\n`,
  }),

  "new-message": ({ name, senderName, preview, count }, unsubscribeUrl) => ({
    subject: count > 1 ? `${count} new messages from ${senderName}` : `New message from ${senderName}`,
    html: layout({
      preheader: preview.slice(0, 90),
      heading: count > 1 ? `${count} new messages from ${senderName}` : `${senderName} sent you a message`,
      bodyHtml: `<p style="margin:0 0 14px">Hi ${escapeHtml(firstName(name))},</p>
        <blockquote style="margin:0;padding:12px 16px;background:#f3f4f9;border-left:3px solid #7c3aed;border-radius:8px;color:#0b1026">${escapeHtml(preview.slice(0, 200))}</blockquote>`,
      cta: { label: "Reply", url: `${appUrl}/messages` },
      unsubscribeUrl,
      footerNote: "You're receiving this because you were offline and have message alerts turned on.",
    }),
    text: `${senderName}: ${preview.slice(0, 200)}\n\nReply: ${appUrl}/messages\n`,
  }),

  "weekly-report": ({ name, hasAIProfile, stats, recommendations }, unsubscribeUrl) => {
    const recs = recommendations
      .map(
        (rec) =>
          `<tr><td style="padding:10px 0;border-bottom:1px solid #eceef6"><strong style="color:#0b1026">${escapeHtml(rec.name)}</strong>
             <span style="display:inline-block;margin-left:8px;padding:2px 10px;border-radius:999px;background:#efe9fd;color:#5b21b6;font-size:12px;font-weight:600">${rec.score}% compatible</span><br>
             <span style="font-size:13px;color:#6b7391">${escapeHtml(rec.reason)}</span></td></tr>`,
      )
      .join("");

    const body = hasAIProfile
      ? `<p style="margin:0 0 14px">Here's your week, ${escapeHtml(firstName(name))}:</p>
         <p style="margin:0 0 18px;font-size:14px">❤️ <strong>${stats.newLikes}</strong> new likes &nbsp; 🤝 <strong>${stats.newMatches}</strong> new matches &nbsp; 💬 <strong>${stats.unreadMessages}</strong> unread messages</p>
         ${recommendations.length ? `<p style="margin:0 0 6px;font-weight:600;color:#0b1026">Your top AI matches right now</p><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${recs}</table>` : `<p style="margin:0">No new recommendations this week — check back as more people finish their AI interviews.</p>`}`
      : `<p style="margin:0 0 12px">Hi ${escapeHtml(firstName(name))}, you haven't taken the AI interview yet — it's what unlocks your compatibility scores and personal recommendations.</p><p style="margin:0">It takes about 10 minutes.</p>`;

    return {
      subject: "Your weekly compatibility report",
      html: layout({
        preheader: hasAIProfile ? `${stats.newMatches} new matches, ${recommendations.length} top recommendations.` : "Unlock your AI compatibility scores.",
        heading: "Your weekly compatibility report",
        bodyHtml: body,
        cta: { label: hasAIProfile ? "See all matches" : "Start the AI interview", url: hasAIProfile ? `${appUrl}/discover` : `${appUrl}/ai-interview` },
        unsubscribeUrl,
        footerNote: "You're receiving this weekly summary because it's turned on in your settings.",
      }),
      text: hasAIProfile
        ? `Your week: ${stats.newLikes} new likes, ${stats.newMatches} new matches, ${stats.unreadMessages} unread messages.\n\n${recommendations.map((r) => `- ${r.name} (${r.score}%): ${r.reason}`).join("\n")}\n\nSee all matches: ${appUrl}/discover\n`
        : `You haven't taken the AI interview yet. It unlocks your compatibility scores: ${appUrl}/ai-interview\n`,
    };
  },

  invite: ({ inviterName, inviteUrl }) => ({
    subject: `${inviterName} invited you to SoulSync AI`,
    html: layout({
      preheader: "A dating app that matches on who you are.",
      heading: `${inviterName} thinks you'd like SoulSync AI`,
      bodyHtml: `<p style="margin:0">SoulSync AI matches people through a conversation with an AI — values, lifestyle and communication style, not just a photo. Your friend invited you to try it.</p>`,
      cta: { label: "Join SoulSync AI", url: inviteUrl },
      footerNote: `${inviterName} sent you this invitation. If you don't know them, you can ignore this email.`,
    }),
    text: `${inviterName} invited you to SoulSync AI, the dating app that matches on who you are.\n\nJoin: ${inviteUrl}\n`,
  }),

  "waitlist-confirmation": ({ position }) => ({
    subject: "You're on the SoulSync AI waitlist",
    html: layout({
      preheader: `You're number ${position} on the list.`,
      heading: "You're on the list",
      bodyHtml: `<p style="margin:0 0 12px">Thanks for your interest in SoulSync AI. You're number <strong>${position}</strong> on the waitlist.</p><p style="margin:0">We're letting people in gradually so every new member gets a great experience. We'll email you the moment your invite is ready.</p>`,
    }),
    text: `You're on the SoulSync AI waitlist (#${position}). We'll email you when your invite is ready.\n`,
  }),

  "waitlist-invite": ({ inviteUrl }) => ({
    subject: "Your SoulSync AI invite is ready",
    html: layout({
      preheader: "Your spot is open.",
      heading: "Your invite is ready",
      bodyHtml: `<p style="margin:0">Your spot on SoulSync AI is open. Create your account with the link below — it's just for you.</p>`,
      cta: { label: "Create my account", url: inviteUrl },
    }),
    text: `Your SoulSync AI invite is ready. Create your account: ${inviteUrl}\n`,
  }),

  "subscription-started": ({ name, planName, expiry }) => ({
    subject: `Welcome to ${planName}`,
    html: layout({
      preheader: `Your ${planName} plan is active.`,
      heading: `You're on ${planName}`,
      bodyHtml: `<p style="margin:0 0 12px">Thanks, ${escapeHtml(firstName(name))}! Your <strong>${escapeHtml(planName)}</strong> plan is active and renews on <strong>${escapeHtml(expiry)}</strong>.</p><p style="margin:0">You can view your receipts or manage your plan any time.</p>`,
      cta: { label: "Manage subscription", url: `${appUrl}/billing` },
    }),
    text: `Your ${planName} plan is active and renews on ${expiry}.\nManage: ${appUrl}/billing\n`,
  }),

  "subscription-canceled": ({ name, planName, expiry }) => ({
    subject: `Your ${planName} plan will end on ${expiry}`,
    html: layout({
      preheader: `You keep ${planName} until ${expiry}.`,
      heading: "Your subscription is set to end",
      bodyHtml: `<p style="margin:0 0 12px">Hi ${escapeHtml(firstName(name))}, we've cancelled your <strong>${escapeHtml(planName)}</strong> plan. You'll keep all its features until <strong>${escapeHtml(expiry)}</strong>, and you won't be charged again.</p><p style="margin:0">Changed your mind? You can resubscribe any time.</p>`,
      cta: { label: "View plans", url: `${appUrl}/pricing` },
    }),
    text: `Your ${planName} plan is cancelled and stays active until ${expiry}. You won't be charged again.\n`,
  }),

  "account-suspended": ({ name, reason }) => ({
    subject: "Your SoulSync AI account has been suspended",
    html: layout({
      preheader: "Your account has been suspended.",
      heading: "Your account has been suspended",
      bodyHtml: `<p style="margin:0 0 12px">Hi ${escapeHtml(firstName(name))}, your account has been suspended for a violation of our community guidelines.</p><p style="margin:0 0 12px"><strong>Reason:</strong> ${escapeHtml(reason)}</p><p style="margin:0">If you believe this is a mistake, reply to this email or contact support.</p>`,
    }),
    text: `Your SoulSync AI account has been suspended.\nReason: ${reason}\nIf this is a mistake, contact support.\n`,
  }),
};

export function renderTemplate<K extends TemplateName>(
  name: K,
  data: TemplateData[K],
  unsubscribeUrl?: string,
): RenderedEmail {
  return (TEMPLATES[name] as Renderer<K>)(data, unsubscribeUrl);
}
