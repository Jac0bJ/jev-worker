import { Hono } from "hono";
import { loadConfig, assertReady } from "./config";
import { asAppError, AppError } from "./errors";
import { corsHeaders, handlePreflight } from "./cors";
import { authenticate } from "./auth";
import { readJson, MAX_BATCH_BYTES, MAX_ITEM_BYTES } from "./http";
import { parseDecisionRequest, parseBatchRequest } from "./schemas";
import { createProvider } from "./providers";
import { createDecisionService } from "./service";
import { presets } from "./presets";
import { resolvePreset, decoratePreset } from "./routes/preset";
import { runBatch, summarizeBatchCache } from "./routes/batch";
import type { AppEnv, AppConfig } from "./types";
import type { JevProvider } from "./providers/types";

type HonoEnv = { Bindings: AppEnv; Variables: { config: AppConfig; requestId: string } };
export function createApp(options: { providerFactory?: (env: AppEnv, config: AppConfig) => JevProvider } = {}) {
  const app = new Hono<HonoEnv>();
  const providerFactory = options.providerFactory ?? createProvider;
  app.onError((error, c) => {
    const safe = asAppError(error);
    if (safe.status === 429) c.header("Retry-After", "60");
    return c.json({ error: safe.toJSON() }, safe.status);
  });
  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    c.header("X-Request-ID", requestId);
    c.header("Cache-Control", "no-store");
    c.header("Vary", "Origin");
    const config = loadConfig(c.env);
    c.set("config", config);
    const headers = corsHeaders(c.req.raw, config);
    headers.forEach((value, key) => c.header(key, value));
    const preflight = handlePreflight(c.req.raw, config);
    if (preflight) {
      preflight.headers.set("X-Request-ID", requestId);
      preflight.headers.set("Cache-Control", "no-store");
      return preflight;
    }
    await next();
  });
  app.get("/", c => c.json({
    name: "jev-worker", version: "0.1.0", auth: "X-API-Key",
    endpoints: { "POST /decide": "{state: string|object, questions: {...}, cache?: boolean}", "POST /decide/batch": "Array of decision requests", "POST /preset/:name": "{text: string}", "GET /health": "Configuration readiness; no inference" },
    presets: Object.values(presets).map(({ name, description }) => ({ name, description })),
    docs: "https://github.com/Jac0bJ/jev-worker",
  }));
  app.get("/health", c => {
    assertReady(c.env, c.get("config"));
    return c.json({ status: "ok", provider: c.get("config").provider });
  });
  app.post("/decide", async c => {
    const config = c.get("config");
    const client = await authenticate(c.req.raw, c.env, config);
    const input = parseDecisionRequest(await readJson(c.req.raw, MAX_ITEM_BYTES));
    const process = createDecisionService({ env: c.env, config, client, provider: providerFactory(c.env, config), requestId: c.get("requestId") });
    const outcome = await process(input);
    c.header("X-Cache", outcome.cache);
    return c.json(outcome.data);
  });
  app.post("/decide/batch", async c => {
    const config = c.get("config");
    const client = await authenticate(c.req.raw, c.env, config);
    const items = parseBatchRequest(await readJson(c.req.raw, MAX_BATCH_BYTES), config.batchMaxItems);
    const process = createDecisionService({ env: c.env, config, client, provider: providerFactory(c.env, config), requestId: c.get("requestId") });
    const results = await runBatch(items, config.batchConcurrency, process);
    c.header("X-Cache", summarizeBatchCache(results));
    return c.json({ results });
  });
  app.post("/preset/:name", async c => {
    const config = c.get("config");
    const client = await authenticate(c.req.raw, c.env, config);
    const { preset, input } = resolvePreset(c.req.param("name"), await readJson(c.req.raw, MAX_ITEM_BYTES));
    const process = createDecisionService({ env: c.env, config, client, provider: providerFactory(c.env, config), requestId: c.get("requestId"), preset: preset.name });
    const outcome = await process(input);
    c.header("X-Cache", outcome.cache);
    return c.json(decoratePreset(preset.name, outcome.data));
  });
  for (const path of ["/", "/health", "/decide", "/decide/batch", "/preset/:name"]) {
    app.all(path, c => { c.header("Allow", path === "/" || path === "/health" ? "GET, HEAD, OPTIONS" : "POST, OPTIONS"); throw new AppError(405, "METHOD_NOT_ALLOWED", "Method not allowed for this endpoint."); });
  }
  app.notFound(() => { throw new AppError(404, "NOT_FOUND", "Endpoint not found."); });
  return app;
}
export default createApp();
