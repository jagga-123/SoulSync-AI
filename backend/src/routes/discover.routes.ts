import { Router } from "express";
import { protect } from "../middleware/auth.middleware";
import { getDiscoverUsers } from "../controllers/discover.controller";

const router = Router();

router.use(protect);
router.get("/", getDiscoverUsers);

export default router;
