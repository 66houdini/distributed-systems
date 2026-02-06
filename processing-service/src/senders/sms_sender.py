"""
SMS Sender - Mock implementation for sending SMS messages
"""
import random
import os
from typing import Dict, Any


def send_sms(payload: Dict[str, Any]) -> bool:
    """
    Mock SMS sending function.
    In production, this would integrate with Twilio, Vonage, or similar.
    
    Args:
        payload: SMS payload containing to (phone) and message
    
    Returns:
        bool: True if SMS sent successfully, False otherwise
    
    Raises:
        Exception: If FORCE_FAILURE is enabled or random failure occurs
    """
    to = payload.get('to')
    message = payload.get('message')
    
    # Simulate failure for testing retry mechanism
    force_failure = os.getenv('FORCE_FAILURE', 'false').lower() == 'true'
    
    if force_failure:
        raise Exception("Forced failure for testing retry mechanism")
    
    # Random failure simulation (10% chance)
    if random.random() < 0.1:
        raise Exception("Simulated random SMS gateway failure")
    
    # Mock successful SMS send
    print(f"📱 SMS SENT:")
    print(f"   To: {to}")
    print(f"   Message: {message}")
    
    return True
