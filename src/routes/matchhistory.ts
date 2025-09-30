import { Router } from "express";
import { getMatchHistory, getRecentMatchHistory } from "../controllers/matchhistory";
import authMiddleware from "../middlewares/authMiddleware";

const router = Router();


router.get("/", authMiddleware, getMatchHistory);
router.get('/recent', authMiddleware, getRecentMatchHistory);


export default router;
