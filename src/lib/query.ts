import { ValidationError, type ValidationErrorCode } from "./errors.ts";
import { serialize, valueTypeOf } from "./helpers/index.ts";
import type {
  NestedKeyOf,
  NestedValueOf,
  NullableKeyOf,
} from "./types.helpers.ts";
import {
  type Condition,
  type ExpressionToken,
  type ExpressionType,
  LogicalOperators,
  type NullOperator,
  type Operator,
  OperatorBaseline,
  type OperatorFor,
  type OrderBy,
  type OrderByDirection,
  type QueryResult,
  type WhereOptions,
} from "./types.ts";
import { FORBIDDEN_NEXT, LABELS } from "./types/validation-errors.types.ts";

export type GroupQuery<T> = {
  and(idx?: number): GroupQuery<T>;
  or(idx?: number): GroupQuery<T>;

  where<P extends NestedKeyOf<T>>(
    property: P,
    operator: OperatorFor<NestedValueOf<T, P>>,
    value: NestedValueOf<T, P>,
    options?: WhereOptions<T, P>,
  ): GroupQuery<T>;
  where<P extends NullableKeyOf<T>>(
    property: P,
    operator: NullOperator,
    value: null,
    options?: { insertAtIndex?: number },
  ): GroupQuery<T>;
};

// biome-ignore lint/suspicious/noExplicitAny: <By providing any you can use the class without being required to specify the type>
class Query<T = any> {
  private _filters: Array<ExpressionToken<T>> = [];
  private _orderBy?: OrderBy<T> | null = null;

  constructor() {}

  private _add(op: ExpressionToken<T>, idx?: number): void {
    if (idx !== undefined) {
      this._filters.splice(idx, 0, op);
    } else {
      this._filters.push(op);
    }
  }

  hasKey(key: NestedKeyOf<T>): boolean {
    return this._filters.some(
      (x) => x.type === "condition" && x.property === key,
    );
  }

  hasValue(key: NestedKeyOf<T>, value: unknown): boolean {
    return this._filters.some(
      (x) =>
        x.type === "condition" &&
        x.property === key &&
        x.value === serialize(value),
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
   * Adds a condition to the query.
   *
   * @typeParam P - A key or nested dot-path of `T` (e.g. `"address.city"`),
   *   inferred from `property`.
   * @param property - The property, or nested property path, of `T` to filter on.
   * @param operator - The comparison operator. Only operators that fit the
   *   property's value type are allowed (see `OperatorsByValueType`).
   * @param value - The value to compare against. Must match the type of the
   *   property at `property`. Dates are stored as ISO strings.
   * @param options - Insertion and comparison options, see {@link WhereOptions}.
   * @returns The current {@link Query} instance, for chaining.
   *
   * @example
   * ```ts
   * new Query<User>()
   *   .where("age", Op.GreaterThan, 18)
   *   .and()
   *   .where("address.city", Op.Equals, "la paz", { caseInsensitive: true });
   * ```
   */
  where<P extends NestedKeyOf<T>>(
    property: P,
    operator: OperatorFor<NestedValueOf<T, P>>,
    value: NestedValueOf<T, P>,
    options?: WhereOptions<T, P>,
  ): Query<T>;
  /**
   * Adds a null check on a nullable property.
   *
   * @typeParam P - A nullable key or nested dot-path of `T`.
   * @param property - The nullable property, or nested property path, to check.
   * @param operator - `Op.Equals` to match `null`, `Op.NotEquals` to exclude it.
   * @param value - Always `null`.
   * @param options - Insertion options.
   * @returns The current {@link Query} instance, for chaining.
   *
   * @example
   * ```ts
   * new Query<User>().where("deletedAt", Op.Equals, null);
   * ```
   */
  where<P extends NullableKeyOf<T>>(
    property: P,
    operator: NullOperator,
    value: null,
    options?: { insertAtIndex?: number },
  ): Query<T>;
  /**
   * Adds a group of conditions, equivalent to wrapping them in parentheses.
   * Use it to control precedence when mixing `and()` and `or()`.
   *
   * @param fn - Callback that receives the query scoped to the group.
   *   Add the grouped conditions to it and return it.
   * @returns The current {@link Query} instance, for chaining.
   *
   * @example
   * ```ts
   * // name = "Jhael" OR (password != "123" AND name contains "Jhael")
   * new Query<User>()
   *   .where("name", Op.Equals, "Jhael")
   *   .or()
   *   .where((q) =>
   *     q.where("password", Op.NotEquals, "123").and().where("name", Op.Contains, "Jhael"),
   *   );
   * ```
   */
  where(fn: (query: GroupQuery<T>) => void): Query<T>;
  where(
    propertyOrFn: string | ((query: GroupQuery<T>) => void),
    operator?: Operator,
    value?: unknown,
    options?: { insertAtIndex?: number; caseInsensitive?: boolean },
  ): Query<T> {
    if (typeof propertyOrFn === "function") {
      this._add({ type: "startGroup", operator: LogicalOperators.START_GROUP });
      propertyOrFn(this);
      this._add({ type: "endGroup", operator: LogicalOperators.END_GROUP });
      return this;
    }

    const property = propertyOrFn;
    const condition: Record<string, unknown> = {
      type: "condition",
      property,
      operator: OperatorBaseline[operator as Operator],
      value: serialize(value),
      valueType: valueTypeOf(value),
    };
    if (options?.caseInsensitive) condition.caseInsensitive = true;

    this._add(condition as Condition<T>, options?.insertAtIndex);
    return this;
  }

  /**
   * Checks the token sequence against {@link FORBIDDEN_NEXT} and the group depth,
   * throwing a {@link ValidationError} on the first malformed token.
   */
  private _validateBuild(): void {
    const fail = (
      code: ValidationErrorCode,
      index: number,
      reason: string,
    ): never => {
      throw new ValidationError(
        code,
        `Invalid filter at index ${index}: ${reason}.`,
        index,
      );
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
        fail(
          "UNBALANCED_GROUP",
          index,
          `${LABELS.endGroup} has no matching opening group`,
        );
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
