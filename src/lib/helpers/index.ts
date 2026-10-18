import { ValueType, type ExpressionToken, type ExpressionType, type InsertAt } from "../types.ts";
import { ValidationError, type ValidationErrorCode } from "../errors.ts";
import type { GetTokenOfType } from "../types/filter-builder.types.ts";
import { FORBIDDEN_NEXT, LABELS } from "../types/validation-errors.types.ts";

export const valueTypeOf = (value: unknown): ValueType => {
  if (value === null) return ValueType.NULL;
  if (value instanceof Date) return ValueType.DATE;
  switch (typeof value) {
    case "string":
      return ValueType.STRING;
    case "number":
      return ValueType.NUMBER;
    case "boolean":
      return ValueType.BOOLEAN;
    default:
      throw new TypeError(`Unsupported filter value of type "${typeof value}".`);
  }
};

export const serialize = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

export const indexOf = (at?: InsertAt): number | undefined =>
  typeof at === "number" ? at : at?.insertAtIndex;

export const checkIndex = (idx: number, max: number): void => {
  if (Number.isInteger(idx) && idx >= 0 && idx <= max) return;
  throw new ValidationError(
    "INVALID_INDEX",
    max < 0
      ? `Invalid index ${idx}: there are no filters.`
      : `Invalid index ${idx}: expected an integer from 0 to ${max}.`,
    idx,
  );
};

export function validateRemovalIndex<T>(idx: number, filters: Array<ExpressionToken<T>>): void {
  const conditionNotFoundMsg = "No condition matches: nothing to remove.";

  if (idx === -1) throw new ValidationError("CONDITION_NOT_FOUND", conditionNotFoundMsg, idx);

  checkIndex(idx, filters.length - 1);

  const invalidIdxMsg = (idx: number) =>
    `Invalid index ${idx}: the token there is not a condition.`;

  if (filters[idx].type !== "condition")
    throw new ValidationError("INVALID_INDEX" as ValidationErrorCode, invalidIdxMsg(idx), idx);
}

export function findRemovalRange<T>(
  idx: number,
  filters: Array<ExpressionToken<T>>,
): [number, number] {
  const isConnector = (i: number) => filters[i]?.type === "and" || filters[i]?.type === "or";

  let start = idx;
  let end = idx;

  // Grow the [start, end] range outward to clean up adjacent connectors or empty groups
  while (true) {
    if (isConnector(end + 1)) {
      end++;
      break;
    }

    if (isConnector(start - 1)) {
      start--;
      break;
    }

    if (filters[start - 1]?.type !== "startGroup") break;
    if (filters[end + 1]?.type !== "endGroup") break;

    start--;
    end++;
  }

  return [start, end];
}

export function getTokenOfType<T>(params: GetTokenOfType<T>): ExpressionToken<T> {
  const { idx, label, types, filters } = params;
  const token = filters[idx];

  if (!types.includes(token.type)) {
    throw new ValidationError(
      "INVALID_INDEX",
      `Invalid index ${idx}: the token there is not ${label}.`,
      idx,
    );
  }

  return token;
}

/**
 * Checks the token sequence against {@link FORBIDDEN_NEXT} and the group depth,
 * throwing a {@link ValidationError} on the first malformed token.
 */
export function validateBuild<T>(filters: Array<ExpressionToken<T>>): void {
  const fail = (code: ValidationErrorCode, index: number, reason: string): never => {
    throw new ValidationError(code, `Invalid filter at index ${index}: ${reason}.`, index);
  };

  let prev: ExpressionType | "start" = "start";
  let depth = 0;

  for (const [index, { type }] of filters.entries()) {
    const code = FORBIDDEN_NEXT[prev][type];

    if (code) {
      const reason =
        prev === "start"
          ? `filters cannot start with ${LABELS[type]}`
          : `${LABELS[type]} cannot follow ${LABELS[prev]}`;

      fail(code, index, reason);
    }

    if (type === "startGroup") depth++;
    if (type === "endGroup" && depth-- === 0) {
      const reason = `${LABELS.endGroup} has no matching opening group`;
      fail("UNBALANCED_GROUP", index, reason);
    }
    prev = type;
  }

  const lastIndex = filters.length - 1;
  const endCode = FORBIDDEN_NEXT[prev].end;
  if (endCode && prev !== "start") {
    fail(endCode, lastIndex, `filters cannot end with ${LABELS[prev]}`);
  }
  if (depth > 0) {
    fail("UNBALANCED_GROUP", lastIndex, `${depth} group(s) not closed`);
  }
}
