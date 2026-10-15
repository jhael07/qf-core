import { ValidationError, type ValidationErrorCode } from "./errors.ts";
import type { NestedKeyOf, NestedValueOf, NullableKeyOf } from "./types.helpers.ts";
import {
  type Condition,
  type ExpressionToken,
  type ExpressionType,
  LogicalOperators,
  type NullOperator,
  type Operator,
  type OperatorFor,
  type OrderBy,
  type OrderByDirection,
  type QueryResult,
  type QuerySchema,
  ValueType,
  type WhereOptions,
} from "./types.ts";

/**
 * Which token may follow which. Each entry maps a token (or the start of the
 * filters) to the tokens that are NOT allowed right after it, and the error
 * they raise. Pairs missing from the table are valid.
 */
const FORBIDDEN_NEXT: Record<
  ExpressionType | "start",
  Partial<Record<ExpressionType | "end", ValidationErrorCode>>
> = {
  start: { and: "INVALID_START", or: "INVALID_START", endGroup: "INVALID_START" },
  condition: { condition: "CONSECUTIVE_CONDITIONS", startGroup: "MISSING_CONNECTOR" },
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

const LABELS: Record<ExpressionType, string> = {
  condition: "a condition",
  and: `"${LogicalOperators.AND}"`,
  or: `"${LogicalOperators.OR}"`,
  startGroup: `"${LogicalOperators.START_GROUP}"`,
  endGroup: `"${LogicalOperators.END_GROUP}"`,
};

const valueTypeOf = (value: unknown): ValueType => {
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

const serialize = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString() : value;

// biome-ignore lint/suspicious/noExplicitAny: <By providing any you can use the class without being required to specify the type>
class Query<T = any> {
  private _filters: Array<ExpressionToken<T>> = [];
  private _orderBy?: OrderBy<T> | null = null;
  private readonly _arrays: ReadonlyArray<string>;

  /**
   * @param schema - Optional runtime facts about `T` that types can't carry,
   *   such as which paths hold arrays.
   */
  constructor(schema?: QuerySchema<T>) {
    this._arrays = schema?.arrays ?? [];
  }

  private _add(op: ExpressionToken<T>, idx?: number): void {
    if (idx !== undefined) {
      this._filters.splice(idx, 0, op);
    } else {
      this._filters.push(op);
    }
  }

  private _isArrayPath(property: string): boolean {
    return this._arrays.some((path) => property === path || property.startsWith(`${path}.`));
  }

  hasKey(key: NestedKeyOf<T>): boolean {
    return this._filters.some((x) => x.type === "condition" && x.property === key);
  }

  hasValue(key: NestedKeyOf<T>, value: unknown): boolean {
    return this._filters.some(
      (x) => x.type === "condition" && x.property === key && x.value === serialize(value),
    );
  }

  remove(idx: number): void {
    this._filters.splice(idx, 1);
  }

  /**
   *
   * @param idx - index position to insert the token, it's undefined by default.
   * @returns Query<T>
   */
  startGroup(idx?: number): Query<T> {
    this._add({ type: "startGroup", operator: LogicalOperators.START_GROUP }, idx);
    return this;
  }

  /**
   *
   * @param idx - index position to insert the token, it's undefined by default.
   * @returns Query<T>
   */
  endGroup(idx?: number): Query<T> {
    this._add({ type: "endGroup", operator: LogicalOperators.END_GROUP }, idx);
    return this;
  }

  /**
   *
   * @param idx - index position to insert the token, it's undefined by default.
   * @returns Query<T>
   */
  and(idx?: number): Query<T> {
    this._add({ type: "and", operator: LogicalOperators.AND }, idx);
    return this;
  }

  /**
   *
   * @param idx - index position to insert the token, it's undefined by default.
   * @returns Query<T>
   */
  or(idx?: number): Query<T> {
    this._add({ type: "or", operator: LogicalOperators.OR }, idx);
    return this;
  }

  orderBy(property: NestedKeyOf<T>, direction: OrderByDirection): Query<T> {
    this._orderBy = { property, direction };
    return this;
  }

  /**
   * Adds a conditional filter token to the query.
   *
   * @typeParam P - A key or nested dot-path of `T` (e.g. `"address.city"`),
   *   inferred from the `property` argument.
   * @param property - The property, or nested property path, of `T` to filter on.
   * @param operator - The comparison operator to apply. Only the operators that
   *   fit the property's value type are allowed (see `OperatorsByValueType`).
   * @param value - The value to compare against. It's typed as `NestedValueOf<T, P>`,
   *   so it has to match the type of the property `property` points to. Dates are
   *   stored as ISO strings. `null` is allowed with `eq`/`neq` on nullable paths.
   * @param options - Insertion and comparison options, see {@link WhereOptions}.
   * @returns The current `Query<T>` instance, so calls can be chained.
   *
   * @example
   * ```ts
   * new Query<User>()
   *   .where('age', Op.GreaterThan, 18, { insertAtIndex: 0 })
   *   .where('address.city', Op.Equals, 'la paz', { caseInsensitive: true });
   * ```
   */
  where<P extends NestedKeyOf<T>>(
    property: P,
    operator: OperatorFor<NestedValueOf<T, P>>,
    value: NestedValueOf<T, P>,
    options?: WhereOptions<T, P>,
  ): Query<T>;
  where<P extends NullableKeyOf<T>>(
    property: P,
    operator: NullOperator,
    value: null,
    options?: { insertAtIndex?: number },
  ): Query<T>;
  where(
    property: string,
    operator: Operator,
    value: unknown,
    options?: { insertAtIndex?: number; caseInsensitive?: boolean },
  ): Query<T> {
    const condition: Record<string, unknown> = {
      type: "condition",
      property,
      operator,
      value: serialize(value),
      valueType: valueTypeOf(value),
    };
    if (this._isArrayPath(property)) condition.isArray = true;
    if (options?.caseInsensitive) condition.caseInsensitive = true;

    this._add(condition as Condition<T>, options?.insertAtIndex);
    return this;
  }

  /**
   * Checks the token sequence against `FORBIDDEN_NEXT` and the group depth,
   * throwing a {@link ValidationError} on the first malformed token.
   */
  private _validateBuild(): void {
    const fail = (code: ValidationErrorCode, index: number, reason: string): never => {
      throw new ValidationError(code, `Invalid filter at index ${index}: ${reason}.`, index);
    };

    let prev: ExpressionType | "start" = "start";
    let depth = 0;

    for (const [index, { type }] of this._filters.entries()) {
      const code = FORBIDDEN_NEXT[prev][type];

      if (code) {
        fail(
          code,
          index,
          prev === "start"
            ? `filters cannot start with ${LABELS[type]}`
            : `${LABELS[type]} cannot follow ${LABELS[prev]}`,
        );
      }

      if (type === "startGroup") depth++;
      if (type === "endGroup" && depth-- === 0) {
        fail("UNBALANCED_GROUP", index, `${LABELS.endGroup} has no matching opening group`);
      }
      prev = type;
    }

    const lastIndex = this._filters.length - 1;
    const endCode = FORBIDDEN_NEXT[prev].end;
    if (endCode && prev !== "start") {
      fail(endCode, lastIndex, `filters cannot end with ${LABELS[prev]}`);
    }
    if (depth > 0) {
      fail("UNBALANCED_GROUP", lastIndex, `${depth} group(s) not closed`);
    }
  }

  build(): QueryResult<T> {
    this._validateBuild();
    return { filters: [...this._filters], order: this._orderBy };
  }
}

export default Query;

// group<T>(fn: (query: Query<T>)=> ExpressionToken<T>[] ): Query<T> {
//   this._add({ type: "startGroup", operator: LogicalOperators.START_GROUP }, idx);
// fn
//   this._add({ type: "endGroup", operator: LogicalOperators.END_GROUP }, idx);
//   return this;
// }
