import { Router } from "express";
import { createGame, createBotGame, joinGame, getUserGames} from "../controllers/game";
import authMiddleware from "../middlewares/authMiddleware";

const router = Router();

router.post("/create", createGame);
router.post("/create-bot", createBotGame);
router.get("/join", joinGame);
router.get("/", authMiddleware, getUserGames)


export default router;
