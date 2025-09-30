import { Router } from "express";
import { getLeaderboard, getTopPlayers } from "../controllers/leaderboard";

const router = Router();


router.get("/", getLeaderboard);
router.get('/topplayers', getTopPlayers);


export default router;
