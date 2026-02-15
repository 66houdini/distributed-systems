
import random
import os
from typing import Dict, Any


def send_email(payload: Dict[str, Any]) -> bool:
    """
    Mock email sending function.
    In production, this would integrate with an SMTP provider or email API.
    
    Args:
        payload: Email payload containing to, subject, body, etc.
    
    Returns:
        bool: True if email sent successfully, False otherwise
    
    Raises:
        Exception: If FORCE_FAILURE is enabled or random failure occurs
    """
    to = payload.get('to')
    subject = payload.get('subject')
    body = payload.get('body')
    
    # Simulate failure for testing retry mechanism
    force_failure = os.getenv('FORCE_FAILURE', 'false').lower() == 'true'
    
    if force_failure:
        raise Exception("Forced failure for testing retry mechanism")
    
    # Random failure simulation (10% chance) for realistic testing
    if random.random() < 0.1:
        raise Exception("Simulated random email provider failure")
    
    # Mock successful email send
    print(f"📧 EMAIL SENT:")
    print(f"   To: {to}")
    print(f"   Subject: {subject}")
    print(f"   Body: {body[:50]}..." if len(body) > 50 else f"   Body: {body}")
    
    return True
