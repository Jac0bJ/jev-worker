import { AppError } from "./errors";
import type { AppConfig } from "./types";

export function corsHeaders(request: Request, config: AppConfig): Headers {
  const headers = new Headers({
    Vary: "Origin",
    "Access-Control-Expose-Headers": "X-Cache, X-Request-ID",
  });
  const origin = request.headers.get("Origin");
  if (!origin) return headers;
  if (config.allowedOrigins.includes("*")) {
    headers.set("Access-Control-Allow-Origin", "*");
  } else if (config.allowedOrigins.includes(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  } else {
    throw new AppError(403, "CORS_FORBIDDEN", "Origin is not allowed.");
  }
  return headers;
}

export function handlePreflight(
  request: Request,
  config: AppConfig,
): Response | null {
  if (request.method !== "OPTIONS") return null;
  const headers = corsHeaders(request, config);
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
  return new Response(null, { status: 204, headers });
}
