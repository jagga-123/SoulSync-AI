import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: string;
  /** Body decoded as a form (Stripe) — bracketed keys are kept as-is, e.g. `line_items[0][price]`. */
  form: Record<string, string>;
  /** Body decoded as JSON (Razorpay, Resend, SendGrid), or undefined. */
  json: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  /** A multipart/form-data body (Cloudinary uploads): text fields decoded, and each part's raw bytes by name. */
  multipart?: { fields: Record<string, string>; files: Record<string, Buffer> };
}

/** Splits a `multipart/form-data` body into named fields and file parts. */
function parseMultipart(raw: Buffer, contentType: string | undefined): RecordedRequest["multipart"] {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/.exec(contentType ?? "");
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
  if (!boundary) return undefined;

  const fields: Record<string, string> = {};
  const files: Record<string, Buffer> = {};
  const delimiter = Buffer.from(`--${boundary}`);
  let start = raw.indexOf(delimiter);
  while (start !== -1) {
    const next = raw.indexOf(delimiter, start + delimiter.length);
    if (next === -1) break;
    const part = raw.subarray(start + delimiter.length, next);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd !== -1) {
      const headerText = part.subarray(0, headerEnd).toString("utf8");
      const nameMatch = /name="([^"]+)"/.exec(headerText);
      const isFile = /filename="/.test(headerText);
      let value = part.subarray(headerEnd + 4);
      if (value.subarray(-2).toString() === "\r\n") value = value.subarray(0, -2);
      if (nameMatch) {
        if (isFile) files[nameMatch[1]!] = Buffer.from(value);
        else fields[nameMatch[1]!] = value.toString("utf8");
      }
    }
    start = next;
  }
  return { fields, files };
}

export interface FakeResponse {
  status?: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * A tiny local HTTP server that stands in for a third-party API (Stripe,
 * Razorpay, Resend, SendGrid…) so provider integrations can be exercised over
 * real HTTP with no network access and no credentials. `handler` returns the
 * canned response for a request, or undefined for a 404.
 */
export async function startFakeProvider(handler: (request: RecordedRequest) => FakeResponse | undefined) {
  const requests: RecordedRequest[] = [];

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks);
      const contentType = req.headers["content-type"];
      const isMultipart = contentType?.startsWith("multipart/form-data") ?? false;
      const body = isMultipart ? "" : raw.toString("utf8");
      let json: unknown;
      try {
        json = body ? JSON.parse(body) : undefined;
      } catch {
        json = undefined;
      }
      const form = json === undefined && body ? Object.fromEntries(new URLSearchParams(body)) : {};
      const multipart = isMultipart ? parseMultipart(raw, contentType) : undefined;

      const recorded: RecordedRequest = { method: req.method ?? "GET", path: (req.url ?? "/").split("?")[0] ?? "/", headers: req.headers, body, form, json, multipart };
      requests.push(recorded);

      const response = handler(recorded);
      if (!response) {
        res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: { message: "not found in fake" } }));
        return;
      }
      res.writeHead(response.status ?? 200, { "Content-Type": "application/json", ...(response.headers ?? {}) }).end(JSON.stringify(response.body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    requests,
    /** Requests matching a method and path prefix, oldest first. */
    matching: (method: string, pathPrefix: string) => requests.filter((r) => r.method === method && r.path.startsWith(pathPrefix)),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export type FakeProvider = Awaited<ReturnType<typeof startFakeProvider>>;
