import { Router } from "express";
import { protect, requireAdmin } from "../middleware/auth.middleware";
import {
  billingLimiter,
  aiGenerationLimiter,
  inviteLimiter,
  reportLimiter,
  verificationEmailLimiter,
  waitlistLimiter,
  authLimiter,
} from "../middleware/rateLimit.middleware";
import * as notificationController from "../controllers/notification.controller";
import * as accountController from "../controllers/account.controller";
import * as billingController from "../controllers/billing.controller";
import * as premiumController from "../controllers/premium.controller";
import * as safetyController from "../controllers/safety.controller";
import * as growthController from "../controllers/growth.controller";
import * as adminController from "../controllers/admin.controller";

// ---- notifications --------------------------------------------------------

export const notificationRoutes = Router();
notificationRoutes.use(protect);
notificationRoutes.get("/", notificationController.list);
notificationRoutes.get("/unread-count", notificationController.unreadCount);
notificationRoutes.post("/read-all", notificationController.markAllRead);
notificationRoutes.post("/:id/read", notificationController.markRead);
notificationRoutes.delete("/:id", notificationController.remove);

// ---- account (verification, preferences, unsubscribe) ---------------------

export const accountRoutes = Router();
accountRoutes.post("/verify-email", authLimiter, accountController.verifyEmail);
accountRoutes.post("/unsubscribe", authLimiter, accountController.unsubscribe);
accountRoutes.post("/resend-verification", protect, verificationEmailLimiter, accountController.resendVerification);
accountRoutes.get("/settings", protect, accountController.getSettings);
accountRoutes.put("/settings", protect, accountController.updateSettings);

// ---- billing --------------------------------------------------------------

export const billingRoutes = Router();
billingRoutes.get("/plans", billingController.plans);
billingRoutes.get("/overview", protect, billingController.overview);
billingRoutes.post("/checkout", protect, billingLimiter, billingController.checkout);
billingRoutes.post("/upgrade", protect, billingLimiter, billingController.upgrade);
billingRoutes.post("/cancel", protect, billingLimiter, billingController.cancel);
billingRoutes.get("/payments", protect, billingController.payments);
billingRoutes.post("/mock/complete", protect, billingLimiter, billingController.mockComplete);

// ---- premium perks --------------------------------------------------------

export const premiumRoutes = Router();
premiumRoutes.use(protect);
premiumRoutes.get("/likes/allowance", premiumController.likeAllowance);
premiumRoutes.get("/boost", premiumController.boostStatus);
premiumRoutes.post("/boost", premiumController.activateBoost);
premiumRoutes.get("/deep-analysis", premiumController.getDeepAnalysis);
premiumRoutes.post("/deep-analysis", aiGenerationLimiter, premiumController.createDeepAnalysis);
premiumRoutes.get("/read-receipts", premiumController.readReceipts);

// ---- safety ---------------------------------------------------------------

export const safetyRoutes = Router();
safetyRoutes.use(protect);
safetyRoutes.post("/reports", reportLimiter, safetyController.createReport);
safetyRoutes.get("/blocks", safetyController.listBlocks);
safetyRoutes.post("/blocks", safetyController.block);
safetyRoutes.delete("/blocks/:userId", safetyController.unblock);

// ---- growth (referrals, waitlist, profile views) --------------------------

export const growthRoutes = Router();
growthRoutes.post("/waitlist", waitlistLimiter, growthController.joinWaitlist);
growthRoutes.get("/referrals", protect, growthController.referralSummary);
growthRoutes.post("/referrals/invite", protect, inviteLimiter, growthController.sendInvites);
growthRoutes.post("/profile-views/:userId", protect, growthController.profileView);

// ---- admin ----------------------------------------------------------------

export const adminRoutes = Router();
adminRoutes.use(protect, requireAdmin);

adminRoutes.get("/overview", adminController.overview);
adminRoutes.get("/analytics/timeseries", adminController.timeseries);
adminRoutes.get("/analytics/funnel", adminController.funnel);
adminRoutes.get("/analytics/rates", adminController.rates);
adminRoutes.get("/analytics/revenue", adminController.revenue);
adminRoutes.get("/system", adminController.system);

adminRoutes.get("/users", adminController.listUsers);
adminRoutes.get("/users/:id", adminController.getUser);
adminRoutes.post("/users/:id/suspend", adminController.suspend);
adminRoutes.post("/users/:id/unsuspend", adminController.unsuspend);
adminRoutes.post("/users/:id/delete", adminController.deleteUser);
adminRoutes.post("/users/:id/plan", adminController.grantUserPlan);
adminRoutes.delete("/users/:id/plan", adminController.revokeUserPlan);

adminRoutes.get("/reports", adminController.listReports);
adminRoutes.get("/reports/:id", adminController.getReport);
adminRoutes.post("/reports/:id/review", adminController.reviewReport);
adminRoutes.post("/reports/:id/resolve", adminController.resolveReport);

adminRoutes.get("/feature-flags", adminController.listFlags);
adminRoutes.put("/feature-flags/:key", adminController.setFlag);
adminRoutes.delete("/feature-flags/:key", adminController.resetFlag);

adminRoutes.get("/audit-log", adminController.auditLog);
adminRoutes.get("/email-log", adminController.emailLog);
adminRoutes.get("/jobs", adminController.jobs);
adminRoutes.post("/jobs/:name/run", adminController.triggerJob);

adminRoutes.get("/waitlist", adminController.listWaitlist);
adminRoutes.post("/waitlist/invite-next", adminController.inviteNextWaitlist);
adminRoutes.post("/waitlist/:id/invite", adminController.inviteWaitlistEntry);
