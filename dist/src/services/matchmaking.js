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
const events_1 = require("events");
const db_1 = __importDefault(require("../config/db"));
class Matchmaker extends events_1.EventEmitter {
    constructor() {
        super();
        this.interval = null;
        this.checkInterval = 5000;
        this.ratingRange = 0;
        this.addToQueue = (userId, rating) => __awaiter(this, void 0, void 0, function* () {
            try {
                yield (0, db_1.default) `
        INSERT INTO matchmaking_queue (user_id, rating) 
        VALUES (${userId}, ${rating}) 
        ON CONFLICT (user_id) DO UPDATE 
        SET joined_at = NOW()
      `;
                this.checkMatches();
            }
            catch (error) {
                console.error('Error adding user to matchmaking queue:', error);
                //throw error; // Re-throw the original error for proper handling
            }
        });
        this.removeFromQueue = (userId) => __awaiter(this, void 0, void 0, function* () {
            try {
                yield (0, db_1.default) `DELETE FROM matchmaking_queue WHERE user_id = ${userId}`;
            }
            catch (error) {
                console.error('Error removing user from matchmaking queue:', error);
                // throw error; // Re-throw the original error for proper handling
            }
        });
        //this.start();
    }
    checkMatches() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const potentialMatches = yield (0, db_1.default) `
        WITH potential_matches AS (
          SELECT 
            a.user_id AS user1, 
            a.joined_at AS joined_at1,
            b.user_id AS user2,
            b.joined_at AS joined_at2,
            ABS(a.rating - b.rating) AS rating_diff
          FROM matchmaking_queue a
          JOIN matchmaking_queue b ON a.user_id < b.user_id
          WHERE ABS(a.rating - b.rating) >= ${this.ratingRange}
          ORDER BY rating_diff, a.joined_at
          LIMIT 1
        )
        SELECT * FROM potential_matches
      `;
                console.log("Checking for matches:", potentialMatches);
                if (potentialMatches.length > 0) {
                    const { user1, joined_at1, user2, joined_at2 } = potentialMatches[0];
                    console.log("potential_matches", potentialMatches);
                    if (joined_at1 < joined_at2) {
                        yield this.createMatch(user1, user2);
                    }
                    else {
                        yield this.createMatch(user2, user1);
                    }
                }
            }
            catch (error) {
                console.error('Error checking for matches:', error);
                // Don't throw here as this is called internally and shouldn't crash the service
            }
        });
    }
    createMatch(userId1, userId2) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const gameCode = Math.random().toString(36).substring(2, 12);
                // Get full user data for both players
                // const players = await sql`
                //   SELECT id, username, email, image_url, rating, location, games_played, games_won
                //   FROM users
                //   WHERE id IN (${userId1}, ${userId2})
                // `;
                const result = yield db_1.default.transaction((sql) => [
                    sql `
          INSERT INTO games (code, created_by, status, player_count, current_player_position, is_rated) 
          VALUES (${gameCode}, ${userId1}, 'waiting', 2, 1, true) 
          RETURNING id
        `,
                    sql `
          WITH new_game_id AS (SELECT lastval() AS game_id)
          INSERT INTO game_players (game_id, user_id, position, is_dealer)
          VALUES 
            ((SELECT game_id FROM new_game_id), ${userId1}::integer, 0, true),
            ((SELECT game_id FROM new_game_id), ${userId2}::integer, 1, false)
          RETURNING 
            user_id as id,
            id as player_id,
            position,
            is_dealer,
            (SELECT username FROM users WHERE users.id = user_id) as username,
            (SELECT image_url FROM users WHERE users.id = user_id) as image_url,
            (SELECT rating FROM users WHERE users.id = user_id) as rating
        `,
                    sql `
          DELETE FROM matchmaking_queue 
          WHERE user_id IN (${userId1}, ${userId2})
        `,
                ]);
                const cards = yield (0, db_1.default) `
        SELECT card_id FROM cards ORDER BY RANDOM()`;
                const gameId = result[0][0].id;
                const players = result[1];
                const dealer = players.find((player) => player.is_dealer);
                cards.forEach((card) => __awaiter(this, void 0, void 0, function* () {
                    yield (0, db_1.default) `INSERT INTO game_cards (game_id, card_id, player_id, hand_position) 
        VALUES (${gameId}, ${card.card_id}, ${dealer === null || dealer === void 0 ? void 0 : dealer.player_id}, ${-1})`;
                }));
                this.emit("matchFound", {
                    gameCode,
                    gameId,
                    players,
                    positions: players.reduce((acc, p) => {
                        acc[p.user_id] = p.position;
                        return acc;
                    }, {}),
                });
                console.log(`Match created: Game ID ${gameId} for players:`, players);
            }
            catch (error) {
                console.error("Match creation failed:", error);
                // Don't throw here as this is called internally and shouldn't crash the service
            }
        });
    }
    start() {
        if (!this.interval) {
            this.interval = setInterval(() => this.checkMatches(), this.checkInterval);
        }
    }
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}
exports.default = Matchmaker;
