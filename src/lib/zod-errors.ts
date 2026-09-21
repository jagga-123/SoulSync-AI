import type { ZodError } from "zod";
import type { FieldError } from "@/types/api";

/** Flattens a ZodError into { fieldName: firstMessage } for form display. */
export function fieldErrorsFromZod(error: ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.errors) {
    const key = issue.path.join(".");
    if (key && !(key in result)) {
      result[key] = issue.message;
    }
  }
  return result;
}

/** Same shape, but from the backend's `error` array of { path, message }. */
export function fieldErrorsFromApi(details: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!Array.isArray(details)) return result;
  for (const entry of details as FieldError[]) {
    if (entry && typeof entry.path === "string" && !(entry.path in result)) {
      result[entry.path] = entry.message;
    }
  }
  return result;
}
