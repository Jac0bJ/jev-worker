import { describe, expect, it } from "vitest";
import { presets } from "../src/presets";
import { resolvePreset, decoratePreset } from "../src/routes/preset";
import { AppError } from "../src/errors";
import type { DecisionResponse } from "../src/types";

describe("presets", () => {
  it("exposes the promised presets and question IDs", () => {
    expect(Object.keys(presets).sort()).toEqual([
      "comment-moderation",
      "form-spam",
      "lead-quality",
      "support-route",
    ]);
    expect(Object.keys(presets["form-spam"].questions)).toEqual(["spam"]);
    expect(Object.keys(presets["comment-moderation"].questions)).toEqual([
      "category",
      "severity",
    ]);
    expect(Object.keys(presets["lead-quality"].questions)).toEqual(["quality"]);
    expect(Object.keys(presets["support-route"].questions)).toEqual([
      "department",
    ]);
    expect(presets["form-spam"].questions.spam.type).toBe("noul");
    const moderation = presets["comment-moderation"].questions;
    expect(moderation.category.type).toBe("choice");
    if (moderation.category.type === "choice") {
      expect(Object.keys(moderation.category.criteria)).toEqual([
        "ok",
        "spam",
        "harassment",
        "hate",
        "sexual",
        "self-harm",
      ]);
    }
    expect(moderation.severity.type).toBe("score");
    if (moderation.severity.type === "score")
      expect(moderation.severity.criteria).toHaveLength(5);
    expect(presets["lead-quality"].questions.quality.type).toBe("score");
    expect(presets["support-route"].questions.department.type).toBe("choice");
    const route = presets["support-route"].questions.department;
    if (route.type === "choice")
      expect(Object.keys(route.criteria)).toEqual([
        "billing",
        "bug",
        "feature-request",
        "account",
        "other",
      ]);
  });

  it("resolves a preset into a decision request and validates its body", () => {
    const result = resolvePreset("form-spam", { text: "Hello" });
    expect(result.preset).toBe(presets["form-spam"]);
    expect(result.input).toEqual({
      state: "Hello",
      questions: presets["form-spam"].questions,
    });
    expect(() => resolvePreset("form-spam", { text: " " })).toThrowError(
      AppError,
    );
    expect(() =>
      resolvePreset("form-spam", { text: "Hello", cache: false }),
    ).toThrowError(AppError);
  });

  it("rejects inherited and prototype names as unknown presets", () => {
    for (const name of ["toString", "constructor", "__proto__", "missing"]) {
      try {
        resolvePreset(name, { text: "Hello" });
        throw new Error("Expected an unknown preset");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).status).toBe(404);
        expect((error as AppError).code).toBe("PRESET_NOT_FOUND");
      }
    }
  });

  it("adds fractional lead rating without modifying the routed or cached answer", () => {
    const answer = {
      type: "score" as const,
      score: 2.25,
      confidence: 0.94,
      probabilities: { "0": 0, "1": 0, "2": 0.75, "3": 0.25, "4": 0 },
      legend: {
        "0": "Low",
        "1": "Below",
        "2": "Medium",
        "3": "High",
        "4": "Best",
      },
      decision: "auto" as const,
      decision_confidence: 0.94,
      decision_confidence_source: "model" as const,
    };
    const response: DecisionResponse = {
      model: "jev",
      answers: { quality: answer },
      usage: { input_tokens: 2, output_tokens: 1 },
    };
    const decorated = decoratePreset("lead-quality", response);
    expect(decorated.answers.quality.rating).toBe(3.25);
    expect(response.answers.quality).toBe(answer);
    expect(response.answers.quality).not.toHaveProperty("rating");
    expect(decorated.answers.quality).not.toBe(answer);
    expect(decoratePreset("form-spam", response)).toBe(response);
  });
});
