/**
 * Email health check — validates the real configuration against the real providers. Never prints secrets.
 *
 *   npm run check:email                       # configuration, SMTP connection + login, sender, DNS (SPF/DKIM/DMARC), templates
 *   npm run check:email -- --send-test        # ALSO sends one real email (the verify-email template) through the app's real
 *                                             # transport (EMAIL_PROVIDER=smtp → the SMTP relay only, no APIs, no fallbacks)
 *   npm run check:email -- --send-test --to you@example.com --all-templates
 *
 * The test recipient is `--to`, else EMAIL_REPLY_TO / EMAIL_FROM (your own address). It is never guessed elsewhere.
 * Exit code 1 when anything FAILS (warnings don't fail the run).
 */
import { promises as dns } from "node:dns";
import { adminEmails, appUrl, env, isProduction } from "../src/config/env";
import { logger } from "../src/config/logger";
import { checkEmailHealth, senderConfigured } from "../src/services/email/health";
import { setEmailProviderForTests, brevoTransport, parseAddress, smtpSettingsInUse, verifySmtpConnection, BREVO_SMTP_HOST } from "../src/services/email/providers";
import { emailProviderChain, sendEmail } from "../src/services/emailClient";
import { renderTemplate, TEMPLATES, type TemplateData, type TemplateName } from "../src/services/email/templates";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const secrets = [env.BREVO_API_KEY, env.RESEND_API_KEY, env.SENDGRID_API_KEY, env.SMTP_PASS].filter(Boolean) as string[];
const redact = (text: string) => secrets.reduce((out, key) => out.split(key).join("[key]"), text);
const mask = (email: string) => email.replace(/^(.{1,2})[^@]*(@.*)$/, "$1***$2");
const TIMEOUT = 15_000;

type Status = "PASS" | "WARN" | "FAIL" | "INFO";
const results: Array<{ area: string; status: Status; detail: string; fix?: string }> = [];
let section = "";
const heading = (title: string) => {
  section = title;
  console.log(`\n${title}`);
};
const report = (status: Status, area: string, detail: string, fix?: string) => {
  results.push({ area: `${section} › ${area}`, status, detail, fix });
  console.log(`  ${status.padEnd(4)}  ${area} — ${detail}`);
  if (fix && status !== "PASS") console.log(`        fix: ${fix}`);
};

const from = parseAddress(env.EMAIL_FROM ?? "");
const fromDomain = from.email.split("@")[1]?.toLowerCase() ?? "";
const FREE_MAIL = /^(gmail|googlemail|yahoo|outlook|hotmail|live|icloud|proton|protonmail|aol|gmx|yandex|zoho)\./;

async function json(url: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT) });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const withTimeout = <T>(promise: Promise<T>, ms = 5000): Promise<T> =>
  Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

// ---------------------------------------------------------------------------

