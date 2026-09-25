import { AppError } from "../errors";
import { presets } from "../presets";
import { parsePresetBody } from "../schemas";
import type { DecideRequest, DecisionResponse, Preset } from "../types";
export function resolvePreset(name: string, body: unknown): { preset: Preset; input: DecideRequest } {
  if (!Object.hasOwn(presets, name)) throw new AppError(404, "PRESET_NOT_FOUND", "Preset not found.");
  const preset = presets[name];
  const { text } = parsePresetBody(body);
  return { preset, input: { state: text, questions: preset.questions } };
}
export function decoratePreset(name: string, response: DecisionResponse): DecisionResponse {
  if (name !== "lead-quality") return response;
  const quality = response.answers.quality;
  if (!quality || quality.type !== "score") return response;
  return {
    ...response,
    answers: {
      ...response.answers,
      quality: { ...quality, rating: quality.score + 1 },
    },
  };
}
