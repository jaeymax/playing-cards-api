import { Router } from "express";

import {
  getAllTournaments,
  createTournament,
  joinTournament,
  startTournament,
  getCurrentWeekendTournament,
  closeTournamentRegistration,
  getTournamentLobby,
} from "../controllers/tournaments";
import authMiddleware from "../middlewares/authMiddleware";

const router = Router();

router.get("/", getAllTournaments);
router.get("/:id/lobby", authMiddleware, getTournamentLobby)
router.post("/weekly/current", getCurrentWeekendTournament);
router.post("/", createTournament);
router.post("/join/:id", authMiddleware, joinTournament);
router.get("/:id/close-registration", authMiddleware, closeTournamentRegistration);
//router.post("/start", startTournament);
// router.get("/:id", getTournamentDetails);

// router.put("/:id", updateTournament);
// router.delete("/:id", deleteTournament);

export default router;
