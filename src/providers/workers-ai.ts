import { AppError } from "../errors";
import { parseProviderResult } from "../schemas";
import type { AppEnv } from "../types";
import type { JevProvider } from "./types";

export function createWorkersAIProvider(env: Pick<AppEnv, "AI">): JevProvider {
  return {
    id: "workers-ai", model: "typesafe/jev",
    async evaluate(input, { signal }) {
      let output: unknown;
      try { output = await env.AI.run("typesafe/jev", { state: input.state, questions: input.questions }, { signal }); }
      catch (error) {
        if (signal.aborted) throw error;
        throw new AppError(502, "UPSTREAM_ERROR", "Jev request failed.");
      }
      return parseProviderResult(output, input);
    },
  };
}
