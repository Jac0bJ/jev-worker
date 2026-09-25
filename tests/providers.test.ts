import { describe, expect, it, vi } from "vitest";
import { createTypeSafeProvider } from "../src/providers/typesafe";
import { createWorkersAIProvider } from "../src/providers/workers-ai";
import { createProvider } from "../src/providers";
import type { AppEnv } from "../src/types";
import { config, sampleInput, sampleResult } from "./helpers";

const signal = new AbortController().signal;
describe("TypeSafe HTTP adapter", () => {
  it("posts only the documented payload and validates the answer", async () => {
    const fetcher = vi.fn(async (_url: string, _init: RequestInit) => { void _url; void _init; return Response.json(sampleResult); });
    const provider = createTypeSafeProvider("test-key", fetcher as typeof fetch);
    await expect(provider.evaluate(sampleInput, { signal })).resolves.toEqual(sampleResult);
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(init.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(JSON.parse(String(init.body))).toEqual({ model: "jev-latest", ...sampleInput });
    expect(init.signal).toBe(signal);
  });
  it("rejects oversized, malformed and failed upstream responses", async () => {
    const oversized = createTypeSafeProvider("key", vi.fn(async () => new Response("x", { headers: { "content-length": "2097153" } })) as typeof fetch);
    await expect(oversized.evaluate(sampleInput, { signal })).rejects.toMatchObject({ code: "UPSTREAM_INVALID_RESPONSE" });
    const failed = createTypeSafeProvider("key", vi.fn(async () => new Response("secret", { status: 401 })) as typeof fetch);
    await expect(failed.evaluate(sampleInput, { signal })).rejects.toMatchObject({ code: "UPSTREAM_AUTH_ERROR" });
  });
  it.each([
    [401, 503, "UPSTREAM_AUTH_ERROR"],
    [403, 503, "UPSTREAM_AUTH_ERROR"],
    [429, 503, "UPSTREAM_RATE_LIMITED"],
    [500, 503, "UPSTREAM_UNAVAILABLE"],
    [400, 502, "UPSTREAM_ERROR"],
  ])("maps HTTP %i without exposing the response body", async (status, expectedStatus, code) => {
    const fetcher = vi.fn(async () => new Response("private upstream details", { status }));
    const provider = createTypeSafeProvider("key", fetcher as typeof fetch);
    await expect(provider.evaluate(sampleInput, { signal })).rejects.toMatchObject({ status: expectedStatus, code });
  });
});
describe("Workers AI adapter", () => {
  it("uses the Jev binding and validates the result", async () => {
    const run = vi.fn(async () => sampleResult);
    const provider = createWorkersAIProvider({ AI: { run } as unknown as AppEnv["AI"] });
    await expect(provider.evaluate(sampleInput, { signal })).resolves.toEqual(sampleResult);
    expect(run).toHaveBeenCalledWith("typesafe/jev", sampleInput, { signal });
  });
  it("requires the configured provider prerequisite", () => {
    expect(() => createProvider({} as AppEnv, config)).toThrow();
    expect(createProvider({ AI: {} } as AppEnv, config).id).toBe("workers-ai");
    expect(() => createProvider({} as AppEnv, { ...config, provider: "typesafe" })).toThrow();
  });
});
