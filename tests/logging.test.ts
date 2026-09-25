import { afterEach, describe, expect, it, vi } from "vitest";
import { logDecision } from "../src/logging";
import type { DecisionLog, JevInput } from "../src/types";

afterEach(() => vi.restoreAllMocks());
const input: JevInput = {
  state: "private user message",
  questions: {
    secretQuestion: { type: "noul", instructions: "private rubric" },
  },
};
const event: DecisionLog = {
  requestId: "request-1",
  latencyMs: 9,
  cache: "MISS",
  provider: "workers-ai",
  status: 200,
  answers: [
    { type: "noul", confidence: 0.9, decision: "auto", source: "derived-noul" },
  ],
};

describe("logDecision", () => {
  it("emits one structured line without user content or question IDs by default", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logDecision(event, input, false);
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0][0] as string;
    expect(JSON.parse(line)).toMatchObject({
      requestId: "request-1",
      status: 200,
      answers: [{ type: "noul", decision: "auto" }],
    });
    expect(line).not.toContain("private");
    expect(line).not.toContain("secretQuestion");
  });
  it("includes state only with explicit input logging", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    logDecision(event, input, true);
    const line = log.mock.calls[0][0] as string;
    expect(line).toContain("private user message");
    expect(line).not.toContain("private rubric");
  });
});
