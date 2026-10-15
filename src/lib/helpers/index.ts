import { ValueType } from "../types.ts";

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
      throw new TypeError(
        `Unsupported filter value of type "${typeof value}".`,
      );
  }
};

export const serialize = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;
