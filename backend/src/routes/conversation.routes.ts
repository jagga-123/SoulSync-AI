import { Router } from "express";
import { protect, requireVerified } from "../middleware/auth.middleware";
import {
  getConversations,
  getMessages,
  startConversation,
} from "../controllers/conversation.controller";

const router = Router();

router.use(protect);

router.get("/", getConversations);
router.get("/:id/messages", getMessages);
router.post("/start/:matchId", requireVerified, startConversation);

export default router;
