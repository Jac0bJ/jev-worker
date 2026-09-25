import { describe, expect, it } from "vitest";
import { corsHeaders, handlePreflight } from "../src/cors";
import type { AppConfig } from "../src/types";

const config = { allowedOrigins: ["https://app.example"] } as AppConfig;
const request = (origin?: string, method = "POST") => new Request("https://api.example/decide", { method, headers: origin ? { Origin: origin } : {} });

describe("CORS", () => {
  it("allows configured origins with Vary and exposed response headers", () => {
    const headers = corsHeaders(request("https://app.example"), config);
    expect(headers.get("Access-Control-Allow-Origin")).toBe("https://app.example");
    expect(headers.get("Vary")).toBe("Origin");
    expect(headers.get("Access-Control-Expose-Headers")).toContain("X-Request-ID");
  });
  it("rejects disallowed origins but permits no Origin", () => {
    expect(() => corsHeaders(request("https://evil.example"), config)).toThrowError(expect.objectContaining({ code: "CORS_FORBIDDEN", status: 403 }));
    expect(corsHeaders(request(), config).get("Access-Control-Allow-Origin")).toBeNull();
  });
  it("handles preflight before auth and supports opt-in wildcard", () => {
    const response = handlePreflight(request("https://app.example", "OPTIONS"), config);
    expect(response?.status).toBe(204);
    expect(response?.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
    expect(response?.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-API-Key");
    expect(handlePreflight(request(), config)).toBeNull();
    expect(corsHeaders(request("https://other.example"), { ...config, allowedOrigins: ["*"] }).get("Access-Control-Allow-Origin")).toBe("*");
  });
});
