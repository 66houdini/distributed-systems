import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { NotificationResponse } from '../types/index.js';

// Initialize Redis client
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Idempotency key TTL (24 hours in seconds)
const IDEMPOTENCY_TTL = 24 * 60 * 60;

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

    // Create a unique key combining user and idempotency key
    const redisKey = `idempotency:${userId}:${idempotencyKey}`;

    // Check if this idempotency key already exists
    const existingResponse = await redis.get(redisKey);

    if (existingResponse) {
      // Return cached response
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

    // Mark as not duplicate, will be stored after successful processing
    req.idempotencyResult = {
      isDuplicate: false,
    };

    next();
  } catch (error) {
    console.error('Idempotency check error:', error);
    // On error, allow the request but log the issue
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
    // Non-critical error, don't throw
  }
}

// Graceful shutdown
export async function closeIdempotencyStore(): Promise<void> {
  await redis.quit();
}
