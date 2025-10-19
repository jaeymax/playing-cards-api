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
exports.startTournament = exports.joinTournament = exports.createTournament = void 0;
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
