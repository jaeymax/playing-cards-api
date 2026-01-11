import { Router } from "express";

import {
  getAllTournaments,
  createTournament,
  joinTournament,
  startTournament,
  getCurrentWeekendTournament,
  closeTournamentRegistration,
  getTournamentLobby,
  reportMatchResult,
  addTournamentRule,
  getTournamentResults,
  getTopThreePlayersFromTournamentResults,
  getLatestSingleEliminationTournamentWinners
} from "../controllers/tournaments";
import authMiddleware from "../middlewares/authMiddleware";

const router = Router();

router.get("/", getAllTournaments);
router.get("/:id/lobby", authMiddleware, getTournamentLobby)
router.post("/weekly/current", getCurrentWeekendTournament);
router.post("/", createTournament);
router.post("/join/:id", authMiddleware, joinTournament);
router.get("/:id/close-registration", authMiddleware, closeTournamentRegistration);
router.post("/:id/start", startTournament);
router.post("/:id/rules", addTournamentRule);
router.post("/matches/:gameId/result", authMiddleware, reportMatchResult);
router.get("/single-elimination/results", getLatestSingleEliminationTournamentWinners)
router.get("/:id/results", authMiddleware, getTournamentResults)
router.get("/:id/results/top-three", getTopThreePlayersFromTournamentResults);
// router.post('/:id/payout', authMiddleware, async (req, res) => {
//   const winners = await getTournamentPlacements(req.params.id);

//   await db.transaction(async (trx) => {
//     for (const winner of winners) {
//       await trx.wallet.credit(winner.user_id, winner.prize);
//       await trx.walletTransactions.create({
//         user_id: winner.user_id,
//         amount: winner.prize,
//         type: "tournament_prize",
//         status: "completed",
//       });
//     }
//   });

//   res.json({ success: true });

// });


export default router;
