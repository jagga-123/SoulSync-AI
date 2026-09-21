import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { aiGeneralLimiter, aiGenerationLimiter } from "../middleware/rateLimit.middleware";
import { interviewAnswerSchema } from "../validators/ai.validator";
import {
  answerInterview,
  completeInterview,
  getCompatibility,
  getInterview,
  getMyAIProfile,
  getRecommendations,
  getStatus,
  restartInterview,
  startInterview,
} from "../controllers/ai.controller";

const router = Router();

// protect must come first so the limiters can key by user id.
router.use(protect, aiGeneralLimiter);

router.get("/status", getStatus);
router.get("/interview", getInterview);
router.post("/interview/start", aiGenerationLimiter, startInterview);
router.post("/interview/answer", aiGenerationLimiter, validate(interviewAnswerSchema), answerInterview);
router.post("/interview/complete", aiGenerationLimiter, completeInterview);
router.post("/interview/restart", aiGenerationLimiter, restartInterview);
router.get("/profile/me", getMyAIProfile);
router.get("/recommendations", getRecommendations);
router.get("/compatibility/:userId", getCompatibility);

export default router;