function checkConfiguration() {
  heading("1. Configuration");
  const chain = emailProviderChain();

  if (env.EMAIL_PROVIDER === "log") report("FAIL", "EMAIL_PROVIDER", "is 'log' — emails are only written to the server log, nobody receives them", "Set EMAIL_PROVIDER=brevo once Brevo credentials pass below.");
  else if (env.EMAIL_PROVIDER === "smtp") report("PASS", "EMAIL_PROVIDER", "smtp — every email goes through the SMTP relay only (no provider APIs, no fallbacks)");
  else report(env.EMAIL_PROVIDER === "brevo" ? "PASS" : "WARN", "EMAIL_PROVIDER", `${env.EMAIL_PROVIDER} — send order: ${chain.join(" → ")}`, env.EMAIL_PROVIDER === "brevo" ? undefined : "Use EMAIL_PROVIDER=brevo so Brevo is tried first.");

  if (!env.EMAIL_FROM) report("FAIL", "EMAIL_FROM", "not set — there is no fallback sender, so nothing can be sent", 'Set EMAIL_FROM="SoulSync AI <the sender you verified in Brevo>" (Brevo → Senders, Domains & Dedicated IPs → Senders).');
  else if (!from.email.includes("@")) report("FAIL", "EMAIL_FROM", `"${env.EMAIL_FROM}" is not a valid address`, 'Use: EMAIL_FROM="SoulSync AI <you@yourdomain.com>"');
  else if (FREE_MAIL.test(fromDomain)) report("WARN", "EMAIL_FROM", `${mask(from.email)} is a free-mail address: fine for testing, but SPF/DKIM/DMARC can't be aligned for ${fromDomain}, so real mail may be spam-foldered or rejected`, "Use an address on a domain you own and authenticate it in Brevo.");
  else report("PASS", "EMAIL_FROM", `${from.name ? `"${from.name}" ` : ""}${mask(from.email)} — every email is sent under this single identity`);

  if (env.EMAIL_REPLY_TO) report("PASS", "EMAIL_REPLY_TO", `replies go to ${mask(parseAddress(env.EMAIL_REPLY_TO).email)}`);
  else if (/no-?reply/i.test(from.email)) report("WARN", "EMAIL_REPLY_TO", "not set and the sender is a no-reply address — replies from members go nowhere", "Set EMAIL_REPLY_TO=support@yourdomain.com (a mailbox you read).");
  else report("PASS", "EMAIL_REPLY_TO", "not set — replies go to the sender address");

  if (!env.API_PUBLIC_URL) {
    report(isProduction ? "FAIL" : "WARN", "API_PUBLIC_URL", "not set — notification emails are sent WITHOUT the List-Unsubscribe / one-click header", "Set API_PUBLIC_URL=https://<your-api-host>/api");
  } else if (isProduction && !env.API_PUBLIC_URL.startsWith("https://")) {
    report("FAIL", "API_PUBLIC_URL", "must be https:// (one-click unsubscribe requires HTTPS)", "Use the https URL of your API.");
  } else {
    report("PASS", "API_PUBLIC_URL", `${env.API_PUBLIC_URL} — List-Unsubscribe + List-Unsubscribe-Post headers are added to notification emails`);
    if (/localhost|127\.0\.0\.1/.test(env.API_PUBLIC_URL)) report("WARN", "API_PUBLIC_URL reachable", "points at localhost — mailbox providers can't reach it, so one-click unsubscribe won't work from a real inbox", "Fine for development; use the public API URL in production.");
  }
  report(isProduction && !appUrl.startsWith("https://") ? "FAIL" : "PASS", "CLIENT_URL (links inside emails)", appUrl);
  void adminEmails;
}

/** EMAIL_PROVIDER=smtp: connect, negotiate TLS and log in to the relay. No Brevo API call is made. */
async function checkSmtp() {
  heading("2. SMTP relay (the only transport in use)");
  const settings = smtpSettingsInUse();
  if (!settings || !settings.user || !settings.pass) {
    report("FAIL", "credentials", "SMTP_HOST, SMTP_USER and SMTP_PASS must all be set", "Brevo → SMTP & API → SMTP tab: copy the 'Login' into SMTP_USER and the SMTP key into SMTP_PASS.");
    return;
  }
  report("INFO", "transport", `${settings.host}:${settings.port}, ${settings.secure ? "implicit TLS" : "STARTTLS " + (settings.requireTLS ? "(required — no plaintext fallback)" : "(optional)")}, login ${mask(settings.user)}`);
  const started = Date.now();
  const reachable = await verifySmtpConnection(settings, { withAuth: false, timeoutMs: TIMEOUT });
  if (!reachable.ok) {
    report("FAIL", "SMTP connection", redact(`cannot connect to ${settings.host}:${settings.port} — ${reachable.reason}`), "Port 587 may be blocked by a firewall/ISP; try SMTP_PORT=2525 (Brevo also listens there) or another network.");
    return;
  }
  report("PASS", "SMTP connection", `${settings.host}:${settings.port} answered and negotiated TLS (${Date.now() - started} ms)`);
  const login = await verifySmtpConnection(settings, { timeoutMs: TIMEOUT });
  if (login.ok) report("PASS", "SMTP login", "the relay accepted the login and SMTP key");
  else report("FAIL", "SMTP login", redact(login.reason), "Use the exact SMTP login from Brevo → SMTP & API → SMTP tab ('Login') as SMTP_USER and an active SMTP key as SMTP_PASS (generate a new one if unsure).");
  report("WARN", "sender verification", "can't be checked over SMTP — Brevo validates the sender when a message is sent (unverified senders are refused)", "Run with --send-test: a delivered test email proves the sender.");
}

