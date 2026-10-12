/**
 * A single error type with a stable machine-readable `code`.
 *
 * Callers (the API, the CLI) map codes to HTTP statuses or exit codes instead of matching
 * on message text, which keeps error handling robust as wording changes.
 */
export type ErrorCode =
  | "invalid_url"
  | "blocked_url"
  | "fetch_failed"
  | "robots_disallowed"
  | "unsupported_content"
  | "not_found"
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "llm_failed"
  | "internal";

export class MatrixError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MatrixError";
    this.code = code;
  }
}

/** Narrowing helper for `catch (err)` blocks. */
export function isMatrixError(err: unknown): err is MatrixError {
  return err instanceof MatrixError;
}
