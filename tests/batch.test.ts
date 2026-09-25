import { describe, expect, it } from "vitest";
import { AppError } from "../src/errors";
import { runBatch, summarizeBatchCache } from "../src/routes/batch";
import type { DecideRequest, DecisionOutcome } from "../src/types";

const item: DecideRequest = {
  state: "test",
  questions: { check: { type: "noul", instructions: "Check" } },
};
const success: DecisionOutcome = {
  data: {
    model: "jev",
    answers: {
      check: {
        type: "noul",
        noul: 0.9,
        decision: "auto",
        decision_confidence: 0.9,
        decision_confidence_source: "derived-noul",
      },
    },
    usage: { input_tokens: 1, output_tokens: 1 },
  },
  cache: "MISS",
};

describe("batch runner", () => {
  it("bounds concurrency and preserves input order despite out-of-order completion", async () => {
    let active = 0;
    let maximum = 0;
    const starts: number[] = [];
    const release: Array<() => void> = [];
    const pending = Array.from(
      { length: 5 },
      () => new Promise<void>((resolve) => release.push(resolve)),
    );
    const promise = runBatch(Array(5).fill(item), 2, async (_input, index) => {
      starts.push(index);
      active++;
      maximum = Math.max(maximum, active);
      await pending[index];
      active--;
      return { ...success, cache: index % 2 ? "HIT" : "MISS" };
    });
    expect(starts).toEqual([0, 1]);
    release[1]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(starts).toEqual([0, 1, 2]);
    release[2]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(starts).toEqual([0, 1, 2, 3]);
    release[3]();
    await new Promise((resolve) => setTimeout(resolve, 0));
    release[4]();
    release[0]();
    const results = await promise;
    expect(maximum).toBe(2);
    expect(results.map((result) => result.index)).toEqual([0, 1, 2, 3, 4]);
    expect(results.map((result) => result.cache)).toEqual([
      "MISS",
      "HIT",
      "MISS",
      "HIT",
      "MISS",
    ]);
    expect(
      results.every(
        (result) => result.status === 200 && result.data === success.data,
      ),
    ).toBe(true);
  });

  it("isolates typed and unexpected failures and keeps processing siblings", async () => {
    const results = await runBatch(
      Array(4).fill(item),
      2,
      async (_input, index) => {
        if (index === 1)
          throw new AppError(429, "RATE_LIMITED", "Too many requests.");
        if (index === 2) throw new Error("secret internal detail");
        return success;
      },
    );
    expect(results[0]).toEqual({
      index: 0,
      status: 200,
      data: success.data,
      cache: "MISS",
    });
    expect(results[1]).toEqual({
      index: 1,
      status: 429,
      error: { code: "RATE_LIMITED", message: "Too many requests." },
    });
    expect(results[2]).toEqual({
      index: 2,
      status: 500,
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
    });
    expect(results[3]).toEqual({
      index: 3,
      status: 200,
      data: success.data,
      cache: "MISS",
    });
    expect(summarizeBatchCache(results)).toBe("MIXED");
    expect(
      summarizeBatchCache(results.filter((result) => result.status !== 200)),
    ).toBe("ERROR");
    expect(
      summarizeBatchCache(results.filter((result) => result.status === 200)),
    ).toBe("MISS");
  });
});
