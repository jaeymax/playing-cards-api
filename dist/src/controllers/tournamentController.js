"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBracket = exports.completeMatch = exports.startTournament = exports.joinTournament = exports.createTournament = exports.getAllTournaments = void 0;
const db_1 = __importDefault(require("../config/db"));
// Utility function for shuffling arrays
const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};
// GET ALL TOURNAMENTS
const getAllTournaments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tournaments = yield (0, db_1.default) `
      SELECT * FROM tournaments ORDER BY created_at DESC
    `;
        res.json({ success: true, data: tournaments });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Error fetching tournaments" });
    }
});
exports.getAllTournaments = getAllTournaments;
const createTournament = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, description, start_date, prize } = req.body;
        // Basic validation
        if (!name || !start_date) {
            return res.status(400).json({
                success: false,
                message: "Name and start date are required",
            });
        }
        const result = yield (0, db_1.default) `
      INSERT INTO tournaments (
        name, 
        description, 
        start_date, 
        prize
      ) VALUES (
        ${name}, 
        ${description}, 
        ${new Date(start_date)},
        ${prize || 0}
      ) 
      RETURNING id
    `;
        res.json({
            success: true,
            tournament_id: result[0].id,
        });
    }
    catch (err) {
        console.error("Error creating tournament:", err);
        res.status(500).json({
            success: false,
            message: "Failed to create tournament",
        });
    }
});
exports.createTournament = createTournament;
const joinTournament = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tournamentId = parseInt(req.params.id);
        const userId = req.user.id;
        // Validate tournament ID
        if (!tournamentId || isNaN(tournamentId)) {
            res.status(400).json({
                success: false,
                message: "Invalid tournament ID",
            });
            return;
        }
        yield (0, db_1.default) `
      INSERT INTO tournament_participants (tournament_id, user_id)
      VALUES (${tournamentId}, ${userId})
      ON CONFLICT (tournament_id, user_id) DO NOTHING
    `;
        res.json({
            success: true,
            message: "Joined tournament successfully!",
        });
    }
    catch (err) {
        console.error("Error joining tournament:", err);
        res.status(500).json({
            success: false,
            message: "Failed to join tournament",
        });
    }
});
exports.joinTournament = joinTournament;
const startTournament = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tournamentId = parseInt(req.params.id);
        if (!tournamentId || isNaN(tournamentId)) {
            res.status(400).json({
                success: false,
                message: "Invalid tournament ID",
            });
            return;
        }
        // Get all participants
        const players = yield (0, db_1.default) `
      SELECT user_id 
      FROM tournament_participants 
      WHERE tournament_id = ${tournamentId}
    `;
        if (players.length < 2) {
            res.status(400).json({
                success: false,
                message: "Not enough players to start tournament",
            });
            return;
        }
        // Shuffle players and create matches
        const shuffled = shuffleArray(players.map((p) => p.user_id));
        for (let i = 0; i < shuffled.length; i += 2) {
            const player1Id = shuffled[i];
            const player2Id = shuffled[i + 1];
            if (!player2Id) {
                // Odd number of players, auto-advance player1
                yield (0, db_1.default) `
          UPDATE tournament_participants 
          SET status = 'winner' 
          WHERE tournament_id = ${tournamentId} 
          AND user_id = ${player1Id}
        `;
                continue;
            }
            // Create match between two players
            yield (0, db_1.default) `
        INSERT INTO tournament_matches (
          tournament_id, 
          round_number,
          game_id
        ) VALUES (
          ${tournamentId},
          1,
          (
            INSERT INTO games (
              code,
              created_by,
              player_count,
              status
            ) VALUES (
              ${Math.random().toString(36).substring(2, 12)},
              ${player1Id},
              2,
              'waiting'
            ) RETURNING id
          )
        )
      `;
        }
        // Update tournament status
        yield (0, db_1.default) `
      UPDATE tournaments 
      SET status = 'ongoing' 
      WHERE id = ${tournamentId}
    `;
        res.json({
            success: true,
            message: "Tournament started successfully!",
        });
    }
    catch (err) {
        console.error("Error starting tournament:", err);
        res.status(500).json({
            success: false,
            message: "Failed to start tournament",
        });
    }
});
exports.startTournament = startTournament;
const completeMatch = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const matchId = parseInt(req.params.matchId);
        const winnerId = parseInt(req.body.winner_id);
        if (!matchId || !winnerId) {
            res.status(400).json({
                success: false,
                message: "Invalid match ID or winner ID",
            });
            return;
        }
        // Get match data
        const matchData = yield (0, db_1.default) `
      SELECT * FROM tournament_matches WHERE id = ${matchId}
    `;
        if (!matchData.length) {
            res.status(404).json({
                success: false,
                message: "Match not found",
            });
            return;
        }
        const match = matchData[0];
        // Update match status
        yield (0, db_1.default) `
      UPDATE tournament_matches 
      SET status = 'completed'
      WHERE id = ${matchId}
    `;
        // Update game status
        yield (0, db_1.default) `
      UPDATE games 
      SET status = 'completed'
      WHERE id = ${match.game_id}
    `;
        // Check if round is completed
        const pendingMatches = yield (0, db_1.default) `
      SELECT COUNT(*) 
      FROM tournament_matches 
      WHERE tournament_id = ${match.tournament_id} 
      AND round_number = ${match.round_number} 
      AND status != 'completed'
    `;
        if (parseInt(pendingMatches[0].count) === 0) {
            // Get winners from current round
            const winners = yield (0, db_1.default) `
        SELECT game_id 
        FROM tournament_matches 
        WHERE tournament_id = ${match.tournament_id} 
        AND round_number = ${match.round_number}
      `;
            if (winners.length === 1) {
                // Tournament completed
                yield (0, db_1.default) `
          UPDATE tournaments 
          SET status = 'completed', 
              winner_id = ${winnerId},
              end_date = CURRENT_TIMESTAMP
          WHERE id = ${match.tournament_id}
        `;
            }
            else {
                // Create next round matches
                const nextRound = match.round_number + 1;
                const shuffled = shuffleArray(winners.map((w) => w.game_id));
                for (let i = 0; i < shuffled.length; i += 2) {
                    const player1GameId = shuffled[i];
                    const player2GameId = shuffled[i + 1];
                    if (!player2GameId) {
                        // Auto-advance single player
                        yield (0, db_1.default) `
              UPDATE tournament_participants 
              SET status = 'winner' 
              WHERE tournament_id = ${match.tournament_id} 
              AND user_id = (
                SELECT created_by FROM games WHERE id = ${player1GameId}
              )
            `;
                        continue;
                    }
                    // Create new game and match for next round
                    yield (0, db_1.default) `
            INSERT INTO tournament_matches (
              tournament_id,
              round_number,
              game_id
            ) VALUES (
              ${match.tournament_id},
              ${nextRound},
              (
                INSERT INTO games (
                  code,
                  created_by,
                  player_count,
                  status
                ) VALUES (
                  ${Math.random().toString(36).substring(2, 12)},
                  (SELECT created_by FROM games WHERE id = ${player1GameId}),
                  2,
                  'waiting'
                ) RETURNING id
              )
            )
          `;
                }
            }
        }
        res.json({
            success: true,
            message: "Match completed successfully",
        });
    }
    catch (err) {
        console.error("Error completing match:", err);
        res.status(500).json({
            success: false,
            message: "Failed to complete match",
        });
    }
});
exports.completeMatch = completeMatch;
const getBracket = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tournamentId = parseInt(req.params.id);
        if (!tournamentId || isNaN(tournamentId)) {
            res.status(400).json({
                success: false,
                message: "Invalid tournament ID",
            });
            return;
        }
        const matches = yield (0, db_1.default) `
      SELECT 
        round_number,
        id,
        game_id,
        status
      FROM tournament_matches 
      WHERE tournament_id = ${tournamentId} 
      ORDER BY round_number ASC
    `;
        const rounds = {};
        //const rounds = {};
        matches.forEach((match) => {
            if (!rounds[match.round_number]) {
                rounds[match.round_number] = [];
            }
            rounds[match.round_number].push(match);
        });
        const formattedRounds = Object.entries(rounds).map(([round, matches]) => ({
            round: parseInt(round),
            matches,
        }));
        res.json({
            success: true,
            rounds: formattedRounds,
        });
    }
    catch (err) {
        console.error("Error fetching tournament bracket:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch tournament bracket",
        });
    }
});
exports.getBracket = getBracket;
