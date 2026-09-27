import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env";

export interface JwtPayload {
  id: string;
  role: string;
  /** The user's `tokenVersion` at the moment this token was issued (see `protect`). Absent on
   * tokens signed before this field existed — those are treated as version 0, so shipping this
   * doesn't sign anyone out. */
  tv?: number;
}

export function signToken(payload: JwtPayload): string {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, env.JWT_SECRET) as JwtPayload;
}
