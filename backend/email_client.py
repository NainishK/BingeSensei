import resend
from config import settings
from typing import List
import logging
import asyncio
from functools import partial

logger = logging.getLogger(__name__)

# Configure Resend API Key
resend.api_key = settings.MAIL_PASSWORD

async def send_email(subject: str, recipients: List[str], body: str):
    """
    Sends an email asynchronously using the Resend API.
    """
    if not resend.api_key:
        logger.warning("Resend API key not configured. Skipping email send.")
        return

    try:
        # Normalize recipients to list
        to_recipients = list(recipients)
        
        params = {
            "from": settings.MAIL_FROM or "onboarding@resend.dev",
            "to": to_recipients,
            "subject": subject,
            "html": body
        }
        
        # Run the synchronous SDK send call in a thread pool to avoid blocking FastAPI's event loop
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            None, 
            partial(resend.Emails.send, params)
        )
        logger.info(f"Email sent successfully to {to_recipients}")
    except Exception as e:
        logger.error(f"Failed to send email via Resend: {e}")
        raise e