async function checkBrevo() {
  if (env.EMAIL_PROVIDER === "smtp") return checkSmtp();
  heading("2. Brevo (primary provider)");
  const transport = brevoTransport();
  const key = env.BREVO_API_KEY ?? "";

  if (!transport) {
    const isSmtpKey = key.startsWith("xsmtpsib-");
    report(
      "FAIL",
      "credentials",
      isSmtpKey ? "BREVO_API_KEY is an SMTP key (xsmtpsib-…) and SMTP_USER is not set — nothing can send" : "no usable Brevo credentials (need an API key xkeysib-…, or SMTP_USER + the SMTP key)",
      isSmtpKey
        ? "Set SMTP_USER to the SMTP login shown at Brevo → SMTP & API → SMTP tab (usually xxxxxx@smtp-brevo.com — copy it from the 'Login' field; it is not necessarily your account email). Or create an API key on the 'API keys' tab and put it in BREVO_API_KEY."
        : "Brevo → SMTP & API → API keys → Generate a new API key → BREVO_API_KEY.",
    );
    // Still prove the relay is reachable from this machine (port 587 is often blocked by firewalls).
    await smtpReachability(env.SMTP_HOST ?? BREVO_SMTP_HOST, env.SMTP_PORT);
    return;
  }

  if (transport.kind === "api") {
    const root = (env.BREVO_BASE_URL ?? "https://api.brevo.com").replace(/\/$/, "");
    const headers = { "api-key": transport.apiKey };
    const account = await json(`${root}/v3/account`, headers);
    if (account.status !== 200) {
      report("FAIL", "API key", `rejected (HTTP ${account.status} ${redact(String(account.body?.message ?? ""))})`, "Generate a new API key (Brevo → SMTP & API → API keys) and check Brevo → Security → Authorised IPs.");
      return;
    }
    const plan = account.body?.plan?.[0];
    report("PASS", "API key", `accepted${plan ? ` — plan ${plan.type}${plan.credits !== undefined ? `, ${plan.credits} credits` : ""}` : ""}`);
    if (account.body?.relay?.data?.userName) report("INFO", "SMTP login for this account", `${account.body.relay.data.userName} (use as SMTP_USER for the SMTP relay)`);

    const senders = await json(`${root}/v3/senders`, headers);
    const list: Array<{ email: string; active: boolean }> = senders.body?.senders ?? [];
    const sender = list.find((s) => s.email.toLowerCase() === from.email.toLowerCase());
    if (sender?.active) report("PASS", "sender verification", `${mask(from.email)} is an active Brevo sender`);
    else report("FAIL", "sender verification", sender ? `${mask(from.email)} exists in Brevo but is not active/verified` : `${mask(from.email)} is not a registered Brevo sender — Brevo will refuse to send from it`, list.length ? `Set EMAIL_FROM to one of your verified senders: ${list.filter((s) => s.active).map((s) => s.email).join(", ") || "(none active yet)"} — or add and verify ${from.email} in Brevo → Senders.` : "Brevo → Senders, Domains & Dedicated IPs → Senders → add and verify the address.");
    const domains = await json(`${root}/v3/senders/domains`, headers);
    const domain = (domains.body?.domains ?? []).find((d: { domain_name: string }) => d.domain_name.toLowerCase() === fromDomain);
    if (domain?.authenticated) report("PASS", "domain authentication", `${fromDomain} is authenticated in Brevo (SPF/DKIM)`);
    else report(FREE_MAIL.test(fromDomain) ? "WARN" : "FAIL", "domain authentication", domain ? `${fromDomain} is added but not authenticated yet` : `${fromDomain} is not authenticated in Brevo`, FREE_MAIL.test(fromDomain) ? "Free-mail domains can't be authenticated; use your own domain for production." : "Brevo → Senders, Domains & Dedicated IPs → Domains → add the domain and publish the DNS records it shows.");
    return;
  }

  // SMTP relay
  const { host, port, user } = transport.settings;
  report("INFO", "transport", `SMTP relay ${host}:${port} (STARTTLS), login ${mask(user ?? "")}`);
  if (!(await smtpReachability(host, port))) return;
  try {
    const nodemailer = await import("nodemailer");
    await nodemailer.createTransport({ host, port, secure: transport.settings.secure, requireTLS: transport.settings.requireTLS, connectionTimeout: TIMEOUT, greetingTimeout: TIMEOUT, auth: { user: transport.settings.user ?? "", pass: transport.settings.pass ?? "" } }).verify();
    report("PASS", "SMTP login", "the relay accepted the login and SMTP key");
  } catch (err) {
    const e = err as { responseCode?: number; response?: string; message?: string };
    report("FAIL", "SMTP login", redact(`rejected — ${e.responseCode ?? ""} ${(e.response ?? e.message ?? "").replace(/\s+/g, " ")}`.trim()), "Use the exact SMTP login from Brevo → SMTP & API → SMTP tab ('Login') as SMTP_USER, and the SMTP key (not the account password) as SMTP_PASS / BREVO_API_KEY.");
    return;
  }
  report("WARN", "sender verification", "can't be checked over SMTP — Brevo validates the sender when a message is sent (unverified senders are refused)", "Run: npm run check:email -- --send-test  (a real send proves the sender). Or use an API key to list verified senders here.");
}

