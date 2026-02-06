import { z } from 'zod';

// Base notification request schema
export const BaseNotificationSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  idempotencyKey: z.string().min(1, 'idempotencyKey is required'),
});

// Email payload schema
export const EmailPayloadSchema = z.object({
  to: z.string().email('Invalid email address'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
});

// SMS payload schema
export const SmsPayloadSchema = z.object({
  to: z.string().min(10, 'Phone number must be at least 10 digits'),
  message: z.string().min(1, 'Message is required').max(160, 'SMS message too long'),
});

// Push notification payload schema
export const PushPayloadSchema = z.object({
  deviceToken: z.string().min(1, 'Device token is required'),
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
  data: z.record(z.string()).optional(),
});

// Combined schemas for each notification type
export const EmailNotificationSchema = BaseNotificationSchema.extend({
  payload: EmailPayloadSchema,
});

export const SmsNotificationSchema = BaseNotificationSchema.extend({
  payload: SmsPayloadSchema,
});

export const PushNotificationSchema = BaseNotificationSchema.extend({
  payload: PushPayloadSchema,
});

// TypeScript types inferred from schemas
export type EmailPayload = z.infer<typeof EmailPayloadSchema>;
export type SmsPayload = z.infer<typeof SmsPayloadSchema>;
export type PushPayload = z.infer<typeof PushPayloadSchema>;

export type EmailNotificationRequest = z.infer<typeof EmailNotificationSchema>;
export type SmsNotificationRequest = z.infer<typeof SmsNotificationSchema>;
export type PushNotificationRequest = z.infer<typeof PushNotificationSchema>;

// Union type for all notification requests
export type NotificationRequest = EmailNotificationRequest | SmsNotificationRequest | PushNotificationRequest;

// Notification types enum
export enum NotificationType {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
}

// Queue message structure
export interface QueueMessage {
  id: string;
  type: NotificationType;
  userId: string;
  idempotencyKey: string;
  payload: EmailPayload | SmsPayload | PushPayload;
  timestamp: number;
  retryCount: number;
}

// Rate limit response
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

// API response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface NotificationResponse {
  id: string;
  status: 'queued' | 'duplicate';
  message: string;
}
