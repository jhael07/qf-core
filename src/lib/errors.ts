export type ValidationErrorCode =
  | "INVALID_START"
  | "INVALID_END"
  | "MISSING_CONNECTOR"
  | "UNBALANCED_GROUP"
  | "EMPTY_GROUP"
  | "CONSECUTIVE_CONDITIONS"
  | "CONSECUTIVE_LOGICAL_OPERATORS";

export class ValidationError extends Error {
  readonly code: ValidationErrorCode;
  /** Position of the offending token in the filters list. */
  readonly index: number;

  constructor(code: ValidationErrorCode, message: string, index: number) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.index = index;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
