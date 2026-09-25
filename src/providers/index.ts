import { AppError } from "../errors";
import type { AppConfig, AppEnv } from "../types";
import type { JevProvider } from "./types";
import { createTypeSafeProvider } from "./typesafe";
import { createWorkersAIProvider } from "./workers-ai";

export function createProvider(env: AppEnv, config: AppConfig): JevProvider {
  if (config.provider === "workers-ai") {
    if (!env.AI) throw new AppError(503, "CONFIG_ERROR", "Workers AI binding is missing.");
    return createWorkersAIProvider(env);
  }
  if (!env.TYPESAFE_API_KEY) throw new AppError(503, "CONFIG_ERROR", "TypeSafe API key is missing.");
  return createTypeSafeProvider(env.TYPESAFE_API_KEY);
}