async function smtpReachability(host: string, port: number): Promise<boolean> {
  try {
    const nodemailer = await import("nodemailer");
    await nodemailer.createTransport({ host, port, secure: env.SMTP_SECURE, requireTLS: !env.SMTP_SECURE && host.endsWith("brevo.com"), connectionTimeout: TIMEOUT, greetingTimeout: TIMEOUT }).verify();
    report("PASS", "relay reachable", `${host}:${port} answered and negotiated TLS from this machine`);
    return true;
  } catch (err) {
    report("FAIL", "relay reachable", redact(`cannot connect to ${host}:${port} — ${err instanceof Error ? err.message : String(err)}`), "Port 587 may be blocked by a firewall/ISP; try SMTP_PORT=2525 (Brevo also listens there) or the API transport.");
    return false;
  }
}

async function checkFallbacks() {
  heading("3. Fallback providers (Resend → SendGrid)");
  if (env.EMAIL_PROVIDER === "smtp") {
    report("INFO", "fallbacks", "not used — EMAIL_PROVIDER=smtp sends through the SMTP relay only, so Resend/SendGrid are neither called nor checked");
    return;
  }
  if (env.RESEND_API_KEY) {
    const res = await json(`${(env.RESEND_BASE_URL ?? "https://api.resend.com").replace(/\/$/, "")}/domains`, { Authorization: `Bearer ${env.RESEND_API_KEY}` });
    if (res.status === 200) {
      const domain = (res.body?.data ?? []).find((d: { name: string }) => d.name.toLowerCase() === fromDomain);
      report(domain?.status === "verified" ? "PASS" : "WARN", "resend", domain?.status === "verified" ? `key accepted, ${fromDomain} verified` : `key accepted, but ${fromDomain} is ${domain ? `"${domain.status}"` : "not added"} in Resend — it can only fall back once the domain (or another EMAIL_FROM domain) is verified`, `Resend → Domains → verify ${fromDomain}.`);
    } else if (res.status === 401 && String(res.body?.name ?? "").includes("restricted")) report("WARN", "resend", "key accepted (sending-only key); the domain status can't be read with it", "Verify the domain in the Resend dashboard.");
    else report("WARN", "resend", `key rejected (HTTP ${res.status})`, "Create a new key at resend.com/api-keys.");
  } else report("INFO", "resend", "not configured (optional fallback)");

  if (env.SENDGRID_API_KEY) {
    const res = await json(`${(env.SENDGRID_BASE_URL ?? "https://api.sendgrid.com").replace(/\/$/, "")}/v3/verified_senders`, { Authorization: `Bearer ${env.SENDGRID_API_KEY}` });
    if (res.status !== 200) report("WARN", "sendgrid", `key too restricted or rejected (HTTP ${res.status})`, "Use a key with Sender Authentication access, or verify the sender in the dashboard.");
    else {
      const ok = (res.body?.results ?? []).some((s: { from_email: string; verified: boolean }) => s.from_email.toLowerCase() === from.email.toLowerCase() && s.verified);
      report(ok ? "PASS" : "WARN", "sendgrid", ok ? "key accepted, sender verified" : `key accepted, but ${mask(from.email)} is not a verified sender`, "SendGrid → Settings → Sender Authentication.");
    }
  } else report("INFO", "sendgrid", "not configured (optional fallback)");
}

