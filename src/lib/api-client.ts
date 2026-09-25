import { API_URL } from "./env";
import { getToken } from "./auth-storage";
import type { ApiErrorBody, ApiSuccessBody } from "@/types/api";

export class ApiClientError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Attach the stored bearer token to this request. Defaults to true. */
  auth?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiClientError(
      "Couldn't reach the SoulSync server. Check that the API is running and NEXT_PUBLIC_API_URL is correct.",
      0,
    );
  }

  const json = (await response.json().catch(() => null)) as
    | ApiSuccessBody<T>
    | ApiErrorBody
    | null;

  if (!response.ok || !json || json.success === false) {
    const message = json?.message ?? `Request failed with status ${response.status}`;
    const details = json && json.success === false ? json.error : undefined;
    throw new ApiClientError(message, response.status, details);
  }

  return json.data;
}
