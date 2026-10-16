
import { EventEmitter } from "events";
import type Redis from "ioredis";
import { saveGame } from "../utils/gameFunctions";
import { setUserStatus } from "./presenceService";
import { serverSocket } from "..";

interface QueueEntry {
  userId: number;
  rating: number;
  joinedAt: number;
}

interface MatchFoundPayload {
  gameCode: string;
  gameId: number;
  players: any[];
  positions: Record<number, number>;
}

type CreateMatchFn = (
  player1Id: number,
  player2Id: number
) => Promise<MatchFoundPayload>;

class Matchmaker extends EventEmitter {
  private readonly queueKey = "matchmaking:queue";
  private readonly ratingsKey = "matchmaking:ratings";

  // 0 means any rating difference is allowed.
  private readonly ratingRange = 0;

  private matching = false;

  constructor(
    private readonly redis: Redis,
    private readonly createMatchFn:any
  ) {
    super();
  }

  /**
   * Atomically finds two eligible players and removes them
   * from the queue so they cannot be paired again.
   *
   * Queue scores represent their original joining timestamps.
   */
  private readonly reserveMatchScript = `
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

  addToQueue = async (
    userId: number,
    rating: number
  ): Promise<void> => {
    try {
      const joinedAt = Date.now();

      // Preserve the original joining time if already queued.
      const existingScore = await this.redis.zscore(
        this.queueKey,
        String(userId)
      );

      if (existingScore === null) {
        await this.redis
          .multi()
          .zadd(this.queueKey, joinedAt, String(userId))
          .hset(this.ratingsKey, String(userId), rating)
          .exec();
      } else {
        // Refresh the rating without resetting queue position.
        await this.redis.hset(this.ratingsKey, String(userId), rating);
      }

      console.log(`User ${userId} added to matchmaking queue with rating ${rating}.`);
      await setUserStatus(userId, "looking_for_game");
      serverSocket.emit("presence:status", { userId, status: "looking_for_game" });
      await this.checkMatches();
    } catch (error) {
      console.error("Error adding user to matchmaking queue:", error);
       await setUserStatus(userId, "idle");
       serverSocket.emit("presence:status", { userId, status: "idle" });
      throw error;
    }
  };

  removeFromQueue = async (userId: number): Promise<void> => {
    try {
      await this.redis
      .multi()
      .zrem(this.queueKey, String(userId))
      .hdel(this.ratingsKey, String(userId))
      .exec();
      await setUserStatus(userId, "idle");
      serverSocket.emit("presence:status", { userId, status: "idle" });
    } catch (error) {
      console.error("Error removing user from matchmaking queue:", error);
      throw error;
    }
  };

  private checkMatches = async (): Promise<void> => {
    if (this.matching) return;

    this.matching = true;

    try {
      while (true) {
        const result = (await this.redis.eval(
          this.reserveMatchScript,
          2,
          this.queueKey,
          this.ratingsKey,
          this.ratingRange
        )) as string[];

        console.log("Matchmaking result:", result);

        if (!result || result.length < 6) {
          break;
        }

        const [
          firstId,
          firstRating,
          firstScore,
          secondId,
          secondRating,
          secondScore,
        ] = result;

        const user1 = Number(firstId);
        const user2 = Number(secondId);

        try {
          // Use your existing game-creation and initialization flow here.
          const match = await this.createMatchFn(user1, user2);

          this.emit("matchFound", {
            ...match,
          });

          await saveGame(match.code, match);

          console.log(
            `Match created: Game ${match.code} for players ${user1}, ${user2}`
          );
        } catch (error) {
          console.error("Match creation failed:", error);

          // Put both players back in their original queue positions.
          await this.redis
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
    } catch (error) {
      console.error("Error checking for matches:", error);
    } finally {
      this.matching = false;
    }
  };
}

export default Matchmaker;