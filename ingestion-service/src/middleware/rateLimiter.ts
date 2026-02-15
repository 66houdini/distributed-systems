import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { RateLimitResult } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../@config/env.js';

const redis = new Redis(env.REDIS_URL);

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

const RATE_LIMIT_QUOTA = env.RATE_LIMIT_QUOTA;
const RATE_LIMIT_WINDOW_MS = env.RATE_LIMIT_WINDOW_SECONDS * 1000;

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

    const pathParts = req.path.split('/');
    const notificationType = pathParts[pathParts.length - 1] || 'default';

    const rateLimitKey = `ratelimit:${userId}:${notificationType}`;
    
    const now = Date.now();
    
    const requestId = uuidv4();

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

    req.rateLimitResult = {
      allowed: allowed === 1,
      remaining,
      resetTime,
    };

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
    next();
  }
}

export async function closeRateLimiter(): Promise<void> {
  await redis.quit();
}
