import type { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { verifyToken } from "../utils/jwt";
import { User } from "../models/User.model";
import { asyncHandler } from "../utils/asyncHandler";

// Activity is recorded at most this often per user — enough for daily/weekly
// active-user metrics without a database write on every request.
const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Verifies the `Authorization: Bearer <token>` header and attaches the
 * authenticated user to `req.user`. Re-checks the user still exists in the
 * database so a deleted account can't keep using an old, still-valid token —
 * and, since Phase 6, that the account hasn't been suspended.
 */
export const protect = asyncHandler(
  async (req: Request, _res: Response, next: NextFunction) => {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Authentication required. Please log in.");
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      throw ApiError.unauthorized("Authentication required. Please log in.");
    }

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw ApiError.unauthorized("Invalid or expired session. Please log in again.");
    }

    const user = await User.findById(payload.id);
    if (!user) {
      throw ApiError.unauthorized("The user for this session no longer exists.");
    }
    if (user.status === "suspended") {
      throw new ApiError(403, "Your account has been suspended. Contact support if you think this is a mistake.", {
        code: "ACCOUNT_SUSPENDED",
      });
    }

    const stale =
      !user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > ACTIVITY_WRITE_INTERVAL_MS;
    if (stale) {
      // Best-effort: activity tracking must never fail a request.
      void User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).catch(() => undefined);
    }

    req.user = { id: user.id, role: user.role };
    next();
  },
);

/** Must run after `protect`. Reads the role from the database (via protect),
 * not from the JWT, so demoting an admin takes effect immediately. */
export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    next(ApiError.forbidden("Admin access required"));
    return;
  }
  next();
}
