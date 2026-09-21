import express, { Router } from "express";
import authRoutes from "./auth.routes";
import profileRoutes from "./profile.routes";
import discoverRoutes from "./discover.routes";
import likeRoutes from "./like.routes";
import matchRoutes from "./match.routes";
import conversationRoutes from "./conversation.routes";
import messageRoutes from "./message.routes";
import aiRoutes from "./ai.routes";
import {
  accountRoutes,
  adminRoutes,
  billingRoutes,
  growthRoutes,
  notificationRoutes,
  premiumRoutes,
  safetyRoutes,
} from "./platform.routes";
import { protect } from "../middleware/auth.middleware";
import { MAX_PHOTO_BYTES, PHOTO_MIME_TYPES } from "../services/photo.service";
import { authLimiter, clientErrorLimiter, globalLimiter, uploadSignLimiter } from "../middleware/rateLimit.middleware";
import {
  clientError,
  cronTrigger,
  deletePhoto,
  emailHealth,
  metrics,
  publicFeatures,
  ready,
  signUpload,
  uploadConfig,
  uploadPhoto,
  userFeatures,
} from "../controllers/system.controller";

const router = Router();

// Probes and scrapes are exempt from rate limiting; everything below is covered.
router.get("/health", (_req, res) => {
  res.status(200).json({ success: true, message: "SoulSync AI API is running", data: null });
});
router.get("/health/ready", ready);
router.get("/metrics", metrics);

router.use(globalLimiter);

// Phase 1–5 routes (unchanged, apart from brute-force limiting on /auth).
router.use("/auth", authLimiter, authRoutes);
router.use("/profile", profileRoutes);
router.use("/discover", discoverRoutes);
router.use("/likes", likeRoutes);
router.use("/matches", matchRoutes);
router.use("/conversations", conversationRoutes);
router.use("/messages", messageRoutes);
router.use("/ai", aiRoutes);

// Phase 6.
router.get("/features/public", publicFeatures);
router.get("/features", protect, userFeatures);
router.use("/notifications", notificationRoutes);
router.use("/account", accountRoutes);
router.use("/billing", billingRoutes);
router.use("/premium", premiumRoutes);
router.use("/safety", safetyRoutes);
router.use("/growth", growthRoutes);
router.use("/admin", adminRoutes);
router.post("/uploads/sign", protect, uploadSignLimiter, signUpload);
router.get("/uploads/config", protect, uploadConfig);
router.get("/email/health", emailHealth);
// Raw image bytes (not multipart): authenticated first, so an anonymous request never gets to buffer a body.
router.post(
  "/uploads/profile-photo",
  protect,
  uploadSignLimiter,
  express.raw({ type: [...PHOTO_MIME_TYPES], limit: MAX_PHOTO_BYTES + 1024 }),
  uploadPhoto,
);
router.delete("/uploads/profile-photo", protect, uploadSignLimiter, deletePhoto);
router.post("/client-errors", clientErrorLimiter, clientError);
router.post("/internal/jobs/:name", cronTrigger);

export default router;
