"use strict";
// services/challengeService.ts
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
exports.ChallengeService = void 0;
const crypto_1 = require("crypto");
const CHALLENGE_TTL_MS = 30000;
const CHALLENGE_RETENTION_SECONDS = 300;
const GAME_CREATION_RESERVATION_MS = 120000;
const PRESENCE_STATUS_KEY = "presence:status";
const MATCHMAKING_QUEUE_KEY = "matchmaking:queue";
const challengeKey = (id) => `challenge:${id}`;
const pendingKey = (userId) => `challenge:pending:user:${userId}`;
const asUserId = (value) => {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
};
const asNumber = (value) => {
    if (value === undefined)
        return null;
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : null;
};
const isBusyStatus = (status) => status !== null &&
    status !== undefined &&
    status !== "" &&
    status !== "idle";
const safeAck = (ack, result) => {
    if (typeof ack === "function") {
        ack(result);
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
class ChallengeService {
    constructor(deps) {
        this.redis = deps.redis;
        this.emitToUser = deps.emitToUser;
        this.getPlayerProfile = deps.getPlayerProfile;
        this.createChallengeGame = deps.createChallengeGame;
    }
    getChallenge(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const record = yield this.redis.hgetall(challengeKey(id));
            if (!record.id)
                return null;
            return record;
        });
    }
    notifyBoth(challengerId, targetId, event, payload) {
        return __awaiter(this, void 0, void 0, function* () {
            yield Promise.allSettled([
                this.emitToUser(challengerId, event, payload),
                this.emitToUser(targetId, event, payload),
            ]);
        });
    }
    releaseChallenge(id_1, finalStatus_1) {
        return __awaiter(this, arguments, void 0, function* (id, finalStatus, resetLobbyStatuses = false) {
            var _a, _b;
            const challenge = yield this.getChallenge(id);
            if (!challenge)
                return { released: false };
            const result = (yield this.redis.eval(RELEASE_CHALLENGE_SCRIPT, 4, challengeKey(id), pendingKey(challenge.challengerId), pendingKey(challenge.targetId), PRESENCE_STATUS_KEY, id, finalStatus, resetLobbyStatuses ? "1" : "0"));
            if (Number(result[0]) !== 1) {
                return { released: false };
            }
            return {
                released: true,
                challengerId: (_a = asNumber(String(result[1]))) !== null && _a !== void 0 ? _a : undefined,
                targetId: (_b = asNumber(String(result[2]))) !== null && _b !== void 0 ? _b : undefined,
            };
        });
    }
    /**
     * Client event: challenge:send
     * Payload: { targetUserId }
     */
    sendChallenge(challengerId, targetUserId) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            if (challengerId === targetUserId) {
                return {
                    success: false,
                    error: "You cannot challenge yourself.",
                };
            }
            const targetProfile = yield this.getPlayerProfile(targetUserId);
            if (!targetProfile) {
                return {
                    success: false,
                    error: "That player could not be found.",
                };
            }
            const id = (0, crypto_1.randomUUID)();
            const now = Date.now();
            const result = (yield this.redis.eval(CREATE_CHALLENGE_SCRIPT, 5, challengeKey(id), pendingKey(challengerId), pendingKey(targetUserId), PRESENCE_STATUS_KEY, MATCHMAKING_QUEUE_KEY, String(challengerId), String(targetUserId), id, String(now), String(CHALLENGE_TTL_MS), String(CHALLENGE_RETENTION_SECONDS)));
            if (Number(result[0]) !== 1) {
                return {
                    success: false,
                    error: this.getErrorMessage(String(result[1])),
                };
            }
            const expiresAt = Number(result[1]);
            yield this.emitToUser(targetUserId, "challenge:received", {
                id,
                challengeId: id,
                challenger: targetProfile,
                expiresAt,
            });
            yield this.emitToUser(challengerId, "challenge:sent", {
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
            (_a = timer.unref) === null || _a === void 0 ? void 0 : _a.call(timer);
            return {
                success: true,
                challengeId: id,
            };
        });
    }
    /**
     * Client event: challenge:accept
     * Payload: { challengeId }
     */
    acceptChallenge(targetId, id) {
        return __awaiter(this, void 0, void 0, function* () {
            const challenge = yield this.getChallenge(id);
            if (!challenge) {
                return {
                    success: false,
                    error: "This challenge no longer exists.",
                };
            }
            const challengerId = asNumber(challenge.challengerId);
            const expectedTargetId = asNumber(challenge.targetId);
            if (challengerId === null ||
                expectedTargetId === null ||
                expectedTargetId !== targetId) {
                return {
                    success: false,
                    error: "You are not the target of this challenge.",
                };
            }
            const result = (yield this.redis.eval(ACCEPT_CHALLENGE_SCRIPT, 5, challengeKey(id), pendingKey(challenge.challengerId), pendingKey(challenge.targetId), PRESENCE_STATUS_KEY, MATCHMAKING_QUEUE_KEY, String(targetId), id, String(Date.now()), String(GAME_CREATION_RESERVATION_MS)));
            if (Number(result[0]) !== 1) {
                const code = String(result[1]);
                if (code === "challenge_expired") {
                    yield this.notifyBoth(challengerId, targetId, "challenge:cancelled", {
                        id,
                        challengeId: id,
                        challengerId,
                        targetUserId: targetId,
                        reason: "expired",
                        message: "The challenge has expired.",
                    });
                }
                else if (code === "player_busy" ||
                    code === "player_in_matchmaking" ||
                    code === "challenge_reservation_lost") {
                    yield this.cancelChallenge(id, "target_busy");
                }
                return {
                    success: false,
                    error: this.getErrorMessage(code),
                };
            }
            try {
                // Replace this injected callback with your existing game creation flow.
                // The callback should persist the game and its cards before returning.
                const gameCode = yield this.createChallengeGame(challengerId, targetId);
                yield this.redis.hset(challengeKey(id), "status", "completed");
                yield this.redis.expire(challengeKey(id), CHALLENGE_RETENTION_SECONDS);
                // Clear challenge-only reservations. Keep in_lobby status because
                // your existing game lifecycle should transition it as appropriate.
                yield Promise.all([
                    this.redis.del(pendingKey(challengerId)),
                    this.redis.del(pendingKey(targetId)),
                ]);
                const matchPayload = {
                    gameCode,
                    challengeId: id,
                };
                yield this.notifyBoth(challengerId, targetId, "challenge:accepted", matchPayload);
                return {
                    success: true,
                    challengeId: id,
                    gameCode,
                };
            }
            catch (error) {
                console.error("Failed to create game from challenge:", error);
                yield this.releaseChallenge(id, "cancelled", true);
                yield this.notifyBoth(challengerId, targetId, "challenge:cancelled", {
                    id,
                    challengeId: id,
                    challengerId,
                    targetUserId: targetId,
                    reason: "game_creation_failed",
                    message: "The game could not be created. Please try again.",
                });
                return {
                    success: false,
                    error: "Could not create the game. Please try again.",
                };
            }
        });
    }
    /**
     * Client event: challenge:decline
     * Payload: { challengeId }
     */
    declineChallenge(targetId, id) {
        return __awaiter(this, void 0, void 0, function* () {
            const challenge = yield this.getChallenge(id);
            if (!challenge) {
                return {
                    success: false,
                    error: "This challenge no longer exists.",
                };
            }
            const challengerId = asNumber(challenge.challengerId);
            if (!challengerId ||
                asNumber(challenge.targetId) !== targetId) {
                return {
                    success: false,
                    error: "You are not the target of this challenge.",
                };
            }
            const result = yield this.releaseChallenge(id, "declined");
            if (!result.released) {
                return {
                    success: false,
                    error: "This challenge has already ended.",
                };
            }
            yield this.notifyBoth(challengerId, targetId, "challenge:declined", {
                id,
                challengeId: id,
                challengerId,
                targetUserId: targetId,
                message: "Your challenge was declined.",
            });
            return { success: true, challengeId: id };
        });
    }
    /**
     * Called by a worker or by the best-effort timeout.
     */
    expireChallenge(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const challenge = yield this.getChallenge(id);
            if (!challenge || challenge.status !== "pending")
                return;
            const expiresAt = Number(challenge.expiresAt);
            if (Date.now() < expiresAt)
                return;
            const challengerId = asNumber(challenge.challengerId);
            const targetId = asNumber(challenge.targetId);
            const result = yield this.releaseChallenge(id, "expired");
            if (!result.released ||
                challengerId === null ||
                targetId === null) {
                return;
            }
            yield this.notifyBoth(challengerId, targetId, "challenge:cancelled", {
                id,
                challengeId: id,
                challengerId,
                targetUserId: targetId,
                reason: "expired",
                message: "The challenge has expired.",
            });
        });
    }
    /**
     * Cancel a challenge because a participant became busy.
     */
    cancelChallenge(id_1) {
        return __awaiter(this, arguments, void 0, function* (id, reason = "cancelled") {
            const challenge = yield this.getChallenge(id);
            if (!challenge || challenge.status !== "pending")
                return;
            const challengerId = asNumber(challenge.challengerId);
            const targetId = asNumber(challenge.targetId);
            if (challengerId === null || targetId === null)
                return;
            const result = yield this.releaseChallenge(id, "cancelled");
            if (!result.released)
                return;
            yield this.notifyBoth(challengerId, targetId, "challenge:cancelled", {
                id,
                challengeId: id,
                challengerId,
                targetUserId: targetId,
                reason,
                message: reason === "target_busy"
                    ? "The player is no longer available."
                    : "The challenge was cancelled.",
            });
        });
    }
    /**
     * Call this whenever a user's status changes to a busy state.
     *
     * Invoke it from your presence/status service, not just the UI.
     */
    cancelPendingChallengeForUser(userId, newStatus) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!isBusyStatus(newStatus))
                return;
            const id = yield this.redis.get(pendingKey(userId));
            if (!id)
                return;
            const challenge = yield this.getChallenge(id);
            if (!challenge || challenge.status !== "pending")
                return;
            const reason = String(challenge.targetId) === String(userId)
                ? "target_busy"
                : "participant_busy";
            yield this.cancelChallenge(id, reason);
        });
    }
    getErrorMessage(code) {
        const messages = {
            cannot_challenge_self: "You cannot challenge yourself.",
            challenger_has_pending_challenge: "You already have a pending challenge.",
            target_has_pending_challenge: "That player already has a pending challenge.",
            challenger_in_matchmaking: "Leave matchmaking before challenging a player.",
            target_in_matchmaking: "That player is searching for a game.",
            challenger_busy: "You are currently busy.",
            target_busy: "That player is no longer available.",
            challenge_not_found: "This challenge no longer exists.",
            challenge_not_pending: "This challenge is no longer pending.",
            not_challenge_target: "You cannot accept this challenge.",
            challenge_expired: "This challenge has expired.",
            challenge_reservation_lost: "This challenge is no longer available.",
            player_in_matchmaking: "A player has already entered matchmaking.",
            player_busy: "A player is no longer available.",
        };
        return messages[code] || "The challenge could not be completed.";
    }
    /**
     * Register the challenge events for an authenticated socket.
     */
    registerSocketHandlers(socket) {
        socket.on("challenge:send", (payload, ack) => __awaiter(this, void 0, void 0, function* () {
            const challengerId = asUserId(socket.data.userId);
            const targetUserId = asUserId(payload === null || payload === void 0 ? void 0 : payload.targetUserId);
            if (!challengerId || !targetUserId) {
                safeAck(ack, {
                    success: false,
                    error: "Invalid user or target ID.",
                });
                return;
            }
            try {
                const result = yield this.sendChallenge(challengerId, targetUserId);
                safeAck(ack, result);
            }
            catch (error) {
                console.error("challenge:send failed:", error);
                safeAck(ack, {
                    success: false,
                    error: "Unable to send challenge.",
                });
            }
        }));
        socket.on("challenge:accept", (payload, ack) => __awaiter(this, void 0, void 0, function* () {
            const targetId = asUserId(socket.data.userId);
            const id = payload === null || payload === void 0 ? void 0 : payload.challengeId;
            if (!targetId || !id) {
                safeAck(ack, {
                    success: false,
                    error: "Invalid challenge request.",
                });
                return;
            }
            try {
                const result = yield this.acceptChallenge(targetId, id);
                safeAck(ack, result);
            }
            catch (error) {
                console.error("challenge:accept failed:", error);
                safeAck(ack, {
                    success: false,
                    error: "Unable to accept challenge.",
                });
            }
        }));
        socket.on("challenge:decline", (payload, ack) => __awaiter(this, void 0, void 0, function* () {
            const targetId = asUserId(socket.data.userId);
            const id = payload === null || payload === void 0 ? void 0 : payload.challengeId;
            if (!targetId || !id) {
                safeAck(ack, {
                    success: false,
                    error: "Invalid challenge request.",
                });
                return;
            }
            try {
                const result = yield this.declineChallenge(targetId, id);
                safeAck(ack, result);
            }
            catch (error) {
                console.error("challenge:decline failed:", error);
                safeAck(ack, {
                    success: false,
                    error: "Unable to decline challenge.",
                });
            }
        }));
    }
}
exports.ChallengeService = ChallengeService;
