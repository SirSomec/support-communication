# Public API Examples

These examples use placeholder secrets only. Never paste live API keys, webhook secrets or provider tokens into docs, tickets or logs.

## Sandbox SDK identify

Use the stage environment for SDK integration tests and QA fixtures.

```http
POST /api/v1/public/sdk/identify?environment=stage HTTP/1.1
Host: api.support.local
Authorization: Bearer sk_test_<sandbox_public_api_key>
Content-Type: application/json
```

```json
{
  "externalId": "sandbox-client-001",
  "traits": {
    "environment": "stage",
    "plan": "qa"
  }
}
```

Expected response shape:

```json
{
  "service": "integrationService",
  "operation": "identifyPublicClient",
  "status": "ok",
  "data": {
    "accepted": true,
    "acceptedEnvironment": "stage",
    "externalId": "sandbox-client-001",
    "rawKeyExposed": false
  }
}
```

## Signed webhook receive

Inbound webhook requests must include timestamp, nonce and HMAC signature headers. Build the signature over the exact raw request body.

```http
POST /api/v1/webhooks/vk HTTP/1.1
Host: api.support.local
Content-Type: application/json
X-Webhook-Timestamp: 2026-06-30T13:05:00.000Z
X-Webhook-Nonce: nonce-<unique-event-id>
X-Webhook-Signature: sha256=<hmac_sha256_hex>
```

Signature formula:

```text
X-Webhook-Signature = "sha256=" + HMAC_SHA256(webhook_secret, "{timestamp}.{raw_body}")
```

```json
{
  "conversationId": "client-001",
  "eventId": "vk-event-001",
  "text": "Hello"
}
```

Replay the same nonce is denied as `webhook_nonce_replay`; retry with a new nonce only when the upstream event id is also new.

## Production SDK identify

Use production only after the client application is bound to a live public API key with the `clients:identify` scope.

```http
POST /api/v1/public/sdk/identify?environment=production HTTP/1.1
Host: api.support.local
Authorization: Bearer sk_live_<production_public_api_key>
Content-Type: application/json
```

```json
{
  "externalId": "client-001",
  "traits": {
    "plan": "enterprise"
  }
}
```

Expected response shape:

```json
{
  "service": "integrationService",
  "operation": "identifyPublicClient",
  "status": "ok",
  "data": {
    "accepted": true,
    "acceptedEnvironment": "production",
    "externalId": "client-001",
    "rawKeyExposed": false
  }
}
```
