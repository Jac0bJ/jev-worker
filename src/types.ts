// Application contracts. Only the lead integrator edits this file.
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type Description = string | JsonObject | JsonValue[];
export type State = string | JsonObject;
export type Question =
  | {
      type: "noul";
      instructions: Description;
      criteria?: { true?: Description; false?: Description };
    }
  | {
      type: "choice";
      instructions: Description;
      criteria: Record<string, Description | null>;
    }
  | { type: "score"; instructions: Description; criteria: Description[] };
export type Questions = Record<string, Question>;
export interface JevInput {
  state: State;
  questions: Questions;
}
export interface DecideRequest extends JevInput {
  cache?: boolean;
}
export type Answer =
  | { type: "noul"; noul: number }
  | {
      type: "choice";
      choice: string;
      confidence: number;
      probabilities: Record<string, number>;
    }
  | {
      type: "score";
      score: number;
      confidence: number;
      probabilities: Record<string, number>;
      legend: Record<string, Description>;
    };
export interface JevResult {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}
export type Decision = "auto" | "review" | "reject";
export type RoutedAnswer = Answer & {
  decision: Decision;
  decision_confidence: number;
  decision_confidence_source: "model" | "derived-noul";
  rating?: number;
};
export interface DecisionResponse extends Omit<JevResult, "answers"> {
  answers: Record<string, RoutedAnswer>;
}
export type CacheStatus = "HIT" | "MISS" | "BYPASS" | "ERROR";
export interface DecisionOutcome {
  data: DecisionResponse;
  cache: CacheStatus;
}
export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}
export interface ApiError {
  code: string;
  message: string;
  issues?: ValidationIssue[];
}
export type BatchItem = {
  index: number;
  status: number;
  data?: DecisionResponse;
  error?: ApiError;
  cache?: CacheStatus;
};
export interface Preset {
  name: string;
  description: string;
  questions: Questions;
}
export interface ClientIdentity {
  fingerprint: string;
}
export interface AppConfig {
  provider: "workers-ai" | "typesafe";
  confidenceAuto: number;
  confidenceReview: number;
  cacheTtlSeconds: number;
  upstreamTimeoutMs: number;
  batchMaxItems: number;
  batchConcurrency: number;
  authEnabled: boolean;
  environment: "production" | "development";
  allowedOrigins: string[];
  logInputs: boolean;
}
export type ConfigVar =
  | "JEV_PROVIDER"
  | "CONFIDENCE_AUTO"
  | "CONFIDENCE_REVIEW"
  | "CACHE_TTL_SECONDS"
  | "UPSTREAM_TIMEOUT_MS"
  | "BATCH_MAX_ITEMS"
  | "BATCH_CONCURRENCY"
  | "AUTH_ENABLED"
  | "ENVIRONMENT"
  | "CORS_ALLOWED_ORIGINS"
  | "LOG_INPUTS";
// Env is generated from Wrangler. Runtime strings are validated by loadConfig.
export type AppEnv = Pick<Env, "AI" | "JEV_CACHE" | "RATE_LIMITER"> &
  Partial<Record<ConfigVar, string>> & {
    CLIENT_API_KEYS?: string;
    TYPESAFE_API_KEY?: string;
  };
export interface DecisionLog {
  requestId: string;
  preset?: string;
  latencyMs: number;
  cache: CacheStatus;
  provider: AppConfig["provider"];
  model?: string;
  status: number;
  errorCode?: string;
  answers?: {
    type: Answer["type"];
    confidence: number;
    decision: Decision;
    source: "model" | "derived-noul";
  }[];
}
