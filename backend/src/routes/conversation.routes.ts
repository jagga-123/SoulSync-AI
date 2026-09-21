import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import {
  getConversations,
  getMessages,
  startConversation,
} from "../controllers/conversation.controller";

const router = Router();

router.use(protect);

router.get("/", getConversations);
router.get("/:id/messages", getMessages);
router.post("/start/:matchId", startConversation);

export default router;
