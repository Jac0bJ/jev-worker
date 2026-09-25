import { AppError } from "./errors";
import type { AppEnv, ClientIdentity } from "./types";

export async function enforceRateLimit(env: Pick<AppEnv, "RATE_LIMITER">, client: ClientIdentity): Promise<void> {
  try {
    const result = await env.RATE_LIMITER.limit({ key: `jev-worker:decision:${client.fingerprint}` });
    if (!result.success) {
      throw new AppError(429, "RATE_LIMITED", "Rate limit exceeded.");
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(503, "RATE_LIMIT_UNAVAILABLE", "Rate limiting is unavailable.");
  }
}
