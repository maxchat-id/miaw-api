# Miaw API

> REST API wrapper for miaw-core - Multiple Instance of App WhatsApp

**Version:** 0.9.0 (Phase 9 - Basic GET Operations)

Miaw API provides a RESTful interface to manage multiple WhatsApp instances, send messages, and receive real-time webhook events. Built with Fastify and TypeScript.

## Features

- **Multi-Instance Management** - Create and manage multiple WhatsApp instances
- **Full Messaging** - Text, media, edit, delete, reactions, forward
- **Contact Validation** - Check numbers, get contact info, profile pictures
- **Group Management** - Create groups, manage participants, admin operations
- **Profile Management** - Update profile name, status, picture
- **RESTful API** - Clean JSON API with OpenAPI/Swagger documentation
- **Real-Time Webhooks** - Receive events (messages, edits, reactions, etc.) via webhooks
- **Authentication** - Simple API key authentication
- **Docker Support** - Easy deployment with Docker and Docker Compose

## Current Status (Phase 9 - Basic GET Operations)

### Implemented (Phase 1-9)

**Phase 1 - Foundation (v0.1.0)**

- Instance CRUD operations (create, list, get, delete)
- Connection management (connect, disconnect, restart, status)
- Send text messages
- QR code authentication
- Webhook delivery with retry mechanism
- API documentation (Swagger UI)

**Phase 2 - Core Messaging (v0.2.0)**

- Send media (image, video, audio, document)
- Edit text messages
- Delete messages (for everyone / for me)
- Emoji reactions (add/remove)
- Forward messages (to multiple recipients)
- Extended webhook events (edit, delete, reaction)

**Phase 3 - Contacts & Validation (v0.3.0)**

- Check phone number (is on WhatsApp?)
- Batch check numbers (up to 50 at once)
- Get contact information
- Get profile picture URL

**Phase 4 - Group Management (v0.4.0)**

- Create groups
- Get group info/metadata
- Add/remove participants
- Promote/demote admin
- Update group name, description, picture
- Group invite link management (get, revoke, join)
- Leave group

**Phase 5 - Profile Management (v0.5.0)**

- Update profile picture
- Remove profile picture
- Update profile name
- Update profile status (About)

**Phase 6 - Presence & UX (v0.6.0)**

- Set presence (available/unavailable)
- Send typing indicator
- Send recording indicator
- Stop typing/recording indicator
- Mark message as read
- Subscribe to presence updates

**Phase 7 - Webhook Enhancements (v0.7.0)**

- Enhanced webhook signature (X-Miaw-Signature, X-Miaw-Timestamp)
- Signature format: sha256=<hex>
- Timestamp-based replay prevention
- Webhook test endpoint
- Webhook delivery statistics
- Signature verification utility

**Phase 8 - Business Features (v0.8.0)**

- Label management (create, delete, chat labels, message labels)
- Product catalog (get catalog, get collections)
- Newsletters (get metadata, get messages)
- WhatsApp Business account required

**Phase 9 - Basic GET Operations (v0.9.0)**

- Get all contacts
- Get all groups
- Get own profile
- Get all labels
- Get all chats
- Get chat messages

### Planned (Phase 10+)

- Polish & Testing
- Performance optimization
- Security audit

See [docs/ROADMAP.md](./docs/ROADMAP.md) for the full roadmap.

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd miaw-api

# Install dependencies
npm install

# Build the project
npm run build
```

### Configuration

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```bash
# Server
PORT=3000
HOST=0.0.0.0

# API Key (change this!)
API_KEY=your-secret-api-key-here

# Webhook
WEBHOOK_SECRET=your-webhook-secret-here
WEBHOOK_TIMEOUT_MS=10000
WEBHOOK_MAX_RETRIES=5
WEBHOOK_RETRY_DELAY_MS=1000

# Session Storage
SESSION_PATH=./sessions

# Logging
LOG_LEVEL=info
```

### Running

```bash
# Start the server
npm start

# Or in development mode
npm run dev:start
```

The API will be available at `http://localhost:3000`

### Swagger Documentation

Open your browser:

```
http://localhost:3000/docs
```

## API Usage

### Authentication

All API requests require an API key:

