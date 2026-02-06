--[[
  Sliding Window Rate Limiter using Redis Sorted Sets
  
  Arguments:
    KEYS[1] - The rate limit key (e.g., "ratelimit:user:123:email")
    ARGV[1] - Current timestamp in milliseconds
    ARGV[2] - Window size in milliseconds (e.g., 3600000 for 1 hour)
    ARGV[3] - Maximum requests allowed in window
    ARGV[4] - Unique request ID for this request
  
  Returns:
    [allowed (0 or 1), remaining, resetTime]
]]

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local requestId = ARGV[4]

-- Calculate the start of the current window
local windowStart = now - window

-- Remove all entries outside the current window
redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)

-- Count current requests in window
local currentCount = redis.call('ZCARD', key)

-- Calculate remaining quota
local remaining = limit - currentCount

-- Calculate reset time (when oldest entry expires)
local oldestEntry = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local resetTime = now + window
if #oldestEntry > 0 then
    resetTime = tonumber(oldestEntry[2]) + window
end

-- Check if request is allowed
if currentCount < limit then
    -- Add the new request with current timestamp as score
    redis.call('ZADD', key, now, requestId)
    -- Set expiry on the key to auto-cleanup
    redis.call('PEXPIRE', key, window)
    -- Return allowed, remaining (after this request), reset time
    return {1, remaining - 1, resetTime}
else
    -- Rate limit exceeded
    return {0, 0, resetTime}
end
