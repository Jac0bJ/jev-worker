import { AppError } from "../errors";
import { parseProviderResult } from "../schemas";
import type { JevProvider } from "./types";

const URL = "https://api.typesafe.ai/v1/systemone";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
async function boundedJson(response: Response): Promise<unknown> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESPONSE_BYTES) throw new AppError(502, "UPSTREAM_INVALID_RESPONSE", "Jev response is too large.");
  if (!response.body) throw new AppError(502, "UPSTREAM_INVALID_RESPONSE", "Jev returned an empty response.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) throw new AppError(502, "UPSTREAM_INVALID_RESPONSE", "Jev response is too large.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => undefined); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new AppError(502, "UPSTREAM_INVALID_RESPONSE", "Jev returned invalid JSON."); }
}
export function createTypeSafeProvider(apiKey: string, fetcher: typeof fetch = fetch): JevProvider {
  return {
    id: "typesafe", model: "jev-latest",
    async evaluate(input, { signal }) {
      let response: Response;
      try {
        response = await fetcher(URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "jev-latest", state: input.state, questions: input.questions }),
          signal,
        });
      } catch (error) {
        if (signal.aborted) throw error;
        throw new AppError(502, "UPSTREAM_ERROR", "Unable to reach Jev.");
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        if (response.status === 401 || response.status === 403) throw new AppError(503, "UPSTREAM_AUTH_ERROR", "Jev credentials were rejected.");
        if (response.status === 429) throw new AppError(503, "UPSTREAM_RATE_LIMITED", "Jev rate limit was reached.");
        if (response.status >= 500) throw new AppError(503, "UPSTREAM_UNAVAILABLE", "Jev is unavailable.");
        throw new AppError(502, "UPSTREAM_ERROR", "Jev request failed.");
      }
      try { return parseProviderResult(await boundedJson(response), input); }
      catch (error) {
        if (signal.aborted || error instanceof AppError) throw error;
        throw new AppError(502, "UPSTREAM_ERROR", "Jev response could not be read.");
      }
    },
  };
}
