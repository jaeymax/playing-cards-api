import { Router } from "express";
import { joinQueue, leaveQueue, startGame } from "../controllers/matchmaking";
import authMiddleware from "../middlewares/authMiddleware";

const router = Router();

router.post("/join", authMiddleware, joinQueue);
router.post("/leave", authMiddleware, leaveQueue);
router.post("/games/:id/start", authMiddleware, startGame);

export default router;
