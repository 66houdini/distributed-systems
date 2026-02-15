import random
import os
from typing import Dict, Any


def send_push(payload: Dict[str, Any]) -> bool:
    """
    Mock push notification sending function.
    In production, this would integrate with Firebase FCM, APNs, or similar.
    
    Args:
        payload: Push payload containing deviceToken, title, body, and optional data
    
    Returns:
        bool: True if push sent successfully, False otherwise
    
    Raises:
        Exception: If FORCE_FAILURE is enabled or random failure occurs
    """
    device_token = payload.get('deviceToken')
    title = payload.get('title')
    body = payload.get('body')
    data = payload.get('data', {})
    
    force_failure = os.getenv('FORCE_FAILURE', 'false').lower() == 'true'
    
    if force_failure:
        raise Exception("Forced failure for testing retry mechanism")
    
    if random.random() < 0.1:
        raise Exception("Simulated random push service failure")
    
    print(f"PUSH NOTIFICATION SENT:")
    print(f"   Device: {device_token[:20]}..." if len(device_token) > 20 else f"   Device: {device_token}")
    print(f"   Title: {title}")
    print(f"   Body: {body}")
    if data:
        print(f"   Data: {data}")
    
    return True
