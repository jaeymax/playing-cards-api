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