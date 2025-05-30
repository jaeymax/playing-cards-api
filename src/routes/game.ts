import { Router } from "express";
import { createGame, joinGame } from "../controllers/game";


const router = Router();

router.post('/create', createGame);

router.get('/join', joinGame); 



export default router;