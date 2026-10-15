import { ValueType, type InsertAt } from "../types.ts";
import { ValidationError } from "../errors.ts";

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
