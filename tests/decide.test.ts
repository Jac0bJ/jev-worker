import { describe, expect, it, vi } from "vitest";
import { evaluateDecision, routeResult } from "../src/decide";
import type { JevProvider } from "../src/providers/types";
import { config, sampleInput, sampleResult } from "./helpers";

describe("routing", () => {
  it("derives noul confidence for strong yes and no, with inclusive thresholds", () => {
    const source = {
      ...sampleResult,
      answers: {
        yes: { type: "noul" as const, noul: 0.9 },
        no: { type: "noul" as const, noul: 0.1 },
        uncertain: { type: "noul" as const, noul: 0.5 },
      },
    };
    const routed = routeResult(source, config);
    expect(routed.answers.yes.decision).toBe("auto");
    expect(routed.answers.no.decision).toBe("auto");
    expect(routed.answers.uncertain.decision).toBe("reject");
    expect(routed.answers.no.decision_confidence_source).toBe("derived-noul");
    expect(source.answers.no).not.toHaveProperty("decision");
  });
  it("uses model confidence for choice and score", () => {
    const routed = routeResult(
      {
        ...sampleResult,
        answers: {
          c: {
            type: "choice",
            choice: "a",
            confidence: 0.6,
            probabilities: { a: 1 },
          },
          s: {
            type: "score",
            score: 1.2,
            confidence: 0.59,
            probabilities: { "0": 0.2, "1": 0.6, "2": 0.2 },
            legend: { "0": "Low", "1": "Mid", "2": "High" },
          },
        },
      },
      config,
    );
    expect(routed.answers.c.decision).toBe("review");
    expect(routed.answers.s.decision).toBe("reject");
  });
});
describe("provider evaluation", () => {
  it("passes a signal and returns the provider result", async () => {
    const evaluate = vi.fn(
      async (_input: typeof sampleInput, _options: { signal: AbortSignal }) => {
        void _input;
        void _options;
        return sampleResult;
      },
    );
    const provider: JevProvider = {
      id: "workers-ai",
      model: "typesafe/jev",
      evaluate,
    };
    await expect(
      evaluateDecision(sampleInput, provider, config),
    ).resolves.toEqual(sampleResult);
    expect(evaluate.mock.calls).toHaveLength(1);
    expect(evaluate.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });
  it("aborts and fails when the provider ignores cancellation", async () => {
    vi.useFakeTimers();
    const signalSeen: AbortSignal[] = [];
    const provider: JevProvider = {
      id: "workers-ai",
      model: "typesafe/jev",
      evaluate: async (_, { signal }) => {
        signalSeen.push(signal);
        return new Promise(() => undefined);
      },
    };
    try {
      const pending = evaluateDecision(sampleInput, provider, {
        ...config,
        upstreamTimeoutMs: 10,
      });
      const assertion = expect(pending).rejects.toMatchObject({
        status: 504,
        code: "UPSTREAM_TIMEOUT",
      });
      await vi.advanceTimersByTimeAsync(10);
      await assertion;
      expect(signalSeen[0]?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
