# Verification — 2026-09-25

## Automated checks

- ESLint: passed.
- TypeScript: passed.
- Vitest in workerd: 60 tests across 12 files passed. Remote bindings disabled.
- Wrangler deploy dry run: passed (865.21 KiB upload / 144.11 KiB gzip).
- Fresh Sol reviewer: one upstream answer-consistency finding, fixed and independently rechecked.

Tests cover HTTP routes, actual local KV, injected provider results, adapter payloads/errors, auth, cache isolation, rate limits, CORS, body limits, batch ordering/concurrency, presets, confidence boundaries, logging and timeout cancellation. They do not establish live model availability or accuracy.

## Live deployment and curl verification

Deployed to Cloudflare on 2026-09-25. Wrangler reused the automatically provisioned KV namespace, retained the client secret, and enabled Workers observability. Version: `bb6e5856-e55a-49f9-8bb4-9de729d65846`. Upload: 865.53 KiB / 144.23 KiB gzip; startup: 14 ms.

All public and protected routes were exercised with curl. Readiness, authentication, validation, method handling, and CORS behaved as expected. Real Jev calls reached AI Gateway but returned insufficient-credit errors; the API now reports HTTP 503 `UPSTREAM_BILLING_REQUIRED`. Batch requests preserve this as an item-level 503 inside their HTTP 200 envelope. **Successful live inference, live cache hits, and real model output validation remain unverified until the account has credits.** Fixture-based tests cover these code paths but do not replace a successful live call.

