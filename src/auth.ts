import { AppError } from "./errors";
import type { AppConfig, AppEnv, ClientIdentity } from "./types";

const encoder = new TextEncoder();

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}


function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function authenticate(request: Request, env: AppEnv, config: AppConfig): Promise<ClientIdentity> {
  if (!config.authEnabled) {
    if (config.environment !== "development") {
      throw new AppError(503, "CONFIG_ERROR", "Authentication may only be disabled in development.");
    }
    return { fingerprint: "local-development" };
  }

  const keys = env.CLIENT_API_KEYS?.split(",").map((key) => key.trim()).filter(Boolean) ?? [];
  if (keys.length === 0) {
    throw new AppError(503, "CONFIG_ERROR", "Client API keys are not configured.");
  }

  const supplied = request.headers.get("X-API-Key");
  if (!supplied) {
    throw new AppError(401, "UNAUTHORIZED", "A valid API key is required.");
  }

  const suppliedHash = await sha256(supplied);
  const configuredHashes = await Promise.all(keys.map(sha256));
  let matched = false;
  for (const configuredHash of configuredHashes) {
    matched = crypto.subtle.timingSafeEqual(suppliedHash, configuredHash) || matched;
  }
  if (!matched) {
    throw new AppError(401, "UNAUTHORIZED", "A valid API key is required.");
  }
  return { fingerprint: hex(suppliedHash) };
}
