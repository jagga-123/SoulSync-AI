import type { AuthenticatedUser } from "../middleware/auth.middleware";

declare global {
  namespace Express {
    interface Request {
      /** Populated by the `protect` auth middleware after verifying the JWT and re-checking the database. */
      user?: AuthenticatedUser;
    }
  }
}

export {};
