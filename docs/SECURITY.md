# Security Guide

This document outlines security best practices for deploying and operating miaw-api in production environments.

## Table of Contents

- [API Key Management](#api-key-management)
- [Webhook Security](#webhook-security)
- [CORS Configuration](#cors-configuration)
- [Session Security](#session-security)
- [Deployment Recommendations](#deployment-recommendations)
- [Security Checklist](#security-checklist)

---

## API Key Management

### Setting Up API Keys

The API uses a single master API key for authentication. **Never use the default key in production.**

```bash
# Generate a secure random key
openssl rand -hex 32

# Set the API key via environment variable
export API_KEY="your-secure-random-key-here"
```

### Authentication Methods

The API accepts authentication via two methods (in order of precedence):

1. **Authorization Header** (recommended)
   ```
   Authorization: Bearer your-api-key
   ```

2. **X-API-Key Header**
   ```
   X-API-Key: your-api-key
   ```

### Key Rotation

To rotate the API key:

1. Generate a new key
2. Update clients to use the new key (if possible, support both temporarily)
3. Update the `API_KEY` environment variable
4. Restart the server
5. Remove old key from all clients

### Security Features

- **Timing-safe comparison**: API key validation uses constant-time comparison to prevent timing attacks
- **Audit logging**: Failed authentication attempts are logged with IP address, method, and URL (but never the invalid key itself)

---

## Webhook Security

### Signature Verification

All webhook requests include a cryptographic signature to verify authenticity:

| Header | Description |
|--------|-------------|
| `X-Miaw-Signature` | HMAC-SHA256 signature in format `sha256=<hex>` |
| `X-Miaw-Timestamp` | Unix timestamp (milliseconds) when request was signed |

### Setting Up Webhook Secret

```bash
# Generate a secure webhook secret
openssl rand -hex 32

# Set via environment variable
export WEBHOOK_SECRET="your-webhook-secret-here"
```

### Verifying Signatures (Node.js Example)

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, timestamp, secret, maxAgeMs = 300000) {
  // 1. Check timestamp freshness (replay prevention)
  const now = Date.now();
  if (now - timestamp > maxAgeMs) {
    console.error('Webhook timestamp expired');
    return false;
  }

  // 2. Validate signature format
  const match = signature.match(/^sha256=(.+)$/);
  if (!match) {
    console.error('Invalid signature format');
    return false;
  }

  const expectedSignature = match[1];

  // 3. Compute expected signature
  const payloadString = JSON.stringify(payload);
  const signedPayload = `${timestamp}.${payloadString}`;
  const computedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // 4. Use timing-safe comparison
  if (expectedSignature.length !== computedSignature.length) {
    return false;
  }
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(computedSignature)
  );
}

// Express middleware example
app.post('/webhook', express.json(), (req, res) => {
  const signature = req.headers['x-miaw-signature'];
  const timestamp = parseInt(req.headers['x-miaw-timestamp'], 10);

  if (!verifyWebhookSignature(req.body, signature, timestamp, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook...
  res.status(200).json({ received: true });
});
```

### Verifying Signatures (Python Example)

```python
import hmac
import hashlib
import json
import time

def verify_webhook_signature(payload, signature, timestamp, secret, max_age_ms=300000):
    # 1. Check timestamp freshness
    now = int(time.time() * 1000)
    if now - timestamp > max_age_ms:
        return False

    # 2. Validate signature format
    if not signature.startswith('sha256='):
        return False

    expected_signature = signature[7:]  # Remove 'sha256=' prefix

    # 3. Compute expected signature
    payload_string = json.dumps(payload, separators=(',', ':'))
    signed_payload = f"{timestamp}.{payload_string}"
    computed_signature = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()

    # 4. Use timing-safe comparison
    return hmac.compare_digest(expected_signature, computed_signature)
```

### Webhook Retry Behavior

Failed webhook deliveries are retried with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1 | Immediate |
| 2 | 1 minute |
| 3 | 5 minutes |
| 4 | 15 minutes |
| 5 | 1 hour |
| 6 | 1 hour (max) |

After `WEBHOOK_MAX_RETRIES` failures, the webhook is dropped.

---

## CORS Configuration

### Development

By default, CORS allows all origins (`*`). This is **not recommended for production**.

### Production

Restrict CORS to your specific domain(s):

```bash
export CORS_ORIGIN="https://app.example.com"
```

For multiple origins, use a reverse proxy (nginx, Caddy) to handle CORS headers.

### Warning

The server will log a warning if CORS is set to `*` in production (`NODE_ENV=production`).

---

## Session Security

### Session Storage

WhatsApp authentication sessions are stored in the filesystem:

```bash
# Default location
./sessions/{instanceId}/

# Custom location
export SESSION_PATH="/secure/path/to/sessions"
```

### File Permissions

Ensure session files are protected:

```bash
# Set restrictive permissions
chmod 700 /path/to/sessions
chown app-user:app-user /path/to/sessions

# Verify permissions
ls -la /path/to/sessions
# Should show: drwx------ (700)
```

### Session Data Contents

Session directories contain:
- `creds.json` - Authentication credentials
- `keys/` - Encryption keys

**These files contain sensitive data. Protect them accordingly.**

### Backup Recommendations

- Encrypt session backups at rest
- Use secure transfer protocols (SCP, SFTP over SSH)
- Limit backup retention
- Store backups in different physical location

---

## Deployment Recommendations

### Use HTTPS

**Always deploy behind HTTPS in production.** Options:

1. **Reverse Proxy** (recommended)
   ```nginx
   # nginx example
   server {
       listen 443 ssl;
       server_name api.example.com;

       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;

       location / {
           proxy_pass http://127.0.0.1:3000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

2. **Cloud Load Balancer** (AWS ALB, GCP Load Balancer, etc.)

### Bind to Localhost

When using a reverse proxy, bind the API to localhost only:

```bash
export HOST="127.0.0.1"
export PORT="3000"
```

### Environment Variables

Never commit secrets to version control:

```bash
# Use .env files (add to .gitignore)
echo ".env" >> .gitignore

# Or use secret management services
# - AWS Secrets Manager
# - HashiCorp Vault
# - Google Secret Manager
```

### Container Security

If using Docker:

```dockerfile
# Run as non-root user
RUN adduser -D appuser
USER appuser

# Don't store secrets in image
# Use environment variables or mounted secrets
```

### Logging

The API logs security events:

| Event | Level | Description |
|-------|-------|-------------|
| `auth_failure` | WARN | Failed authentication attempt |
| `webhook_delivered` | INFO | Successful webhook delivery |
| `webhook_failed` | WARN | Failed webhook delivery |

Configure appropriate log aggregation for security monitoring.

---

## Security Checklist

Use this checklist before deploying to production:

### Authentication
- [ ] Set custom `API_KEY` (not default `miaw-api-key`)
- [ ] Set custom `WEBHOOK_SECRET` (not default `webhook-secret`)
- [ ] Implemented webhook signature verification in your webhook handler

### Network
- [ ] HTTPS enabled (via reverse proxy or load balancer)
- [ ] API bound to localhost if using reverse proxy
- [ ] CORS restricted to specific origin(s)
- [ ] Firewall rules configured appropriately

### Sessions
- [ ] Session path has restricted permissions (700)
- [ ] Session directory owned by application user
- [ ] Session backups encrypted

### Deployment
- [ ] Running as non-root user
- [ ] Secrets not in version control
- [ ] Environment variables from secure source
- [ ] Log aggregation configured
- [ ] Monitoring for failed authentication attempts

### Application
- [ ] Latest version deployed
- [ ] No default/test credentials
- [ ] `NODE_ENV=production` set

---

## Reporting Security Issues

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public issue
2. Email security concerns to the maintainers
3. Include detailed steps to reproduce
4. Allow reasonable time for a fix before public disclosure

---

## Version History

| Version | Changes |
|---------|---------|
| 1.0.0 | Initial security documentation |
