import { describe, expect, it } from "vitest";
import {
  parseBatchRequest,
  parseDecisionRequest,
  parsePresetBody,
  parseProviderResult,
} from "../src/schemas";
import { sampleInput, sampleResult } from "./helpers";

const choiceInput = {
  state: "Need billing help",
  questions: {
    route: {
      type: "choice",
      instructions: "Classify",
      criteria: { billing: "Payments", other: null },
    },
  },
};
const choiceResult = {
  model: "jev",
  answers: {
    route: {
      type: "choice",
      choice: "billing",
      confidence: 0.92,
      probabilities: { billing: 0.92, other: 0.08 },
    },
  },
  usage: { input_tokens: 4, output_tokens: 2 },
};
describe("request validation", () => {
  it("accepts documented question types and a bare batch", () => {
    expect(parseDecisionRequest(choiceInput).questions.route.type).toBe(
      "choice",
    );
    expect(parseBatchRequest([choiceInput], 20)).toHaveLength(1);
    expect(parsePresetBody({ text: "hello" })).toEqual({ text: "hello" });
    expect(parsePresetBody({ text: "  hello  " }).text).toBe("  hello  ");
    expect(
      parseDecisionRequest({ ...choiceInput, state: "  Need billing help  " })
        .state,
    ).toBe("  Need billing help  ");
  });
  it("rejects invented wrapper fields and prototype keys without echoing values", () => {
    expect(() =>
      parseDecisionRequest({ ...choiceInput, secret: "private-value" }),
    ).toThrow(/Invalid request body/);
    expect(() =>
      parseDecisionRequest(
        JSON.parse(
          '{"state":"x","questions":{"__proto__":{"type":"noul","instructions":"x"}}}',
        ),
      ),
    ).toThrow();
    try {
      parseDecisionRequest({ ...choiceInput, secret: "private-value" });
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain("private-value");
    }
  });
  it("enforces question counts, score levels, and batch bounds", () => {
    expect(() => parseDecisionRequest({ state: "x", questions: {} })).toThrow();
    expect(() =>
      parseDecisionRequest({
        state: "x",
        questions: {
          s: { type: "score", instructions: "Rate", criteria: ["Only one"] },
        },
      }),
    ).toThrow();
    expect(() => parseBatchRequest([choiceInput, choiceInput], 1)).toThrow();
    try {
      parseBatchRequest(
        [choiceInput, { state: "", questions: sampleInput.questions }],
        20,
      );
    } catch (error) {
      expect(error).toMatchObject({
        message: "Invalid batch item 1.",
        issues: expect.arrayContaining([
          expect.objectContaining({ path: expect.arrayContaining([1]) }),
        ]),
      });
    }
  });
  it("enforces item size and nesting", () => {
    expect(() =>
      parseDecisionRequest({
        state: "x".repeat(65537),
        questions: sampleInput.questions,
      }),
    ).toThrow();
    let nested: unknown = "x";
    for (let i = 0; i < 21; i++) nested = [nested];
    expect(() =>
      parseDecisionRequest({
        state: { nested },
        questions: sampleInput.questions,
      }),
    ).toThrow();
  });
});
describe("provider response validation", () => {
  it("accepts matching responses", () => {
    expect(parseProviderResult(sampleResult, sampleInput)).toEqual(
      sampleResult,
    );
    expect(parseProviderResult(choiceResult, choiceInput as never)).toEqual(
      choiceResult,
    );
  });
  it("accepts tied choices and rounded fractional scores", () => {
    const tied = {
      ...choiceResult,
      answers: {
        route: {
          ...choiceResult.answers.route,
          probabilities: { billing: 0.5, other: 0.5 },
        },
      },
    };
    expect(parseProviderResult(tied, choiceInput as never)).toEqual(tied);
    const input = {
      state: "x",
      questions: {
        mood: {
          type: "score",
          instructions: "Rate",
          criteria: ["Calm", "Frustrated", "Angry"],
        },
      },
    };
    const rounded = {
      model: "jev",
      answers: {
        mood: {
          type: "score",
          score: 1.04,
          confidence: 0.94,
          legend: { "0": "Calm", "1": "Frustrated", "2": "Angry" },
          probabilities: { "0": 0, "1": 0.96, "2": 0.04 },
        },
      },
      usage: { input_tokens: 4, output_tokens: 2 },
    };
    expect(parseProviderResult(rounded, input as never)).toEqual(rounded);
    const nearRounded = {
      ...rounded,
      answers: { mood: { ...rounded.answers.mood, score: 1.05 } },
    };
    expect(parseProviderResult(nearRounded, input as never)).toEqual(
      nearRounded,
    );
  });
  it("rejects contradictory choices and scores", () => {
    const contradictoryChoice = {
      ...choiceResult,
      answers: {
        route: {
          ...choiceResult.answers.route,
          confidence: 1,
          probabilities: { billing: 0, other: 1 },
        },
      },
    };
    expect(() =>
      parseProviderResult(contradictoryChoice, choiceInput as never),
    ).toThrow();
    const input = {
      state: "x",
      questions: {
        mood: {
          type: "score",
          instructions: "Rate",
          criteria: ["Calm", "Frustrated", "Angry"],
        },
      },
    };
    const contradictoryScore = {
      model: "jev",
      answers: {
        mood: {
          type: "score",
          score: 2,
          confidence: 0.99,
          legend: { "0": "Calm", "1": "Frustrated", "2": "Angry" },
          probabilities: { "0": 0, "1": 0.96, "2": 0.04 },
        },
      },
      usage: { input_tokens: 4, output_tokens: 2 },
    };
    expect(() =>
      parseProviderResult(contradictoryScore, input as never),
    ).toThrow();
  });
  it("rejects mismatched keys, invalid probabilities, and incorrect answer shapes", () => {
    expect(() =>
      parseProviderResult(
        { ...choiceResult, answers: { other: choiceResult.answers.route } },
        choiceInput as never,
      ),
    ).toThrow();
    expect(() =>
      parseProviderResult(
        {
          ...choiceResult,
          answers: {
            route: {
              ...choiceResult.answers.route,
              probabilities: { billing: 1, other: 1 },
            },
          },
        },
        choiceInput as never,
      ),
    ).toThrow();
    expect(() =>
      parseProviderResult(
        {
          ...sampleResult,
          answers: { urgent: { type: "noul", noul: 0.5, confidence: 0.9 } },
        },
        sampleInput,
      ),
    ).toThrow();
  });
});
