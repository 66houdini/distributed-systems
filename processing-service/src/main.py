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

load_dotenv()

RABBITMQ_URL = os.getenv('RABBITMQ_URL', 'amqp://guest:guest@localhost:5672')

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
    print("Notification Processing Service")
    print("=" * 60)
    print(f"Connecting to RabbitMQ: {RABBITMQ_URL.replace(':guest@', ':***@')}")
    
    connection = None
    channel = None
    
    def shutdown_handler(signum, frame):
        """Handle graceful shutdown."""
        print("\n\nShutdown signal received. Cleaning up...")
        if channel and channel.is_open:
            channel.stop_consuming()
        if connection and connection.is_open:
            connection.close()
        print("Goodbye!")
        sys.exit(0)
    
    # Register signal handlers
    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)
    
    # Retry connecting to RabbitMQ with exponential backoff
    import time
    max_retries = 10
    delay = 2
    
    for attempt in range(1, max_retries + 1):
        try:
            print(f"Connecting to RabbitMQ (attempt {attempt}/{max_retries})...")
            connection = create_connection()
            channel = connection.channel()
            print("Connected to RabbitMQ successfully")
            
            start_consuming(channel, QUEUES)
            break
            
        except pika.exceptions.AMQPConnectionError as e:
            if attempt == max_retries:
                print(f"Failed to connect to RabbitMQ after {max_retries} attempts: {e}")
                sys.exit(1)
            print(f"RabbitMQ not ready, retrying in {delay}s...")
            time.sleep(delay)
            delay = min(delay * 2, 30)
        except KeyboardInterrupt:
            shutdown_handler(None, None)
        except Exception as e:
            print(f"Unexpected error: {e}")
            sys.exit(1)
    
    if connection and connection.is_open:
        connection.close()


if __name__ == '__main__':
    main()
