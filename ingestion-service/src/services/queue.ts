import amqp from 'amqplib';
import { QueueMessage, NotificationType } from '../types/index.js';

class QueueService {
  // Using 'any' to avoid amqplib type compatibility issues between versions
  private connection: any = null;
  private channel: any = null;
  private readonly url: string;
  private reconnecting = false;

  // Queue names
  static readonly QUEUES = {
    EMAIL: 'notifications.email',
    SMS: 'notifications.sms',
    PUSH: 'notifications.push',
    DLQ: 'notifications.dlq',
  };

  // Exchange name
  static readonly EXCHANGE = 'notifications.exchange';

  constructor() {
    this.url = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
  }

  async connect(): Promise<void> {
    try {
      console.log('Connecting to RabbitMQ...');
      this.connection = await amqp.connect(this.url);
      this.channel = await this.connection.createChannel();

      // Set up connection error handlers
      this.connection.on('error', (err: Error) => {
        console.error('RabbitMQ connection error:', err.message);
        this.handleDisconnect();
      });

      this.connection.on('close', () => {
        console.warn('RabbitMQ connection closed');
        this.handleDisconnect();
      });

      // Set up exchange and queues
      await this.setupExchangeAndQueues();
      console.log('Connected to RabbitMQ successfully');
    } catch (error) {
      console.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  private async setupExchangeAndQueues(): Promise<void> {
    if (!this.channel) throw new Error('Channel not initialized');

    // Create dead letter exchange
    await this.channel.assertExchange('notifications.dlx', 'direct', { durable: true });

    // Create dead letter queue
    await this.channel.assertQueue(QueueService.QUEUES.DLQ, { durable: true });
    await this.channel.bindQueue(QueueService.QUEUES.DLQ, 'notifications.dlx', 'dead');

    // Create main exchange
    await this.channel.assertExchange(QueueService.EXCHANGE, 'direct', { durable: true });

    // Queue options with dead letter configuration
    const queueOptions = {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': 'notifications.dlx',
        'x-dead-letter-routing-key': 'dead',
      },
    };

    // Create queues and bind to exchange
    await this.channel.assertQueue(QueueService.QUEUES.EMAIL, queueOptions);
    await this.channel.bindQueue(QueueService.QUEUES.EMAIL, QueueService.EXCHANGE, 'email');

    await this.channel.assertQueue(QueueService.QUEUES.SMS, queueOptions);
    await this.channel.bindQueue(QueueService.QUEUES.SMS, QueueService.EXCHANGE, 'sms');

    await this.channel.assertQueue(QueueService.QUEUES.PUSH, queueOptions);
    await this.channel.bindQueue(QueueService.QUEUES.PUSH, QueueService.EXCHANGE, 'push');
  }

  private handleDisconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;

    console.log('Attempting to reconnect to RabbitMQ...');
    
    // Exponential backoff for reconnection
    let delay = 1000;
    const maxDelay = 30000;

    const attemptReconnect = async (): Promise<void> => {
      while (this.reconnecting) {
        try {
          await new Promise((resolve) => setTimeout(resolve, delay));
          await this.connect();
          this.reconnecting = false;
          console.log('Reconnected to RabbitMQ successfully');
        } catch (error) {
          console.error(`Reconnection failed, retrying in ${delay}ms...`);
          delay = Math.min(delay * 2, maxDelay);
        }
      }
    };

    attemptReconnect();
  }

  async publish(type: NotificationType, message: QueueMessage): Promise<boolean> {
    if (!this.channel) {
      throw new Error('Channel not initialized. Call connect() first.');
    }

    const routingKey = type;
    const content = Buffer.from(JSON.stringify(message));

    try {
      const success = this.channel.publish(
        QueueService.EXCHANGE,
        routingKey,
        content,
        {
          persistent: true, // Message survives broker restart
          contentType: 'application/json',
          messageId: message.id,
          headers: {
            'x-retry-count': message.retryCount,
            'x-idempotency-key': message.idempotencyKey,
          },
        }
      );

      if (success) {
        console.log(`Published message ${message.id} to ${routingKey} queue`);
      }

      return success;
    } catch (error) {
      console.error('Failed to publish message:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      console.log('RabbitMQ connection closed');
    } catch (error) {
      console.error('Error closing RabbitMQ connection:', error);
    }
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }
}

// Singleton instance
export const queueService = new QueueService();
