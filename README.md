# jev-worker

A Cloudflare Worker that exposes [TypeSafe Jev](https://docs.typesafe.ai/api) as a small HTTP decision API. It validates requests and model responses, routes answers by confidence, caches successful inference in KV, and includes four editable presets. Node.js 22.13+ is needed for development.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Jac0bJ/jev-worker)

## Two-minute deployment

With a Cloudflare account and inference credits ready:

1. Click **Deploy to Cloudflare** above and connect your GitHub account.
2. Enter a strong random `CLIENT_API_KEYS` value when prompted. AI and KV bindings are provisioned from the template; no TypeSafe key is needed.
3. Open the deployed `/health` URL, then try the form-spam curl below with your key.

For the CLI path, sign in with `npx wrangler login`, then:

```sh
git clone https://github.com/Jac0bJ/jev-worker.git
cd jev-worker
npm ci
npm run deploy
npx wrangler secret put CLIENT_API_KEYS
```

When prompted for `CLIENT_API_KEYS`, enter a strong random key (for example, generate one with `openssl rand -hex 32`). Keep it outside source control. Wrangler provisions the `JEV_CACHE` KV namespace from `wrangler.jsonc`; no namespace ID is needed in the template. Check `https://<your-worker>.workers.dev/health` after setting the secret. The button above uses the Cloudflare Git deployment flow. [Cloudflare's deploy-button guide](https://developers.cloudflare.com/workers/platform/deploy-buttons/) describes account setup and automatic resource provisioning. This flow may take longer than two minutes when the account or billing is not ready.

For local development, copy `.dev.vars.example` to `.dev.vars`, fill `CLIENT_API_KEYS`, and run `npm run dev`. The dev script sets `ENVIRONMENT=development`; it **does not** turn off authentication. Local requests to the Workers AI binding still use a remote model and may incur charges. An explicit `AUTH_ENABLED=false` is accepted only in development. Run `npm run lint`, `npm run typecheck`, and `npm test` before a change.

## API

Set `BASE_URL` to your Worker URL and `CLIENT_KEY` to one of the comma-separated values in `CLIENT_API_KEYS`. Protected calls send `X-API-Key` and JSON. All responses include `X-Request-ID` and `Cache-Control: no-store`; successful inference also includes `X-Cache` (`HIT`, `MISS`, `BYPASS`, or `ERROR`). Errors use `{ "error": { "code": "...", "message": "...", "issues": [...] } }`.

```sh
export BASE_URL=http://localhost:8787
export CLIENT_KEY='<your-client-key>'
```

Public discovery and readiness endpoints:

```sh
curl "$BASE_URL/"
curl "$BASE_URL/health"
```

`GET /` lists routes and preset names. `GET /health` checks configuration and bindings without calling Jev. Protected requests require the client key.

Custom decision, using Jev's `noul` (binary), `choice`, and `score` question forms:

```sh
curl -sS "$BASE_URL/decide" -H "X-API-Key: $CLIENT_KEY" -H 'Content-Type: application/json' \
  --data '{"state":"Please contact me about team pricing.","questions":{"sales":{"type":"noul","instructions":"Is this a genuine sales inquiry?","criteria":{"true":"Real request about buying","false":"Spam or unrelated"}}},"cache":true}'
```

`state` accepts a nonempty string or JSON object. Each question has a user-chosen ID and `instructions` (string, object, or array). `choice.criteria` maps 2–255 option IDs to descriptions or `null`; `score.criteria` is an array of 2–10 ordered levels, numbered from zero. Use `"cache": false` to bypass KV for an item. The response retains `model`, `usage`, and each original answer, and adds `decision`, `decision_confidence`, and `decision_confidence_source` to every answer.

Batch decisions accept a **bare JSON array** and return `{ "results": [{ "index": 0, "status": 200, "data": { ... }, "cache": "MISS" }] }`. Items stay in input order; an item error does not cancel its siblings. The default limit is 20 items with concurrency 4. Run the complete Node example with `JEV_WORKER_URL="$BASE_URL" JEV_CLIENT_API_KEY="$CLIENT_KEY" node examples/batch.mjs`.

```sh
curl -sS "$BASE_URL/decide/batch" -H "X-API-Key: $CLIENT_KEY" -H 'Content-Type: application/json' \
  --data '[{"state":"I need a receipt.","questions":{"billing":{"type":"noul","instructions":"Is this about billing?"}}},{"state":"Where is the setup guide?","questions":{"help":{"type":"noul","instructions":"Does this request need product help?"}}}]'
```

Presets take exactly `{ "text": "..." }`:

```sh
curl -sS "$BASE_URL/preset/form-spam" -H "X-API-Key: $CLIENT_KEY" -H 'Content-Type: application/json' --data '{"text":"Hello, I have a question about your service."}'
curl -sS "$BASE_URL/preset/comment-moderation" -H "X-API-Key: $CLIENT_KEY" -H 'Content-Type: application/json' --data '{"text":"Thanks for sharing this article."}'
curl -sS "$BASE_URL/preset/lead-quality" -H "X-API-Key: $CLIENT_KEY" -H 'Content-Type: application/json' --data '{"text":"We have 30 seats and need a quote this week."}'
curl -sS "$BASE_URL/preset/support-route" -H "X-API-Key: $CLIENT_KEY" -H 'Content-Type: application/json' --data '{"text":"I cannot sign in to my account."}'
```

The presets answer spam (`noul`), moderation category and severity (`choice` and `score`), lead quality (`score`), and support department (`choice`). The lead-quality preset adds `rating = score + 1`, so its 0–4 raw score is also a possibly fractional 1–5 rating. To make your own preset, add a `questions`/`description` module under `src/presets/`, register it in `src/presets/index.ts`, and redeploy. For a custom question without redeploying, call `/decide` as above. [The local browser demo](examples/form-spam.html) requires a key entered at runtime; it does not save the key. Serve it with `python3 -m http.server 8000`, run the Worker with `npm run dev -- --var CORS_ALLOWED_ORIGINS:http://localhost:8000`, then open `http://localhost:8000/examples/form-spam.html`. Browser users can inspect any key supplied to a page, so use a dedicated demo key.

## Routing and operations

By default, `decision_confidence >= 0.9` routes to `auto`, `>= 0.6` to `review`, and lower values to `reject`. Thresholds are inclusive and configurable with `CONFIDENCE_AUTO` and `CONFIDENCE_REVIEW`. For `choice` and `score`, the confidence comes from Jev. For `noul`, it is derived as `max(noul, 1 - noul)` and marked `derived-noul`; a strong "no" may therefore route to `auto`. These labels describe confidence for routing, not correctness or content approval.

`JEV_PROVIDER=workers-ai` uses Cloudflare's `AI` binding and needs no TypeSafe API secret. To use TypeSafe's direct API, set `JEV_PROVIDER` to `typesafe` in `wrangler.jsonc`, set `TYPESAFE_API_KEY` with `npx wrangler secret put TYPESAFE_API_KEY` (or in local `.dev.vars`), and redeploy with `npm run deploy`. Calls go to `https://api.typesafe.ai/v1/systemone` with `jev-latest`. The provider is selected per deployment; there is no automatic fallback or retry.

Defaults in `wrangler.jsonc` are a one-hour KV TTL, a 15-second upstream timeout, 20 batch items, concurrency 4, authentication on, and input logging off. `CLIENT_API_KEYS` may contain comma-separated keys for rotation. The built-in rate limiter allows 60 decision items per minute per client fingerprint and Cloudflare location; it is not a global spending cap. KV is eventually consistent and best effort, so concurrent requests can make duplicate billable inference calls and cache reads or writes can fail. `X-Cache: ERROR` reports a cache failure while returning a valid inference result. Cache hits retain the original inference `usage`; those tokens are not newly billed by this Worker. Keys are client-isolated, so key rotation starts a separate cache. A model alias may change before a cached answer expires. Requests are limited to 64 KiB per decision, 1 MiB per batch, and 32 questions per item.

Set `CORS_ALLOWED_ORIGINS` to comma-separated exact origins for browser clients; the default denies cross-origin browser requests. `LOG_INPUTS=true` opts into logging raw state.

Jev is a third-party model on Cloudflare Workers AI, not a model hosted natively by Cloudflare. TypeSafe [prices Jev by input tokens](https://docs.typesafe.ai/models); output tokens are free under its listed pricing. Cloudflare credits, billing prerequisites, and current rates may differ by path, so check the [Cloudflare model page](https://developers.cloudflare.com/ai/models/typesafe/jev/) and your dashboard before running traffic. Local inference can also be billable. No live inference is required by CI.

## Release

Pull requests run lint, typecheck, and deterministic workerd tests without secrets. Maintainer `v*` tags run the same checks and then deploy with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` GitHub secrets. See [CONTRIBUTING.md](CONTRIBUTING.md) for development expectations. MIT licensed.
