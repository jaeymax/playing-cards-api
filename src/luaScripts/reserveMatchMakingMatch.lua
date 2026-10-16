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