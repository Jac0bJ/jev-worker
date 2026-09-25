import { asAppError } from "../errors";
import type { BatchItem, CacheStatus, DecideRequest, DecisionOutcome } from "../types";
export async function runBatch(
  items: DecideRequest[],
  concurrency: number,
  process: (item: DecideRequest, index: number) => Promise<DecisionOutcome>,
): Promise<BatchItem[]> {
  if (items.length === 0) return [];
  const results = new Array<BatchItem>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        const outcome = await process(items[index], index);
        results[index] = { index, status: 200, data: outcome.data, cache: outcome.cache };
      } catch (cause) {
        const error = asAppError(cause);
        results[index] = { index, status: error.status, error: error.toJSON() };
      }
    }
  };
  const limit = Number.isFinite(concurrency) ? Math.max(1, Math.floor(concurrency)) : 1;
  await Promise.all(Array.from({ length: Math.min(items.length, limit) }, worker));
  return results;
}
export function summarizeBatchCache(results: BatchItem[]): CacheStatus | "MIXED" {
  const statuses = results.map((item) => item.cache ?? "ERROR");
  const first = statuses[0] ?? "ERROR";
  return statuses.every((status) => status === first) ? first : "MIXED";
}
