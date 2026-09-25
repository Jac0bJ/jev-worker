import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/index";
import { AppError } from "../src/errors";
import { makeCacheKey } from "../src/cache";
import { authenticate } from "../src/auth";
import { loadConfig } from "../src/config";
import type {
  AppEnv,
  JevInput,
  JevResult,
  DecisionResponse,
  BatchItem,
} from "../src/types";
import type { JevProvider } from "../src/providers/types";
import { sampleInput } from "./helpers";

function answer(input: JevInput): JevResult {
  return {
    model: "jev-test",
    usage: { input_tokens: 10, output_tokens: 3 },
    answers: Object.fromEntries(
      Object.entries(input.questions).map(([id, q]) => {
        if (q.type === "noul") return [id, { type: "noul", noul: 0.95 }];
        if (q.type === "choice")
          return [
            id,
            {
              type: "choice",
              choice: Object.keys(q.criteria)[0],
              confidence: 0.9,
              probabilities: Object.fromEntries(
                Object.keys(q.criteria).map((k, i) => [k, i === 0 ? 1 : 0]),
              ),
            },
          ];
        return [
          id,
          {
            type: "score",
            score: 2,
            confidence: 0.6,
            probabilities: Object.fromEntries(
              q.criteria.map((_, i) => [String(i), i === 2 ? 1 : 0]),
            ),
            legend: Object.fromEntries(
              q.criteria.map((v, i) => [String(i), v]),
            ),
          },
        ];
      }),
    ),
  };
}
function setup(overrides: Partial<AppEnv> = {}) {
  const key = crypto.randomUUID();
  const runtime: AppEnv = {
    ...env,
    CLIENT_API_KEYS: key,
    RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    ...overrides,
  };
  const evaluate = vi.fn(async (input: JevInput) => answer(input));
  const provider: JevProvider = {
    id: "workers-ai",
    model: "typesafe/jev",
    evaluate,
  };
  const app = createApp({ providerFactory: () => provider });
  const send = (
    path: string,
    body: unknown = sampleInput,
    init: RequestInit = {},
  ) => {
    const headers = new Headers({
      "Content-Type": "application/json",
      "X-API-Key": key,
    });
    new Headers(init.headers).forEach((value, name) =>
      headers.set(name, value),
    );
    return app.request(
      path,
      { method: "POST", body: JSON.stringify(body), ...init, headers },
      runtime,
    );
  };
  return { app, runtime, evaluate, provider, key, send };
}
afterEach(() => vi.restoreAllMocks());

