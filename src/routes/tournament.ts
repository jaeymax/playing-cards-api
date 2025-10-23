import { Router } from "express";

import { getAllTournaments,createTournament, joinTournament, startTournament } from "../controllers/tournamentController";
import authMiddleware from "../middlewares/authMiddleware";

const router = Router();


router.get('/', getAllTournaments)
router.post("/", createTournament);
// router.post("/join", joinTournament);
// router.post("/start", startTournament);
// router.get("/:id", getTournamentDetails);

// router.put("/:id", updateTournament);
// router.delete("/:id", deleteTournament);

export default router;
