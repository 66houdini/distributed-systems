import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { RateLimitResult } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

// Initialize Redis client
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Inline the Lua rate limiting script (avoids path issues with ES modules and Docker)
const luaScript = `
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
`;

// Rate limit configuration
const RATE_LIMIT_QUOTA = parseInt(process.env.RATE_LIMIT_QUOTA || '50', 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || '3600', 10) * 1000;

// Define the script in Redis
let scriptSha: string | null = null;

async function ensureScriptLoaded(): Promise<string> {
  if (!scriptSha) {
    scriptSha = await redis.script('LOAD', luaScript) as string;
  }
  return scriptSha;
}

export interface RateLimitRequest extends Request {
  rateLimitResult?: RateLimitResult;
}

export async function rateLimiter(
  req: RateLimitRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.body?.userId;
    
    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'userId is required for rate limiting',
      });
      return;
    }

    // Determine notification type from URL path
    const pathParts = req.path.split('/');
    const notificationType = pathParts[pathParts.length - 1] || 'default';

    // Create rate limit key
    const rateLimitKey = `ratelimit:${userId}:${notificationType}`;
    
    // Current timestamp
    const now = Date.now();
    
    // Unique request ID for this rate limit entry
    const requestId = uuidv4();

    // Ensure script is loaded and execute
    const sha = await ensureScriptLoaded();
    
    const result = await redis.evalsha(
      sha,
      1,
      rateLimitKey,
      now.toString(),
      RATE_LIMIT_WINDOW_MS.toString(),
      RATE_LIMIT_QUOTA.toString(),
      requestId
    ) as [number, number, number];

    const [allowed, remaining, resetTime] = result;

    // Store result for potential use in route handlers
    req.rateLimitResult = {
      allowed: allowed === 1,
      remaining,
      resetTime,
    };

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_QUOTA);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));

    if (!req.rateLimitResult.allowed) {
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        message: `You have exceeded the rate limit of ${RATE_LIMIT_QUOTA} requests per hour`,
        retryAfter: Math.ceil((resetTime - now) / 1000),
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Rate limiter error:', error);
    // On error, allow the request but log the issue
    // This prevents the rate limiter from being a single point of failure
    next();
  }
}

// Graceful shutdown
export async function closeRateLimiter(): Promise<void> {
  await redis.quit();
}