```bash
curl http://localhost:3000/instances \
  -H "Authorization: Bearer your-api-key"
```

Or use the `X-API-Key` header:

```bash
curl http://localhost:3000/instances \
  -H "X-API-Key: your-api-key"
```

### Create Instance

```bash
curl -X POST http://localhost:3000/instances \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "instanceId": "my-bot",
    "webhookUrl": "https://your-server.com/webhook",
    "webhookEvents": ["message", "qr", "ready"]
  }'
```

### Connect Instance (Scan QR)

```bash
curl -X POST http://localhost:3000/instances/my-bot/connect \
  -H "Authorization: Bearer your-api-key"
```

The QR code will be sent to your webhook URL. Scan it with WhatsApp.

### Send Text Message

```bash
curl -X POST http://localhost:3000/instances/my-bot/send-text \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "to": "6281234567890",
    "text": "Hello from Miaw API!"
  }'
```

### List Instances

```bash
curl http://localhost:3000/instances \
  -H "Authorization: Bearer your-api-key"
```

### Check Instance Status

```bash
curl http://localhost:3000/instances/my-bot/status \
  -H "Authorization: Bearer your-api-key"
```

### Delete Instance

```bash
curl -X DELETE http://localhost:3000/instances/my-bot \
  -H "Authorization: Bearer your-api-key"
```

## Webhook Events

When events occur, POST requests are sent to your configured webhook URL:

```json
{
  "event": "message",
  "instanceId": "my-bot",
  "timestamp": 1735147200000,
  "data": {
    "id": "message-id",
    "from": "6281234567890@s.whatsapp.net",
    "text": "Hello!",
    "timestamp": 1735147200
  }
}
```

### Event Types

| Event          | Description                    |
| -------------- | ------------------------------ |
| `qr`           | QR code available for scanning |
| `ready`        | Instance connected and ready   |
| `message`      | New message received           |
| `connection`   | Connection state changed       |
| `disconnected` | Instance disconnected          |
| `error`        | Error occurred                 |

## Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Build and start
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Using Docker

```bash
# Build
docker build -t miaw-api .

# Run
docker run -d \
  -p 3000:3000 \
  -e API_KEY=your-api-key \
  -e WEBHOOK_SECRET=your-secret \
  -v $(pwd)/sessions:/app/sessions \
  miaw-api
```

## Development

### Project Structure

```
miaw-api/
├── src/
│   ├── config/         # Configuration loader
│   ├── middleware/     # Express middleware (auth)
│   ├── routes/         # API route handlers
│   ├── schemas/        # JSON Schema definitions
│   ├── services/       # Business logic (InstanceManager, WebhookDispatcher)
│   ├── types/          # TypeScript types
│   ├── utils/          # Utilities (error handler)
│   └── server.ts       # Server entry point
├── test/
│   ├── integration/    # Integration tests
│   └── unit/           # Unit tests (planned)
├── sessions/           # WhatsApp session data (gitignored)
└── dist/               # Compiled output (gitignored)
```

### Scripts

```bash
# Build
npm run build

# Development (watch mode)
npm run dev

# Run tests
npm test
npm run test:unit
npm run test:integration

# Lint
npm run lint
npm run lint:fix
```

### Adding New Features

1. Add route in `src/routes/`
2. Add schema in `src/schemas/index.ts`
3. Add implementation if needed
4. Add integration tests in `test/integration/`
5. Update Swagger documentation

## Testing

See [docs/TESTING.md](./docs/TESTING.md) for detailed testing guide.

```bash
# Run integration tests (requires WhatsApp pairing)
npm run test:integration

# Setup test instance (pair via QR)
npm run test:integration -- setup
```

## API Endpoints

### Instance Management

| Method | Endpoint         | Description          |
| ------ | ---------------- | -------------------- |
| POST   | `/instances`     | Create new instance  |
| GET    | `/instances`     | List all instances   |
| GET    | `/instances/:id` | Get instance details |
| DELETE | `/instances/:id` | Delete instance      |

### Connection

