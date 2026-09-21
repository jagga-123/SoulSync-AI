import type { JwtPayload } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      /** Populated by the `protect` auth middleware after verifying the JWT. */
      user?: JwtPayload;
    }
  }
}

export {};