async function checkDns() {
  heading("4. Deliverability — DNS for the sender domain");
  if (!fromDomain || FREE_MAIL.test(fromDomain) || flag("--skip-dns") || process.env.CHECK_EMAIL_SKIP_DNS) {
    report("INFO", "SPF / DKIM / DMARC", FREE_MAIL.test(fromDomain) ? `skipped — ${fromDomain} is a free-mail domain you don't control` : "skipped");
    return;
  }
  const txt = async (name: string) => (await withTimeout(dns.resolveTxt(name)).catch(() => [] as string[][])).map((parts) => parts.join(""));
  const spf = (await txt(fromDomain)).find((r) => r.toLowerCase().startsWith("v=spf1"));
  if (!spf) report("WARN", "SPF", `no SPF record on ${fromDomain}`, `Add a TXT record on ${fromDomain}: "v=spf1 include:spf.brevo.com ~all"`);
  else if (/spf\.brevo\.com|sendinblue\.com/i.test(spf)) report("PASS", "SPF", "present and authorises Brevo");
  else report("WARN", "SPF", `present but does not include Brevo: ${spf.slice(0, 120)}`, 'Add include:spf.brevo.com to the existing SPF record (there must be only ONE SPF record).');

  const dkimNames = ["brevo1._domainkey", "brevo2._domainkey", "mail._domainkey"].map((s) => `${s}.${fromDomain}`);
  let dkim = false;
  for (const name of dkimNames) {
    const cname = await withTimeout(dns.resolveCname(name)).catch(() => [] as string[]);
    if (cname.length || (await txt(name)).some((r) => /v=DKIM1|k=rsa/i.test(r))) { dkim = true; break; }
  }
  report(dkim ? "PASS" : "WARN", "DKIM", dkim ? "a Brevo DKIM key is published" : `no DKIM record found at ${dkimNames[0]}`, "Brevo → Domains → your domain → copy the DKIM records (brevo1/brevo2._domainkey) into your DNS.");

  const dmarc = (await txt(`_dmarc.${fromDomain}`)).find((r) => r.toUpperCase().startsWith("V=DMARC1"));
  report(dmarc ? "PASS" : "WARN", "DMARC", dmarc ? dmarc.slice(0, 100) : `no DMARC record at _dmarc.${fromDomain}`, `Add a TXT record on _dmarc.${fromDomain}: "v=DMARC1; p=none; rua=mailto:you@${fromDomain}" (start with p=none, tighten later).`);
}

