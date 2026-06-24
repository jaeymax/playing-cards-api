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
exports.getBracket = exports.reportMatchResult = exports.startTournament = exports.getTournamentLobby = exports.closeTournamentRegistration = exports.joinTournament = exports.createTournament = exports.getLatestFeaturedTournament = exports.getAllTournaments = exports.addTournamentRule = exports.getTopThreePlayersFromTournamentResults = exports.getLatestSwissTournamentWinners = exports.getLatestSingleEliminationTournamentWinners = exports.getTournamentResults = void 0;
const db_1 = __importDefault(require("../config/db"));
const gameFunctions_1 = require("../utils/gameFunctions");
const __1 = require("..");
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const tournament_1 = require("../utils/tournament");
const utils_1 = require("../utils");
exports.getTournamentResults = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tournament_id = req.params.id;
    const tournament = yield (0, db_1.default) `SELECT * from tournaments WHERE id = ${tournament_id}`;
    if (!tournament || tournament.length == 0) {
        res
            .status(404)
            .json({ message: `Tournament with id ${tournament_id} not found` });
        return;
    }
    const results = yield (0, db_1.default) `SELECT
    u.id,
    u.username,
    u.image_url,
    COALESCE(COUNT(tm.id),0) AS num_wins
  FROM tournament_participants tp
  JOIN users u
    ON u.id = tp.user_id
  LEFT JOIN tournament_matches tm
    ON tm.tournament_id = tp.tournament_id
    AND tm.winner_id = u.id
  WHERE tp.tournament_id = ${tournament_id}
  GROUP BY u.id, u.username, u.image_url
  ORDER BY num_wins DESC`;
    res.status(200).json(results);
}));
exports.getLatestSingleEliminationTournamentWinners = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tournament_id = yield (0, db_1.default) `SELECT id from tournaments WHERE format = 'Single Elimination' AND status = 'completed' ORDER by created_at DESC LIMIT 1`;
    if (!tournament_id || tournament_id.length == 0) {
        res.status(400).json({ message: "No tournament found" });
        return;
    }
    const results = yield (0, db_1.default) `SELECT
    u.id,
    u.username as name,
    u.image_url,
    COALESCE(COUNT(tm.id),0) AS wins
  FROM tournament_participants tp
  JOIN users u
    ON u.id = tp.user_id
  LEFT JOIN tournament_matches tm
    ON tm.tournament_id = tp.tournament_id
    AND tm.winner_id = u.id
  WHERE tp.tournament_id = ${tournament_id[0].id}
  GROUP BY u.id, u.username, u.image_url
  ORDER BY wins DESC LIMIT 3`;
    res.status(200).json({
        tournamentId: tournament_id[0].id,
        winners: results,
    });
}));
exports.getLatestSwissTournamentWinners = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tournament_id = yield (0, db_1.default) `SELECT id from tournaments WHERE format = 'Swiss' AND status = 'completed' ORDER by created_at DESC LIMIT 1`;
    if (!tournament_id || tournament_id.length == 0) {
        res.status(400).json({ message: "No tournament found" });
        return;
    }
    const results = yield (0, db_1.default) `SELECT u.id, u.username as name, u.image_url, tp.score, tp.losses FROM users u JOIN tournament_participants tp ON u.id = tp.user_id WHERE tp.tournament_id = ${tournament_id[0].id} ORDER BY tp.score DESC, tp.buchholz_score DESC, u.rating DESC LIMIT 3`;
    res.status(200).json({
        tournamentId: tournament_id[0].id,
        winners: results,
    });
}));
exports.getTopThreePlayersFromTournamentResults = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tournament_id = req.params.id;
    const tournament = yield (0, db_1.default) `SELECT * from tournaments WHERE id = ${tournament_id}`;
    if (!tournament || tournament.length == 0) {
        res
            .status(404)
            .json({ message: `Tournament with id ${tournament_id} not found` });
        return;
    }
    const results = yield (0, db_1.default) `SELECT
  u.id,
  u.username,
  u.image_url,
  COALESCE(COUNT(tm.id),0) AS wins
FROM tournament_participants tp
JOIN users u
  ON u.id = tp.user_id
LEFT JOIN tournament_matches tm
  ON tm.tournament_id = tp.tournament_id
  AND tm.winner_id = u.id
WHERE tp.tournament_id = ${tournament_id}
GROUP BY u.id, u.username, u.image_url
ORDER BY wins DESC LIMIT 3`;
    res.status(200).json(results);
}));
exports.addTournamentRule = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const tournament_id = req.params.id;
    const { title, message } = req.body;
    if (!title || !message) {
        res.status(404).json({ message: "Please provide title and message" });
    }
    const tournament = yield (0, db_1.default) `SELECT * from tournaments WHERE id = ${tournament_id}`;
    if (!tournament || tournament.length == 0) {
        res
            .status(404)
            .json({ message: `Tournament with id ${tournament_id} not found` });
        return;
    }
    const rule = yield (0, db_1.default) `INSERT into tournament_rules (tournament_id, title, message) VALUES (${tournament_id}, ${title}, ${message}) RETURNING *`;
    res
        .status(200)
        .json({ message: "Tournament rule added successfully", rule: rule[0] });
}));
// GET ALL TOURNAMENTS
const getAllTournaments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || null;
    try {
        const tournaments = yield (0, db_1.default) `
     SELECT 
        t.*,
        CASE 
          WHEN tp.user_id IS NOT NULL THEN true
          ELSE false
        END AS registered
      FROM tournaments t
      LEFT JOIN tournament_participants tp
        ON t.id = tp.tournament_id
        AND tp.user_id = ${userId}
      ORDER BY t.created_at DESC
    `;
        // Log request query for debugging
        console.log('user', req.user);
        res.json({ success: true, data: tournaments });
    }
    catch (err) {
        console.error(err);
        res
            .status(500)
            .json({ success: false, message: "Error fetching tournaments" });
    }
});
exports.getAllTournaments = getAllTournaments;
const getLatestFeaturedTournament = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.body.userId || null;
        console.log("request body", req.body);
        const tournament = yield (0, db_1.default) `
      SELECT * FROM tournaments 
      WHERE is_featured = 'true' and status IN ('upcoming', 'ongoing') 
      ORDER BY start_date ASC
      LIMIT 1
    `;
        if (tournament.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No current weekend tournament found",
            });
        }
        let registered = false;
        // Only check registration if userId is provided
        if (userId) {
            const registration = yield (0, db_1.default) `
        SELECT id FROM tournament_participants
        WHERE tournament_id = ${tournament[0].id} AND user_id = ${userId}
      `;
            registered = registration.length > 0;
        }
        res.json({
            success: true,
            data: Object.assign(Object.assign({}, tournament[0]), { registered }),
        });
    }
    catch (err) {
        console.error(err);
        res
            .status(500)
            .json({ success: false, message: "Error fetching weekend tournaments" });
    }
});
exports.getLatestFeaturedTournament = getLatestFeaturedTournament;
const createTournament = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, description, start_date, registration_closing_date, registration_fee, format, prize, is_featured, difficulty, end_date, } = req.body;
        // Basic validation
        if (!name ||
            !start_date ||
            !registration_closing_date ||
            !end_date ||
            !format) {
            return res.status(400).json({
                success: false,
                message: "Name, start date, registration closing date, and end date are required",
            });
        }
        const result = yield (0, db_1.default) `
      INSERT INTO tournaments (
        name, 
        description, 
        start_date, 
        end_date,
        registration_closing_date,
        registration_fee,
        prize,
        format,
        difficulty,
        is_featured
      ) VALUES (
        ${name}, 
        ${description}, 
        ${new Date(start_date)},
        ${new Date(end_date)},
        ${new Date(registration_closing_date)},
        ${registration_fee || 0},
        ${prize || 0},
        ${format},
        ${difficulty},
        ${is_featured || false}
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
    var _a;
    try {
        const tournamentId = parseInt(req.params.id);
        const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
        //console.log('user:', req.user);
        if (!userId) {
            res.status(401).json({
                success: false,
                message: "Unauthorized: User ID not found in request",
            });
            return;
        }
        // Validate tournament ID
        if (!tournamentId || isNaN(tournamentId)) {
            res.status(400).json({
                success: false,
                message: "Invalid tournament ID",
            });
            return;
        }
        // check if users wallet balance is greater or equal to tournament- registration fee
        const tournament = yield (0, db_1.default) `
      SELECT registration_fee FROM tournaments WHERE id = ${tournamentId}
    `;
        if (!tournament.length) {
            res.status(404).json({
                success: false,
                message: "Tournament not found",
            });
            return;
        }
        const registrationFee = tournament[0].registration_fee;
        let userWallet = yield (0, db_1.default) `
      SELECT balance FROM wallets WHERE user_id = ${userId}
    `;
        if (userWallet.length === 0) {
            // create a wallet for the user with 0 balance
            userWallet = yield (0, db_1.default) `
        INSERT INTO wallets (user_id) VALUES (${userId})
      RETURNING balance`;
            console.log(`Wallet created for user ${userId} with 0 balance`);
        }
        if (parseFloat(userWallet[0].balance) < parseFloat(registrationFee)) {
            res.status(400).json({
                success: false,
                message: "Insufficient wallet balance to join tournament",
            });
            return;
        }
        // update the users wallet balance by subtracting the tournament registration fee
        yield db_1.default.transaction((sql) => [
            sql ` UPDATE wallets SET balance = balance - ${registrationFee} WHERE user_id = ${userId} `,
            sql `
        INSERT INTO tournament_participants (tournament_id, user_id)
        VALUES (${tournamentId}, ${userId})
        ON CONFLICT (tournament_id, user_id) DO NOTHING
      `,
            sql `UPDATE tournaments SET registered_participants = registered_participants + 1 WHERE id = ${tournamentId}`,
        ]);
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
const closeTournamentRegistration = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tournamentId = parseInt(req.params.id);
        if (!tournamentId || isNaN(tournamentId)) {
            res.status(400).json({
                success: false,
                message: "Invalid tournament ID",
            });
            return;
        }
        const tournament = yield (0, db_1.default) `
      SELECT * FROM tournaments WHERE id = ${tournamentId}
    `;
        if (!tournament.length) {
            res.status(404).json({
                success: false,
                message: "Tournament not found",
            });
            return;
        }
        if (tournament[0].registration_closed) {
            //console.log("Tournament registration is already closed.");
            res.status(400).json({
                success: false,
                message: "Tournament registration is already closed",
            });
            return;
        }
        // Fetch all participants
        const participants = yield (0, tournament_1.getSingleEliminationTournamentParticipants)(tournamentId);
        if (participants.length < 2) {
            res.status(400).json({
                success: false,
                message: "Not enough participants to start tournament",
            });
            return;
        }
        try {
            // Create first round
            const round = yield (0, db_1.default) `
        INSERT INTO tournament_rounds (tournament_id, round_number, status)
        VALUES (${tournamentId}, 1, 'pending')
        RETURNING id
      `;
            const roundId = round[0].id;
            (0, gameFunctions_1.fisherYatesShuffle)(participants);
            const rounds = { 1: [] };
            const is_final_round = participants.length === 2;
            // Pair players and create matches
            for (let i = 0; i < participants.length; i += 2) {
                const player1 = participants[i];
                const player2 = participants[i + 1];
                if (!player2) {
                    console.log("creating bye match");
                    // Handle odd player (auto-advance)
                    const game = yield (0, tournament_1.createByeMatch)(player1.id);
                    console.log("game created for bye match", game.id, game.code);
                    const { gameplayer } = yield (0, tournament_1.createMatchGamePlayer)(game.id, player1.id, 0, true);
                    console.log("game player created for bye match", gameplayer);
                    // create tournament match
                    const match = yield (0, tournament_1.createSingleEliminationByeMatch)(tournamentId, game.id, roundId, player1.id, Math.floor(i / 2) + 1);
                    if (tournament[0].format === "Swiss") {
                        yield (0, db_1.default) `
              UPDATE tournament_participants
              SET score = score + 1
              WHERE tournament_id = ${tournamentId} AND user_id = ${player1.id}
            `;
                    }
                    rounds[1].push({
                        id: match.id,
                        player1: player1.username,
                        player2: null,
                        status: match.status,
                    });
                    console.log(`created match for only ${player1.username}`);
                    const newGame = Object.assign(Object.assign({}, game), { players: [gameplayer], cards: null });
                    yield (0, gameFunctions_1.saveGame)(game.code, newGame);
                    console.log("game saved to memory", game.code);
                    break;
                }
                const game = yield (0, tournament_1.createTwoPlayerMatch)(player1.id, "waiting", is_final_round, true);
                const { gameplayer1, gameplayer2 } = yield (0, tournament_1.createTwoPlayerMatchGamePlayers)(game.id, player1.id, player2.id);
                const gameCards = yield (0, tournament_1.createGameCardsForMatch)(game.id, gameplayer1.id);
                const match = yield (0, tournament_1.createSingleEliminationMatch)(tournamentId, game.id, roundId, player1.id, player2.id, "pending", Math.floor(i / 2) + 1);
                console.log(`created match for ${player1.username} an ${player2.username}`);
                const newGame = Object.assign(Object.assign({}, game), { players: [gameplayer1, gameplayer2], cards: gameCards });
                yield (0, gameFunctions_1.saveGame)(game.code, newGame);
                console.log("game saved to memory", game.code);
                rounds[1].push({
                    id: match.id,
                    player1: player1.username,
                    player2: player2.username,
                    status: match.status,
                });
            }
            // Update tournament registration status
            yield (0, db_1.default) `
        UPDATE tournaments
        SET registration_closed = true
        WHERE id = ${tournamentId}
      `;
        }
        catch (err) {
            console.error("Error during transaction:", err);
            throw err;
        }
        // Fetch final data for response
        const finalMatches = yield (0, db_1.default) `
      SELECT 
        tm.id,
        tm.player1_id,
        tm.player2_id,
        u1.username as player1_name,
        u1.image_url as player1_image,
        u2.username as player2_name,
        u2.image_url as player2_image,
        tm.status,
        tm.winner_id
      FROM tournament_matches tm
      JOIN users u1 ON tm.player1_id = u1.id
      LEFT JOIN users u2 ON tm.player2_id = u2.id
      WHERE tm.tournament_id = ${tournamentId}
      AND tm.round_id = (
        SELECT id FROM tournament_rounds 
        WHERE tournament_id = ${tournamentId} 
        AND round_number = 1
      )
      ORDER BY tm.match_order
    `;
        const formattedMatches = finalMatches.map((match) => ({
            id: match.id,
            player1: {
                id: match.player1_id,
                name: match.player1_name,
                image_url: match.player1_image,
                winner: match.winner_id === match.player1_id ? true : false,
            },
            player2: match.player2_id
                ? {
                    id: match.player2_id,
                    name: match.player2_name,
                    image_url: match.player2_image,
                    winner: match.winner_id === match.player2_id ? true : false,
                }
                : null,
            status: match.status,
        }));
        res.json({
            success: true,
            tournament: tournament[0],
            participants,
            rounds: [
                {
                    round: 1,
                    matches: formattedMatches,
                },
            ],
        });
        __1.serverSocket.to(`tournament_${tournamentId}`).emit("lobbyUpdate", {
            success: true,
            tournament: tournament[0],
            participants,
            rounds: [{ round: 1, matches: formattedMatches }],
        });
        console.log("tournament registration lobby emitted to socket room:", `tournament_${tournamentId}`);
    }
    catch (err) {
        console.error("Error closing tournament registration:", err);
        res.status(500).json({
            success: false,
            message: "Failed to close tournament registration",
        });
    }
});
exports.closeTournamentRegistration = closeTournamentRegistration;
const getTournamentLobby = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const tournamentId = parseInt(req.params.id);
        if (!tournamentId || isNaN(tournamentId)) {
            res.status(400).json({
                success: false,
                message: "Invalid tournament ID",
            });
            return;
        }
        const userId = ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) || null;
        // Fetch tournament details
        const tournament = yield (0, db_1.default) `
       SELECT 
        t.*,
        CASE 
          WHEN tp.user_id IS NOT NULL THEN true
          ELSE false
        END AS registered
      FROM tournaments t
      LEFT JOIN tournament_participants tp
        ON t.id = tp.tournament_id
        AND tp.user_id = ${userId}
      WHERE t.id = ${tournamentId}
    `;
        if (!tournament.length) {
            res.status(404).json({
                success: false,
                message: "Tournament not found",
            });
            return;
        }
        // Fetch participants with their global ranking
        // const participants = await sql`
        //   SELECT
        //     u.id,
        //     u.username,
        //     u.image_url,
        //     u.rating,
        //     u.is_rated,
        //     tp.status,
        //     tp.score,
        //     RANK() OVER (ORDER BY u.rating DESC) as rank
        //   FROM users u
        //   JOIN tournament_participants tp ON u.id = tp.user_id
        //   WHERE tp.tournament_id = ${tournamentId}
        // `;
        const participants = yield (0, tournament_1.getSingleEliminationTournamentParticipants)(tournamentId);
        const rules = yield (0, db_1.default) `SELECT id, title, message as content from tournament_rules WHERE tournament_id = ${tournamentId}`;
        // Fetch current round matches with player details and scores
        const matches = yield (0, db_1.default) `
      SELECT 
        tr.round_number,
        tm.id,
        tm.game_id,
        tm.status,
        tm.winner_id,
        g.code,
        u1.id as player1_id,
        u2.id as player2_id,
        u1.username as player1_name,
        u1.image_url as player1_image,
        gp1.score as player1_score,
        u2.username as player2_name,
        u2.image_url as player2_image,
        gp2.score as player2_score
      FROM tournament_matches tm
      JOIN tournament_rounds tr ON tm.round_id = tr.id
      JOIN users u1 ON tm.player1_id = u1.id
      LEFT JOIN users u2 ON tm.player2_id = u2.id
      JOIN games g ON tm.game_id = g.id
      LEFT JOIN game_players gp1 ON g.id = gp1.game_id AND u1.id = gp1.user_id
      LEFT JOIN game_players gp2 ON g.id = gp2.game_id AND u2.id = gp2.user_id
      WHERE tm.tournament_id = ${tournamentId}
      ORDER BY tr.round_number ASC, tm.match_order ASC
    `;
        const gamesList = yield (0, db_1.default) `SELECT code as gamecode from games where id = ANY(${matches.map((m) => m.game_id)}::integer[])`;
        const codes = gamesList.map((gameData) => gameData.gamecode);
        const games = yield (0, utils_1.getGamesByCodes)(codes);
        let gamesMap = {};
        if (games) {
            gamesMap = Object.fromEntries(games.map((game) => [game.code, game]));
        }
        // Format rounds with aggregated player data
        const roundsMap = {};
        matches.forEach((match) => {
            var _a, _b;
            if (!roundsMap[match.round_number]) {
                roundsMap[match.round_number] = [];
            }
            roundsMap[match.round_number].push({
                id: match.id,
                player1: {
                    id: match.player1_id,
                    name: match.player1_name,
                    image_url: match.player1_image,
                    score: match.player1_score || 0,
                    winner: match.winner_id === match.player1_id ? true : false,
                },
                player2: {
                    id: match.player2_id,
                    name: match.player2_name,
                    image_url: match.player2_image,
                    score: match.player2_score || 0,
                    winner: match.winner_id === match.player2_id ? true : false,
                },
                status: match.status,
                game_id: match.game_id,
                game_code: match.code,
                winner_id: match.winner_id,
                turn_ends_at: (_a = gamesMap[match.code]) === null || _a === void 0 ? void 0 : _a.turn_ends_at,
                forfeiter_user_id: (_b = gamesMap[match.code]) === null || _b === void 0 ? void 0 : _b.forfeited_by,
            });
        });
        const rounds = Object.entries(roundsMap).map(([round, matches]) => ({
            round: parseInt(round),
            matches,
        }));
        const tournamentFormat = tournament[0].format;
        let standings = null;
        if (tournamentFormat === "Swiss") {
            standings = yield (0, tournament_1.getSwissTournamentStandings)(tournamentId);
        }
        else if (tournamentFormat === "Single Elimination") {
            standings = yield (0, tournament_1.getSingleEliminationTournamentStandings)(tournamentId, tournament[0].status);
        }
        res.json({
            success: true,
            tournament: tournament[0],
            participants,
            rules,
            rounds,
            standings,
        });
    }
    catch (err) {
        console.error("Error fetching tournament lobby:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch tournament lobby",
        });
    }
});
exports.getTournamentLobby = getTournamentLobby;
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
        let tournament = yield (0, db_1.default) `
      SELECT status FROM tournaments WHERE id = ${tournamentId}
    `;
        if (tournament[0].started) {
            // throw new Error("Tournament has already started.");
            res.status(400).json({
                success: false,
                message: "Tournament has already started",
            });
            return;
        }
        if (!tournament.length) {
            res.status(404).json({
                success: false,
                message: "Tournament not found",
            });
            return;
        }
        if (tournament[0].status !== "upcoming") {
            res.status(400).json({
                success: false,
                message: "Tournament cannot be started",
            });
            return;
        }
        // Get all participants
        const players = yield (0, tournament_1.getSingleEliminationTournamentParticipants)(tournamentId);
        if (players.length < 2) {
            res.status(400).json({
                success: false,
                message: "Not enough players to start tournament",
            });
            return;
        }
        // Update tournament status
        yield (0, db_1.default) `
      UPDATE tournaments 
      SET status = 'ongoing' 
      WHERE id = ${tournamentId}
    `;
        // Fetch all tournament matches and update associated games except bye matches
        const matches_update = yield (0, db_1.default) `
      SELECT tm.id, g.id as game_id
      FROM tournament_matches tm
      JOIN games g ON tm.game_id = g.id
      WHERE tm.tournament_id = ${tournamentId} AND tm.player2_id IS NOT NULL
    `;
        // Update match statuses to ongoing
        yield (0, db_1.default) `
      UPDATE tournament_matches
      SET status = 'in_progress'
      WHERE id = ANY(${matches_update.map((m) => m.id)}::integer[])
    `;
        // Update all games to in_progress with started_at timestamp
        yield (0, db_1.default) `
      UPDATE games
      SET status = 'in_progress', started_at = CURRENT_TIMESTAMP
      WHERE id = ANY(${matches_update.map((m) => m.game_id)}::integer[])
    `;
        // Update round 1 status to ongoing
        yield (0, db_1.default) `
      UPDATE tournament_rounds
      SET status = 'ongoing'
      WHERE tournament_id = ${tournamentId} AND round_number = 1
    `;
        // Fetch participants with their global ranking
        // const participants = await sql`
        //   SELECT
        //     u.id,
        //     u.username,
        //     u.image_url,
        //     u.rating,
        //     u.is_rated,
        //     tp.status,
        //     tp.score,
        //     tp.losses
        //     RANK() OVER (ORDER BY u.rating DESC) as rank
        //   FROM users u
        //   JOIN tournament_participants tp ON u.id = tp.user_id
        //   WHERE tp.tournament_id = ${tournamentId}
        // `;
        const participants = yield (0, tournament_1.getSingleEliminationTournamentParticipants)(tournamentId);
        tournament = yield (0, db_1.default) `
      SELECT * FROM tournaments WHERE id = ${tournamentId} `;
        // Fetch current round matches with player details and scores
        const matches = yield (0, db_1.default) `
      SELECT 
        tr.round_number,
        tm.id,
        tm.game_id,
        tm.status,
        tm.winner_id,
        g.code,
        u1.id as player1_id,
        u2.id as player2_id,
        u1.username as player1_name,
        u1.image_url as player1_image,
        gp1.score as player1_score,
        u2.username as player2_name,
        u2.image_url as player2_image,
        gp2.score as player2_score
      FROM tournament_matches tm
      JOIN tournament_rounds tr ON tm.round_id = tr.id
      JOIN users u1 ON tm.player1_id = u1.id
      LEFT JOIN users u2 ON tm.player2_id = u2.id
      JOIN games g ON tm.game_id = g.id
      LEFT JOIN game_players gp1 ON g.id = gp1.game_id AND u1.id = gp1.user_id
      LEFT JOIN game_players gp2 ON g.id = gp2.game_id AND u2.id = gp2.user_id
      WHERE tm.tournament_id = ${tournamentId}
      ORDER BY tr.round_number ASC, tm.match_order ASC
    `;
        const gamesList = yield (0, db_1.default) `SELECT code as gamecode from games where id = ANY(${matches.map((m) => m.game_id)}::integer[])`;
        //console.log("games", games);
        const codes = gamesList.map((gameData) => gameData.gamecode);
        const games = yield (0, utils_1.getGamesByCodes)(codes);
        let gamesMap = {};
        if (games) {
            gamesMap = Object.fromEntries(games.map((game) => [game.code, game]));
        }
        for (let code of codes) {
            const game = gamesMap[code];
            game.turn_started_at = Date.now();
            game.turn_ends_at =
                (game === null || game === void 0 ? void 0 : game.turn_started_at) + (game.turn_timeout_seconds + 0) * 1000;
            if (game.status == "waiting") {
                game.status = "in_progress";
                yield __1.matchForfeiter.scheduleForfeit(code, (game.turn_timeout_seconds + 0) * 1000);
            }
            yield (0, gameFunctions_1.saveGame)(code, game);
        }
        // update tournament started to true
        yield (0, db_1.default) `
      UPDATE tournaments
      SET started = true
      WHERE id = ${tournamentId}
    `;
        // Format rounds with aggregated player data
        const roundsMap = {};
        matches.forEach((match) => {
            if (!roundsMap[match.round_number]) {
                roundsMap[match.round_number] = [];
            }
            const game = gamesMap[match.code];
            roundsMap[match.round_number].push({
                id: match.id,
                player1: {
                    id: match.player1_id,
                    name: match.player1_name,
                    image_url: match.player1_image,
                    score: match.player1_score || 0,
                    winner: match.winner_id === match.player1_id ? true : false,
                },
                player2: {
                    id: match.player2_id,
                    name: match.player2_name,
                    image_url: match.player2_image,
                    score: match.player2_score || 0,
                    winner: match.winner_id === match.player2_id ? true : false,
                },
                status: match.status,
                game_id: match.game_id,
                game_code: match.code,
                winner_id: match.winner_id,
                turn_ends_at: game.turn_ends_at,
            });
        });
        const rounds = Object.entries(roundsMap).map(([round, matches]) => ({
            round: parseInt(round),
            matches,
        }));
        __1.serverSocket.to(`tournament_${tournamentId}`).emit("lobbyUpdate", {
            success: true,
            tournament: tournament[0],
            participants,
            rounds,
        });
        console.log("tournament started emitted to socket room:", `tournament_${tournamentId}`);
        res.json({
            success: true,
            message: "Tournament started successfully!",
            data: {
                tournament: tournament[0],
                participants,
                rounds,
            },
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
const reportMatchResult = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const gameId = parseInt(req.params.gameId);
        const { winner_id } = req.body;
        if (!gameId || isNaN(gameId) || !winner_id || isNaN(winner_id)) {
            res.status(400).json({
                success: false,
                message: "Invalid game ID or winner ID",
            });
            return;
        }
        // get tournament_id for the current match
        const tournament_id = yield (0, db_1.default) `
      SELECT tournament_id 
      FROM tournament_matches 
      WHERE game_id = ${gameId}
    `;
        // Update match with winner
        yield (0, db_1.default) `
      UPDATE tournament_matches 
      SET winner_id = ${winner_id}, status = 'completed'
      WHERE game_id = ${gameId}
    `;
        // update the loser participant status to disqualified
        const loserParticipant = yield (0, db_1.default) `
      SELECT 
        CASE 
          WHEN player1_id = ${winner_id} 
          THEN player2_id 
          ELSE player1_id 
        END AS loser_id
      FROM tournament_matches 
      WHERE game_id = ${gameId}
    `;
        yield (0, db_1.default) `
      UPDATE tournament_participants
      SET status = 'disqualified'
      WHERE tournament_id = ${tournament_id[0].tournament_id}
      AND user_id = ${loserParticipant[0].loser_id}
    `;
        const current_round_number = yield (0, db_1.default) `
      SELECT tr.round_number
      FROM tournament_matches tm
      JOIN tournament_rounds tr ON tm.round_id = tr.id
      WHERE tm.game_id = ${gameId}
    `;
        const next_round_number = current_round_number[0].round_number + 1;
        console.log("current round number:", current_round_number[0].round_number);
        console.log("next round number:", next_round_number);
        // const completedMatches = await sql`
        //   SELECT COUNT(*)
        //   FROM tournament_matches
        //   WHERE round_number = ${current_round_number[0].round_number}
        //   AND status = 'completed'
        // `;
        // if (parseInt(completedMatches[0].count) === 0) {
        //   res.status(400).json({
        //     success: false,
        //     message: "Current round is not completed yet",
        //   });
        //   return;
        // }
        res.json({
            success: true,
            message: "Match result reported successfully",
        });
    }
    catch (err) {
        console.error("Error reporting match result:", err);
        res.status(500).json({
            success: false,
            message: "Failed to report match result",
        });
    }
});
exports.reportMatchResult = reportMatchResult;
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
