import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import notificationRoutes from './routes/notifications.js';
import { queueService } from './services/queue.js';
import { closeRateLimiter } from './middleware/rateLimiter.js';
import { closeIdempotencyStore } from './middleware/idempotency.js';
import { env } from './@config/env.js';



const app = express();
const PORT = env.PORT;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});
app.get('/health', (_req: Request, res: Response) => {
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      rabbitmq: queueService.isConnected() ? 'connected' : 'disconnected',
    },
  };
  
  res.json(status);
});


app.get('/ready', (_req: Request, res: Response) => {
  if (queueService.isConnected()) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false, reason: 'RabbitMQ not connected' });
  }
});

app.use('/api/notifications', notificationRoutes);

app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: 'The requested endpoint does not exist',
  });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

async function shutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  
  try {
    await queueService.close();
    
    await closeRateLimiter();
    await closeIdempotencyStore();
    
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

async function start(): Promise<void> {
  const MAX_RETRIES = 10;
  let delay = 2000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`Connecting to RabbitMQ (attempt ${attempt}/${MAX_RETRIES})...`);
      await queueService.connect();
      console.log('RabbitMQ connected!');
      break;
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error('Failed to connect to RabbitMQ after max retries:', error);
        process.exit(1);
      }
      console.warn(`RabbitMQ not ready, retrying in ${delay / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }

  app.listen(PORT, () => {
    console.log(`🚀 Ingestion Service running on port ${PORT}`);
    console.log(`📡 Health check: http://localhost:${PORT}/health`);
    console.log(`📬 API endpoint: http://localhost:${PORT}/api/notifications`);
  });
}

start();
