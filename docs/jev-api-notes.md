# Jev API notes — verified 2026-09-25

Read these before coding. Documentation verified, live inference NOT yet verified.

## Sources
- Index (read first): https://docs.typesafe.ai/llms.txt
- Direct HTTP: https://docs.typesafe.ai/api
- Cloudflare model: https://developers.cloudflare.com/ai/models/typesafe/jev/
- Noul: https://docs.typesafe.ai/primitives/noul
- Score: https://docs.typesafe.ai/primitives/score
- Confidence pattern: https://docs.typesafe.ai/patterns/confidence-routing
- Models/pricing: https://docs.typesafe.ai/models
- JS SDK: https://docs.typesafe.ai/sdk/javascript (`@typesafe-ai/sdk`)
- Python SDK: https://docs.typesafe.ai/sdk/python (`typesafe-ai`; imports `typesafe_sdk`)
- AI billing: https://developers.cloudflare.com/ai-gateway/features/unified-billing/
- KV consistency: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- Rate limits: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- Deploy buttons: https://developers.cloudflare.com/workers/platform/deploy-buttons/
- Automatic provisioning: https://developers.cloudflare.com/workers/wrangler/configuration/#automatic-provisioning
- Current Vitest integration: https://developers.cloudflare.com/workers/testing/vitest-integration/

## Calls
Workers: `env.AI.run("typesafe/jev", { state, questions }, { signal })`.
The published @cloudflare/workers-types 5.20260923.1 has `AiOptions.signal?: AbortSignal` and an unknown-model overload returning Record<string, unknown>; Jev is absent from its model enum. Validate the result, do not double-cast.
Direct: POST https://api.typesafe.ai/v1/systemone with Authorization: Bearer TYPESAFE_API_KEY and JSON `{model:"jev-latest",state,questions}`. Native fetch is sufficient. No SDK dependency needed.
Never send wrapper fields (`cache`) upstream. No automatic retry or fallback.

## Questions
State upstream supports string/object/array; this template intentionally accepts only string/object.
Questions map user-chosen IDs to discriminated objects. IDs are not interpreted by the model.
All types require `instructions`: string, object, or array of JSON. No invented prompt/options/levels fields.
Choice: `{type:"choice", instructions, criteria:{billing:"Payments",other:null}}`; max 255 options. Template requires at least 2.
Score: `{type:"score", instructions, criteria:["Low", "Medium", "High"]}`; 2–10 levels, each string/object/array. Levels start at ZERO. Score is a probability-weighted mean and may be fractional.
Noul: `{type:"noul", instructions, criteria?:{true:"Yes rubric",false:"No rubric"}}`.

## Response
Both providers document `{model,answers,usage:{input_tokens,output_tokens}}`.
Choice answer: `{type:"choice",choice:"billing",confidence:0.8,probabilities:{billing:0.87,other:0.13}}`.
Score answer: `{type:"score",score:1.04,confidence:0.94,legend:{"0":"Calm","1":"Frustrated","2":"Very angry"},probabilities:{"0":0,"1":0.96,"2":0.04}}`.
Noul answer: `{type:"noul",noul:0.95}`. NO separate confidence and NO probabilities field. P(yes)=noul; P(no)=1-noul.

## Approved adaptations
Return original answer fields plus decision, decision_confidence, decision_confidence_source.
Choice/Score use model confidence. Noul uses max(p,1-p) with source derived-noul, not a fabricated model-confidence field. Both strong yes and strong no may route auto. Decision rejects uncertain inference, not content.
Thresholds >=0.9 auto, >=0.6 review, lower reject; inclusive and configurable.
Lead-quality keeps raw 0–4 score and adds rating=score+1 on the preset endpoint (1–5, fractional allowed).
Confidence is a routing signal, not a correctness guarantee or a content-approval decision.

## Costs and constraints
TypeSafe charges input tokens only; output free. Cloudflare labels Jev THIRD-PARTY, not natively hosted @cf inference. Provider secret unnecessary for binding, but Cloudflare credits/billing prerequisites apply; check dashboard rates. Do not promise free inference.
KV cache is best effort and eventually consistent: duplicate calls during races, propagation, expiry, failures are possible. This was explicitly accepted; no Durable Object.
Native rate limit is supported in Wrangler as ratelimits:[{name:"RATE_LIMITER",namespace_id:"1001",simple:{limit:60,period:60}}]. It is per location, not a global hard billing quota.
KV can omit IDs for auto-provisioning in current Wrangler. Do not include fake namespace IDs.
Cloudflare renamed vitest-pool-workers to vitest-plugin; user explicitly approved current plugin and Vitest >=4.1.

## Live binding observation — 2026-09-25
Wrangler OAuth device authorization succeeded. A real `env.AI.run("typesafe/jev",...)` probe returned `AiGatewayError` with message `2021: Insufficient AI Gateway credits`. The API maps that known code to HTTP 503 / UPSTREAM_BILLING_REQUIRED without exposing arbitrary upstream error messages. Cloudflare accepts the model call path but successful model output remains unverified until credits are funded.
A real deployment automatically provisioned the KV namespace and uploaded the client key through `wrangler deploy --secrets-file .dev.vars`. The local secret file is ignored and was not committed.