describe("HTTP API in workerd", () => {
  it("serves public usage and readiness without inference", async () => {
    const s = setup();
    expect((await s.app.request("/", {}, s.runtime)).status).toBe(200);
    const health = await s.app.request("/health", {}, s.runtime);
    expect(await health.json()).toEqual({
      status: "ok",
      provider: "workers-ai",
    });
    expect(s.evaluate).not.toHaveBeenCalled();
    expect(
      (
        await s.app.request(
          "/health",
          {},
          { ...s.runtime, CLIENT_API_KEYS: "" },
        )
      ).status,
    ).toBe(503);
  });
  it("authenticates before inference and returns headers on errors", async () => {
    const s = setup({ CORS_ALLOWED_ORIGINS: "https://client.example" });
    const r = await s.send("/decide", sampleInput, {
      headers: { "X-API-Key": "wrong", Origin: "https://client.example" },
    });
    expect(r.status).toBe(401);
    expect(r.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://client.example",
    );
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(r.headers.get("X-Request-ID")).toBeTruthy();
    expect(s.evaluate).not.toHaveBeenCalled();
  });
  it("never permits production auth bypass or spoofed local host", async () => {
    const s = setup({ AUTH_ENABLED: "false" });
    expect(
      (await s.send("/decide", sampleInput, { headers: { Host: "localhost" } }))
        .status,
    ).toBe(503);
    const local = setup({ AUTH_ENABLED: "false", ENVIRONMENT: "development" });
    expect(
      (
        await local.send(
          "/decide",
          { ...sampleInput, cache: false },
          { headers: { "X-API-Key": "" } },
        )
      ).status,
    ).toBe(200);
  });
  it("validates bodies, methods, unknown paths, and content type", async () => {
    const s = setup();
    expect(
      (await s.send("/decide", { ...sampleInput, unknown: true })).status,
    ).toBe(400);
    expect((await s.send("/decide", undefined, { body: "{" })).status).toBe(
      400,
    );
    expect(
      (
        await s.send("/decide", sampleInput, {
          headers: { "Content-Type": "text/plain" },
        })
      ).status,
    ).toBe(415);
    expect((await s.app.request("/decide", {}, s.runtime)).status).toBe(405);
    expect((await s.app.request("/missing", {}, s.runtime)).status).toBe(404);
    expect(s.evaluate).not.toHaveBeenCalled();
  });
  it("enforces streaming byte limits without Content-Length", async () => {
    const s = setup();
    const response = await s.send("/decide", {
      ...sampleInput,
      state: "a".repeat(65536),
    });
    expect(response.status).toBe(413);
    expect(s.evaluate).not.toHaveBeenCalled();
  });
  it("handles CORS preflight before auth and denies other origins", async () => {
    const s = setup({ CORS_ALLOWED_ORIGINS: "https://client.example" });
    const r = await s.app.request(
      "/decide",
      {
        method: "OPTIONS",
        headers: {
          Origin: "https://client.example",
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers": "X-API-Key,Content-Type",
        },
      },
      s.runtime,
    );
    expect(r.status).toBe(204);
    expect(r.headers.get("Access-Control-Allow-Headers")).toContain(
      "X-API-Key",
    );
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(
      (
        await s.send("/decide", sampleInput, {
          headers: { Origin: "https://evil.example" },
        })
      ).status,
    ).toBe(403);
    expect(s.evaluate).not.toHaveBeenCalled();
  });
  it("uses real KV for hits and recalculates thresholds on hits", async () => {
    const s = setup();
    const first = await s.send("/decide");
    expect(first.status).toBe(200);
    expect(first.headers.get("X-Cache")).toBe("MISS");
    const initial = await first.json<DecisionResponse>();
    expect(initial.answers.urgent).toMatchObject({
      decision: "auto",
      decision_confidence_source: "derived-noul",
    });
    s.runtime.CONFIDENCE_AUTO = ".99";
    const second = await s.send("/decide");
    expect(second.headers.get("X-Cache")).toBe("HIT");
    expect(
      (await second.json<DecisionResponse>()).answers.urgent.decision,
    ).toBe("review");
    expect(s.evaluate).toHaveBeenCalledTimes(1);
  });
  it("never serves another client's cached result", async () => {
    const s = setup();
    const secondKey = crypto.randomUUID();
    s.runtime.CLIENT_API_KEYS = `${s.key},${secondKey}`;
    await s.send("/decide");
    const r = await s.send("/decide", sampleInput, {
      headers: { "X-API-Key": secondKey },
    });
    expect(r.headers.get("X-Cache")).toBe("MISS");
    expect(s.evaluate).toHaveBeenCalledTimes(2);
  });
  it("bypasses cache and degrades on failed cache writes", async () => {
    const s = setup();
    expect(
      (await s.send("/decide", { ...sampleInput, cache: false })).headers.get(
        "X-Cache",
      ),
    ).toBe("BYPASS");
    const put = vi
      .spyOn(s.runtime.JEV_CACHE, "put")
      .mockRejectedValue(new Error("kv down"));
    const r = await s.send("/decide");
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Cache")).toBe("ERROR");
    put.mockRestore();
  });
  it("ignores a poisoned cache result and obtains a validated answer", async () => {
    const s = setup();
    const identity = await authenticate(
      new Request("https://worker.test", { headers: { "X-API-Key": s.key } }),
      s.runtime,
      loadConfig(s.runtime),
    );
    const key = await makeCacheKey(sampleInput, s.provider, identity);
    await s.runtime.JEV_CACHE.put(
      key,
      JSON.stringify({
        expiresAt: Date.now() + 60000,
        result: {
          model: "poison",
          answers: {},
          usage: { input_tokens: 0, output_tokens: 0 },
        },
      }),
    );
    const r = await s.send("/decide");
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Cache")).toBe("ERROR");
    expect(s.evaluate).toHaveBeenCalledTimes(1);
  });
  it("counts hits and each batch item against the rate limit", async () => {
    const s = setup();
    const limit = vi.spyOn(s.runtime.RATE_LIMITER, "limit");
    await s.send("/decide");
    await s.send("/decide");
    expect(limit).toHaveBeenCalledTimes(2);
    limit.mockResolvedValue({ success: false });
    const r = await s.send("/decide");
    expect(r.status).toBe(429);
    expect(r.headers.get("Retry-After")).toBe("60");
    expect(s.evaluate).toHaveBeenCalledTimes(1);
    const batch = await s.send("/decide/batch", [sampleInput, sampleInput]);
    expect(
      (await batch.json<{ results: BatchItem[] }>()).results.map(
        (r) => r.status,
      ),
    ).toEqual([429, 429]);
    expect(limit).toHaveBeenCalledTimes(5);
  });
  it("validates an entire batch before any inference", async () => {
    const s = setup();
    expect(
      (
        await s.send("/decide/batch", [
          sampleInput,
          { state: "missing questions" },
        ])
      ).status,
    ).toBe(400);
    expect((await s.send("/decide/batch", [])).status).toBe(400);
    expect(
      (
        await s.send(
          "/decide/batch",
          Array.from({ length: 21 }, () => sampleInput),
        )
      ).status,
    ).toBe(400);
    expect(s.evaluate).not.toHaveBeenCalled();
  });
  it("preserves batch order and individual failures", async () => {
    const s = setup();
    s.evaluate.mockImplementation(async (input) => {
      if (input.state === "fail")
        throw new AppError(503, "UPSTREAM_UNAVAILABLE", "Jev unavailable.");
      return answer(input);
    });
    const r = await s.send("/decide/batch", [
      { ...sampleInput, state: "fail" },
      { ...sampleInput, state: "success" },
    ]);
    expect(r.status).toBe(200);
    const results = (await r.json<{ results: BatchItem[] }>()).results;
    expect(results.map((r) => [r.index, r.status])).toEqual([
      [0, 503],
      [1, 200],
    ]);
    expect(r.headers.get("X-Cache")).toBe("MIXED");
  });
  it("runs every preset and adds the requested lead rating", async () => {
    const s = setup();
    for (const name of [
      "form-spam",
      "comment-moderation",
      "lead-quality",
      "support-route",
    ]) {
      const r = await s.send(`/preset/${name}`, {
        text: "A realistic submission",
      });
      expect(r.status).toBe(200);
      const result = await r.json<DecisionResponse>();
      if (name === "lead-quality")
        expect(result.answers.quality).toMatchObject({ score: 2, rating: 3 });
    }
    expect(
      (await s.send("/preset/constructor", { text: "hello" })).status,
    ).toBe(404);
    expect((await s.send("/preset/unknown", { text: "hello" })).status).toBe(
      404,
    );
  });
  it("returns 504 and aborts upstream on deadline", async () => {
    const s = setup({ UPSTREAM_TIMEOUT_MS: "5" });
    let signal: AbortSignal | undefined;
    const provider: JevProvider = {
      ...s.provider,
      evaluate: (_input, options) => {
        signal = options.signal;
        return new Promise(() => {});
      },
    };
    const app = createApp({ providerFactory: () => provider });
    const r = await app.request(
      "/decide",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": s.key },
        body: JSON.stringify(sampleInput),
      },
      s.runtime,
    );
    expect(r.status).toBe(504);
    expect(signal?.aborted).toBe(true);
  });
  it("logs one safe line per item without request text or arbitrary answer IDs", async () => {
    const s = setup();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await s.send("/decide", {
      state: "SENSITIVE STATE",
      questions: {
        "PRIVATE QUESTION ID": {
          type: "noul",
          instructions: "SENSITIVE RUBRIC",
        },
      },
    });
    expect(log).toHaveBeenCalledTimes(1);
    const output = JSON.stringify(log.mock.calls);
    for (const secret of [
      s.key,
      "SENSITIVE STATE",
      "PRIVATE QUESTION ID",
      "SENSITIVE RUBRIC",
    ])
      expect(output).not.toContain(secret);
  });
});
