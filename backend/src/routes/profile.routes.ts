import { Router } from "express";
import {
  createProfile,
  getMyProfile,
  updateProfile,
} from "../controllers/profile.controller";
import { protect } from "../middleware/auth.middleware";
import { validate } from "../middleware/validate.middleware";
import { createProfileSchema, updateProfileSchema } from "../validators/profile.validator";

const router = Router();

router.use(protect);

router.post("/", validate(createProfileSchema), createProfile);
router.put("/", validate(updateProfileSchema), updateProfile);
router.get("/me", getMyProfile);

export default router;
