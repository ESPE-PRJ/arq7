from fastapi import FastAPI, HTTPException, BackgroundTasks
import aio_pika
import redis
import asyncio
import smtplib
import json
import os
import logging
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart
from datetime import datetime
from typing import Dict, Any
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://rabbitmq:5672")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@ecommerce.com")

app = FastAPI(title="Notification Service", description="Notification Microservice", version="1.0.0")

redis_client = redis.from_url(REDIS_URL, decode_responses=True)

class EmailNotification(BaseModel):
    to_email: EmailStr
    subject: str
    message: str
    template_type: str = "default"

class NotificationStatus(BaseModel):
    id: str
    status: str
    created_at: str
    sent_at: str = None
    error_message: str = None

async def send_email(to_email: str, subject: str, message: str, template_type: str = "default"):
    try:
        msg = MimeMultipart()
        msg['From'] = FROM_EMAIL
        msg['To'] = to_email
        msg['Subject'] = subject
        
        if template_type == "order_confirmation":
            html_body = f"""
            <html>
            <body>
                <h2>¡Gracias por tu pedido!</h2>
                <p>Hemos recibido tu pedido correctamente.</p>
                <div style="background-color: #f5f5f5; padding: 15px; margin: 10px 0;">
                    {message}
                </div>
                <p>Te enviaremos actualizaciones sobre el estado de tu pedido.</p>
                <p>¡Gracias por elegirnos!</p>
            </body>
            </html>
            """
        elif template_type == "order_status":
            html_body = f"""
            <html>
            <body>
                <h2>Actualización de tu pedido</h2>
                <div style="background-color: #e7f3ff; padding: 15px; margin: 10px 0;">
                    {message}
                </div>
                <p>Gracias por tu paciencia.</p>
            </body>
            </html>
            """
        else:
            html_body = f"""
            <html>
            <body>
                <h2>Notificación</h2>
                <p>{message}</p>
            </body>
            </html>
            """
        
        msg.attach(MimeText(html_body, 'html'))
        
        if SMTP_USERNAME and SMTP_PASSWORD:
            with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
                server.starttls()
                server.login(SMTP_USERNAME, SMTP_PASSWORD)
                server.send_message(msg)
        else:
            logger.warning("SMTP credentials not configured, simulating email send")
        
        logger.info(f"Email sent to {to_email}: {subject}")
        return True
        
    except Exception as e:
        logger.error(f"Error sending email to {to_email}: {str(e)}")
        return False

async def process_order_created_event(event_data: Dict[str, Any]):
    try:
        order_id = event_data.get('orderId')
        user_email = event_data.get('userEmail')
        total_amount = event_data.get('totalAmount')
        
        subject = f"Confirmación de Pedido #{order_id}"
        message = f"""
        Tu pedido #{order_id} ha sido creado exitosamente.
        
        Total: ${total_amount:.2f}
        Fecha: {event_data.get('timestamp')}
        
        Te enviaremos actualizaciones sobre el estado de tu pedido.
        """
        
        notification_id = f"order_conf_{order_id}_{datetime.now().timestamp()}"
        
        redis_client.hset(f"notification:{notification_id}", mapping={
            "id": notification_id,
            "type": "order_confirmation",
            "to_email": user_email,
            "subject": subject,
            "status": "processing",
            "created_at": datetime.now().isoformat()
        })
        
        success = await send_email(user_email, subject, message, "order_confirmation")
        
        if success:
            redis_client.hset(f"notification:{notification_id}", mapping={
                "status": "sent",
                "sent_at": datetime.now().isoformat()
            })
        else:
            redis_client.hset(f"notification:{notification_id}", mapping={
                "status": "failed",
                "error_message": "Failed to send email"
            })
            
        logger.info(f"Processed order created event for order {order_id}")
        
    except Exception as e:
        logger.error(f"Error processing order created event: {str(e)}")

