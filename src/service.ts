import { enforceRateLimit } from "./rate-limit";
import { makeCacheKey, readCache, writeCache } from "./cache";
import { evaluateDecision, routeResult } from "./decide";
import { parseProviderResult } from "./schemas";
import { logDecision } from "./logging";
import { asAppError } from "./errors";
import type { JevProvider } from "./providers/types";
import type {
  AppEnv,
  AppConfig,
  ClientIdentity,
  DecideRequest,
  DecisionOutcome,
  JevInput,
  JevResult,
  CacheStatus,
  DecisionResponse,
} from "./types";

export function createDecisionService(options: {
  env: AppEnv;
  config: AppConfig;
  provider: JevProvider;
  client: ClientIdentity;
  requestId: string;
  preset?: string;
}): (request: DecideRequest) => Promise<DecisionOutcome> {
  const { env, config, provider, client, requestId, preset } = options;
  return async (request) => {
    const start = performance.now();
    const input: JevInput = {
      state: request.state,
      questions: request.questions,
    };
    let cache: CacheStatus = request.cache === false ? "BYPASS" : "MISS";
    let result: JevResult | undefined;
    let data: DecisionResponse | undefined;
    let status = 200;
    let errorCode: string | undefined;
    try {
      await enforceRateLimit(env, client);
      let cacheKey: string | undefined;
      if (request.cache !== false) {
        try {
          cacheKey = await makeCacheKey(input, provider, client);
          const stored = await readCache(env.JEV_CACHE, cacheKey);
          if (stored !== null) {
            result = parseProviderResult(stored, input);
            cache = "HIT";
          }
        } catch {
          cache = "ERROR";
        }
      }
      if (!result) {
        result = await evaluateDecision(input, provider, config);
        // Validate even injected providers; neither cache nor routing trusts adapter output.
        result = parseProviderResult(result, input);
        if (cacheKey) {
          try {
            await writeCache(
              env.JEV_CACHE,
              cacheKey,
              result,
              config.cacheTtlSeconds,
            );
          } catch {
            cache = "ERROR";
          }
        }
      }
      data = routeResult(result, config);
      return { data, cache };
    } catch (error) {
      const appError = asAppError(error);
      status = appError.status;
      errorCode = appError.code;
      throw appError;
    } finally {
      logDecision(
        {
          requestId,
          ...(preset ? { preset } : {}),
          latencyMs: Math.round(performance.now() - start),
          cache,
          provider: provider.id,
          ...(result ? { model: result.model } : {}),
          status,
          ...(errorCode ? { errorCode } : {}),
          ...(data
            ? {
                answers: Object.values(data.answers).map((answer) => ({
                  type: answer.type,
                  confidence: answer.decision_confidence,
                  decision: answer.decision,
                  source: answer.decision_confidence_source,
                })),
              }
            : {}),
        },
        input,
        config.logInputs,
      );
    }
  };
}
