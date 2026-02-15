
import time
from typing import Callable, Any, Optional
from functools import wraps


MAX_RETRIES = 5
BASE_DELAY = 1  
MAX_DELAY = 16  


def calculate_backoff_delay(retry_count: int) -> float:
    """
    Calculate exponential backoff delay.
    
    Delays: 1s, 2s, 4s, 8s, 16s
    """
    delay = min(BASE_DELAY * (2 ** retry_count), MAX_DELAY)
    return delay


def should_retry(retry_count: int) -> bool:
    """Check if we should retry based on current retry count."""
    return retry_count < MAX_RETRIES


def with_retry(func: Callable) -> Callable:
    """
    Decorator that adds retry logic with exponential backoff.
    
    The decorated function should raise an exception on failure.
    After MAX_RETRIES failures, the exception is re-raised.
    """
    @wraps(func)
    def wrapper(*args, **kwargs) -> Any:
        retry_count = kwargs.pop('_retry_count', 0)
        
        while True:
            try:
                return func(*args, **kwargs)
            except Exception as e:
                if not should_retry(retry_count):
                    print(f"Max retries ({MAX_RETRIES}) exceeded. Giving up.")
                    raise
                
                delay = calculate_backoff_delay(retry_count)
                print(f"Attempt {retry_count + 1} failed: {e}")
                print(f"Retrying in {delay}s... (attempt {retry_count + 2}/{MAX_RETRIES + 1})")
                
                time.sleep(delay)
                retry_count += 1
    
    return wrapper


class RetryableMessage:
    """
    Represents a message that can be retried with tracking.
    """
    def __init__(
        self,
        message_id: str,
        message_type: str,
        payload: dict,
        retry_count: int = 0,
        max_retries: int = MAX_RETRIES
    ):
        self.message_id = message_id
        self.message_type = message_type
        self.payload = payload
        self.retry_count = retry_count
        self.max_retries = max_retries
    
    def can_retry(self) -> bool:
        return self.retry_count < self.max_retries
    
    def get_backoff_delay(self) -> float:
        return calculate_backoff_delay(self.retry_count)
    
    def increment_retry(self) -> 'RetryableMessage':
        return RetryableMessage(
            message_id=self.message_id,
            message_type=self.message_type,
            payload=self.payload,
            retry_count=self.retry_count + 1,
            max_retries=self.max_retries
        )
    
    def to_dict(self) -> dict:
        """Convert to dictionary for requeueing."""
        return {
            'id': self.message_id,
            'type': self.message_type,
            'payload': self.payload,
            'retryCount': self.retry_count,
        }
