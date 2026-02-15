import dotenv from 'dotenv';
dotenv.config();
import { z } from 'zod';


const envSchema = z.object({
    REDIS_URL: z.string().url(),
    IDEMPOTENCY_TTL: z.coerce.number().default(24 * 60 * 60),
    RABBITMQ_URL: z.string().url(),
    PORT: z.number().default(3000),
    RATE_LIMIT_QUOTA: z.coerce.number().default(50),
    RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(3600),
    NODE_ENV: z.enum(['development', 'production']).default('development'),
})

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables. Check your .env configuration.');
}

export const env = {
  ...parsed.data,
  isDevelopment: parsed.data.NODE_ENV === 'development',
  isProduction: parsed.data.NODE_ENV === 'production',
};