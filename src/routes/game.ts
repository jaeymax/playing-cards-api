import { Router } from "express";
import { createGame, createBotGame, joinGame, getUserGames, leaveGame} from "../controllers/game";
import authMiddleware from "../middlewares/authMiddleware";

const router = Router();

router.post("/create", createGame);
router.post("/create-bot", createBotGame);
router.get("/join/:code", authMiddleware, joinGame);
router.get("/leave/:code",authMiddleware, leaveGame)
router.get("/", authMiddleware, getUserGames)


export default router;
