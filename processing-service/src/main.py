"""
Processing Service - Main entry point
Consumes notification messages from RabbitMQ and sends them
"""
import os
import sys
import signal
import pika
from dotenv import load_dotenv

from consumer import start_consuming

# Load environment variables
load_dotenv()

# RabbitMQ connection settings
RABBITMQ_URL = os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672')

# Queues to consume from
QUEUES = [
    'notifications.email',
    'notifications.sms',
    'notifications.push',
]


def create_connection():
    """Create and return a RabbitMQ connection."""
    parameters = pika.URLParameters(RABBITMQ_URL)
    parameters.heartbeat = 600
    parameters.blocked_connection_timeout = 300
    
    return pika.BlockingConnection(parameters)


def main():
    """Main entry point for the processing service."""
    print("=" * 60)
    print("🔔 Notification Processing Service")
    print("=" * 60)
    print(f"Connecting to RabbitMQ: {RABBITMQ_URL.replace(':guest@', ':***@')}")
    
    connection = None
    channel = None
    
    def shutdown_handler(signum, frame):
        """Handle graceful shutdown."""
        print("\n\n⚠️ Shutdown signal received. Cleaning up...")
        if channel and channel.is_open:
            channel.stop_consuming()
        if connection and connection.is_open:
            connection.close()
        print("👋 Goodbye!")
        sys.exit(0)
    
    # Register signal handlers
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)
    
    try:
        # Create connection
        connection = create_connection()
        channel = connection.channel()
        
        print("✅ Connected to RabbitMQ successfully")
        
        # Start consuming
        start_consuming(channel, QUEUES)
        
    except pika.exceptions.AMQPConnectionError as e:
        print(f"❌ Failed to connect to RabbitMQ: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        shutdown_handler(None, None)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)
    finally:
        if connection and connection.is_open:
            connection.close()


if __name__ == '__main__':
    main()
