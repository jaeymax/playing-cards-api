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
//import { redis } from "..";
const db_1 = __importDefault(require("../config/db"));
const gameFunctions_1 = require("../utils/gameFunctions");
class MatchForfeiter {
    constructor(serverSocket, redis) {
        this.interval = null;
        this.checkInterval = 1000; // 1 seconds
        this.serverSocket = serverSocket;
        this.redis = redis;
        this.start();
    }
    start() {
        this.interval = setInterval(() => {
            this.checkForForfeits();
        }, this.checkInterval);
    }
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
    createNextMatchRound(tournamentId, roundNumber) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Fetch participants qualified for the next round
                // create a new round entry for the tournament if it doesn't exist
                const existingRound = yield (0, db_1.default) `
    SELECT id 
    FROM tournament_rounds 
    WHERE tournament_id = ${tournamentId} 
    AND round_number = ${roundNumber}
  `;
                let roundId;
                if (existingRound.length === 0) {
                    const newRound = yield (0, db_1.default) `
      INSERT INTO tournament_rounds (tournament_id, round_number) 
      VALUES (${tournamentId}, ${roundNumber})
      RETURNING id
    `;
                    roundId = newRound[0].id;
                }
                else {
                    roundId = existingRound[0].id;
                }
                console.log('creating matching for round', roundNumber);
                // create new matches for the next round
                const participants = yield (0, db_1.default) `
    SELECT u.id, u.username, u.image_url
    FROM users u
    JOIN tournament_participants tp ON u.id = tp.user_id
    WHERE tp.tournament_id = ${tournamentId} AND status = 'qualified'
    ORDER BY u.username
  `;
                // Shuffle participants
                const shuffled = participants.sort(() => Math.random() - 0.5);
                // Pair players and create matches
                for (let i = 0; i < shuffled.length; i += 2) {
                    const player1 = shuffled[i];
                    const player2 = shuffled[i + 1];
                    if (!player2) {
                        // Handle odd number of players - auto-advance
                        const game = yield (0, db_1.default) `
          INSERT INTO games (
            code,
            created_by,
            player_count,
            status,
            current_turn_user_id,
            is_rated
          ) VALUES (
            ${Math.random().toString(36).substring(2, 12)},
            ${player1.id},
            2,
            'completed',
            ${player1.id},
            true
          )
          RETURNING *
        `;
                        // create game player
                        const result = yield (0, db_1.default) `
          INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
          VALUES (
            ${game[0].id}, 
            ${player1.id}, 
            0, 
            true,
            'active'
          )
          RETURNING 
            id,
            game_id,
            score,
            games_won,
            position,
            is_dealer,
            status,
            (SELECT json_build_object(
              'id', id,
              'username', username,
              'image_url', image_url,
              'rating', rating
            ) FROM users WHERE id = user_id) as user
        `;
                        // create tournament match
                        const match = yield (0, db_1.default) `
          INSERT INTO tournament_matches (
            tournament_id,
            game_id,
            round_id,
            player1_id,
            player2_id,
            status,
            winner_id,
            match_order
          ) VALUES (
            ${tournamentId},
            ${game[0].id},
            ${roundId},
            ${player1.id},
            NULL,
            'completed',
            ${player1.id},
            ${Math.floor(i / 2) + 1}
          )
          RETURNING id, status
        `;
                        continue;
                    }
                    const cards = yield (0, db_1.default) `SELECT card_id FROM cards ORDER BY RANDOM()`;
                    const is_final_match = participants.length == 2;
                    // Create game
                    const game = yield (0, db_1.default) `
      INSERT INTO games (
        code,
        created_by,
        player_count,
        status,
        current_turn_user_id,
        is_rated,
        is_final_match
      ) VALUES (
        ${Math.random().toString(36).substring(2, 12)},
        ${player1.id},
        2,
        'waiting',
        ${player2.id},
        true,
        ${is_final_match}
      )
      RETURNING *
    `;
                    // Create game players
                    const result = yield db_1.default.transaction((sql) => [
                        sql `
        INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
        VALUES (
          ${game[0].id}, 
          ${player1.id}, 
          0, 
          true,
          'active'
        )
        RETURNING 
          id,
          game_id,
          score,
          games_won,
          position,
          is_dealer,
          status,
          (SELECT json_build_object(
            'id', id,
            'username', username,
            'image_url', image_url,
            'rating', rating
          ) FROM users WHERE id = user_id) as user
      `,
                        sql `
        INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
        VALUES (
          ${game[0].id}, 
          ${player2.id}, 
          1, 
          false,
          'active'
        )
        RETURNING 
          id,
          game_id,
          score,
          games_won,
          position,
          is_dealer,
          status,
          (SELECT json_build_object(
            'id', id,
            'username', username,
            'image_url', image_url,
            'rating', rating
          ) FROM users WHERE id = user_id) as user
      `,
                    ]);
                    // Create game cards
                    const gameCards = yield (0, db_1.default) `
      INSERT INTO game_cards (game_id, card_id, player_id, hand_position, status)
      SELECT 
        ${game[0].id},
        unnest(${cards.map((c) => c.card_id)}::integer[]),
        ${result[0][0].id},
        -1,
        'in_deck'
      RETURNING 
        id,
        game_id,
        player_id,
        status,
        hand_position,
        trick_number,
        pos_x,
        pos_y,
        rotation,
        z_index,
        animation_state,
        (SELECT json_build_object(
          'card_id', card_id,
          'suit', suit,
          'value', value,
          'rank', rank,
          'image_url', image_url
        ) FROM cards WHERE card_id = game_cards.card_id) as card
    `;
                    // Create match
                    const match = yield (0, db_1.default) `
      INSERT INTO tournament_matches (
        tournament_id,
        game_id,
        round_id,
        player1_id,
        player2_id,
        status,
        match_order
      ) VALUES (
        ${tournamentId},
        ${game[0].id},
        ${roundId},
        ${player1.id},
        ${player2.id},
        'in_progress',
        ${Math.floor(i / 2) + 1}
      )
      RETURNING id, status
    `;
                    // update tournaments current round number
                    yield (0, db_1.default) `
      UPDATE tournaments 
      SET current_round_number = ${roundNumber} 
      WHERE id = ${tournamentId}
    `;
                    // Prepare and save game to Redis
                    const newGame = Object.assign(Object.assign({}, game[0]), { players: [result[0][0], result[1][0]], cards: gameCards });
                    yield (0, gameFunctions_1.saveGame)(game[0].code, newGame);
                    console.log("game saved to memory successfully", game[0].code);
                    const lobbyData = yield (0, gameFunctions_1.getTournamentLobbyData)(tournamentId);
                    this.serverSocket.to(`tournament_${tournamentId}`).emit("lobbyUpdate", lobbyData);
                }
            }
            catch (error) {
                console.error("Error creating next match round:", error);
            }
        });
    }
    advanceToNextRound(gameId, winnerId, tournamentId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const current_round_number = yield (0, db_1.default) `
      SELECT tr.round_number
      FROM tournament_matches tm
      JOIN tournament_rounds tr ON tm.round_id = tr.id
      WHERE tm.game_id = ${gameId}
    `;
                const ongoingMatches = yield (0, db_1.default) `
    SELECT COUNT(*) AS ongoing_count
    FROM tournament_matches tm
    JOIN tournament_rounds tr ON tm.round_id = tr.id
    WHERE tm.tournament_id = ${tournamentId}
    AND tr.round_number = ${current_round_number[0].round_number}
    AND (tm.status = 'in_progress' OR tm.status = 'pending')
  `;
                if (ongoingMatches[0].ongoing_count == 0) {
                    // proceed to check active participants
                    // count all active participants in the tournament
                    const activeParticipants = yield (0, db_1.default) `
      SELECT COUNT(*) AS active_count
      FROM tournament_participants
      WHERE tournament_id = ${tournamentId} AND status = 'qualified'
    `;
                    console.log("activeParticipants", activeParticipants[0].active_count);
                    if (activeParticipants[0].active_count <= 1) {
                        // if only one active participant remains, mark the tournament as completed
                        yield (0, db_1.default) `
        UPDATE tournaments
        SET status = 'completed', end_date = NOW()
        WHERE id = ${tournamentId}
      `;
                        // set tournament winner to the last active participant
                        const winnerParticipant = yield (0, db_1.default) `
        SELECT user_id
        FROM tournament_participants
        WHERE tournament_id = ${tournamentId} AND status = 'qualified'
        LIMIT 1
      `;
                        if (winnerParticipant.length > 0) {
                            yield (0, db_1.default) `
          UPDATE tournaments
          SET winner_id = ${winnerParticipant[0].user_id}
          WHERE id = ${tournamentId}
        `;
                        }
                    }
                    else if (activeParticipants[0].active_count > 1) {
                        // advance to next round
                        this.createNextMatchRound(tournamentId, current_round_number[0].round_number + 1);
                    }
                }
                else {
                    // exit if there are still ongoing matches
                }
            }
            catch (error) {
                console.error("Error advancing to next round:", error);
            }
        });
    }
    getWinnerId(match) {
        return match.players.find((p) => p.user.id !== match.current_turn_user_id).user.id;
    }
    saveMatchResultToDB(game, winnerId) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                // Update all players scores and games_played in the database
                for (const player of game.players) {
                    yield (0, db_1.default) `
        UPDATE game_players 
        SET score = ${player.score}
        WHERE game_id = ${game.id} AND user_id = ${player.user.id}
      `;
                    // update games_played for each user
                    yield (0, db_1.default) `
        UPDATE users 
        SET games_played = games_played + 1
        WHERE id = ${player.user.id}
      `;
                    // Update user's game_wons count
                    yield (0, db_1.default) `
    UPDATE users 
    SET games_won = games_won + 1
    WHERE id = ${winnerId}
  `;
                }
            }
            catch (error) {
                console.error("Error saving match result to DB:", error);
            }
        });
    }
    checkForForfeits() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const expiredGames = yield this.redis.zrangebyscore("forfeit:index", 0, Date.now());
                for (const gameCode of expiredGames) {
                    const match = yield (0, gameFunctions_1.getGameByCode)(gameCode);
                    if (!match || !match.is_rated) {
                        continue;
                    }
                    console.log(`Game with code ${gameCode} is eligible for forfeit check.`);
                    const entry = yield this.redis.zrem("forfeit:index", gameCode);
                    console.log('Redis zrem result: in forfeit index itself', entry, gameCode);
                    if (entry == 0)
                        continue;
                    const entry2 = yield this.redis.zrem('forfeit:index', gameCode);
                    console.log('Redis zrem result: in forfeit index itself test', entry2, gameCode);
                    this.serverSocket.to(gameCode).emit("matchForfeit", {
                        game_code: gameCode,
                        reason: "Match forfeited due to inactivity.",
                        loserId: match.current_turn_user_id,
                    });
                    const winner_id = this.getWinnerId(match);
                    match.winner_id = winner_id;
                    yield this.saveMatchResultToDB(match, winner_id);
                    yield this.forfeitMatch(match.id, gameCode, winner_id);
                    const tournamentId = yield (0, db_1.default) `
        SELECT tournament_id
        FROM tournament_matches
        WHERE game_id = ${match.id}
      `;
                    yield this.advanceToNextRound(match.id, winner_id, tournamentId[0].tournament_id);
                    const lobbyData = yield (0, gameFunctions_1.getTournamentLobbyData)(tournamentId[0].tournament_id);
                    // console.log('lobbyData after forfeit:', JSON.stringify(lobbyData));
                    this.serverSocket.to(`tournament_${tournamentId[0].tournament_id}`).emit("lobbyUpdate", lobbyData);
                }
            }
            catch (error) {
                console.error("Error checking for forfeitable matches:", error);
            }
        });
    }
    forfeitMatch(game_id, game_code, winner_id) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Match forfeited: Game Code: ${game_code}`);
            //select match with game_code
            const tournament_match = yield (0, db_1.default) `SELECT * FROM tournament_matches WHERE game_id = ${game_id};`;
            if (tournament_match.length > 0) {
                console.log(`Forfeiting match with ID: ${tournament_match[0].id}`);
                yield (0, db_1.default) `UPDATE tournament_matches SET status = 'forfeited' WHERE id = ${tournament_match[0].id};`;
                yield (0, db_1.default) `UPDATE tournament_matches SET winner_id = ${winner_id} WHERE id = ${tournament_match[0].id};`;
                const loserParticipant = yield (0, db_1.default) `
      SELECT 
        CASE 
          WHEN player1_id = ${winner_id} 
          THEN player2_id 
          ELSE player1_id 
        END AS loser_id
      FROM tournament_matches 
      WHERE game_id = ${game_id}
    `;
                yield (0, db_1.default) `
      UPDATE tournament_participants
      SET status = 'eliminated'
      WHERE tournament_id = ${tournament_match[0].tournament_id}
      AND user_id = ${loserParticipant[0].loser_id}
    `;
                console.log(`Match updated: Game Code: ${game_code}, Winner ID: ${winner_id}`);
            }
            else {
                console.log(`No match found for Game ID: ${game_id}`);
            }
        });
    }
}
exports.default = MatchForfeiter;
