import type { AppConfig, JevInput, JevResult } from "../src/types";
export const config: AppConfig = { provider: "workers-ai", confidenceAuto: .9, confidenceReview: .6, cacheTtlSeconds: 3600, upstreamTimeoutMs: 15000, batchMaxItems: 20, batchConcurrency: 4, authEnabled: true, environment: "production", allowedOrigins: [], logInputs: false };
export const sampleInput: JevInput = { state: "A support request", questions: { urgent: { type: "noul", instructions: "Is this urgent?" } } };
export const sampleResult: JevResult = { model: "jev-1.13.0", answers: { urgent: { type: "noul", noul: .95 } }, usage: { input_tokens: 20, output_tokens: 4 } };
