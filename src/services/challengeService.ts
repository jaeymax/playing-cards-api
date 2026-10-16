// services/challengeService.ts

import type { Redis } from "ioredis";
import type { Server, Socket } from "socket.io";
import { randomUUID } from "crypto";

export type ChallengeStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired"
  | "completed";

type UserId = number;

export type ChallengerProfile = {
  id: number | string;
  username: string;
  image_url?: string | null;
  rating?: number;
  rank?: string;
  rank_color?: string;
};

type ChallengeRecord = {
  id: string;
  challengerId: string;
  targetId: string;
  status: ChallengeStatus;
  createdAt: string;
  expiresAt: string;
};

type ChallengeAck = {
  success: boolean;
  challengeId?: string;
  gameCode?: string;
  error?: string;
};

type ChallengeDependencies = {
  redis: Redis;
  //io: Server;

  // Reuse your existing helper that emits to every socket belonging to a user.
  emitToUser: (
    userId: number,
    event: string,
    payload: unknown,
  ) => Promise<void>;

  // Return the profile information needed by IncomingChallengeModal.
  getPlayerProfile: (
    userId: number,
  ) => Promise<ChallengerProfile | null>;

  // Connect this to your existing game initialization flow.
  // It must create the game and persist it before returning the game code.
  createChallengeGame: (
    challengerId: number,
    targetId: number,
  ) => Promise<any>;
};

const CHALLENGE_TTL_MS = 30_000;
const CHALLENGE_RETENTION_SECONDS = 300;
const GAME_CREATION_RESERVATION_MS = 120_000;

const PRESENCE_STATUS_KEY = "presence:status";
const MATCHMAKING_QUEUE_KEY = "matchmaking:queue";

const challengeKey = (id: string) => `challenge:${id}`;

const pendingKey = (userId: number | string) =>
  `challenge:pending:user:${userId}`;

