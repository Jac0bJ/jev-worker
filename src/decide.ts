import { AppError } from "./errors";
import type { AppConfig, Decision, DecisionResponse, JevInput, JevResult, RoutedAnswer } from "./types";
import type { JevProvider } from "./providers/types";

export async function evaluateDecision(input: JevInput, provider: JevProvider, config: AppConfig): Promise<JevResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new AppError(504, "UPSTREAM_TIMEOUT", "Jev request timed out."));
    }, config.upstreamTimeoutMs);
  });
  try { return await Promise.race([provider.evaluate(input, { signal: controller.signal }), timeout]); }
  catch (error) {
    if (controller.signal.aborted) throw new AppError(504, "UPSTREAM_TIMEOUT", "Jev request timed out.");
    throw error;
  } finally { if (timer !== undefined) clearTimeout(timer); }
}
function decision(confidence: number, config: AppConfig): Decision {
  return confidence >= config.confidenceAuto ? "auto" : confidence >= config.confidenceReview ? "review" : "reject";
}
export function routeResult(result: JevResult, config: AppConfig): DecisionResponse {
  const answers: Record<string, RoutedAnswer> = Object.create(null);
  for (const [id, answer] of Object.entries(result.answers)) {
    const confidence = answer.type === "noul" ? Math.max(answer.noul, 1 - answer.noul) : answer.confidence;
    answers[id] = {
      ...answer,
      decision: decision(confidence, config),
      decision_confidence: confidence,
      decision_confidence_source: answer.type === "noul" ? "derived-noul" : "model",
    };
  }
  return { model: result.model, usage: { ...result.usage }, answers };
}
