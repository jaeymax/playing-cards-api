"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const tournaments_1 = require("../controllers/tournaments");
const authMiddleware_1 = __importDefault(require("../middlewares/authMiddleware"));
const router = (0, express_1.Router)();
router.get("/", tournaments_1.getAllTournaments);
router.get("/:id/lobby", authMiddleware_1.default, tournaments_1.getTournamentLobby);
router.post("/weekly/current", tournaments_1.getCurrentWeekendTournament);
router.post("/", tournaments_1.createTournament);
router.post("/join/:id", authMiddleware_1.default, tournaments_1.joinTournament);
router.get("/:id/close-registration", authMiddleware_1.default, tournaments_1.closeTournamentRegistration);
router.post("/:id/start", tournaments_1.startTournament);
router.post("/:id/rules", tournaments_1.addTournamentRule);
router.post("/matches/:gameId/result", authMiddleware_1.default, tournaments_1.reportMatchResult);
router.get("/single-elimination/results", tournaments_1.getLatestSingleEliminationTournamentWinners);
router.get("/:id/results", authMiddleware_1.default, tournaments_1.getTournamentResults);
router.get("/:id/results/top-three", tournaments_1.getTopThreePlayersFromTournamentResults);
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
exports.default = router;