| Method | Endpoint                    | Description              |
| ------ | --------------------------- | ------------------------ |
| POST   | `/instances/:id/connect`    | Connect to WhatsApp      |
| DELETE | `/instances/:id/disconnect` | Disconnect from WhatsApp |
| POST   | `/instances/:id/restart`    | Restart connection       |
| GET    | `/instances/:id/status`     | Get connection status    |

### Messaging

| Method | Endpoint                             | Description                    |
| ------ | ------------------------------------ | ------------------------------ |
| POST   | `/instances/:id/send-text`           | Send text message              |
| POST   | `/instances/:id/send-media`          | Send media (image/video/audio) |
| PATCH  | `/instances/:id/messages/edit`       | Edit text message              |
| DELETE | `/instances/:id/messages/:messageId` | Delete message                 |
| POST   | `/instances/:id/messages/reaction`   | React to message               |
| POST   | `/instances/:id/messages/forward`    | Forward message                |

### Contacts

| Method | Endpoint                               | Description                   |
| ------ | -------------------------------------- | ----------------------------- |
| POST   | `/instances/:id/check-number`          | Check if phone is on WhatsApp |
| POST   | `/instances/:id/check-batch`           | Batch check numbers (max 50)  |
| GET    | `/instances/:id/contacts/:jid`         | Get contact information       |
| GET    | `/instances/:id/contacts/:jid/picture` | Get profile picture URL       |

### Groups

| Method | Endpoint                                        | Description                   |
| ------ | ----------------------------------------------- | ----------------------------- |
| POST   | `/instances/:id/groups`                         | Create group                  |
| GET    | `/instances/:id/groups/:groupJid`               | Get group info                |
| PATCH  | `/instances/:id/groups/:groupJid`               | Update group name/description |
| POST   | `/instances/:id/groups/:groupJid/participants`  | Add participants              |
| DELETE | `/instances/:id/groups/:groupJid/participants`  | Remove participants           |
| POST   | `/instances/:id/groups/:groupJid/admins`        | Promote to admin              |
| DELETE | `/instances/:id/groups/:groupJid/admins`        | Demote admin                  |
| POST   | `/instances/:id/groups/:groupJid/picture`       | Update group picture          |
| GET    | `/instances/:id/groups/:groupJid/invite`        | Get invite link               |
| POST   | `/instances/:id/groups/:groupJid/revoke-invite` | Revoke invite link            |
| POST   | `/instances/:id/groups/join/:inviteCode`        | Join via invite code          |
| DELETE | `/instances/:id/groups/:groupJid`               | Leave group                   |

### Profile

| Method | Endpoint                         | Description            |
| ------ | -------------------------------- | ---------------------- |
| POST   | `/instances/:id/profile/picture` | Update profile picture |
| DELETE | `/instances/:id/profile/picture` | Remove profile picture |
| PATCH  | `/instances/:id/profile/name`    | Update profile name    |
| PATCH  | `/instances/:id/profile/status`  | Update profile status  |

### Presence

| Method | Endpoint                         | Description                   |
| ------ | -------------------------------- | ----------------------------- |
| POST   | `/instances/:id/presence`        | Set presence (online/offline) |
| POST   | `/instances/:id/typing/:to`      | Send typing indicator         |
| POST   | `/instances/:id/recording/:to`   | Send recording indicator      |
| POST   | `/instances/:id/stop-typing/:to` | Stop typing/recording         |
| POST   | `/instances/:id/read`            | Mark message as read          |
| POST   | `/instances/:id/subscribe/:jid`  | Subscribe to presence updates |

### Webhooks

| Method | Endpoint                        | Description                     |
| ------ | ------------------------------- | ------------------------------- |
| POST   | `/instances/:id/webhook/test`   | Send test webhook event         |
| GET    | `/instances/:id/webhook/status` | Get webhook delivery statistics |

### Business (WhatsApp Business Only)

