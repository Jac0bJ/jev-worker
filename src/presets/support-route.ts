import type { Questions } from "../types";
export const description = "Route a support request to the right department.";
export const questions: Questions = {
  department: {
    type: "choice",
    instructions: "Choose the department best suited to resolve the main issue in this support request.",
    criteria: {
      billing: "Payments, invoices, charges, refunds, or subscriptions.",
      bug: "A product error, broken behavior, or technical malfunction.",
      "feature-request": "A suggestion for new or improved product behavior.",
      account: "Sign-in, access, profile, or account management.",
      other: "Anything that does not fit the other departments.",
    },
  },
};
