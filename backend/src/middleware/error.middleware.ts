import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ApiError } from "../utils/ApiError";
import { isProduction } from "../config/env";
import { logger } from "../config/logger";
import { captureError } from "../platform/error-tracker";

interface MongoDuplicateKeyError {
  code: 11000;
  keyPattern?: Record<string, unknown>;
}

function isMongoDuplicateKeyError(err: unknown): err is MongoDuplicateKeyError {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === 11000
  );
}

interface ClientHttpError {
  status?: number;
  statusCode?: number;
  type?: string;
}

/** A 4xx raised by Express's own middleware (not by our ApiError). */
function isClientHttpError(err: unknown): err is ClientHttpError & Error {
  if (!(err instanceof Error)) return false;
  const { status, statusCode } = err as ClientHttpError;
  const code = status ?? statusCode;
  return typeof code === "number" && code >= 400 && code < 500;
}

function serializeError(err: unknown) {
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return err;
}

/**
 * Central error handler — every thrown/`next(err)`-forwarded error in the
 * app ends up here and is normalized into the standard
 * `{ success:false, message, error }` response shape.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let statusCode = 500;
  let message = "Something went wrong";
  let errors: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 422;
    message = "Validation failed";
    errors = Object.values(err.errors).map((e) => e.message);
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid value for field "${err.path}"`;
  } else if (isMongoDuplicateKeyError(err)) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern ?? {})[0] ?? "field";
    message = `An account with this ${field} already exists`;
  } else if (isClientHttpError(err)) {
    // Body-parser / http-errors: malformed JSON, oversized payloads, bad encodings…
    statusCode = err.status ?? err.statusCode ?? 400;
    message =
      err.type === "entity.too.large"
        ? "The request body is too large."
        : err.type === "entity.parse.failed"
          ? "The request body isn't valid JSON."
          : "The request couldn't be processed.";
  } else if (err instanceof Error) {
    if (err.name === "JsonWebTokenError") {
      statusCode = 401;
      message = "Invalid authentication token";
    } else if (err.name === "TokenExpiredError") {
      statusCode = 401;
      message = "Session expired. Please log in again.";
    } else if (!isProduction) {
      message = err.message;
    }
  }

  if (statusCode >= 500) {
    const requestId = (req as { id?: string }).id;
    logger.error({ err, requestId, method: req.method, path: req.originalUrl, userId: req.user?.id }, "unhandled request error");
    captureError(err, { requestId, userId: req.user?.id, method: req.method, path: req.originalUrl });
  }

  res.status(statusCode).json({
    success: false,
    message,
    error: errors ?? (isProduction ? undefined : serializeError(err)),
  });
}
