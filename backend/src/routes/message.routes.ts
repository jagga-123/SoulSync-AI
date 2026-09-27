import { Router } from "express";
import { protect, requireVerified } from "../middleware/auth.middleware";
import { markRead, sendMessage } from "../controllers/message.controller";
import { validate } from "../middleware/validate.middleware";
import { sendMessageSchema } from "../validators/message.validator";

const router = Router();

router.use(protect);

router.post("/send", requireVerified, validate(sendMessageSchema), sendMessage);
router.post("/read/:messageId", markRead);

export default router;
