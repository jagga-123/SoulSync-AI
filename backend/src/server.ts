import { createServer } from "node:http";
import { env, getEnvWarnings } from "./config/env";
import { logger } from "./config/logger";
import { connectDB, disconnectDB } from "./config/db";
import app from "./app";
import { initSocket } from "./socket";
import { captureError, flushErrorTracking, initErrorTracking } from "./platform/error-tracker";
import { events } from "./platform/events";
import { startJobs, stopJobs } from "./platform/jobs";
import { registerEventListeners } from "./platform/listeners";
import { verifyEmailOnStartup } from "./services/email/health";
import { registerScheduledJobs } from "./platform/scheduled";
import { ensureAdmins } from "./services/account.service";

const SHUTDOWN_GRACE_MS = 10_000;

async function main() {
  const errorTracker = await initErrorTracking();
  for (const warning of getEnvWarnings()) logger.warn({ warning }, "launch configuration warning");

  await connectDB();
  registerEventListeners();

  const promoted = await ensureAdmins();
  if (promoted > 0) logger.info({ promoted }, "promoted users listed in ADMIN_EMAILS to admin");

  registerScheduledJobs();
  if (env.JOBS_ENABLED) startJobs();
  else logger.info("in-process scheduler disabled (JOBS_ENABLED=false) — use POST /api/internal/jobs/:name from a cron");

  // Socket.IO needs the raw http.Server (for the WebSocket upgrade
  // handshake) rather than the Express app directly, so the app is wrapped
  // here instead of calling `app.listen()` — everything else about how
  // Express handles requests is unchanged.
  const httpServer = createServer(app);
  const io = initSocket(httpServer);

  // Load balancers (Render, Railway, ALB) hold connections open ~60s; Node
  // closing idle keep-alive sockets sooner surfaces as sporadic 502s.
  httpServer.keepAliveTimeout = 65_000;
  httpServer.headersTimeout = 66_000;

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, environment: env.NODE_ENV, errorTracker }, "SoulSync AI API listening");
    // Verify the email transport in the background: an SMTP outage is logged, never fatal.
    void verifyEmailOnStartup();
  });

  let shuttingDown = false;
  const shutdown = async (signal: string, exitCode = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "shutting down gracefully");

    const force = setTimeout(() => {
      logger.error("graceful shutdown timed out — forcing exit");
      process.exit(exitCode || 1);
    }, SHUTDOWN_GRACE_MS);
    force.unref();

    try {
      stopJobs();
      await new Promise<void>((resolve) => io.close(() => resolve())); // also closes the http server
      await events.idle();
      await flushErrorTracking(2000);
      await disconnectDB();
    } catch (err) {
      logger.error({ err }, "error during shutdown");
    }
    process.exit(exitCode);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.fatal({ err: reason }, "unhandled promise rejection");
    captureError(reason);
    void shutdown("unhandledRejection", 1);
  });
  process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaught exception");
    captureError(err);
    void shutdown("uncaughtException", 1);
  });
}

main().catch((err) => {
  logger.fatal({ err }, "failed to start");
  captureError(err);
  void flushErrorTracking(2000).finally(() => process.exit(1));
});
