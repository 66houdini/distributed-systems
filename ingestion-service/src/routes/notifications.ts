import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ZodError, ZodSchema } from 'zod';
import {
  EmailNotificationSchema,
  SmsNotificationSchema,
  PushNotificationSchema,
  NotificationType,
  QueueMessage,
  NotificationResponse,
  EmailPayload,
  SmsPayload,
  PushPayload,
} from '../types/index.js';
import { rateLimiter } from '../middleware/rateLimiter.js';
import { 
  idempotencyCheck, 
  storeIdempotencyResponse,
  IdempotencyRequest 
} from '../middleware/idempotency.js';
import { queueService } from '../services/queue.js';

const router = Router();

/**
 * Validate request body against a Zod schema
 */
function validateRequest<T>(schema: ZodSchema<T>, body: unknown): T {
  return schema.parse(body);
}

/**
 * Create and publish a notification message
 */
async function handleNotification(
  req: IdempotencyRequest,
  res: Response,
  type: NotificationType,
  schema: ZodSchema
): Promise<void> {
  try {
    const validatedData = validateRequest(schema, req.body);
    const { userId, idempotencyKey, payload } = validatedData as {
      userId: string;
      idempotencyKey: string;
      payload: EmailPayload | SmsPayload | PushPayload;
    };

    const messageId = uuidv4();

    const message: QueueMessage = {
      id: messageId,
      type,
      userId,
      idempotencyKey,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
    };

    const published = await queueService.publish(type, message);

    if (!published) {
      throw new Error('Failed to publish message to queue');
    }

    const response: NotificationResponse = {
      id: messageId,
      status: 'queued',
      message: `${type} notification queued successfully`,
    };

    await storeIdempotencyResponse(userId, idempotencyKey, response);

    res.status(202).json({
      success: true,
      message: response.message,
      data: response,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      });
      return;
    }

    console.error(`Error handling ${type} notification:`, error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * POST /api/notifications/email
 * Queue an email notification
 */
router.post(
  '/email',
  rateLimiter,
  idempotencyCheck,
  async (req: Request, res: Response) => {
    await handleNotification(
      req as IdempotencyRequest,
      res,
      NotificationType.EMAIL,
      EmailNotificationSchema
    );
  }
);

/**
 * POST /api/notifications/sms
 * Queue an SMS notification
 */
router.post(
  '/sms',
  rateLimiter,
  idempotencyCheck,
  async (req: Request, res: Response) => {
    await handleNotification(
      req as IdempotencyRequest,
      res,
      NotificationType.SMS,
      SmsNotificationSchema
    );
  }
);

/**
 * POST /api/notifications/push
 * Queue a push notification
 */
router.post(
  '/push',
  rateLimiter,
  idempotencyCheck,
  async (req: Request, res: Response) => {
    await handleNotification(
      req as IdempotencyRequest,
      res,
      NotificationType.PUSH,
      PushNotificationSchema
    );
  }
);

export default router;