async def process_order_status_event(event_data: Dict[str, Any]):
    try:
        order_id = event_data.get('orderId')
        user_email = event_data.get('userEmail')
        new_status = event_data.get('newStatus')
        
        status_messages = {
            'confirmed': 'Tu pedido ha sido confirmado y está siendo preparado.',
            'processing': 'Tu pedido está siendo procesado.',
            'shipped': 'Tu pedido ha sido enviado.',
            'delivered': 'Tu pedido ha sido entregado.',
            'cancelled': 'Tu pedido ha sido cancelado.'
        }
        
        subject = f"Actualización de Pedido #{order_id}"
        message = f"""
        Estado actualizado: {new_status.upper()}
        
        {status_messages.get(new_status, 'Tu pedido ha sido actualizado.')}
        
        Pedido: #{order_id}
        Fecha de actualización: {event_data.get('timestamp')}
        """
        
        notification_id = f"order_status_{order_id}_{datetime.now().timestamp()}"
        
        redis_client.hset(f"notification:{notification_id}", mapping={
            "id": notification_id,
            "type": "order_status",
            "to_email": user_email,
            "subject": subject,
            "status": "processing",
            "created_at": datetime.now().isoformat()
        })
        
        success = await send_email(user_email, subject, message, "order_status")
        
        if success:
            redis_client.hset(f"notification:{notification_id}", mapping={
                "status": "sent",
                "sent_at": datetime.now().isoformat()
            })
        else:
            redis_client.hset(f"notification:{notification_id}", mapping={
                "status": "failed",
                "error_message": "Failed to send email"
            })
            
        logger.info(f"Processed order status event for order {order_id}")
        
    except Exception as e:
        logger.error(f"Error processing order status event: {str(e)}")

async def consume_notifications():
    try:
        connection = await aio_pika.connect_robust(RABBITMQ_URL)
        channel = await connection.channel()
        
        await channel.declare_queue("notification_events", durable=True)
        
        async def process_message(message):
            async with message.process():
                try:
                    event_data = json.loads(message.body.decode())
                    event_type = event_data.get('type')
                    
                    logger.info(f"Processing notification event: {event_type}")
                    
                    if event_type == 'ORDER_CONFIRMATION':
                        await process_order_created_event(event_data)
                    elif event_type == 'ORDER_STATUS_UPDATED':
                        await process_order_status_event(event_data)
                    else:
                        logger.warning(f"Unknown event type: {event_type}")
                        
                except Exception as e:
                    logger.error(f"Error processing message: {str(e)}")
        
        queue = await channel.get_queue("notification_events")
        await queue.consume(process_message)
        
        logger.info("Started consuming notification events from RabbitMQ")
        
    except Exception as e:
        logger.error(f"Error setting up RabbitMQ consumer: {str(e)}")
        await asyncio.sleep(5)
        await consume_notifications()

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(consume_notifications())

@app.post("/notifications/email")
async def send_email_notification(
    notification: EmailNotification, 
    background_tasks: BackgroundTasks
):
    try:
        notification_id = f"manual_{datetime.now().timestamp()}"
        
        redis_client.hset(f"notification:{notification_id}", mapping={
            "id": notification_id,
            "type": "manual_email",
            "to_email": notification.to_email,
            "subject": notification.subject,
            "status": "processing",
            "created_at": datetime.now().isoformat()
        })
        
        background_tasks.add_task(
            send_email_async,
            notification_id,
            notification.to_email,
            notification.subject,
            notification.message,
            notification.template_type
        )
        
        return {
            "message": "Notification queued successfully",
            "notification_id": notification_id
        }
        
    except Exception as e:
        logger.error(f"Error queuing email notification: {str(e)}")
        raise HTTPException(status_code=500, detail="Error queuing notification")

async def send_email_async(notification_id: str, to_email: str, subject: str, message: str, template_type: str):
    success = await send_email(to_email, subject, message, template_type)
    
    if success:
        redis_client.hset(f"notification:{notification_id}", mapping={
            "status": "sent",
            "sent_at": datetime.now().isoformat()
        })
    else:
        redis_client.hset(f"notification:{notification_id}", mapping={
            "status": "failed",
            "error_message": "Failed to send email"
        })

@app.get("/notifications/{notification_id}/status")
async def get_notification_status(notification_id: str):
    try:
        notification_data = redis_client.hgetall(f"notification:{notification_id}")
        
        if not notification_data:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        return NotificationStatus(**notification_data)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting notification status: {str(e)}")
        raise HTTPException(status_code=500, detail="Error retrieving notification status")

@app.get("/notifications/stats")
async def get_notification_stats():
    try:
        keys = redis_client.keys("notification:*")
        stats = {
            "total": len(keys),
            "sent": 0,
            "failed": 0,
            "processing": 0
        }
        
        for key in keys:
            status = redis_client.hget(key, "status")
            if status in stats:
                stats[status] += 1
        
        return stats
        
    except Exception as e:
        logger.error(f"Error getting notification stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Error retrieving stats")

@app.get("/health")
def health_check():
    try:
        redis_client.ping()
        redis_status = "UP"
    except:
        redis_status = "DOWN"
    
    return {
        "status": "OK",
        "timestamp": datetime.now().isoformat(),
        "service": "notification-service",
        "dependencies": {
            "redis": redis_status
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 3004)))