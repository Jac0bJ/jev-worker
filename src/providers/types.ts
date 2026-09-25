import type { JevInput, JevResult } from "../types";
export interface JevProvider {
  readonly id: "workers-ai" | "typesafe";
  readonly model: string;
  evaluate(input: JevInput, options: { signal: AbortSignal }): Promise<JevResult>;
}
