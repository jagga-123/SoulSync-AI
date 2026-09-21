import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import {
  acceptLike,
  getIncoming,
  getOutgoing,
  rejectLike,
  sendLike,
} from "../controllers/like.controller";

const router = Router();

router.use(protect);

router.post("/send/:userId", sendLike);
router.get("/incoming", getIncoming);
router.get("/outgoing", getOutgoing);
router.post("/accept/:likeId", acceptLike);
router.post("/reject/:likeId", rejectLike);

export default router;
