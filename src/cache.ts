import type { ClientIdentity, JevInput, JevResult } from "./types";
import type { JevProvider } from "./providers/types";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function makeCacheKey(input: JevInput, provider: JevProvider, client: ClientIdentity): Promise<string> {
  const material = canonical({ version: 1, client: client.fingerprint, provider: provider.id, model: provider.model, state: input.state, questions: input.questions });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return `jev-worker:cache:v1:${hex(new Uint8Array(digest))}`;
}

export async function readCache(kv: KVNamespace, key: string): Promise<unknown | null> {
  const value: unknown = await kv.get(key, "json");
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const envelope = value as Record<string, unknown>;
  if (typeof envelope.expiresAt !== "number" || !Number.isFinite(envelope.expiresAt) || envelope.expiresAt <= Date.now()) return null;
  if (envelope.result === null || typeof envelope.result !== "object" || Array.isArray(envelope.result)) return null;
  return envelope.result;
}

export async function writeCache(kv: KVNamespace, key: string, result: JevResult, ttl: number): Promise<void> {
  await kv.put(key, JSON.stringify({ expiresAt: Date.now() + ttl * 1000, result }), { expirationTtl: ttl });
}
