# Error Codes Reference

This document provides a comprehensive reference for all error codes returned by the miaw-api.

## Error Response Format

All errors follow a consistent JSON structure:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error description",
    "details": {},
    "correlationId": "uuid-for-tracking"
  }
}
```

| Field                 | Type    | Description                          |
| --------------------- | ------- | ------------------------------------ |
| `success`             | boolean | Always `false` for errors            |
| `error.code`          | string  | Machine-readable error code          |
| `error.message`       | string  | Human-readable description           |
| `error.details`       | object  | Optional additional context          |
| `error.correlationId` | string  | UUID for log correlation and support |

---

## Error Codes

### Authentication Errors

#### UNAUTHORIZED (401)

Authentication failed or was not provided.

**Causes:**

- Missing API key header
- Invalid API key

**Example Response:**

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Missing API key",
    "correlationId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
  }
}
```

**Resolution:**

- Verify the API key is correct
- Check the header format: `Authorization: Bearer <key>` or `X-API-Key: <key>`
- Ensure no extra whitespace in the key

---

### Request Validation Errors

#### VALIDATION_ERROR (400)

Request data failed schema validation. Raised by the framework's validator, so
it fires before the route handler runs.

**Causes:**

- Missing required fields
- Invalid field types
- Field value out of range
- An unknown field, on `/api/v2` routes only — v1 ignores fields it does not
  recognise

**Example Response:**

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "body/phone must be string",
    "details": {
      "validation": [
        {
          "keyword": "type",
          "instancePath": "/phone",
          "message": "must be string"
        }
      ]
    },
    "correlationId": "b2c3d4e5-f6a7-8901-bcde-f23456789012"
  }
}
```

**Resolution:**

- Review the API documentation for the endpoint
- Check that all required fields are present
- Verify field types match the schema
- Consult the `details` field for specific validation errors

---

#### INVALID_REQUEST (400)

The request is malformed, or WhatsApp refused the operation. This is also the
code for anything the framework rejects that is not a schema failure — an empty
body where one is required, an unsupported content type.

**Causes:**

- Invalid JSON in request body
- A body that is empty or of the wrong content type
- Invalid JID format
- Operation not supported for the given context
- WhatsApp declined the operation (send failed, not an admin, invite spent)

**Example Response:**

```json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid JID format",
    "details": {
      "provided": "invalid-jid",
      "expected": "phone@s.whatsapp.net or group@g.us"
    },
    "correlationId": "c3d4e5f6-a7b8-9012-cdef-345678901234"
  }
}
```

**Resolution:**

- Verify the request body is valid JSON
- Check JID formats: `{phone}@s.whatsapp.net` for individuals, `{id}@g.us` for groups
- Review the specific error message for guidance

---

### Resource Errors

#### NOT_FOUND (404)

The requested resource does not exist.

**Causes:**

- Instance ID does not exist
- Message not found
- Contact not found
- Group not found

**Example Response:**

```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Instance not found",
    "correlationId": "d4e5f6a7-b8c9-0123-def4-567890123456"
  }
}
```

**Resolution:**

- Verify the resource ID is correct
- List existing resources to confirm availability
- For instances: use `GET /instances` to list all instances

---

#### CONFLICT (409)

The operation conflicts with the current state of a resource.

**Causes:**

- Attempting to create an instance with an ID that already exists
- Duplicate operation

**Example Response:**

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Instance already exists",
    "correlationId": "e5f6a7b8-c9d0-1234-ef56-789012345678"
  }
}
```

**Resolution:**

- Use a different ID for new resources
- Check if the resource already exists before creating
- For instances: use `GET /instances/{id}` to check existence

---

### Connection Errors

#### SERVICE_UNAVAILABLE (503)

The service or required connection is not available.

**Causes:**

- WhatsApp instance not connected
- Connection in progress
- WhatsApp servers unreachable

**Example Response:**

```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Instance not connected to WhatsApp",
    "correlationId": "f6a7b8c9-d0e1-2345-f678-901234567890"
  }
}
```

**Resolution:**

- Check instance connection status: `GET /instances/{id}/status`
- Connect the instance: `POST /instances/{id}/connect`
- Wait for QR code scan if required
- Check WhatsApp service status if persistent issues

---

### Server Errors

#### INTERNAL_ERROR (500)

An unexpected error occurred on the server.

**Causes:**

- Unhandled exception
- Database/storage errors
- System resource issues

**Example Response:**

```json
{
  "success": false,
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An unexpected error occurred",
    "correlationId": "a7b8c9d0-e1f2-3456-7890-123456789abc"
  }
}
```

