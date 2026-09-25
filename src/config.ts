import { AppError } from "./errors";
import type { AppConfig, AppEnv, ConfigVar } from "./types";

export function loadConfig(env: Partial<AppEnv>): AppConfig {
  const invalid = (name: string): never => {
    throw new AppError(503, "CONFIG_ERROR", `Invalid ${name} configuration.`);
  };
  const number = (
    name: ConfigVar,
    fallback: number,
    min: number,
    max: number,
    integer = false,
  ): number => {
    const raw = env[name];
    const value = raw === undefined ? fallback : Number(raw);
    if (
      raw?.trim() === "" ||
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (integer && !Number.isInteger(value))
    )
      return invalid(name);
    return value;
  };
  const boolean = (name: ConfigVar, fallback: boolean): boolean => {
    const raw = env[name];
    if (raw === undefined) return fallback;
    if (raw !== "true" && raw !== "false") return invalid(name);
    return raw === "true";
  };
  const provider = env.JEV_PROVIDER ?? "workers-ai";
  if (provider !== "workers-ai" && provider !== "typesafe")
    return invalid("JEV_PROVIDER");
  const environment = env.ENVIRONMENT ?? "production";
  if (environment !== "production" && environment !== "development")
    return invalid("ENVIRONMENT");
  const authEnabled = boolean("AUTH_ENABLED", true);
  if (!authEnabled && environment !== "development")
    return invalid("AUTH_ENABLED (bypass requires development)");
  const confidenceAuto = number("CONFIDENCE_AUTO", 0.9, 0, 1);
  const confidenceReview = number("CONFIDENCE_REVIEW", 0.6, 0, 1);
  if (confidenceReview >= confidenceAuto)
    return invalid("confidence thresholds (review must be less than auto)");
  const allowedOrigins = (env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const origin of allowedOrigins) {
    if (origin === "*") continue;
    try {
      const url = new URL(origin);
      if (!["https:", "http:"].includes(url.protocol) || url.origin !== origin)
        return invalid("CORS_ALLOWED_ORIGINS");
    } catch {
      return invalid("CORS_ALLOWED_ORIGINS");
    }
  }
  return {
    provider,
    environment,
    authEnabled,
    confidenceAuto,
    confidenceReview,
    cacheTtlSeconds: number("CACHE_TTL_SECONDS", 3600, 60, 604800, true),
    upstreamTimeoutMs: number("UPSTREAM_TIMEOUT_MS", 15000, 1, 60000, true),
    batchMaxItems: number("BATCH_MAX_ITEMS", 20, 1, 100, true),
    batchConcurrency: number("BATCH_CONCURRENCY", 4, 1, 10, true),
    allowedOrigins,
    logInputs: boolean("LOG_INPUTS", false),
  };
}

export function assertReady(env: AppEnv, config: AppConfig): void {
  if (
    config.authEnabled &&
    !env.CLIENT_API_KEYS?.split(",").some((key) => key.trim())
  )
    throw new AppError(
      503,
      "CONFIG_ERROR",
      "CLIENT_API_KEYS must be configured.",
    );
  if (config.provider === "typesafe" && !env.TYPESAFE_API_KEY?.trim())
    throw new AppError(
      503,
      "CONFIG_ERROR",
      "TYPESAFE_API_KEY is required for the typesafe provider.",
    );
  if (config.provider === "workers-ai" && !env.AI)
    throw new AppError(503, "CONFIG_ERROR", "AI binding must be configured.");
  if (!env.JEV_CACHE || !env.RATE_LIMITER)
    throw new AppError(
      503,
      "CONFIG_ERROR",
      "Cache and rate-limit bindings must be configured.",
    );
}