// Realistic sample data for every template — the real renderer, real APP URL, no database.
const SAMPLE: { [K in TemplateName]: TemplateData[K] } = {
  welcome: { name: "Asha Verma" },
  "verify-email": { name: "Asha Verma", verifyUrl: `${appUrl}/verify-email?token=0123456789abcdef01234567.${"ab".repeat(32)}` },
  match: { name: "Asha Verma", matchName: "Ravi Kumar", score: 91 },
  "new-message": { name: "Asha Verma", senderName: "Ravi Kumar", preview: "Hey Asha, how was your weekend hike?", count: 2 },
  "weekly-report": { name: "Asha Verma", hasAIProfile: true, stats: { newLikes: 3, newMatches: 1, unreadMessages: 2 }, recommendations: [{ name: "Ravi", score: 91, reason: "You both value honesty and outdoor adventures." }] },
  invite: { inviterName: "Asha Verma", inviteUrl: `${appUrl}/register?ref=ABC123` },
  "waitlist-confirmation": { position: 42 },
  "waitlist-invite": { inviteUrl: `${appUrl}/register?invite=xyz` },
  "subscription-started": { name: "Asha Verma", planName: "Premium", expiry: "20 Oct 2026" },
  "subscription-canceled": { name: "Asha Verma", planName: "Premium", expiry: "20 Oct 2026" },
  "account-suspended": { name: "Asha Verma", reason: "Repeated reports from other members" },
};
const NOTIFICATION_TEMPLATES: TemplateName[] = ["match", "new-message", "weekly-report"];