**Resolution:**

- Note the `correlationId` for support requests
- Check server logs for details (search by correlationId)
- Retry the request after a brief delay
- Contact support if the issue persists

**Note:** For security reasons, internal error details are not exposed in the response. The actual error is logged server-side with the correlationId.

---

## Framework errors

Fastify raises its own errors for validation and malformed requests, carrying
codes like `FST_ERR_VALIDATION`. Those never reach a client: the error handler
translates them into the codes above. A `FST_ERR_*` in a response would mean a
Fastify upgrade could change this API's contract without anyone deciding to.

## Quick Reference Table

| Code                  | HTTP Status | Description                           | Common Causes                             |
| --------------------- | ----------- | ------------------------------------- | ----------------------------------------- |
| `UNAUTHORIZED`        | 401         | Authentication failed                 | Missing/invalid API key                   |
| `VALIDATION_ERROR`    | 400         | Schema validation failed              | Wrong field types, missing fields         |
| `INVALID_REQUEST`     | 400         | Bad request data, or WhatsApp refused | Invalid JSON, bad JID format, failed send |
| `NOT_FOUND`           | 404         | Resource not found                    | Wrong instance ID, deleted resource       |
| `CONFLICT`            | 409         | Resource conflict                     | Duplicate creation attempt                |
| `SERVICE_UNAVAILABLE` | 503         | Service not ready                     | WhatsApp not connected                    |
| `INTERNAL_ERROR`      | 500         | Server error                          | Unexpected exception                      |

---

## Correlation IDs

Every error response includes a `correlationId` (UUID v4). This ID:

1. **Links to server logs** - Use it to find detailed error information
2. **Enables support** - Provide it when reporting issues
3. **Unique per request** - Each error generates a new ID

### Using Correlation IDs

**For debugging:**

```bash
# Search logs by correlationId
grep "a1b2c3d4-e5f6-7890-abcd-ef1234567890" /var/log/miaw-api.log
```

**For support requests:**
Include the correlationId when reporting issues:

- Timestamp of the error
- Endpoint called
- Correlation ID from the response
- Steps to reproduce

---

## Common Scenarios

### Scenario: Instance Not Connected

**Symptom:** Getting `SERVICE_UNAVAILABLE` when sending messages

**Solution:**

```bash
# 1. Check status
curl -X GET "http://localhost:3000/instances/my-instance/status" \
  -H "Authorization: Bearer $API_KEY"

# 2. If disconnected, connect
curl -X POST "http://localhost:3000/instances/my-instance/connect" \
  -H "Authorization: Bearer $API_KEY"

# 3. If QR required, get QR code
curl -X GET "http://localhost:3000/instances/my-instance/qr" \
  -H "Authorization: Bearer $API_KEY"
```

### Scenario: Invalid Phone Number

**Symptom:** Getting `INVALID_REQUEST` when sending to a phone number

**Solution:**

```bash
# Verify number format (should include country code, no + or spaces)
# Wrong: +1 234 567 8901
# Wrong: 1-234-567-8901
# Right: 12345678901

# Use the validate endpoint
curl -X POST "http://localhost:3000/instances/my-instance/contacts/check" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"phones": ["12345678901"]}'
```

### Scenario: Authentication Failures

**Symptom:** Getting `UNAUTHORIZED` on all requests

**Solution:**

```bash
# Check header format (two options):

# Option 1: Authorization header
curl -X GET "http://localhost:3000/instances" \
  -H "Authorization: Bearer your-api-key"

# Option 2: X-API-Key header
curl -X GET "http://localhost:3000/instances" \
  -H "X-API-Key: your-api-key"

# Verify no extra whitespace
# Wrong: "Bearer  your-key" (double space)
# Wrong: "your-key " (trailing space)
# Right: "Bearer your-key"
```

---

## HTTP Status Code Summary

| Status | Meaning               | Error Codes                           |
| ------ | --------------------- | ------------------------------------- |
| 400    | Bad Request           | `VALIDATION_ERROR`, `INVALID_REQUEST` |
| 401    | Unauthorized          | `UNAUTHORIZED`                        |
| 404    | Not Found             | `NOT_FOUND`                           |
| 409    | Conflict              | `CONFLICT`                            |
| 500    | Internal Server Error | `INTERNAL_ERROR`                      |
| 503    | Service Unavailable   | `SERVICE_UNAVAILABLE`                 |

---

## Version History

| Version | Changes                           |
| ------- | --------------------------------- |
| 1.0.0   | Initial error codes documentation |
