import { describe, expect, it, vi } from "vitest";
import { makeCacheKey, readCache, writeCache } from "../src/cache";
import type { JevInput, JevResult } from "../src/types";
import type { JevProvider } from "../src/providers/types";

const input: JevInput = {
  state: { z: "text", a: { y: 2, x: 1 } },
  questions: { spam: { type: "noul", instructions: "Is this spam?" } },
};
const provider = { id: "workers-ai", model: "typesafe/jev" } as JevProvider;
const result: JevResult = {
  model: "typesafe/jev",
  answers: { spam: { type: "noul", noul: 0.9 } },
  usage: { input_tokens: 4, output_tokens: 1 },
};

describe("cache", () => {
  it("canonicalizes object keys and isolates client, provider, and model", async () => {
    const key = await makeCacheKey(input, provider, { fingerprint: "one" });
    const reordered: JevInput = {
      questions: input.questions,
      state: { a: { x: 1, y: 2 }, z: "text" },
    };
    expect(
      await makeCacheKey(reordered, provider, { fingerprint: "one" }),
    ).toBe(key);
    expect(
      await makeCacheKey(input, provider, { fingerprint: "two" }),
    ).not.toBe(key);
    expect(
      await makeCacheKey(
        input,
        { ...provider, id: "typesafe" },
        { fingerprint: "one" },
      ),
    ).not.toBe(key);
    expect(
      await makeCacheKey(
        input,
        { ...provider, model: "next" },
        { fingerprint: "one" },
      ),
    ).not.toBe(key);
    expect(key).not.toContain("text");
    expect(key).not.toContain("spam");
  });

  it("writes an expiring envelope and rejects expired or corrupt entries", async () => {
    const put = vi.fn();
    const get = vi.fn();
    const kv = { put, get } as unknown as KVNamespace;
    await writeCache(kv, "key", result, 60);
    expect(put).toHaveBeenCalledWith("key", expect.any(String), {
      expirationTtl: 60,
    });
    const envelope = JSON.parse(put.mock.calls[0][1] as string);
    expect(envelope.result).toEqual(result);
    get.mockResolvedValue(envelope);
    expect(await readCache(kv, "key")).toEqual(result);
    get.mockResolvedValue({ ...envelope, expiresAt: Date.now() - 1 });
    expect(await readCache(kv, "key")).toBeNull();
    get.mockResolvedValue({ expiresAt: "tomorrow", result });
    expect(await readCache(kv, "key")).toBeNull();
    expect(get).toHaveBeenCalledWith("key", "json");
  });
});