function checkTemplates() {
  heading("5. Deliverability — all templates (HTML + plain text, mobile, links)");
  const problems: string[] = [];
  let bytesMax = 0;
  for (const name of Object.keys(TEMPLATES) as TemplateName[]) {
    const unsubscribeUrl = NOTIFICATION_TEMPLATES.includes(name) ? `${appUrl}/unsubscribe?token=sample` : undefined;
    const { subject, html, text } = renderTemplate(name, SAMPLE[name] as never, unsubscribeUrl);
    const bytes = Buffer.byteLength(html);
    bytesMax = Math.max(bytesMax, bytes);
    if (!text.trim()) problems.push(`${name}: no plain-text version`);
    if (!/<meta name="viewport"/i.test(html)) problems.push(`${name}: no viewport meta (poor mobile rendering)`);
    if (!/<table[^>]*role="presentation"/i.test(html) || !/max-width:\s*\d+px/i.test(html)) problems.push(`${name}: not a fluid table layout`);
    if (bytes > 90_000) problems.push(`${name}: ${bytes} bytes (Gmail clips messages above ~102 KB)`);
    if (/<script/i.test(html)) problems.push(`${name}: contains <script>`);
    if (subject.length > 78) problems.push(`${name}: subject is ${subject.length} chars (may be truncated)`);
    const links = [...html.matchAll(/href="([^"]+)"/g)].map((m) => (m[1] as string).replace(/&amp;/g, "&"));
    if (links.some((l) => !/^https?:\/\//.test(l))) problems.push(`${name}: relative or non-http link`);
    const cta = links.find((l) => l.startsWith(appUrl) && !l.includes("/unsubscribe"));
    if (cta && !text.includes(cta)) problems.push(`${name}: the plain-text version lacks the button link`);
    if (NOTIFICATION_TEMPLATES.includes(name) && !/Unsubscribe/.test(html)) problems.push(`${name}: notification email without an unsubscribe link`);
  }
  report(problems.length ? "WARN" : "PASS", `${Object.keys(TEMPLATES).length} templates`, problems.length ? problems.join("; ") : `all have HTML + plain text, viewport meta, fluid 560px layout, absolute links, and unsubscribe where required (largest ${Math.round(bytesMax / 1024)} KB)`);
  report("PASS", "headers", env.API_PUBLIC_URL ? "notification emails carry List-Unsubscribe + List-Unsubscribe-Post (one-click); Reply-To " + (env.EMAIL_REPLY_TO ? "is set" : "is not set") : "List-Unsubscribe is disabled until API_PUBLIC_URL is set");
}

async function sendTest() {
  heading("6. Real send test (through the app's real transport)");
  // Default: your own configured address (Reply-To, else the sender). Never the SMTP login — that is a relay account, not a mailbox.
  const ownAddress = env.EMAIL_REPLY_TO ? parseAddress(env.EMAIL_REPLY_TO).email : senderConfigured() ? from.email : undefined;
  const to = option("--to") ?? ownAddress;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    report("FAIL", "recipient", "no test recipient — pass --to you@example.com (or set EMAIL_REPLY_TO / EMAIL_FROM to your own address)", "npm run check:email -- --send-test --to <your inbox>");
    return;
  }
  if (env.EMAIL_PROVIDER === "log") {
    // Test delivery as it will be once switched on, without editing .env first.
    (env as unknown as Record<string, unknown>).EMAIL_PROVIDER = "brevo";
    setEmailProviderForTests(undefined);
    report("INFO", "provider", "EMAIL_PROVIDER=log in .env — testing the real Brevo → Resend → SendGrid chain as if it were 'brevo'");
  }
  const names = flag("--all-templates") ? (Object.keys(TEMPLATES) as TemplateName[]) : (["verify-email"] as TemplateName[]);
  for (const name of names) {
    const { subject, html, text } = renderTemplate(name, SAMPLE[name] as never, NOTIFICATION_TEMPLATES.includes(name) ? `${appUrl}/unsubscribe?token=sample` : undefined);
    const started = Date.now();
    try {
      const result = await sendEmail({ to, subject: `[SoulSync test] ${subject}`, html, text, headers: {} });
      const detail = `accepted for ${mask(to)} via ${result.provider}${result.id ? ` (message id ${redact(String(result.id)).slice(0, 80)})` : ""} in ${Date.now() - started} ms`;
      report("PASS", `send ${name}`, detail);
      if (result.provider === "smtp" || result.detail) {
        // nodemailer raises EENVELOPE / a 5xx if the relay refuses the sender or the recipient; getting here means it did neither.
        report("PASS", "sender accepted", `the relay accepted the sender ${mask(from.email)} — no sender-validation error`);
        report(/^250\b/.test(result.detail ?? "") ? "PASS" : "WARN", "queued", `server reply: ${redact(result.detail ?? "(none)")}`, "A 250 reply means the relay queued the message for delivery; check Brevo → Transactional → Logs for its final status.");
      }
      logger.info({ template: name, to: mask(to), sender: mask(from.email), provider: result.provider, messageId: result.id, serverReply: result.detail, ms: Date.now() - started, outcome: "accepted" }, "test email send result");
    } catch (err) {
      const reason = redact(err instanceof Error ? err.message : String(err)).slice(0, 500);
      report("FAIL", `send ${name}`, reason, "See the error above: fix the login/SMTP key, or verify the EMAIL_FROM sender with your provider.");
      logger.warn({ template: name, to: mask(to), reason, outcome: "failed" }, "test email send result");
      break;
    }
    if (names.length > 1) await new Promise((resolve) => setTimeout(resolve, Number(process.env.CHECK_EMAIL_PACING_MS ?? 1200)));
  }
}

async function main() {
  console.log(`\nEMAIL_PROVIDER=${env.EMAIL_PROVIDER}   EMAIL_FROM=${from.name ? `"${from.name}" ` : ""}${mask(from.email)}   NODE_ENV=${env.NODE_ENV}`);
  checkConfiguration();
  await checkBrevo();
  await checkFallbacks();
  await checkDns();
  checkTemplates();
  if (flag("--send-test")) await sendTest();
  else console.log("\n(no email was sent — add --send-test [--to you@example.com] [--all-templates] to send real ones)");

  // The same answer GET /api/email/health gives.
  const { health } = await checkEmailHealth({ force: true });
  console.log(`\nGET /api/email/health would report: ${JSON.stringify({ smtpConnected: health.smtpConnected, provider: health.provider, senderConfigured: health.senderConfigured, readyForProduction: health.readyForProduction, status: health.status })}`);
  for (const warning of health.warnings) console.log(`  ! ${warning}`);

  const count = (s: Status) => results.filter((r) => r.status === s).length;
  const failed = results.filter((r) => r.status === "FAIL");
  console.log(`\nSummary: ${count("PASS")} passed, ${count("WARN")} warnings, ${count("FAIL")} failed`);
  if (failed.length) {
    console.log("Blockers:");
    for (const r of failed) console.log(`  ✗ ${r.area}: ${r.detail}${r.fix ? `\n      → ${r.fix}` : ""}`);
  }
  console.log(failed.length ? "\nNOT ready for production email.\n" : "\nReady: nothing failed.\n");
  process.exit(failed.length ? 1 : 0);
}

void main();
