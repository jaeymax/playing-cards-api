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
exports.createChallengeGame = exports.getPlayerProfile = exports.createEmitToUser = exports.createMatchmakerMatch = exports.getGamesByCodes = exports.markTournamentAsEndedAndCompleted = exports.getMatchLoser = exports.isTournamentMatch = exports.updateGamePlayersScores = exports.getMatchWinner = exports.updateGamesPlayedForGamePlayers = exports.markGameAsEndedAndForfeited = exports.markGameAsEndedAndCompleted = exports.updateLoserWinningStreak = exports.updateWinnerWonCount = void 0;
const _1 = require(".");
const db_1 = __importDefault(require("./config/db"));
const tournament_1 = require("./utils/tournament");
const presenceService_1 = require("./services/presenceService");
const gameFunctions_1 = require("./utils/gameFunctions");
const updateWinnerWonCount = (winnerId) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.default) `
      UPDATE users
      SET games_won = games_won + 1
      WHERE id = ${winnerId}
   `;
    // update winning streak for winner, add 1 to current winning streak, and update max winning streak if current winning streak is greater than max winning streak
    yield (0, db_1.default) `
      UPDATE users
      SET current_winning_streak = current_winning_streak + 1,
          max_winning_streak = GREATEST(current_winning_streak + 1, max_winning_streak)
      WHERE id = ${winnerId}
   `;
});
exports.updateWinnerWonCount = updateWinnerWonCount;
const updateLoserWinningStreak = (loserId) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.default) `
      UPDATE users
      SET current_winning_streak = 0
      WHERE id = ${loserId}
   `;
});
exports.updateLoserWinningStreak = updateLoserWinningStreak;
const markGameAsEndedAndCompleted = (gameId) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.default) `
      UPDATE games
      SET status = 'completed', ended_at = NOW()
      WHERE id = ${gameId}
   `;
});
exports.markGameAsEndedAndCompleted = markGameAsEndedAndCompleted;
const markGameAsEndedAndForfeited = (gameId) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.default) `
      UPDATE games
      SET status = 'forfeited', ended_at = NOW()
      WHERE id = ${gameId}
   `;
    console.log("updated game with game_id", gameId, "as forfeited");
});
exports.markGameAsEndedAndForfeited = markGameAsEndedAndForfeited;
const markTournamentAsEndedAndCompleted = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.default) `
      UPDATE tournaments
      SET status = 'completed', end_date = NOW()
      WHERE id = ${tournamentId}
   `;
});
exports.markTournamentAsEndedAndCompleted = markTournamentAsEndedAndCompleted;
// update games played for all players in a game
const updateGamesPlayedForGamePlayers = (gameId) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.default) `
  UPDATE users u
  SET games_played = u.games_played + 1
  FROM game_players gp
  WHERE gp.game_id = ${gameId}
    AND gp.user_id = u.id
`;
});
exports.updateGamesPlayedForGamePlayers = updateGamesPlayedForGamePlayers;
const getMatchWinner = (game) => {
    const final_trick = game.completed_tricks[game.completed_tricks.length - 1];
    return game.players.find((player) => player.position == final_trick.leader_position);
};
exports.getMatchWinner = getMatchWinner;
// function go return loser of a match, but only for a  two player game
const getMatchLoser = (game) => {
    if (game.players.length != 2) {
        throw new Error("getMatchLoser only works for two player games");
    }
    const winner = getMatchWinner(game);
    return game.players.find((player) => player.id != (winner === null || winner === void 0 ? void 0 : winner.id));
};
exports.getMatchLoser = getMatchLoser;
// function to return losers of a match, for games with more than 2 players, it will return an array of losers
const getMatchLosers = (game) => {
    const winner = getMatchWinner(game);
    return game.players.filter((player) => player.id != (winner === null || winner === void 0 ? void 0 : winner.id));
};
const updateGamePlayersScores = (game) => __awaiter(void 0, void 0, void 0, function* () {
    // for (const player of game.players) {
    //   await sql`
    //       UPDATE game_players
    //       SET score = ${player.score}
    //       WHERE game_id = ${game.id} AND user_id = ${player.user.id}
    //   `;
    // }
    const userIds = game.players.map((p) => p.user.id);
    const scores = game.players.map((p) => p.score);
    yield (0, db_1.default) `
    UPDATE game_players gp
    SET score = u.score
    FROM UNNEST(
      ${userIds}::int[],
      ${scores}::int[]
    ) AS u(user_id, score)
    WHERE gp.game_id = ${game.id}
      AND gp.user_id = u.user_id
  `;
});
exports.updateGamePlayersScores = updateGamePlayersScores;
// function to determin whether a game is a tournament game
const isTournamentMatch = (gameId) => __awaiter(void 0, void 0, void 0, function* () {
    // join on tournaments table and return the format of the tournament
    const result = yield (0, db_1.default) `
      SELECT tm.tournament_id, tr.round_number, t.format
           FROM tournament_matches tm
           JOIN tournament_rounds tr ON tm.round_id = tr.id
           JOIN tournaments t ON tm.tournament_id = t.id
        WHERE tm.game_id = ${gameId}
    `;
    return result.length > 0
        ? {
            id: result[0].tournament_id,
            current_round_number: result[0].round_number,
            format: result[0].format,
        }
        : null;
});
exports.isTournamentMatch = isTournamentMatch;
const getGamesByCodes = (codes) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const keys = codes.map((code) => `${code}`);
        const games = yield _1.redis.mget(keys);
        return games.map((g) => g && JSON.parse(g)).filter(Boolean);
    }
    catch (err) {
        console.log("Error getting games from redis", err);
        return null;
    }
});
exports.getGamesByCodes = getGamesByCodes;
const createMatchmakerMatch = (user1, user2) => __awaiter(void 0, void 0, void 0, function* () {
    const game = yield (0, tournament_1.createTwoPlayerMatch)(user1);
    const { gameplayer1, gameplayer2 } = yield (0, tournament_1.createTwoPlayerMatchGamePlayers)(game.id, user1, user2);
    const gameCards = yield (0, tournament_1.createGameCardsForMatch)(game.id, gameplayer1.id);
    const newGame = Object.assign(Object.assign({}, game), { players: [gameplayer1, gameplayer2], cards: gameCards });
    return newGame;
});
exports.createMatchmakerMatch = createMatchmakerMatch;
const createChallengeGame = (user1Id, user2Id) => __awaiter(void 0, void 0, void 0, function* () {
    const game = yield (0, tournament_1.createTwoPlayerMatch)(user1Id);
    const { gameplayer1, gameplayer2 } = yield (0, tournament_1.createTwoPlayerMatchGamePlayers)(game.id, user1Id, user2Id);
    const gameCards = yield (0, tournament_1.createGameCardsForMatch)(game.id, gameplayer1.id);
    const newGame = Object.assign(Object.assign({}, game), { players: [gameplayer1, gameplayer2], cards: gameCards });
    yield (0, gameFunctions_1.saveGame)(game.code, newGame);
    return game.code; // Return the game code instead of the entire game object
});
exports.createChallengeGame = createChallengeGame;
const createEmitToUser = (serverSocket, redis) => {
    return (userId, event, payload) => __awaiter(void 0, void 0, void 0, function* () {
        const userIdString = String(userId);
        const key = (0, presenceService_1.connectionsKey)(userIdString);
        const now = Date.now();
        // Remove expired socket connections.
        yield redis.zremrangebyscore(key, "-inf", now);
        // Retrieve all active socket IDs for this user.
        const socketIds = yield redis.zrange(key, 0, -1);
        if (socketIds.length === 0) {
            return;
        }
        // Emit to every active device/tab belonging to this user.
        const emissions = socketIds.map((socketId) => serverSocket.to(socketId).emit(event, payload));
        // Socket.IO emit() is synchronous; it doesn't confirm delivery.
        void emissions;
    });
};
exports.createEmitToUser = createEmitToUser;
const getPlayerProfile = (userId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, db_1.default) `
    SELECT id, username, image_url, rating, games_played, games_won, current_winning_streak, max_winning_streak
    FROM users
    WHERE id = ${userId}
  `;
    if (result.length === 0) {
        throw new Error(`User with ID ${userId} not found`);
    }
    return result[0];
});
exports.getPlayerProfile = getPlayerProfile;
