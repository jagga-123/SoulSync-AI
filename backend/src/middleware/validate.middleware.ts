import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodSchema } from "zod";
import { ApiError } from "../utils/ApiError";

/**
 * Validates `req.body` (plus params/query, if the schema declares them)
 * against a Zod schema shaped like `z.object({ body, params?, query? })`.
 * On success, `req.body` is replaced with the parsed/coerced value so
 * downstream code can trust its shape and defaults.
 */
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      }) as { body?: unknown };

      if (parsed.body !== undefined) {
        req.body = parsed.body;
      }

      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const formatted = err.errors.map((e) => ({
          path: e.path.filter((segment) => segment !== "body").join("."),
          message: e.message,
        }));
        next(ApiError.unprocessable("Validation failed", formatted));
        return;
      }
      next(err);
    }
  };
}
