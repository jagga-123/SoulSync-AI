import { Router } from "express";
import { forgotPassword, getMe, login, register, resetPassword } from "../controllers/auth.controller";
import { protect } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "../validators/auth.validator";

const router = Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.get("/me", protect, getMe);
// Same brute-force/enumeration surface as login — shares its limiter, already applied
// to the whole /auth router in routes/index.ts.
router.post("/forgot-password", validate(forgotPasswordSchema), forgotPassword);
router.post("/reset-password", validate(resetPasswordSchema), resetPassword);

export default router;
