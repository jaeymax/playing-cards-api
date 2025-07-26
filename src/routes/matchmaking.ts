import { Router } from "express";
import { joinQueue, leaveQueue, startGame } from "../controllers/matchmaking";

const router = Router();

router.post("/join", joinQueue);
router.post("/leave", leaveQueue);
router.post("/games/:id/start", startGame);

export default router;
