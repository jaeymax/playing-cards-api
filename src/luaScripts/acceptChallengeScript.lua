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