import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { getMatches } from "../controllers/match.controller";

const router = Router();

router.use(protect);
router.get("/", getMatches);

export default router;