Cloudflare documents the credit requirement and top-up steps in its [unified billing guide](https://developers.cloudflare.com/ai-gateway/features/unified-billing/). `/health` checks configuration readiness and intentionally makes no inference call.

Requests used synthetic input `Please send my invoice.` with a binary billing question, and preset text `Hello, please send pricing for 30 seats.`. Authenticated requests supplied the deployed client secret via curl's standard-input config; no secret is included here. Selected headers and response bodies below are actual production outputs.

### usage — GET /

```http
HTTP 200
content-type: application/json
cache-control: no-store
vary: Origin
x-request-id: 27058513-4702-4e80-b663-0837a2b0bbfb

{"name":"jev-worker","version":"0.1.0","auth":"X-API-Key","endpoints":{"POST /decide":"{state: string|object, questions: {...}, cache?: boolean}","POST /decide/batch":"Array of decision requests","POST /preset/:name":"{text: string}","GET /health":"Configuration readiness; no inference"},"presets":[{"name":"form-spam","description":"Detect likely spam in a submitted form message."},{"name":"comment-moderation","description":"Classify a comment and estimate moderation severity."},{"name":"lead-quality","description":"Score the quality of an inbound sales lead."},{"name":"support-route","description":"Route a support request to the right department."}],"docs":"https://github.com/Jac0bJ/jev-worker"}
```

### health — GET /health

```http
HTTP 200
content-type: application/json
cache-control: no-store
vary: Origin
x-request-id: 104cad18-4e34-4621-bd63-940091a72ac0

{"status":"ok","provider":"workers-ai"}
```

### unauthorized — POST /decide

```http
HTTP 401
content-type: application/json
cache-control: no-store
vary: Origin
x-request-id: 2caec520-d36d-4494-a338-4c96e10c72ee

{"error":{"code":"UNAUTHORIZED","message":"A valid API key is required."}}
```

### invalid-body — POST /decide

```http
HTTP 400
content-type: application/json
cache-control: no-store
vary: Origin
x-request-id: 4f7d8a8c-2305-4791-b851-768466993fc2

{"error":{"code":"VALIDATION_ERROR","message":"Invalid request body.","issues":[{"path":["state"],"message":"Invalid value"},{"path":["questions"],"message":"Invalid type"}]}}
```

### wrong-method — GET /decide

```http
HTTP 405
content-type: application/json
allow: POST, OPTIONS
cache-control: no-store
vary: Origin
x-request-id: dc8a84e1-142d-4586-b61a-7f1538f31c91

{"error":{"code":"METHOD_NOT_ALLOWED","message":"Method not allowed for this endpoint."}}
```

### not-found — GET /missing

```http
HTTP 404
content-type: application/json
cache-control: no-store
vary: Origin
x-request-id: fc388229-93ef-461e-b102-87b648c4804c

{"error":{"code":"NOT_FOUND","message":"Endpoint not found."}}
```

### cors-denied — POST /decide

```http
HTTP 403
content-type: application/json
cache-control: no-store
vary: Origin
x-request-id: 0207ff2d-eead-4c3a-b199-020f15dc9fbe

{"error":{"code":"CORS_FORBIDDEN","message":"Origin is not allowed."}}
```

### preflight — OPTIONS /decide

```http
HTTP 204
cache-control: no-store
vary: Origin
x-request-id: d6a80c6d-df1c-4c96-bd39-be433b69d11a
```

### decide — POST /decide

```http
HTTP 503
content-type: application/json
cache-control: no-store
vary: Origin
x-request-id: 5be24f7a-4c48-419f-ba12-eb7f1e708b8c

{"error":{"code":"UPSTREAM_BILLING_REQUIRED","message":"Cloudflare AI Gateway credits are required to use Jev."}}
```

### batch — POST /decide/batch

```http
HTTP 200
content-type: application/json
cache-control: no-store
vary: Origin
x-cache: ERROR
x-request-id: c08d743f-df58-4a4e-8fb0-c6c18cf51dc3

{"results":[{"index":0,"status":503,"error":{"code":"UPSTREAM_BILLING_REQUIRED","message":"Cloudflare AI Gateway credits are required to use Jev."}}]}
```

### form-spam — POST /preset/form-spam

```http
HTTP 503
content-type: application/json
cache-control: no-store
vary: Origin
x-request-id: bdb9e34e-d694-4d02-bda9-285992609f0a

{"error":{"code":"UPSTREAM_BILLING_REQUIRED","message":"Cloudflare AI Gateway credits are required to use Jev."}}
```

### comment-moderation — POST /preset/comment-moderation

```http
HTTP 503
content-type: application/json
cache-control: no-store
vary: Origin
x-request-id: fc6c2e21-aa59-413d-ba50-671fc71c4ca2

{"error":{"code":"UPSTREAM_BILLING_REQUIRED","message":"Cloudflare AI Gateway credits are required to use Jev."}}
```

### lead-quality — POST /preset/lead-quality

```http
HTTP 503
content-type: application/json
cache-control: no-store
vary: Origin
x-request-id: 101f1317-9c76-46f2-a6c7-ebe5f423652b

{"error":{"code":"UPSTREAM_BILLING_REQUIRED","message":"Cloudflare AI Gateway credits are required to use Jev."}}
```

### support-route — POST /preset/support-route

```http
HTTP 503
content-type: application/json
cache-control: no-store
vary: Origin
x-request-id: 20d9be9d-3364-4d72-ab4e-a2cec298d427

{"error":{"code":"UPSTREAM_BILLING_REQUIRED","message":"Cloudflare AI Gateway credits are required to use Jev."}}
```

## Historical curl transcript: local-only Wrangler

Run: `npx wrangler dev --local --ip 127.0.0.1 --port 8787 --var ENVIRONMENT:development --var CLIENT_API_KEYS:local-smoke-only --var CORS_ALLOWED_ORIGINS:http://localhost:8000`.

These are actual HTTP outputs from the application, not fabricated examples. The AI binding cannot infer in `--local` mode, so decision routes correctly return upstream errors in this transcript. Successful decision behavior is tested with injected fixtures in workerd. This historical local-only run preceded the live deployment below. The direct provider still needs a TypeSafe credential.

Requests used `curl --silent --show-error --max-time 20 --include --request METHOD URL`, plus JSON and `X-API-Key` headers for protected requests. Decision input: `{"state":"Please send my invoice.","questions":{"billing":{"type":"noul","instructions":"Is this about billing?"}}}`. Preset text: `Hello, please send pricing for 30 seats.`. The batch contains one decision item. The unauthorized case omits the key; invalid-body sends `{}`; CORS cases use the localhost and denied.example origins.

### usage — GET /

```http
HTTP/1.1 200 OK
Content-Length: 705
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Request-ID: 30bd42ec-23b5-43b1-86fb-ae0a97af5e25
access-control-expose-headers: X-Cache, X-Request-ID

{"name":"jev-worker","version":"0.1.0","auth":"X-API-Key","endpoints":{"POST /decide":"{state: string|object, questions: {...}, cache?: boolean}","POST /decide/batch":"Array of decision requests","POST /preset/:name":"{text: string}","GET /health":"Configuration readiness; no inference"},"presets":[{"name":"form-spam","description":"Detect likely spam in a submitted form message."},{"name":"comment-moderation","description":"Classify a comment and estimate moderation severity."},{"name":"lead-quality","description":"Score the quality of an inbound sales lead."},{"name":"support-route","description":"Route a support request to the right department."}],"docs":"https://github.com/Jac0bJ/jev-worker"}
```

### health — GET /health

```http
HTTP/1.1 200 OK
Content-Length: 39
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Request-ID: bd642a27-7d95-48a3-ac53-7d113d184f0b
access-control-expose-headers: X-Cache, X-Request-ID

{"status":"ok","provider":"workers-ai"}
```

### unauthorized — POST /decide

```http
HTTP/1.1 401 Unauthorized
Content-Length: 74
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Request-ID: 7a304b9c-189d-44a8-bccc-69a7bf1004e8
access-control-expose-headers: X-Cache, X-Request-ID

{"error":{"code":"UNAUTHORIZED","message":"A valid API key is required."}}
```

### invalid-body — POST /decide

```http
HTTP/1.1 400 Bad Request
Content-Length: 175
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Request-ID: bdf20982-1624-4499-9c0a-501c75eed70a
access-control-expose-headers: X-Cache, X-Request-ID

{"error":{"code":"VALIDATION_ERROR","message":"Invalid request body.","issues":[{"path":["state"],"message":"Invalid value"},{"path":["questions"],"message":"Invalid type"}]}}
```

### wrong-method — GET /decide

```http
HTTP/1.1 405 Method Not Allowed
Content-Length: 89
Content-Type: application/json
Allow: POST, OPTIONS
Cache-Control: no-store
Vary: Origin
X-Request-ID: aaff86c5-5b06-45c3-832a-1d65c28112d2
access-control-expose-headers: X-Cache, X-Request-ID

{"error":{"code":"METHOD_NOT_ALLOWED","message":"Method not allowed for this endpoint."}}
```

### not-found — GET /missing

```http
HTTP/1.1 404 Not Found
Content-Length: 62
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Request-ID: 41f093c8-47eb-4be3-8995-4aa7e465fe51
access-control-expose-headers: X-Cache, X-Request-ID

{"error":{"code":"NOT_FOUND","message":"Endpoint not found."}}
```

### cors-preflight — OPTIONS /decide

```http
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://localhost:8000
Cache-Control: no-store
Vary: Origin
Access-Control-Allow-Headers: Content-Type, X-API-Key
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Expose-Headers: X-Cache, X-Request-ID
X-Request-ID: 7ea9ab90-f12f-40ff-9801-1a16e80227d9
```

### cors-denied — POST /decide

```http
HTTP/1.1 403 Forbidden
Content-Length: 70
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Request-ID: 5114b711-5b01-47dc-926f-a3009a619826

{"error":{"code":"CORS_FORBIDDEN","message":"Origin is not allowed."}}
```

### decide-local-ai — POST /decide

```http
HTTP/1.1 502 Bad Gateway
Content-Length: 67
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Request-ID: ceb4af2d-7891-47c3-a771-24d784ae494e
access-control-expose-headers: X-Cache, X-Request-ID

{"error":{"code":"UPSTREAM_ERROR","message":"Jev request failed."}}
```

### batch-local-ai — POST /decide/batch

```http
HTTP/1.1 200 OK
Content-Length: 104
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Cache: ERROR
X-Request-ID: 10c1823e-673e-4983-827d-9f1840ded99d
access-control-expose-headers: X-Cache, X-Request-ID

{"results":[{"index":0,"status":502,"error":{"code":"UPSTREAM_ERROR","message":"Jev request failed."}}]}
```

### form-spam — POST /preset/form-spam

```http
HTTP/1.1 502 Bad Gateway
Content-Length: 67
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Request-ID: 2892e484-3279-43e6-a51e-ba8dd649e50d
access-control-expose-headers: X-Cache, X-Request-ID

{"error":{"code":"UPSTREAM_ERROR","message":"Jev request failed."}}
```

### comment-moderation — POST /preset/comment-moderation

```http
HTTP/1.1 502 Bad Gateway
Content-Length: 67
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Request-ID: bba0b19c-b68d-425c-81ea-2acb934e843d
access-control-expose-headers: X-Cache, X-Request-ID

{"error":{"code":"UPSTREAM_ERROR","message":"Jev request failed."}}
```

### lead-quality — POST /preset/lead-quality

```http
HTTP/1.1 502 Bad Gateway
Content-Length: 67
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Request-ID: 1ddfe2ac-ce7f-4aee-bd99-cd02ecf16e7e
access-control-expose-headers: X-Cache, X-Request-ID

{"error":{"code":"UPSTREAM_ERROR","message":"Jev request failed."}}
```

### support-route — POST /preset/support-route

```http
HTTP/1.1 502 Bad Gateway
Content-Length: 67
Content-Type: application/json
Cache-Control: no-store
Vary: Origin
X-Request-ID: 78459a88-9a53-47f0-9c2a-d8c52918c842
access-control-expose-headers: X-Cache, X-Request-ID

{"error":{"code":"UPSTREAM_ERROR","message":"Jev request failed."}}
```
