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
const bullmq_1 = require("bullmq");
const gameFunctions_1 = require("../utils/gameFunctions");
const ioredis_1 = __importDefault(require("ioredis"));
const db_1 = __importDefault(require("../config/db"));
const utils_1 = require("../utils");
const tournament_1 = require("../utils/tournament");
const rating_1 = require("../utils/rating");
class MatchForfeiter {
    constructor(serverSocket) {
        this.serverSocket = serverSocket;
        this.queue = new bullmq_1.Queue("forfeitQueue");
        this.worker = new bullmq_1.Worker("forfeitQueue", (job) => __awaiter(this, void 0, void 0, function* () {
            const start = Date.now();
            yield this.processForfeitJob(job);
            console.log(`Job ${job === null || job === void 0 ? void 0 : job.id} took ${Date.now() - start}ms`);
        }), { connection: new ioredis_1.default({ maxRetriesPerRequest: null }), concurrency: 1 });
        this.worker.on("failed", (job, err) => {
            console.error(`Job ${job === null || job === void 0 ? void 0 : job.id} failed with error: ${err.message} ❌`);
        });
        this.worker.on("ready", () => {
            console.log("Forfeit worker is ready to process jobs ✅");
        });
        this.worker.on("active", (job) => {
            console.log(`Processing job ${job.id}...`);
        });
    }
    scheduleForfeit(gameCode, delayMs) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Scheduling forfeit for game ${gameCode} with timeout ${delayMs}ms`);
            yield this.cancelForfeit(gameCode); // Cancel existing job if any
            yield this.queue.add("forfeitJob", { gameCode }, {
                delay: delayMs,
                removeOnComplete: true,
                attempts: 3,
                removeOnFail: 500,
                jobId: gameCode,
            });
            console.log(`added job with gamecode ${gameCode} to queue`);
        });
    }
    cancelForfeit(gameCode) {
        return __awaiter(this, void 0, void 0, function* () {
            const job = yield this.queue.getJob(gameCode);
            try {
                if (job) {
                    yield job.remove();
                    console.log(`Cancelled forfeit for game ${gameCode}`);
                }
            }
            catch (err) {
                console.log(`Error canceling job ${job === null || job === void 0 ? void 0 : job.id}`, err);
            }
        });
    }
    processForfeitJob(job) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const { gameCode } = job.data;
            console.log(`Processing forfeit for match ${gameCode}`);
            // Add your forfeit logic here
            const match = yield (0, gameFunctions_1.getGameByCode)(gameCode);
            console.log(`Match ${gameCode} status: ${match.status}`);
            if (!match || !match.is_rated)
                return;
            // if the match is already completed or forfeited, do nothing
            if (match.status === "completed" || match.status === "forfeited") {
                console.log(`Match ${gameCode} already completed or forfeited. No action taken.`);
                return;
            }
            const winnerId = (_a = match.players.find((p) => p.user.id !== match.current_turn_user_id)) === null || _a === void 0 ? void 0 : _a.user.id;
            const loserId = match.current_turn_user_id;
            const winner = match.players.find((p) => p.user.id === winnerId);
            const loser = match.players.find((p) => p.user.id === loserId);
            console.log(`Forfeit processed for match ${gameCode}. Winner: ${winnerId}, Loser: ${loserId}`);
            // Notify Game Room
            const tournament = yield (0, utils_1.isTournamentMatch)(match.id);
            if (tournament) {
                const tournamentFormat = tournament.format;
                if (tournamentFormat == "Single Elimination") {
                    // create sql transaction to update match and player stats
                    const results = yield db_1.default.transaction((tx) => {
                        // 1. Update Match Status
                        const updateMatchStatus = tx `
                UPDATE tournament_matches 
                SET status = 'forfeited', winner_id = ${winnerId} 
                WHERE game_id = ${match.id} 
                RETURNING id, tournament_id
              `;
                        const queries = [updateMatchStatus];
                        // 2. Eliminate Loser from Tournament
                        const eliminateLoser = tx `
                UPDATE tournament_participants 
                SET status = 'eliminated' 
                WHERE tournament_id = (SELECT tournament_id FROM tournament_matches WHERE game_id = ${match.id}) AND user_id = ${loserId}
              `;
                        // 3. Update User Stats (Batch these!)
                        const updateUserStats = tx `
                UPDATE users SET games_played = games_played + 1 
                WHERE id IN (${winnerId}, ${loserId})
              `;
                        const updateWinnerStats = tx `UPDATE users SET games_won = games_won + 1 WHERE id = ${winnerId}`;
                        // 4. Update Game Players
                        //const updateGamePlayers = tx`UPDATE game_players SET status = 'forfeited' WHERE game_id = ${match.id} AND user_id = ${loserId}`;
                        queries.push(eliminateLoser, updateUserStats, updateWinnerStats);
                        return queries;
                    });
                    this.serverSocket
                        .to(`lobby_game_room:${gameCode}`)
                        .emit("matchForfeit", { winnerId, loserId });
                    //  await saveGame(gameCode, match); // Save the updated match state with timeouts and scores
                    console.log(`event sent to lobby_game_room:${gameCode}`);
                    const tournamentId = tournament.id;
                    const lobbyData = yield (0, gameFunctions_1.getSingleEliminationTournamentLobbyData)(tournamentId);
                    this.serverSocket
                        .to(`tournament_${tournamentId}`)
                        .emit("lobbyUpdate", lobbyData);
                    yield (0, tournament_1.advanceSingleEliminationTournamentToNextRound)(tournament.id, tournament.current_round_number, this.serverSocket);
                }
                else if (tournamentFormat == "Swiss") {
                    const results = yield db_1.default.transaction((tx) => {
                        // 1. Update Match Status
                        const updateMatchStatus = tx `
              UPDATE tournament_matches 
              SET status = 'forfeited', winner_id = ${winnerId} 
              WHERE game_id = ${match.id} 
              RETURNING id, tournament_id
            `;
                        const queries = [updateMatchStatus];
                        // 2. Eliminate Loser from Tournament
                        const winner = tx `
              UPDATE tournament_participants 
              SET score = score + 1 
              WHERE tournament_id = (SELECT tournament_id FROM tournament_matches WHERE game_id = ${match.id}) AND user_id = ${winnerId}
            `;
                        const loser = tx `
            UPDATE tournament_participants 
            SET losses = losses + 1
            WHERE tournament_id = (SELECT tournament_id FROM tournament_matches WHERE game_id = ${match.id}) AND user_id = ${loserId}
          `;
                        // 3. Update User Stats (Batch these!)
                        const updateUserStats = tx `
              UPDATE users SET games_played = games_played + 1 
              WHERE id IN (${winnerId}, ${loserId})
            `;
                        const updateWinnerStats = tx `UPDATE users SET games_won = games_won + 1 WHERE id = ${winnerId}`;
                        // 4. Update Game Players
                        //const updateGamePlayers = tx`UPDATE game_players SET status = 'forfeited' WHERE game_id = ${match.id} AND user_id = ${loserId}`;
                        queries.push(winner, loser, updateUserStats, updateWinnerStats);
                        return queries;
                    });
                    this.serverSocket
                        .to(`lobby_game_room:${gameCode}`)
                        .emit("matchForfeit", { winnerId, loserId });
                    console.log(`event sent to lobby_game_room:${gameCode}`);
                    const tournamentId = results[0][0].tournament_id;
                    console.log("before lobby update");
                    const lobbyData = yield (0, tournament_1.getSwissTournamentLobbyData)(tournamentId);
                    console.log("after lobby update");
                    this.serverSocket
                        .to(`tournament_${tournamentId}`)
                        .emit("lobbyUpdate", lobbyData);
                    //
                    yield (0, tournament_1.advanceSwissTournamentToNextRound)(tournament.id, tournament.current_round_number, this.serverSocket);
                }
            }
            this.serverSocket.to(gameCode).emit("matchForfeit", { winnerId, loserId });
            // Update Memory/Redis State
            match.winner_id = winnerId;
            match.status = "forfeited";
            match.forfeited_by = loserId;
            if (match.is_rated) {
                const players = (0, rating_1.updateRatings)(match.players, winnerId);
                for (let player of players) {
                    const oldRating = yield (0, db_1.default) `SELECT rating from users WHERE id = ${player.user.id}`;
                    const newRating = player.user.rating;
                    console.log(`player ${player.user.username} old rating ${oldRating[0].rating} new rating ${newRating}`);
                    yield (0, db_1.default) `UPDATE users SET rating = ${newRating} WHERE id = ${player.user.id}`;
                    const ratingChange = newRating - oldRating[0].rating;
                    // character suit there question //
                    yield (0, db_1.default) `INSERT INTO rating_changes (user_id, tournament_id, rating_change) VALUES (${player.user.id}, ${tournament === null || tournament === void 0 ? void 0 : tournament.id}, ${ratingChange})`;
                }
            }
            yield (0, gameFunctions_1.saveGame)(gameCode, match);
        });
    }
}
exports.default = MatchForfeiter;
