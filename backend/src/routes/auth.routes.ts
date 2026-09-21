import { Router } from "express";
import { getMe, login, register } from "../controllers/auth.controller";
import { protect } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { loginSchema, registerSchema } from "../validators/auth.validator";

const router = Router();

router.post("/register", validate(registerSchema), register);
router.post("/login", validate(loginSchema), login);
router.get("/me", protect, getMe);

export default router;
