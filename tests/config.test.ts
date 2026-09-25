import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config";

describe("configuration", () => {
  it("uses safe production defaults", () => { const c = loadConfig({}); expect(c.authEnabled).toBe(true); expect(c.provider).toBe("workers-ai"); expect(c.allowedOrigins).toEqual([]); });
  it("rejects production bypass, bad thresholds and malformed settings", () => {
    for (const vars of [{ AUTH_ENABLED: "false" }, { CONFIDENCE_AUTO: ".5" }, { CONFIDENCE_REVIEW: "NaN" }, { CACHE_TTL_SECONDS: "1" }, { BATCH_CONCURRENCY: "2.5" }, { LOG_INPUTS: "yes" }, { CORS_ALLOWED_ORIGINS: "https://example.com/path" }]) expect(() => loadConfig(vars)).toThrow();
  });
  it("accepts explicit development bypass and explicit origins", () => { expect(loadConfig({ENVIRONMENT:"development",AUTH_ENABLED:"false",CORS_ALLOWED_ORIGINS:"https://example.com,http://localhost:8080"}).authEnabled).toBe(false); });
});