const asUserId = (value: unknown): number | null => {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

const asNumber = (value: string | undefined): number | null => {
  if (value === undefined) return null;

  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

const isBusyStatus = (status: string | null | undefined) =>
  status !== null &&
  status !== undefined &&
  status !== "" &&
  status !== "idle";

const safeAck = (
  ack: unknown,
  result: ChallengeAck,
) => {
  if (typeof ack === "function") {
    (ack as (result: ChallengeAck) => void)(result);
  }
};

/**
 * Atomically create a challenge and reserve both users against other
 * challenges and matchmaking.
 *
 * Note: the matchmaking join handler must also check the pending keys
 * atomically before adding a player to its queue.
 */
const CREATE_CHALLENGE_SCRIPT = `
local challengeKey = KEYS[1]
local challengerPendingKey = KEYS[2]
local targetPendingKey = KEYS[3]
local statusKey = KEYS[4]
local queueKey = KEYS[5]

local challengerId = ARGV[1]
local targetId = ARGV[2]
local challengeId = ARGV[3]
local now = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])
local retention = tonumber(ARGV[6])

if challengerId == targetId then
  return {0, "cannot_challenge_self"}
end

if redis.call("EXISTS", challengerPendingKey) == 1 then
  return {0, "challenger_has_pending_challenge"}
end

if redis.call("EXISTS", targetPendingKey) == 1 then
  return {0, "target_has_pending_challenge"}
end

if redis.call("ZSCORE", queueKey, challengerId) then
  return {0, "challenger_in_matchmaking"}
end

if redis.call("ZSCORE", queueKey, targetId) then
  return {0, "target_in_matchmaking"}
end

local challengerStatus = redis.call("HGET", statusKey, challengerId)
local targetStatus = redis.call("HGET", statusKey, targetId)

if challengerStatus and challengerStatus ~= "" and challengerStatus ~= "idle" then
  return {0, "challenger_busy"}
end

if targetStatus and targetStatus ~= "" and targetStatus ~= "idle" then
  return {0, "target_busy"}
end

redis.call(
  "HSET",
  challengeKey,
  "id", challengeId,
  "challengerId", challengerId,
  "targetId", targetId,
  "status", "pending",
  "createdAt", tostring(now),
  "expiresAt", tostring(now + ttl)
)

redis.call("EXPIRE", challengeKey, retention)

redis.call("SET", challengerPendingKey, challengeId, "PX", ttl)
redis.call("SET", targetPendingKey, challengeId, "PX", ttl)

return {1, tostring(now + ttl)}
`;

/**
 * Atomically accept a pending challenge.
 *
 * Both users are moved to in_lobby before game creation starts.
 */
const ACCEPT_CHALLENGE_SCRIPT = `
local challengeKey = KEYS[1]
local challengerPendingKey = KEYS[2]
local targetPendingKey = KEYS[3]
local statusKey = KEYS[4]
local queueKey = KEYS[5]

local actorId = ARGV[1]
local challengeId = ARGV[2]
local now = tonumber(ARGV[3])
local reservationTtl = tonumber(ARGV[4])

if redis.call("EXISTS", challengeKey) == 0 then
  return {0, "challenge_not_found"}
end

local status = redis.call("HGET", challengeKey, "status")
local challengerId = redis.call("HGET", challengeKey, "challengerId")
local targetId = redis.call("HGET", challengeKey, "targetId")
local expiresAt = tonumber(redis.call("HGET", challengeKey, "expiresAt") or "0")

if status ~= "pending" then
  return {0, "challenge_not_pending"}
end

if actorId ~= targetId then
  return {0, "not_challenge_target"}
end

if now >= expiresAt then
  redis.call("HSET", challengeKey, "status", "expired")
  redis.call("DEL", challengerPendingKey, targetPendingKey)
  return {0, "challenge_expired"}
end

if redis.call("GET", challengerPendingKey) ~= challengeId
  or redis.call("GET", targetPendingKey) ~= challengeId then
  redis.call("HSET", challengeKey, "status", "cancelled")
  redis.call("DEL", challengerPendingKey, targetPendingKey)
  return {0, "challenge_reservation_lost"}
end

if redis.call("ZSCORE", queueKey, challengerId)
  or redis.call("ZSCORE", queueKey, targetId) then
  redis.call("HSET", challengeKey, "status", "cancelled")
  redis.call("DEL", challengerPendingKey, targetPendingKey)
  return {0, "player_in_matchmaking"}
end

local challengerStatus = redis.call("HGET", statusKey, challengerId)
local targetStatus = redis.call("HGET", statusKey, targetId)

if (challengerStatus and challengerStatus ~= "" and challengerStatus ~= "idle")
  or (targetStatus and targetStatus ~= "" and targetStatus ~= "idle") then
  redis.call("HSET", challengeKey, "status", "cancelled")
  redis.call("DEL", challengerPendingKey, targetPendingKey)
  return {0, "player_busy"}
end

redis.call("HSET", challengeKey, "status", "accepted")
redis.call("HSET", statusKey, challengerId, "in_lobby")
redis.call("HSET", statusKey, targetId, "in_lobby")

redis.call("PEXPIRE", challengerPendingKey, reservationTtl)
redis.call("PEXPIRE", targetPendingKey, reservationTtl)

return {1, challengerId, targetId}
`;

/**
 * Release reservations only if they still belong to this challenge.
 */
const RELEASE_CHALLENGE_SCRIPT = `
local challengeKey = KEYS[1]
local challengerPendingKey = KEYS[2]
local targetPendingKey = KEYS[3]
local statusKey = KEYS[4]

local challengeId = ARGV[1]
local finalStatus = ARGV[2]
local resetLobbyStatuses = ARGV[3]

if redis.call("EXISTS", challengeKey) == 0 then
  return {0, "challenge_not_found"}
end

local currentStatus = redis.call("HGET", challengeKey, "status")
local challengerId = redis.call("HGET", challengeKey, "challengerId")
local targetId = redis.call("HGET", challengeKey, "targetId")

if currentStatus ~= "pending" and currentStatus ~= "accepted" then
  return {0, "challenge_already_finished"}
end

redis.call("HSET", challengeKey, "status", finalStatus)

if redis.call("GET", challengerPendingKey) == challengeId then
  redis.call("DEL", challengerPendingKey)
end

if redis.call("GET", targetPendingKey) == challengeId then
  redis.call("DEL", targetPendingKey)
end

if resetLobbyStatuses == "1" then
  if redis.call("HGET", statusKey, challengerId) == "in_lobby" then
    redis.call("HSET", statusKey, challengerId, "idle")
  end

  if redis.call("HGET", statusKey, targetId) == "in_lobby" then
    redis.call("HSET", statusKey, targetId, "idle")
  end
end

return {1, challengerId, targetId}
`;

export class ChallengeService {
  private redis: Redis;
  private emitToUser: ChallengeDependencies["emitToUser"];
  private getPlayerProfile: ChallengeDependencies["getPlayerProfile"];
  private createChallengeGame: ChallengeDependencies["createChallengeGame"];

  constructor(deps: ChallengeDependencies) {
    this.redis = deps.redis;
    this.emitToUser = deps.emitToUser;
    this.getPlayerProfile = deps.getPlayerProfile;
    this.createChallengeGame = deps.createChallengeGame;
  }

  private async getChallenge(
    id: string,
  ): Promise<ChallengeRecord | null> {
    const record = await this.redis.hgetall(challengeKey(id));

    if (!record.id) return null;

    return record as ChallengeRecord;
  }

  private async notifyBoth(
    challengerId: number,
    targetId: number,
    event: string,
    payload: Record<string, unknown>,
  ) {
    await Promise.allSettled([
      this.emitToUser(challengerId, event, payload),
      this.emitToUser(targetId, event, payload),
    ]);
  }

  private async releaseChallenge(
    id: string,
    finalStatus: "declined" | "cancelled" | "expired" | "completed",
    resetLobbyStatuses = false,
  ): Promise<{
    released: boolean;
    challengerId?: number;
    targetId?: number;
  }> {
    const challenge = await this.getChallenge(id);

    if (!challenge) return { released: false };

    const result = (await this.redis.eval(
      RELEASE_CHALLENGE_SCRIPT,
      4,
      challengeKey(id),
      pendingKey(challenge.challengerId),
      pendingKey(challenge.targetId),
      PRESENCE_STATUS_KEY,
      id,
      finalStatus,
      resetLobbyStatuses ? "1" : "0",
    )) as Array<string | number>;

    if (Number(result[0]) !== 1) {
      return { released: false };
    }

    return {
      released: true,
      challengerId: asNumber(String(result[1])) ?? undefined,
      targetId: asNumber(String(result[2])) ?? undefined,
    };
  }

  /**
   * Client event: challenge:send
   * Payload: { targetUserId }
   */
  async sendChallenge(
    challengerId: number,
    targetUserId: number,
  ): Promise<ChallengeAck> {
    if (challengerId === targetUserId) {
      return {
        success: false,
        error: "You cannot challenge yourself.",
      };
    }

    const targetProfile = await this.getPlayerProfile(targetUserId);

    if (!targetProfile) {
      return {
        success: false,
        error: "That player could not be found.",
      };
    }

    const id = randomUUID();
    const now = Date.now();

    const result = (await this.redis.eval(
      CREATE_CHALLENGE_SCRIPT,
      5,
      challengeKey(id),
      pendingKey(challengerId),
      pendingKey(targetUserId),
      PRESENCE_STATUS_KEY,
      MATCHMAKING_QUEUE_KEY,
      String(challengerId),
      String(targetUserId),
      id,
      String(now),
      String(CHALLENGE_TTL_MS),
      String(CHALLENGE_RETENTION_SECONDS),
    )) as Array<string | number>;

    if (Number(result[0]) !== 1) {
      return {
        success: false,
        error: this.getErrorMessage(String(result[1])),
      };
    }

    const expiresAt = Number(result[1]);

    await this.emitToUser(targetUserId, "challenge:received", {
      id,
      challengeId: id,
      challenger: targetProfile,
      expiresAt,
    });

    await this.emitToUser(challengerId, "challenge:sent", {
      id,
      challengeId: id,
      targetUserId,
      expiresAt,
    });

    // This timeout is a best-effort notification mechanism.
    // expireChallenge() should also be called by a durable worker
    // (for example, a BullMQ delayed job) in production.
    const timer = setTimeout(() => {
      void this.expireChallenge(id);
    }, CHALLENGE_TTL_MS + 100);

    timer.unref?.();

    return {
      success: true,
      challengeId: id,
    };
  }

  /**
   * Client event: challenge:accept
   * Payload: { challengeId }
   */
  async acceptChallenge(
    targetId: number,
    id: string,
  ): Promise<ChallengeAck> {
    const challenge = await this.getChallenge(id);

    if (!challenge) {
      return {
        success: false,
        error: "This challenge no longer exists.",
      };
    }

    const challengerId = asNumber(challenge.challengerId);
    const expectedTargetId = asNumber(challenge.targetId);

    if (
      challengerId === null ||
      expectedTargetId === null ||
      expectedTargetId !== targetId
    ) {
      return {
        success: false,
        error: "You are not the target of this challenge.",
      };
    }

    const result = (await this.redis.eval(
      ACCEPT_CHALLENGE_SCRIPT,
      5,
      challengeKey(id),
      pendingKey(challenge.challengerId),
      pendingKey(challenge.targetId),
      PRESENCE_STATUS_KEY,
      MATCHMAKING_QUEUE_KEY,
      String(targetId),
      id,
      String(Date.now()),
      String(GAME_CREATION_RESERVATION_MS),
    )) as Array<string | number>;

    if (Number(result[0]) !== 1) {
      const code = String(result[1]);

      if (code === "challenge_expired") {
        await this.notifyBoth(
          challengerId,
          targetId,
          "challenge:cancelled",
          {
            id,
            challengeId: id,
            challengerId,
            targetUserId: targetId,
            reason: "expired",
            message: "The challenge has expired.",
          },
        );
      } else if (
        code === "player_busy" ||
        code === "player_in_matchmaking" ||
        code === "challenge_reservation_lost"
      ) {
        await this.cancelChallenge(id, "target_busy");
      }

      return {
        success: false,
        error: this.getErrorMessage(code),
      };
    }

    try {
      // Replace this injected callback with your existing game creation flow.
      // The callback should persist the game and its cards before returning.
      const gameCode = await this.createChallengeGame(challengerId, targetId);

      await this.redis.hset(challengeKey(id), "status", "completed");

      await this.redis.expire(
        challengeKey(id),
        CHALLENGE_RETENTION_SECONDS,
      );

      // Clear challenge-only reservations. Keep in_lobby status because
      // your existing game lifecycle should transition it as appropriate.
      await Promise.all([
        this.redis.del(pendingKey(challengerId)),
        this.redis.del(pendingKey(targetId)),
      ]);

      const matchPayload = {
        gameCode,
        challengeId: id,
      };

      await this.notifyBoth(
        challengerId,
        targetId,
        "challenge:accepted",
        matchPayload,
      );

      return {
        success: true,
        challengeId: id,
        gameCode,
      };
    } catch (error) {
      console.error("Failed to create game from challenge:", error);

      await this.releaseChallenge(id, "cancelled", true);

      await this.notifyBoth(
        challengerId,
        targetId,
        "challenge:cancelled",
        {
          id,
          challengeId: id,
          challengerId,
          targetUserId: targetId,
          reason: "game_creation_failed",
          message: "The game could not be created. Please try again.",
        },
      );

      return {
        success: false,
        error: "Could not create the game. Please try again.",
      };
    }
  }

  /**
   * Client event: challenge:decline
   * Payload: { challengeId }
   */
  async declineChallenge(
    targetId: number,
    id: string,
  ): Promise<ChallengeAck> {
    const challenge = await this.getChallenge(id);

    if (!challenge) {
      return {
        success: false,
        error: "This challenge no longer exists.",
      };
    }

    const challengerId = asNumber(challenge.challengerId);

    if (
      !challengerId ||
      asNumber(challenge.targetId) !== targetId
    ) {
      return {
        success: false,
        error: "You are not the target of this challenge.",
      };
    }

    const result = await this.releaseChallenge(id, "declined");

    if (!result.released) {
      return {
        success: false,
        error: "This challenge has already ended.",
      };
    }

    await this.notifyBoth(
      challengerId,
      targetId,
      "challenge:declined",
      {
        id,
        challengeId: id,
        challengerId,
        targetUserId: targetId,
        message: "Your challenge was declined.",
      },
    );

    return { success: true, challengeId: id };
  }

  /**
   * Called by a worker or by the best-effort timeout.
   */
  async expireChallenge(id: string): Promise<void> {
    const challenge = await this.getChallenge(id);

    if (!challenge || challenge.status !== "pending") return;

    const expiresAt = Number(challenge.expiresAt);

    if (Date.now() < expiresAt) return;

    const challengerId = asNumber(challenge.challengerId);
    const targetId = asNumber(challenge.targetId);

    const result = await this.releaseChallenge(id, "expired");

    if (
      !result.released ||
      challengerId === null ||
      targetId === null
    ) {
      return;
    }

    await this.notifyBoth(
      challengerId,
      targetId,
      "challenge:cancelled",
      {
        id,
        challengeId: id,
        challengerId,
        targetUserId: targetId,
        reason: "expired",
        message: "The challenge has expired.",
      },
    );
  }

  /**
   * Cancel a challenge because a participant became busy.
   */
  async cancelChallenge(
    id: string,
    reason = "cancelled",
  ): Promise<void> {
    const challenge = await this.getChallenge(id);

    if (!challenge || challenge.status !== "pending") return;

    const challengerId = asNumber(challenge.challengerId);
    const targetId = asNumber(challenge.targetId);

    if (challengerId === null || targetId === null) return;

    const result = await this.releaseChallenge(id, "cancelled");

    if (!result.released) return;

    await this.notifyBoth(
      challengerId,
      targetId,
      "challenge:cancelled",
      {
        id,
        challengeId: id,
        challengerId,
        targetUserId: targetId,
        reason,
        message:
          reason === "target_busy"
            ? "The player is no longer available."
            : "The challenge was cancelled.",
      },
    );
  }

  /**
   * Call this whenever a user's status changes to a busy state.
   *
   * Invoke it from your presence/status service, not just the UI.
   */
  async cancelPendingChallengeForUser(
    userId: number,
    newStatus: string,
  ): Promise<void> {
    if (!isBusyStatus(newStatus)) return;

    const id = await this.redis.get(pendingKey(userId));

    if (!id) return;

    const challenge = await this.getChallenge(id);

    if (!challenge || challenge.status !== "pending") return;

    const reason =
      String(challenge.targetId) === String(userId)
        ? "target_busy"
        : "participant_busy";

    await this.cancelChallenge(id, reason);
  }

  private getErrorMessage(code: string): string {
    const messages: Record<string, string> = {
      cannot_challenge_self: "You cannot challenge yourself.",
      challenger_has_pending_challenge:
        "You already have a pending challenge.",
      target_has_pending_challenge:
        "That player already has a pending challenge.",
      challenger_in_matchmaking:
        "Leave matchmaking before challenging a player.",
      target_in_matchmaking:
        "That player is searching for a game.",
      challenger_busy: "You are currently busy.",
      target_busy: "That player is no longer available.",
      challenge_not_found: "This challenge no longer exists.",
      challenge_not_pending: "This challenge is no longer pending.",
      not_challenge_target: "You cannot accept this challenge.",
      challenge_expired: "This challenge has expired.",
      challenge_reservation_lost:
        "This challenge is no longer available.",
      player_in_matchmaking:
        "A player has already entered matchmaking.",
      player_busy: "A player is no longer available.",
    };

    return messages[code] || "The challenge could not be completed.";
  }

  /**
   * Register the challenge events for an authenticated socket.
   */
  registerSocketHandlers(socket: Socket): void {
    socket.on(
      "challenge:send",
      async (
        payload: { targetUserId?: number | string },
        ack?: (result: ChallengeAck) => void,
      ) => {
        const challengerId = asUserId(socket.data.userId);
        const targetUserId = asUserId(payload?.targetUserId);

        if (!challengerId || !targetUserId) {
          safeAck(ack, {
            success: false,
            error: "Invalid user or target ID.",
          });
          return;
        }

        try {
          const result = await this.sendChallenge(
            challengerId,
            targetUserId,
          );

          safeAck(ack, result);
        } catch (error) {
          console.error("challenge:send failed:", error);

          safeAck(ack, {
            success: false,
            error: "Unable to send challenge.",
          });
        }
      },
    );

    socket.on(
      "challenge:accept",
      async (
        payload: { challengeId?: string },
        ack?: (result: ChallengeAck) => void,
      ) => {
        const targetId = asUserId(socket.data.userId);
        const id = payload?.challengeId;

        if (!targetId || !id) {
          safeAck(ack, {
            success: false,
            error: "Invalid challenge request.",
          });
          return;
        }

        try {
          const result = await this.acceptChallenge(targetId, id);
          safeAck(ack, result);
        } catch (error) {
          console.error("challenge:accept failed:", error);

          safeAck(ack, {
            success: false,
            error: "Unable to accept challenge.",
          });
        }
      },
    );

    socket.on(
      "challenge:decline",
      async (
        payload: { challengeId?: string },
        ack?: (result: ChallengeAck) => void,
      ) => {
        const targetId = asUserId(socket.data.userId);
        const id = payload?.challengeId;

        if (!targetId || !id) {
          safeAck(ack, {
            success: false,
            error: "Invalid challenge request.",
          });
          return;
        }

        try {
          const result = await this.declineChallenge(targetId, id);
          safeAck(ack, result);
        } catch (error) {
          console.error("challenge:decline failed:", error);

          safeAck(ack, {
            success: false,
            error: "Unable to decline challenge.",
          });
        }
      },
    );
  }
}