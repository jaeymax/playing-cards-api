import { Router } from "express";
import { createGame, createBotGame, joinGame } from "../controllers/game";

const router = Router();

router.post("/create", createGame);
router.post("/create-bot", createBotGame);
router.get("/join", joinGame);

export default router;
