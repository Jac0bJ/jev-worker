import type { DecisionLog, JevInput } from "./types";

export function logDecision(
  event: DecisionLog,
  input: JevInput | undefined,
  logInputs: boolean,
): void {
  const entry = {
    requestId: event.requestId,
    ...(event.preset === undefined ? {} : { preset: event.preset }),
    latencyMs: event.latencyMs,
    cache: event.cache,
    provider: event.provider,
    ...(event.model === undefined ? {} : { model: event.model }),
    status: event.status,
    ...(event.errorCode === undefined ? {} : { errorCode: event.errorCode }),
    ...(event.answers === undefined
      ? {}
      : {
          answers: event.answers.map(
            ({ type, confidence, decision, source }) => ({
              type,
              confidence,
              decision,
              source,
            }),
          ),
        }),
    ...(logInputs && input ? { state: input.state } : {}),
  };
  console.log(JSON.stringify(entry));
}
