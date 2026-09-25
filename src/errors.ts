import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiError, ValidationIssue } from "./types";
export class AppError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    public readonly code: string,
    message: string,
    public readonly issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = "AppError";
  }
  toJSON(): ApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.issues ? { issues: this.issues } : {}),
    };
  }
}
export function asAppError(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
}
