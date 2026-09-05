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
exports.startTournament = exports.closeTournamentRegistration = exports.getAllUpcomingTournaments = exports.getTournamentById = exports.getTournaments = void 0;
const __1 = require("..");
const db_1 = __importDefault(require("../config/db"));
const utils_1 = require("../utils");
const gameFunctions_1 = require("../utils/gameFunctions");
const tournament_1 = require("../utils/tournament");
const getTournaments = () => __awaiter(void 0, void 0, void 0, function* () {
    const tournaments = yield (0, db_1.default) `SELECT * FROM tournaments`;
    return tournaments;
});
exports.getTournaments = getTournaments;
const getTournamentById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const tournament = yield (0, db_1.default) `SELECT * FROM tournaments WHERE id = ${id}`;
    if (tournament.length === 0) {
        throw new Error(`Tournament with id ${id} not found`);
    }
    return tournament[0];
});
exports.getTournamentById = getTournamentById;
const getAllUpcomingTournaments = () => __awaiter(void 0, void 0, void 0, function* () {
    const tournaments = yield (0, db_1.default) `SELECT id, format, name, registration_closed, registration_fee, start_date, registration_closing_date FROM tournaments WHERE status = 'upcoming' ORDER BY start_date ASC`;
    return tournaments;
});
exports.getAllUpcomingTournaments = getAllUpcomingTournaments;
const closeTournamentRegistration = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const tournament = yield (0, db_1.default) `
      SELECT * FROM tournaments WHERE id = ${tournamentId}
    `;
        const participants = yield (0, tournament_1.getSingleEliminationTournamentParticipants)(tournamentId);
        if (tournament[0].registration_closed) {
            console.log("Tournament registration is already closed.");
            return;
        }
        if (participants.length < 2) {
            throw new Error("Cannot start tournament with less than 2 participants. Please wait for more players to register.");
        }
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
            // send push notification to players
            if (player1.push_token) {
                const title = `${player1.username}! Your Match is Ready`;
                const body = `You vs ${player2.username}`;
                (0, __1.sendPushNotification)(player1.push_token, title, body);
            }
            if (player2.push_token) {
                const title = `${player2.username}! Your Match is Ready`;
                const body = `You vs ${player1.username}`;
                (0, __1.sendPushNotification)(player2.push_token, title, body);
            }
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
        __1.serverSocket.to(`tournament_${tournamentId}`).emit("lobbyUpdate", {
            success: true,
            tournament: tournament[0],
            participants,
            rounds: [{ round: 1, matches: formattedMatches }],
        });
        console.log("tournament registration lobby emitted to socket room:", `tournament_${tournamentId}`);
    }
    catch (error) {
        console.error("Error closing tournament registration:", error);
        throw error;
    }
});
exports.closeTournamentRegistration = closeTournamentRegistration;
const startTournament = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let tournament = yield (0, db_1.default) `
      SELECT started, status FROM tournaments WHERE id = ${tournamentId}
    `;
        if (tournament[0].started) {
            throw new Error("Tournament has already started.");
        }
        if (tournament[0].status !== "upcoming") {
            throw new Error("Only upcoming tournaments can be started.");
        }
        // Get all participants
        const players = yield (0, tournament_1.getSingleEliminationTournamentParticipants)(tournamentId);
        if (players.length < 2) {
            throw new Error("Cannot start tournament with less than 2 participants.");
        }
        // Update tournament status to 'ongoing' and set started to true
        yield (0, db_1.default) `
      UPDATE tournaments
      SET status = 'ongoing', started = true
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
    }
    catch (error) {
        console.error("Error starting tournament:", error);
        throw error;
    }
});
exports.startTournament = startTournament;
