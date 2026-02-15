import { z } from 'zod';

export const BaseNotificationSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  idempotencyKey: z.string().min(1, 'idempotencyKey is required'),
});
export const EmailPayloadSchema = z.object({
  to: z.string().email('Invalid email address'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
});

export const SmsPayloadSchema = z.object({
  to: z.string().min(10, 'Phone number must be at least 10 digits'),
  message: z.string().min(1, 'Message is required').max(160, 'SMS message too long'),
});
export const PushPayloadSchema = z.object({
  deviceToken: z.string().min(1, 'Device token is required'),
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
  data: z.record(z.string()).optional(),
});

export const EmailNotificationSchema = BaseNotificationSchema.extend({
  payload: EmailPayloadSchema,
});

export const SmsNotificationSchema = BaseNotificationSchema.extend({
  payload: SmsPayloadSchema,
});

export const PushNotificationSchema = BaseNotificationSchema.extend({
  payload: PushPayloadSchema,
});

export type EmailPayload = z.infer<typeof EmailPayloadSchema>;
export type SmsPayload = z.infer<typeof SmsPayloadSchema>;
export type PushPayload = z.infer<typeof PushPayloadSchema>;

export type EmailNotificationRequest = z.infer<typeof EmailNotificationSchema>;
export type SmsNotificationRequest = z.infer<typeof SmsNotificationSchema>;
export type PushNotificationRequest = z.infer<typeof PushNotificationSchema>;

export type NotificationRequest = EmailNotificationRequest | SmsNotificationRequest | PushNotificationRequest;

export enum NotificationType {
  EMAIL = 'email',
  SMS = 'sms',
  PUSH = 'push',
}

export interface QueueMessage {
  id: string;
  type: NotificationType;
  userId: string;
  idempotencyKey: string;
  payload: EmailPayload | SmsPayload | PushPayload;
  timestamp: number;
  retryCount: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

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
