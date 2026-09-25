import { z } from "zod";
import { AppError } from "./errors";
import type {
  DecideRequest,
  Description,
  JevInput,
  JevResult,
  JsonValue,
  Question,
  ValidationIssue,
} from "./types";

const key = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (s) => !["__proto__", "prototype", "constructor"].includes(s),
    "Reserved key",
  );
const nonempty = z
  .string()
  .refine((value) => value.trim().length > 0, "Must not be empty");
const json: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(json),
    z.record(key, json),
  ]),
);
const object = z.record(key, json);
const description: z.ZodType<Description> = z.union([
  nonempty,
  object.refine((v) => Object.keys(v).length > 0, "Must not be empty"),
  z.array(json).min(1),
]);
const state = z.union([
  nonempty,
  object.refine((v) => Object.keys(v).length > 0, "Must not be empty"),
]);
const question: z.ZodType<Question> = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("noul"),
    instructions: description,
    criteria: z
      .strictObject({
        true: description.optional(),
        false: description.optional(),
      })
      .optional(),
  }),
  z.strictObject({
    type: z.literal("choice"),
    instructions: description,
    criteria: z
      .record(key, description.nullable())
      .refine(
        (v) => Object.keys(v).length >= 2 && Object.keys(v).length <= 255,
        "Requires 2 to 255 choices",
      ),
  }),
  z.strictObject({
    type: z.literal("score"),
    instructions: description,
    criteria: z.array(description).min(2).max(10),
  }),
]);
const request = z.strictObject({
  state,
  questions: z
    .record(key, question)
    .refine(
      (v) => Object.keys(v).length >= 1 && Object.keys(v).length <= 32,
      "Requires 1 to 32 questions",
    ),
  cache: z.boolean().optional(),
});
const preset = z.strictObject({ text: nonempty });
const probability = z.number().finite().min(0).max(1);
const answer = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("noul"), noul: probability }),
  z.strictObject({
    type: z.literal("choice"),
    choice: z.string(),
    confidence: probability,
    probabilities: z.record(key, probability),
  }),
  z.strictObject({
    type: z.literal("score"),
    score: z.number().finite(),
    confidence: probability,
    probabilities: z.record(key, probability),
    legend: z.record(key, description),
  }),
]);
const result = z.strictObject({
  model: nonempty,
  answers: z.record(key, answer),
  usage: z.strictObject({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
  }),
});
function issues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter(
      (part): part is string | number =>
        typeof part === "string" || typeof part === "number",
    ),
    message:
      issue.code === "invalid_type"
        ? "Invalid type"
        : issue.code === "unrecognized_keys"
          ? "Unknown field"
          : issue.code === "too_small" || issue.code === "too_big"
            ? issue.message
            : issue.message === "Reserved key" ||
                issue.message.startsWith("Requires ") ||
                issue.message === "Must not be empty"
              ? issue.message
              : "Invalid value",
  }));
}
function invalid(error: z.ZodError): never {
  throw new AppError(
    400,
    "VALIDATION_ERROR",
    "Invalid request body.",
    issues(error),
  );
}
function upstream(): never {
  throw new AppError(
    502,
    "UPSTREAM_INVALID_RESPONSE",
    "Invalid response from Jev.",
  );
}
function checkDepth(value: unknown, depth = 0): void {
  if (depth > 20)
    throw new AppError(
      400,
      "VALIDATION_ERROR",
      "Request nesting exceeds 20 levels.",
      [{ path: [], message: "Too deeply nested" }],
    );
  if (value && typeof value === "object")
    for (const child of Object.values(value)) checkDepth(child, depth + 1);
}
function checkSize(value: unknown): void {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    /* Reject below. */
  }
  if (serialized === undefined)
    throw new AppError(400, "VALIDATION_ERROR", "Invalid request body.");
  if (new TextEncoder().encode(serialized).byteLength > 65_536)
    throw new AppError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Decision item exceeds 64 KiB.",
    );
}
export function parseDecisionRequest(value: unknown): DecideRequest {
  checkDepth(value);
  checkSize(value);
  const parsed = request.safeParse(value);
  if (!parsed.success) return invalid(parsed.error);
  return parsed.data;
}
export function parseBatchRequest(
  value: unknown,
  maxItems: number,
): DecideRequest[] {
  const parsed = z.array(z.unknown()).min(1).max(maxItems).safeParse(value);
  if (!parsed.success) return invalid(parsed.error);
  return parsed.data.map((item, index) => {
    try {
      return parseDecisionRequest(item);
    } catch (error) {
      if (error instanceof AppError)
        throw new AppError(
          error.status,
          error.code,
          error.status === 413
            ? `Batch item ${index} exceeds 64 KiB.`
            : `Invalid batch item ${index}.`,
          error.issues?.map((issue) => ({
            ...issue,
            path: [index, ...issue.path],
          })),
        );
      throw error;
    }
  });
}
export function parsePresetBody(value: unknown): { text: string } {
  checkDepth(value);
  checkSize(value);
  const parsed = preset.safeParse(value);
  if (!parsed.success) return invalid(parsed.error);
  return parsed.data;
}
function exactKeys(
  actual: Record<string, unknown>,
  expected: string[],
): boolean {
  const got = Object.keys(actual);
  return (
    got.length === expected.length &&
    expected.every((name) => Object.hasOwn(actual, name))
  );
}
function validDistribution(values: Record<string, number>): boolean {
  return (
    Math.abs(Object.values(values).reduce((sum, n) => sum + n, 0) - 1) <= 0.01
  );
}
export function parseProviderResult(
  value: unknown,
  input: JevInput,
): JevResult {
  const parsed = result.safeParse(value);
  if (!parsed.success) return upstream();
  const output = parsed.data;
  if (!exactKeys(output.answers, Object.keys(input.questions)))
    return upstream();
  for (const [id, question] of Object.entries(input.questions)) {
    const item = output.answers[id];
    if (item.type !== question.type) return upstream();
    if (question.type === "choice" && item.type === "choice") {
      const choices = Object.keys(question.criteria);
      if (
        !exactKeys(item.probabilities, choices) ||
        !choices.includes(item.choice) ||
        !validDistribution(item.probabilities)
      )
        return upstream();
      const maximum = Math.max(...Object.values(item.probabilities));
      if (item.probabilities[item.choice] + 1e-9 < maximum) return upstream();
    }
    if (question.type === "score" && item.type === "score") {
      const levels = question.criteria.map((_, index) => String(index));
      if (
        !exactKeys(item.probabilities, levels) ||
        !exactKeys(item.legend, levels) ||
        !validDistribution(item.probabilities) ||
        item.score < 0 ||
        item.score > levels.length - 1
      )
        return upstream();
      const total = levels.reduce(
        (sum, level) => sum + item.probabilities[level],
        0,
      );
      const weightedScore =
        levels.reduce(
          (sum, level, index) => sum + index * item.probabilities[level],
          0,
        ) / total;
      if (Math.abs(item.score - weightedScore) > 0.020000001) return upstream();
    }
  }
  return output;
}
