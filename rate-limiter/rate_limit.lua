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
local windowStart = now - window

redis.call('ZREMRANGEBYSCORE', key, '-inf', windowStart)
local currentCount = redis.call('ZCARD', key)

local remaining = limit - currentCount

local oldestEntry = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local resetTime = now + window
if #oldestEntry > 0 then
    resetTime = tonumber(oldestEntry[2]) + window
end

if currentCount < limit then
    redis.call('ZADD', key, now, requestId)
    redis.call('PEXPIRE', key, window)
    return {1, remaining - 1, resetTime}
else
    return {0, 0, resetTime}
end
