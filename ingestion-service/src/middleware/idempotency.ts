import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { NotificationResponse } from '../types/index.js';
import { env } from '../@config/env.js';

const redis = new Redis(env.REDIS_URL);

const IDEMPOTENCY_TTL = env.IDEMPOTENCY_TTL;

export interface IdempotencyRequest extends Request {
  idempotencyResult?: {
    isDuplicate: boolean;
    cachedResponse?: NotificationResponse;
  };
}

export async function idempotencyCheck(
  req: IdempotencyRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const idempotencyKey = req.body?.idempotencyKey;
    const userId = req.body?.userId;

    if (!idempotencyKey) {
      res.status(400).json({
        success: false,
        error: 'idempotencyKey is required',
      });
      return;
    }

    const redisKey = `idempotency:${userId}:${idempotencyKey}`;

    const existingResponse = await redis.get(redisKey);

    if (existingResponse) {
      const cachedResponse: NotificationResponse = JSON.parse(existingResponse);
      
      req.idempotencyResult = {
        isDuplicate: true,
        cachedResponse,
      };

      res.status(200).json({
        success: true,
        message: 'Duplicate request detected, returning cached response',
        data: {
          ...cachedResponse,
          status: 'duplicate',
        },
      });
      return;
    }

    req.idempotencyResult = {
      isDuplicate: false,
    };

    next();
  } catch (error) {
    console.error('Idempotency check error:', error);
    next();
  }
}

/**
 * Store the response for an idempotency key
 * Should be called after successfully publishing to the queue
 */
export async function storeIdempotencyResponse(
  userId: string,
  idempotencyKey: string,
  response: NotificationResponse
): Promise<void> {
  const redisKey = `idempotency:${userId}:${idempotencyKey}`;
  
  try {
    await redis.setex(redisKey, IDEMPOTENCY_TTL, JSON.stringify(response));
  } catch (error) {
    console.error('Failed to store idempotency response:', error);
  }
}

export async function closeIdempotencyStore(): Promise<void> {
  await redis.quit();
}
