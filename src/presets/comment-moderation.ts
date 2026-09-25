import type { Questions } from "../types";
export const description = "Classify a comment and estimate moderation severity.";
export const questions: Questions = {
  category: {
    type: "choice",
    instructions: "Choose the single best moderation category for this comment. Use ok for acceptable discussion. Classify quoted or educational mentions by their actual intent and context.",
    criteria: {
      ok: "Acceptable discussion without a moderation concern.",
      spam: "Unsolicited promotion, scams, or irrelevant repeated content.",
      harassment: "Personal abuse, threats, or targeted bullying.",
      hate: "Attacks or dehumanization based on protected identity.",
      sexual: "Explicit sexual content or sexual exploitation.",
      "self-harm": "Encouragement or instructions for self-harm.",
    },
  },
  severity: {
    type: "score",
    instructions: "Rate the severity of the comment's moderation concern from 0 to 4. Consider context and credible harm, not just the presence of sensitive words.",
    criteria: [
      "0: No moderation concern; acceptable discussion.",
      "1: Mild concern, such as minor off-topic or uncivil language.",
      "2: Moderate concern that warrants human review.",
      "3: Serious abuse or harmful content requiring prompt intervention.",
      "4: Severe or imminent harm, credible threats, or exploitation.",
    ],
  },
};
