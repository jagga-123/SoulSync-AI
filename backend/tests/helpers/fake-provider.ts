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
      const body = Buffer.concat(chunks).toString("utf8");
      let json: unknown;
      try {
        json = body ? JSON.parse(body) : undefined;
      } catch {
        json = undefined;
      }
      const form = json === undefined && body ? Object.fromEntries(new URLSearchParams(body)) : {};

      const recorded: RecordedRequest = { method: req.method ?? "GET", path: (req.url ?? "/").split("?")[0] ?? "/", headers: req.headers, body, form, json };
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
