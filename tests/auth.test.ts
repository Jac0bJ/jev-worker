import { describe, expect, it } from "vitest";
import { authenticate } from "../src/auth";
import type { AppConfig, AppEnv } from "../src/types";

const config = { authEnabled: true, environment: "production" } as AppConfig;
const env = (keys?: string) => ({ CLIENT_API_KEYS: keys }) as AppEnv;
const request = (key?: string) =>
  new Request("https://example.test/decide", {
    headers: key ? { "X-API-Key": key } : {},
  });

describe("authenticate", () => {
  it("accepts a configured key and returns only its SHA-256 fingerprint", async () => {
    const client = await authenticate(
      request("second"),
      env("first, second"),
      config,
    );
    expect(client.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(client.fingerprint).not.toContain("second");
    expect(client).toEqual(
      await authenticate(request("second"), env("second"), config),
    );
  });

  it("fails closed for missing configuration, missing keys, and invalid keys", async () => {
    await expect(
      authenticate(request("x"), env(), config),
    ).rejects.toMatchObject({ status: 503, code: "CONFIG_ERROR" });
    await expect(
      authenticate(request(), env("x"), config),
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    await expect(
      authenticate(request("wrong"), env("x"), config),
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
  });

  it("permits disabled auth only in development, without relying on headers", async () => {
    const disabled = { ...config, authEnabled: false };
    await expect(
      authenticate(request(), env(), disabled),
    ).rejects.toMatchObject({ code: "CONFIG_ERROR" });
    expect(
      await authenticate(request(), env(), {
        ...disabled,
        environment: "development",
      }),
    ).toEqual({ fingerprint: "local-development" });
  });
});
