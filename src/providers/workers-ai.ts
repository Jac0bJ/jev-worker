import { AppError } from "../errors";
import { parseProviderResult } from "../schemas";
import type { AppEnv } from "../types";
import type { JevProvider } from "./types";

export function createWorkersAIProvider(env: Pick<AppEnv, "AI">): JevProvider {
  return {
    id: "workers-ai",
    model: "typesafe/jev",
    async evaluate(input, { signal }) {
      let output: unknown;
      try {
        output = await env.AI.run(
          "typesafe/jev",
          { state: input.state, questions: input.questions },
          { signal },
        );
      } catch (error) {
        if (signal.aborted) throw error;
        if (
          error instanceof Error &&
          error.name === "AiGatewayError" &&
          /^2021: Insufficient AI Gateway credits(?:\.|$)/.test(error.message)
        ) {
          throw new AppError(
            503,
            "UPSTREAM_BILLING_REQUIRED",
            "Cloudflare AI Gateway credits are required to use Jev.",
          );
        }
        throw new AppError(502, "UPSTREAM_ERROR", "Jev request failed.");
      }
      return parseProviderResult(output, input);
    },
  };
}
