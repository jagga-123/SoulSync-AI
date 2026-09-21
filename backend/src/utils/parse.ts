import type { ZodTypeAny, z } from "zod";
import { ApiError } from "./ApiError";

/** Validates `data` against a Zod schema, throwing the API's standard 422 on failure. */
export function parseOrThrow<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw ApiError.unprocessable(
      "Validation failed",
      result.error.errors.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

/** A path/route param that must be a Mongo ObjectId. */
export function requireObjectId(value: string | undefined, label = "id"): string {
  if (!value || !/^[0-9a-fA-F]{24}$/.test(value)) throw ApiError.badRequest(`Invalid ${label}`);
  return value;
}
