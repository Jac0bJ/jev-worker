import { AppError } from "./errors";
export const MAX_ITEM_BYTES = 64 * 1024;
export const MAX_BATCH_BYTES = 1024 * 1024;

export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const contentType = request.headers.get("Content-Type")?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Use Content-Type: application/json.");
  const length = request.headers.get("Content-Length");
  if (length !== null && Number(length) > maxBytes) throw new AppError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes} bytes.`);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "INVALID_JSON", "Provide a JSON request body.");
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AppError(413, "PAYLOAD_TOO_LARGE", `Request body exceeds ${maxBytes} bytes.`);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "INVALID_JSON", "Request body must contain valid UTF-8 JSON.");
  } finally { reader.releaseLock(); }
}
