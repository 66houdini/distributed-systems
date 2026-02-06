import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import notificationRoutes from './routes/notifications.js';
import { queueService } from './services/queue.js';
import { closeRateLimiter } from './middleware/rateLimiter.js';
import { closeIdempotencyStore } from './middleware/idempotency.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
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

// Ready check endpoint (for Kubernetes/Docker health checks)
app.get('/ready', (_req: Request, res: Response) => {
  if (queueService.isConnected()) {
    res.status(200).json({ ready: true });
  } else {
    res.status(503).json({ ready: false, reason: 'RabbitMQ not connected' });
  }
});

// API routes
app.use('/api/notifications', notificationRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'Not found',
    message: 'The requested endpoint does not exist',
  });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// Graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  console.log(`\nReceived ${signal}. Starting graceful shutdown...`);
  
  try {
    // Close RabbitMQ connection
    await queueService.close();
    
    // Close Redis connections
    await closeRateLimiter();
    await closeIdempotencyStore();
    
    console.log('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Register shutdown handlers
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server
async function start(): Promise<void> {
  try {
    // Connect to RabbitMQ
    await queueService.connect();
    
    // Start Express server
    app.listen(PORT, () => {
      console.log(`🚀 Ingestion Service running on port ${PORT}`);
      console.log(`📡 Health check: http://localhost:${PORT}/health`);
      console.log(`📬 API endpoint: http://localhost:${PORT}/api/notifications`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
