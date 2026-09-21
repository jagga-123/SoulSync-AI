import "../helpers/setup-env";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, it } from "node:test";

const BACKEND = resolve(__dirname, "../..");
const ROOT = resolve(BACKEND, "..");

function walk(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (["node_modules", ".next", ".next-e2e", "dist", "uploads"].includes(name)) return [];
    return statSync(path).isDirectory() ? walk(path, extensions) : extensions.some((e) => name.endsWith(e)) ? [path] : [];
  });
}

const shipped = [
  ...walk(join(BACKEND, "src"), [".ts"]),
  ...walk(join(BACKEND, "scripts"), [".ts"]),
  ...walk(join(ROOT, "src"), [".ts", ".tsx"]),
  join(ROOT, "render.yaml"),
  join(BACKEND, ".env.example"),
];
const rel = (path: string) => relative(ROOT, path).replace(/\\/g, "/");

describe("sender identity: one source of truth (EMAIL_FROM / EMAIL_REPLY_TO)", () => {
  it("no backend or frontend file hardcodes a sender address or a fallback sender", () => {
    // Any free-mail mailbox, the old placeholder domain, and no-reply style addresses. (Specific addresses are
    // deliberately not listed here: this file is published, and real mailboxes belong only in the local .env.)
    const banned = /no-?reply@|noreply@|@soulsync\.ai\b|@(gmail|yahoo|outlook|hotmail)\.com/i;
    const offenders = shipped.filter((file) => banned.test(readFileSync(file, "utf8"))).map(rel);
    assert.deepEqual(offenders, [], "sender addresses belong in the environment (.env), never in source");
  });

  it("only the email client, the health module and the env schema read EMAIL_FROM / EMAIL_REPLY_TO", () => {
    const readers = walk(join(BACKEND, "src"), [".ts"])
      .filter((file) => /EMAIL_FROM|EMAIL_REPLY_TO/.test(readFileSync(file, "utf8")))
      .map(rel)
      .sort();
    assert.deepEqual(readers, ["backend/src/config/env.ts", "backend/src/services/email/health.ts", "backend/src/services/emailClient.ts"]);
  });

  it("nothing but the email client hands a message to a transport, so nobody can pick a different From", () => {
    const senders = walk(join(BACKEND, "src"), [".ts"])
      .filter((file) => /\.send\(\{/.test(readFileSync(file, "utf8")) && /getEmailProvider|EmailProvider/.test(readFileSync(file, "utf8")))
      .map(rel)
      .sort();
    assert.deepEqual(senders, ["backend/src/services/emailClient.ts"]);
    // ...and the request type has no `from` / `replyTo` override.
    const client = readFileSync(join(BACKEND, "src/services/emailClient.ts"), "utf8");
    const requestType = /export interface SendEmailRequest \{[\s\S]*?\n\}/.exec(client)?.[0] ?? "";
    assert.ok(requestType && !/\bfrom\b|replyTo/.test(requestType), "SendEmailRequest must not allow overriding the sender");
  });

  it("the env schema has no default for EMAIL_FROM", () => {
    const schema = readFileSync(join(BACKEND, "src/config/env.ts"), "utf8");
    assert.match(schema, /EMAIL_FROM: optionalString,/);
    assert.ok(!/EMAIL_FROM:[^\n]*\.default\(/.test(schema));
  });
});
