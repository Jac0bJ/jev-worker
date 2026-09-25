import { describe, expect, it, vi } from "vitest";
import { enforceRateLimit } from "../src/rate-limit";
import type { AppEnv } from "../src/types";

const env = (limit: ReturnType<typeof vi.fn>) =>
  ({ RATE_LIMITER: { limit } }) as unknown as Pick<AppEnv, "RATE_LIMITER">;

describe("enforceRateLimit", () => {
  it("uses a namespaced client fingerprint", async () => {
    const limit = vi.fn().mockResolvedValue({ success: true });
    await enforceRateLimit(env(limit), { fingerprint: "abc" });
    expect(limit).toHaveBeenCalledWith({ key: "jev-worker:decision:abc" });
  });
  it("reports denial and binding failures separately", async () => {
    await expect(
      enforceRateLimit(env(vi.fn().mockResolvedValue({ success: false })), {
        fingerprint: "abc",
      }),
    ).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    await expect(
      enforceRateLimit(env(vi.fn().mockRejectedValue(new Error("secret"))), {
        fingerprint: "abc",
      }),
    ).rejects.toMatchObject({ status: 503, code: "RATE_LIMIT_UNAVAILABLE" });
  });
});
