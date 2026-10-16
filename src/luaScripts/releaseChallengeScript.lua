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