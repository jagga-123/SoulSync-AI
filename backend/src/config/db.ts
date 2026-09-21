import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";

mongoose.set("strictQuery", true);

// `mongodb+srv://` URIs resolve their host list via a DNS SRV lookup.
// Node's resolver (c-ares) sometimes can't do that against the DNS server a
// machine's network adapter hands it — even when the OS's own resolver
// handles the same lookup fine — which surfaces as `querySrv ECONNREFUSED`
// and blocks every connection attempt. Pointing Node at public resolvers
// sidesteps it; harmless in normal deployments, since egress to these is
// essentially always allowed.
if (env.MONGODB_URI.startsWith("mongodb+srv://")) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

export async function connectDB(): Promise<void> {
  mongoose.connection.on("connected", () => {
    logger.info("MongoDB connected");
  });

  mongoose.connection.on("error", (err) => {
    logger.error({ err }, "MongoDB connection error");
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });

  await mongoose.connect(env.MONGODB_URI, {
    // Fail fast instead of hanging. Without a socket timeout the driver waits
    // forever on a half-dead connection (a stalled network path, a failover),
    // which surfaces as requests that never answer. Bounded waits turn that
    // into a fast, retryable error.
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    connectTimeoutMS: 10_000,
    maxPoolSize: 20,
    minPoolSize: 1,
  });
}

/** True when the driver reports a live connection (readiness probe). */
export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/** Round-trips to the database — proves it's reachable, not just "connected". */
export async function pingDb(): Promise<boolean> {
  try {
    await mongoose.connection.db?.admin().ping();
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}
