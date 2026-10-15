import type { ValidationErrorCode } from "../errors.ts";
import { LogicalOperators, type ExpressionType } from "../types.ts";

/**
 * Which token may follow which. Each entry maps a token (or the start of the
 * filters) to the tokens that are NOT allowed right after it, and the error
 * they raise. Pairs missing from the table are valid.
 */
export const FORBIDDEN_NEXT: Record<
  ExpressionType | "start",
  Partial<Record<ExpressionType | "end", ValidationErrorCode>>
> = {
  start: {
    and: "INVALID_START",
    or: "INVALID_START",
    endGroup: "INVALID_START",
  },
  condition: {
    condition: "CONSECUTIVE_CONDITIONS",
    startGroup: "MISSING_CONNECTOR",
  },
  and: {
    and: "CONSECUTIVE_LOGICAL_OPERATORS",
    or: "CONSECUTIVE_LOGICAL_OPERATORS",
    endGroup: "CONSECUTIVE_LOGICAL_OPERATORS",
    end: "INVALID_END",
  },
  or: {
    and: "CONSECUTIVE_LOGICAL_OPERATORS",
    or: "CONSECUTIVE_LOGICAL_OPERATORS",
    endGroup: "CONSECUTIVE_LOGICAL_OPERATORS",
    end: "INVALID_END",
  },
  startGroup: {
    and: "INVALID_START",
    or: "INVALID_START",
    endGroup: "EMPTY_GROUP",
    end: "INVALID_END",
  },
  endGroup: { condition: "MISSING_CONNECTOR", startGroup: "MISSING_CONNECTOR" },
};

export const LABELS: Record<ExpressionType, string> = {
  condition: "a condition",
  and: `"${LogicalOperators.AND}"`,
  or: `"${LogicalOperators.OR}"`,
  startGroup: `"${LogicalOperators.START_GROUP}"`,
  endGroup: `"${LogicalOperators.END_GROUP}"`,
};
