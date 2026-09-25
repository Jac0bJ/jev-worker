import type { Questions } from "../types";
export const description = "Score the quality of an inbound sales lead.";
export const questions: Questions = {
  quality: {
    type: "score",
    instructions:
      "Assess the commercial quality of this inbound lead from 0 to 4 using specificity, apparent fit, intent, and readiness. Do not infer facts that are absent from the message.",
    criteria: [
      "0: Irrelevant, spam, or no discernible buying intent.",
      "1: Vague interest with little evidence of fit or intent.",
      "2: Plausible fit and interest, but key needs or timing are unclear.",
      "3: Clear need and good fit with meaningful buying intent.",
      "4: Strong fit, explicit need, and near-term purchase readiness.",
    ],
  },
};
