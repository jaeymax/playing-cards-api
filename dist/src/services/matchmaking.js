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
Object.defineProperty(exports, "__esModule", { value: true });
const events_1 = require("events");
const gameFunctions_1 = require("../utils/gameFunctions");
const presenceService_1 = require("./presenceService");
const __1 = require("..");
class Matchmaker extends events_1.EventEmitter {
    constructor(redis, createMatchFn) {
        super();
        this.redis = redis;
        this.createMatchFn = createMatchFn;
        this.queueKey = "matchmaking:queue";
        this.ratingsKey = "matchmaking:ratings";
        // 0 means any rating difference is allowed.
        this.ratingRange = 0;
        this.matching = false;
        /**
         * Atomically finds two eligible players and removes them
         * from the queue so they cannot be paired again.
         *
         * Queue scores represent their original joining timestamps.
         */
        this.reserveMatchScript = `
    local queueKey = KEYS[1]
    local ratingsKey = KEYS[2]
    local ratingRange = tonumber(ARGV[1])

    local entries = redis.call(
      "ZRANGE", queueKey, 0, -1, "WITHSCORES"
    )

    if #entries < 4 then
      return {}
    end

    local selectedFirst = nil
    local selectedSecond = nil
    local bestDifference = nil

    -- The first player is the longest-waiting player.
    local firstId = entries[1]
    local firstRating = tonumber(
      redis.call("HGET", ratingsKey, firstId)
    )

    if not firstRating then
      redis.call("ZREM", queueKey, firstId)
      redis.call("HDEL", ratingsKey, firstId)
      return {}
    end

    selectedFirst = firstId

    -- Find the closest-rated eligible opponent.
    for i = 3, #entries, 2 do
      local candidateId = entries[i]
      local candidateRating = tonumber(
        redis.call("HGET", ratingsKey, candidateId)
      )

      if candidateRating then
        local difference = math.abs(firstRating - candidateRating)

        if (ratingRange == 0 or difference <= ratingRange)
          and (
            bestDifference == nil
            or difference < bestDifference
          ) then
          selectedSecond = candidateId
          bestDifference = difference
        end
      end
    end

    if not selectedSecond then
      return {}
    end

    local firstScore = redis.call("ZSCORE", queueKey, selectedFirst)
    local secondScore = redis.call("ZSCORE", queueKey, selectedSecond)

    redis.call("ZREM", queueKey, selectedFirst, selectedSecond)

    return {
      selectedFirst,
      tostring(firstRating),
      firstScore,
      selectedSecond,
      tostring(redis.call("HGET", ratingsKey, selectedSecond)),
      secondScore
    }
  `;
        this.addToQueue = (userId, rating) => __awaiter(this, void 0, void 0, function* () {
            try {
                const joinedAt = Date.now();
                // Preserve the original joining time if already queued.
                const existingScore = yield this.redis.zscore(this.queueKey, String(userId));
                if (existingScore === null) {
                    yield this.redis
                        .multi()
                        .zadd(this.queueKey, joinedAt, String(userId))
                        .hset(this.ratingsKey, String(userId), rating)
                        .exec();
                }
                else {
                    // Refresh the rating without resetting queue position.
                    yield this.redis.hset(this.ratingsKey, String(userId), rating);
                }
                console.log(`User ${userId} added to matchmaking queue with rating ${rating}.`);
                yield (0, presenceService_1.setUserStatus)(userId, "looking_for_game");
                __1.serverSocket.emit("presence:status", { userId, status: "looking_for_game" });
                yield this.checkMatches();
            }
            catch (error) {
                console.error("Error adding user to matchmaking queue:", error);
                yield (0, presenceService_1.setUserStatus)(userId, "idle");
                __1.serverSocket.emit("presence:status", { userId, status: "idle" });
                throw error;
            }
        });
        this.removeFromQueue = (userId) => __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.redis
                    .multi()
                    .zrem(this.queueKey, String(userId))
                    .hdel(this.ratingsKey, String(userId))
                    .exec();
                yield (0, presenceService_1.setUserStatus)(userId, "idle");
                __1.serverSocket.emit("presence:status", { userId, status: "idle" });
            }
            catch (error) {
                console.error("Error removing user from matchmaking queue:", error);
                throw error;
            }
        });
        this.checkMatches = () => __awaiter(this, void 0, void 0, function* () {
            if (this.matching)
                return;
            this.matching = true;
            try {
                while (true) {
                    const result = (yield this.redis.eval(this.reserveMatchScript, 2, this.queueKey, this.ratingsKey, this.ratingRange));
                    console.log("Matchmaking result:", result);
                    if (!result || result.length < 6) {
                        break;
                    }
                    const [firstId, firstRating, firstScore, secondId, secondRating, secondScore,] = result;
                    const user1 = Number(firstId);
                    const user2 = Number(secondId);
                    try {
                        // Use your existing game-creation and initialization flow here.
                        const match = yield this.createMatchFn(user1, user2);
                        this.emit("matchFound", Object.assign({}, match));
                        yield (0, gameFunctions_1.saveGame)(match.code, match);
                        console.log(`Match created: Game ${match.code} for players ${user1}, ${user2}`);
                    }
                    catch (error) {
                        console.error("Match creation failed:", error);
                        // Put both players back in their original queue positions.
                        yield this.redis
                            .multi()
                            .zadd(this.queueKey, Number(firstScore), firstId)
                            .zadd(this.queueKey, Number(secondScore), secondId)
                            .hset(this.ratingsKey, firstId, firstRating)
                            .hset(this.ratingsKey, secondId, secondRating)
                            .exec();
                        // Stop here to avoid repeatedly retrying the same failed pair.
                        break;
                    }
                }
            }
            catch (error) {
                console.error("Error checking for matches:", error);
            }
            finally {
                this.matching = false;
            }
        });
    }
}
exports.default = Matchmaker;
