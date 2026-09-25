import type { Questions } from "../types";
export const description = "Detect likely spam in a submitted form message.";
export const questions: Questions = {
  spam: {
    type: "noul",
    instructions: "Is this form submission spam? Consider unsolicited advertising, scams, repeated boilerplate, and irrelevant links. Legitimate inquiries are not spam.",
    criteria: {
      true: "The message is unsolicited, deceptive, promotional, or irrelevant to the form's purpose.",
      false: "The message is a genuine inquiry or relevant submission, even if brief or imperfectly written.",
    },
  },
};