| Method | Endpoint                                             | Description               |
| ------ | ---------------------------------------------------- | ------------------------- |
| POST   | `/instances/:id/labels`                              | Create/edit label         |
| DELETE | `/instances/:id/labels/:labelId`                     | Delete label              |
| POST   | `/instances/:id/chats/:jid/labels/:labelId`          | Add label to chat         |
| DELETE | `/instances/:id/chats/:jid/labels/:labelId`          | Remove label from chat    |
| POST   | `/instances/:id/messages/:messageId/labels/:labelId` | Add label to message      |
| DELETE | `/instances/:id/messages/:messageId/labels/:labelId` | Remove label from message |
| GET    | `/instances/:id/products/catalog`                    | Get product catalog       |
| GET    | `/instances/:id/products/collections`                | Get product collections   |
| GET    | `/instances/:id/newsletters/:newsletterId`           | Get newsletter metadata   |
| GET    | `/instances/:id/newsletters/:newsletterId/messages`  | Get newsletter messages   |

### Basic GET Operations

| Method | Endpoint                                | Description                |
| ------ | --------------------------------------- | -------------------------- |
| GET    | `/instances/:id/contacts`              | Get all contacts           |
| GET    | `/instances/:id/groups`                | Get all groups             |
| GET    | `/instances/:id/profile`               | Get own profile            |
| GET    | `/instances/:id/labels`                | Get all labels             |
| GET    | `/instances/:id/chats`                 | Get all chats              |
| GET    | `/instances/:id/chats/:jid/messages`   | Get chat messages          |

### Health

| Method | Endpoint  | Description  |
| ------ | --------- | ------------ |
| GET    | `/health` | Health check |

## Documentation

- [Roadmap](./docs/ROADMAP.md) - Full development roadmap
- [Integration Test Plan](./docs/INTEGRATION-TEST-PLAN.md) - Test strategy
- [Testing Guide](./docs/TESTING.md) - How to run tests

## Configuration Reference

| Variable                 | Default    | Description                          |
| ------------------------ | ---------- | ------------------------------------ |
| `PORT`               | 3000       | Server port                          |
| `HOST`               | 0.0.0.0    | Server host                          |
| `API_KEY`                | -          | API key for authentication           |
| `WEBHOOK_SECRET`     | -          | Secret for webhook signature         |
| `WEBHOOK_TIMEOUT_MS`     | 10000      | Webhook delivery timeout (ms)        |
| `WEBHOOK_MAX_RETRIES`    | 6          | Max webhook retry attempts           |
| `WEBHOOK_RETRY_DELAY_MS` | 60000      | Initial retry delay (ms)             |
| `SESSION_PATH`           | ./sessions | Session storage path                 |
| `LOG_LEVEL`              | info       | Log level (debug, info, warn, error) |
| `CORS_ORIGIN`            | \*         | CORS allowed origin                  |

## Limitations

- One WhatsApp number per instance
- Manual QR scanning required for initial connection
- Sessions expire after inactivity (requires re-pairing)
- Rate limiting by WhatsApp (may need delays between operations)

## Security Considerations

1. **API Key**: Use a strong, random API key in production
2. **Webhook Secret**: Keep webhook secret secure to verify webhook signatures
3. **HTTPS**: Use HTTPS in production for all API communication
4. **Firewall**: Restrict access to webhook endpoints
5. **Session Files**: Protect `./sessions/` directory (contains auth credentials)

## Troubleshooting

### Connection Issues

**Problem**: QR code not received

- Check webhook URL is accessible
- Verify webhook events include `qr`

**Problem**: Connection fails after QR scan

- Check network connectivity
- Verify WhatsApp can reach the server
- Check logs for errors

### Session Issues

**Problem**: Instance always shows QR required

- Delete instance's session directory: `rm -rf sessions/{instanceId}/`
- Re-scan QR code

**Problem**: Session expired

- Sessions expire after ~30 days of inactivity
- Re-pair by scanning QR code again

## Versioning

This project follows Semantic Versioning (semver).

Current version: `0.1.0`

- **Major version** (0): Initial development, API may change
- **Minor version** (1): Phase 1 (MVP) features
- **Patch version** (0): Initial release

## License

MIT

## Contributing

Contributions are welcome! Please read the contributing guidelines first.

## Support

For issues and questions:

- GitHub Issues: <repository-url>/issues
- Documentation: See [docs/TESTING.md](./docs/TESTING.md) and [docs/ROADMAP.md](./docs/ROADMAP.md)

---

**Miaw API** - Multiple Instance of App WhatsApp REST API

Built with ❤️ using Fastify, TypeScript, and miaw-core
