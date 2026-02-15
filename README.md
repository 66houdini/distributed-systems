# Distributed Notification System

A microservices-based notification system for sending emails, SMS, and push notifications with rate limiting, retry mechanisms, and idempotency guarantees.

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────┐     ┌──────────────────┐
│   API Client    │────▶│  Ingestion Service (Node.js) │────▶│    RabbitMQ     │
└─────────────────┘     │  - Rate Limiting (Redis)     │     │  - Email Queue   │
                        │  - Idempotency Check         │     │  - SMS Queue     │
                        │  - Request Validation        │     │  - Push Queue    │
                        └──────────────────────────────┘     │  - Dead Letter Q │
                                                             └────────┬─────────┘
                                                                      │
                        ┌──────────────────────────────┐              │
                        │ Processing Service (Python)  │◀─────────────┘
                        │  - Exponential Backoff Retry │
                        │  - Idempotency Check         │
                        │  - Mock Notification Senders │
                        └──────────────────────────────┘
```

## Features

- **Rate Limiting** - Sliding window rate limiter (50 requests/hour per user)
- **Idempotency** - Prevents duplicate notifications on retry/redelivery
- **Exponential Backoff** - Retry delays: 1s → 2s → 4s → 8s → 16s
- **Dead Letter Queue** - Failed messages after max retries for inspection
- **Polyglot** - Node.js/TypeScript + Python via RabbitMQ

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ (for local development)
- Python 3.11+ (for local development)

### Start All Services

```bash
# Start everything with Docker Compose
docker-compose up --build

# Or in detached mode
docker-compose up -d --build
```

### Services

| Service | Port | Description |
|---------|------|-------------|
| Ingestion API | 3000 | REST API for notifications |
| RabbitMQ | 5672 | Message queue |
| RabbitMQ UI | 15672 | Management UI (guest/guest) |
| Redis | 6379 | Rate limiting & idempotency |

## API Endpoints

### Send Email
```bash
curl -X POST http://localhost:3000/api/notifications/email \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "idempotencyKey": "email-001",
    "payload": {
      "to": "recipient@example.com",
      "subject": "Hello",
      "body": "This is a test email"
    }
  }'
```

### Send SMS
```bash
curl -X POST http://localhost:3000/api/notifications/sms \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "idempotencyKey": "sms-001",
    "payload": {
      "to": "+1234567890",
      "message": "This is a test SMS"
    }
  }'
```

### Send Push Notification
```bash
curl -X POST http://localhost:3000/api/notifications/push \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "idempotencyKey": "push-001",
    "payload": {
      "deviceToken": "abc123xyz",
      "title": "New Message",
      "body": "You have a new notification"
    }
  }'
```

### Health Check
```bash
curl http://localhost:3000/health
```

## Testing

### Test Rate Limiting
```bash
# Send 51 requests (limit is 50/hour)
for i in $(seq 1 51); do
  echo "Request $i:"
  curl -s -X POST http://localhost:3000/api/notifications/email \
    -H "Content-Type: application/json" \
    -d "{\"userId\":\"user-123\",\"idempotencyKey\":\"test-$i\",\"payload\":{\"to\":\"test@example.com\",\"subject\":\"Test\",\"body\":\"Hello\"}}"
  echo ""
done
# Request 51 should return 429 Too Many Requests
```

### Test Idempotency
```bash
# Send same request twice
curl -X POST http://localhost:3000/api/notifications/email \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-123","idempotencyKey":"duplicate-test","payload":{"to":"test@example.com","subject":"Test","body":"Hello"}}'

# Second request returns cached response
curl -X POST http://localhost:3000/api/notifications/email \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-123","idempotencyKey":"duplicate-test","payload":{"to":"test@example.com","subject":"Test","body":"Hello"}}'
```

### Test Retry & Dead Letter Queue
```bash
# Enable forced failures
docker-compose exec processing-service sh -c "export FORCE_FAILURE=true"

# Send a notification and watch the logs for retry attempts
docker-compose logs -f processing-service
```

## Local Development

### Ingestion Service (TypeScript)
```bash
cd ingestion-service
npm install
npm run dev
```

### Processing Service (Python)
```bash
cd processing-service
pip install -r requirements.txt
python src/main.py
```

## Project Structure
```
distributed-systems/
├── docker-compose.yml
├── .env.example
├── rate-limiter/
│   └── rate_limit.lua
├── ingestion-service/
│   ├── src/
│   │   ├── index.ts
│   │   ├── types/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── services/
│   └── Dockerfile
└── processing-service/
    ├── src/
    │   ├── main.py
    │   ├── consumer.py
    │   ├── retry_handler.py
    │   └── senders/
    └── Dockerfile
```

## License

MIT
