# Verification — 2026-09-25

## Automated checks

- ESLint: passed.
- TypeScript: passed.
- Vitest in workerd: 58 tests across 12 files passed. Remote bindings disabled.
- Wrangler deploy dry run: passed (865.21 KiB upload / 144.11 KiB gzip).
- Fresh Sol reviewer: one upstream answer-consistency finding, fixed and independently rechecked.

Tests cover HTTP routes, actual local KV, injected provider results, adapter payloads/errors, auth, cache isolation, rate limits, CORS, body limits, batch ordering/concurrency, presets, confidence boundaries, logging and timeout cancellation. They do not establish live model availability or accuracy.

## Actual curl transcript: local-only Wrangler

Run: `npx wrangler dev --local --ip 127.0.0.1 --port 8787 --var ENVIRONMENT:development --var CLIENT_API_KEYS:local-smoke-only --var CORS_ALLOWED_ORIGINS:http://localhost:8000`.

These are actual HTTP outputs from the application, not fabricated examples. The AI binding cannot infer in `--local` mode, so decision routes correctly return upstream errors in this transcript. Successful decision behavior is tested with injected fixtures in workerd. Live inference and account deployment are pending Cloudflare login; the direct provider also needs a TypeSafe credential.

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
