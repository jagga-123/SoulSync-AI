import express, { type Application } from "express";
import compression from "compression";
import cors from "cors";
import helmet from "helmet";
import { allowedOrigins, env } from "./config/env";
import routes from "./routes";
import { webhook } from "./controllers/billing.controller";
import { requestLogger } from "./middleware/requestLogger.middleware";
import { notFound } from "./middleware/notFound.middleware";
import { errorHandler } from "./middleware/error.middleware";
import { metricsMiddleware } from "./platform/metrics";
import { isLocalUploadsEnabled, uploadRoot } from "./services/photo.service";

const app: Application = express();

// Behind Render/Railway the client's address is in X-Forwarded-For. Trusting
// exactly N proxies (and no more) is what keeps rate limits and logs honest
// without letting a client spoof its own IP.
app.set("trust proxy", env.TRUST_PROXY);

app.use(requestLogger);
app.use(metricsMiddleware);

// This is a JSON API: no document should ever be rendered from it, so the
// content-security-policy can be as strict as it gets.
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
    referrerPolicy: { policy: "no-referrer" },
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use((_req, res, next) => {
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  next();
});
app.use(compression());
app.use(
  cors({
    origin: allowedOrigins,
    exposedHeaders: ["x-request-id", "ratelimit", "ratelimit-policy", "retry-after"],
  }),
);

// Payment webhooks must see the exact bytes the provider signed, so this route
// is registered BEFORE the JSON parser (which would re-serialize the body and
// break signature verification).
app.post("/api/billing/webhook/:provider", express.raw({ type: "*/*", limit: "1mb" }), webhook);

// Locally stored profile photos (the free fallback when Cloudinary isn't configured). File names are
// random and never change, so browsers may cache them for good; directory listings and dotfiles are off.
if (isLocalUploadsEnabled()) {
  app.use("/uploads/profiles", express.static(uploadRoot(), { index: false, dotfiles: "deny", maxAge: "30d", immutable: true, fallthrough: true }));
}

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
