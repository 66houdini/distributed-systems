"""
Consumer - RabbitMQ message consumer with idempotency and retry logic
"""
import json
import os
from typing import Dict, Any, Callable
import pika
import redis

from retry_handler import RetryableMessage, calculate_backoff_delay, MAX_RETRIES
from senders import send_email, send_sms, send_push


# Redis client for idempotency checks
redis_client = redis.from_url(os.getenv('REDIS_URL', 'redis://localhost:6379'))

# Idempotency key TTL (24 hours in seconds)
IDEMPOTENCY_TTL = 24 * 60 * 60

# Notification type to sender mapping
SENDERS: Dict[str, Callable] = {
    'email': send_email,
    'sms': send_sms,
    'push': send_push,
}


def check_idempotency(user_id: str, idempotency_key: str) -> bool:
    """
    Check if this message has already been processed.
    
    Returns:
        True if already processed (duplicate), False if new
    """
    redis_key = f"processed:{user_id}:{idempotency_key}"
    return redis_client.exists(redis_key) > 0


def mark_as_processed(user_id: str, idempotency_key: str) -> None:
    """Mark a message as successfully processed."""
    redis_key = f"processed:{user_id}:{idempotency_key}"
    redis_client.setex(redis_key, IDEMPOTENCY_TTL, "1")


def process_message(
    channel: pika.channel.Channel,
    method: pika.spec.Basic.Deliver,
    properties: pika.spec.BasicProperties,
    body: bytes
) -> None:
    """
    Process a notification message from the queue.
    
    Implements:
    - Idempotency check (prevents duplicate sends)
    - Retry with exponential backoff
    - Dead letter queue for failed messages
    """
    try:
        # Parse message
        message_data = json.loads(body.decode('utf-8'))
        
        message_id = message_data.get('id')
        message_type = message_data.get('type')
        user_id = message_data.get('userId')
        idempotency_key = message_data.get('idempotencyKey')
        payload = message_data.get('payload')
        retry_count = message_data.get('retryCount', 0)
        
        # Get retry count from headers if available
        if properties.headers and 'x-retry-count' in properties.headers:
            retry_count = properties.headers['x-retry-count']
        
        print(f"\n{'='*50}")
        print(f"📥 Received message: {message_id}")
        print(f"   Type: {message_type}")
        print(f"   User: {user_id}")
        print(f"   Retry count: {retry_count}")
        
        # Idempotency check
        if check_idempotency(user_id, idempotency_key):
            print(f"⏭️ Duplicate message detected. Skipping processing.")
            channel.basic_ack(delivery_tag=method.delivery_tag)
            return
        
        # Get the appropriate sender
        sender = SENDERS.get(message_type)
        if not sender:
            print(f"❌ Unknown message type: {message_type}")
            channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
            return
        
        # Create retryable message
        retryable = RetryableMessage(
            message_id=message_id,
            message_type=message_type,
            payload=payload,
            retry_count=retry_count
        )
        
        # Attempt to send notification
        try:
            sender(payload)
            
            # Mark as processed for idempotency
            mark_as_processed(user_id, idempotency_key)
            
            print(f"✅ Message {message_id} processed successfully")
            channel.basic_ack(delivery_tag=method.delivery_tag)
            
        except Exception as send_error:
            print(f"❌ Failed to send notification: {send_error}")
            
            if retryable.can_retry():
                # Schedule retry with backoff
                delay = retryable.get_backoff_delay()
                print(f"🔄 Scheduling retry in {delay}s (attempt {retry_count + 2}/{MAX_RETRIES + 1})")
                
                # Republish with incremented retry count
                new_message = retryable.increment_retry()
                new_body = json.dumps({
                    **message_data,
                    'retryCount': new_message.retry_count
                })
                
                # Use RabbitMQ's delayed message feature via TTL
                # Alternatively, use a delay exchange plugin
                channel.basic_publish(
                    exchange='',
                    routing_key=method.routing_key,
                    body=new_body.encode('utf-8'),
                    properties=pika.BasicProperties(
                        delivery_mode=2,  # Persistent
                        headers={'x-retry-count': new_message.retry_count},
                        expiration=str(int(delay * 1000))  # TTL in milliseconds
                    )
                )
                
                # Acknowledge original message
                channel.basic_ack(delivery_tag=method.delivery_tag)
                
            else:
                # Max retries exceeded - move to DLQ
                print(f"💀 Max retries exceeded. Moving to Dead Letter Queue.")
                # Reject without requeue - will go to DLQ via x-dead-letter-exchange
                channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
        
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON in message: {e}")
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)
    except Exception as e:
        print(f"❌ Unexpected error processing message: {e}")
        channel.basic_nack(delivery_tag=method.delivery_tag, requeue=False)


def start_consuming(channel: pika.channel.Channel, queues: list) -> None:
    """
    Start consuming messages from the specified queues.
    """
    # Set prefetch count to process one message at a time
    channel.basic_qos(prefetch_count=1)
    
    for queue in queues:
        channel.basic_consume(
            queue=queue,
            on_message_callback=process_message,
            auto_ack=False
        )
        print(f"👂 Listening to queue: {queue}")
    
    print("\n🚀 Consumer started. Waiting for messages...")
    channel.start_consuming()
