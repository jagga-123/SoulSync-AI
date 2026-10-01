import { Router } from "express";
import { forgotPassword, getMe, login, register, resetPassword } from "../controllers/auth.controller";
import { protect } from "../middleware/auth.middleware";
import { requireCaptcha } from "../middleware/captcha.middleware";
import { validate } from "../middleware/validate.middleware";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "../validators/auth.validator";

const router = Router();

// requireCaptcha reads req.body.captchaToken, so it must run before validate() strips
// unrecognized fields from the body. It's a no-op when TURNSTILE_SECRET_KEY isn't set.
router.post("/register", requireCaptcha, validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.get("/me", protect, getMe);
// Same brute-force/enumeration surface as login — shares its limiter, already applied
// to the whole /auth router in routes/index.ts.
router.post("/forgot-password", requireCaptcha, validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

export default router;
