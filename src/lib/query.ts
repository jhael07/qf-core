import { ValidationError, type ValidationErrorCode } from "./errors.ts";
import { serialize, valueTypeOf } from "./helpers/index.ts";
import type { NestedKeyOf, NestedValueOf, NullableKeyOf } from "./types.helpers.ts";
import {
  type CompareOptions,
  type Condition,
  type ExpressionToken,
  type ExpressionType,
  type InsertAt,
  type InsertOptions,
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

/**
 * The builder a {@link Query.group} callback receives. Tokens always append
 * inside the group, so none of its methods take an index.
 */
export type GroupQuery<T> = {
  and(): GroupQuery<T>;
  or(): GroupQuery<T>;
  group(fn: (query: GroupQuery<T>) => void): GroupQuery<T>;

  where<P extends NestedKeyOf<T>>(
    property: P,
    operator: OperatorFor<NestedValueOf<T, P>>,
    value: NestedValueOf<T, P>,
    options?: CompareOptions<T, P>,
  ): GroupQuery<T>;
  where<P extends NullableKeyOf<T>>(
    property: P,
    operator: NullOperator,
    value: null,
  ): GroupQuery<T>;
};

const indexOf = (at?: InsertAt): number | undefined =>
  typeof at === "number" ? at : at?.insertAtIndex;

const checkIndex = (idx: number, max: number): void => {
  if (Number.isInteger(idx) && idx >= 0 && idx <= max) return;
  throw new ValidationError(
    "INVALID_INDEX",
    max < 0
      ? `Invalid index ${idx}: there are no filters.`
      : `Invalid index ${idx}: expected an integer from 0 to ${max}.`,
    idx,
  );
};

// biome-ignore lint/suspicious/noExplicitAny: <By providing any you can use the class without being required to specify the type>
class Query<T = any> {
  private _filters: Array<ExpressionToken<T>> = [];
  private _orderBy?: OrderBy<T> | null = null;

  totalCount: number = this._filters.length;

  private _add(tokens: Array<ExpressionToken<T>>, at?: InsertAt): void {
    const idx = indexOf(at);
    if (idx === undefined) {
      this._filters.push(...tokens);
      return;
    }
    checkIndex(idx, this._filters.length);
    this._filters.splice(idx, 0, ...tokens);
  }

  hasKey(key: NestedKeyOf<T>): boolean {
    return this._filters.some((x) => x.type === "condition" && x.property === key);
  }

  hasValue(key: NestedKeyOf<T>, value: unknown): boolean {
    return this._filters.some(
      (x) => x.type === "condition" && x.property === key && x.value === serialize(value),
    );
  }

  /**
   * Finds the position of the first condition on `key` whose stored value is
   * strictly equal to `value`. Pass the result to {@link Query.remove} or as
   * an insertion index.
   *
   * @param key - The property, or nested property path, of the condition.
   * @param value - The value the condition compares against.
   * @returns The condition's index in the filters, or `-1` if none matches.
   *
   * @example
   * ```ts
   * const query = new Query<User>().where("age", Op.GREATER_THAN, 18);
   * query.getIndexByToken("age", 18); // 0
   * ```
   */
  getIndexByToken(key: NestedKeyOf<T>, value: unknown): number {
    return this._filters.findIndex(
      (x) => x.type === "condition" && x.value === value && x.property === key,
    );
  }

  getTokenByIndex(idx: number): ExpressionToken<T> {
    checkIndex(idx, this._filters.length - 1);

    const tokenExpression = this._filters[idx];
    return tokenExpression;
  }

  /**
   * Removes the token at `idx` from the filters. Only that one token is
   * removed, so remove a condition's connector as well.
   *
   * @throws {@link ValidationError} with code `INVALID_INDEX` when `idx` is
   *   not an existing position.
   */
  remove(idx: number): void {
    checkIndex(idx, this._filters.length - 1);
    this._filters.splice(idx, 1);
  }

  /**
   * Adds an `&&` connector.
   *
   * @param at - Where to insert it: an index or `{ insertAtIndex }`. Appends when omitted.
   * @returns The current {@link Query} instance, for chaining.
   */
  and(at?: InsertAt): Query<T> {
    this._add([{ type: "and", operator: LogicalOperators.AND }], at);
    return this;
  }

  /**
   * Adds an `||` connector.
   *
   * @param at - Where to insert it: an index or `{ insertAtIndex }`. Appends when omitted.
   * @returns The current {@link Query} instance, for chaining.
   */
  or(at?: InsertAt): Query<T> {
    this._add([{ type: "or", operator: LogicalOperators.OR }], at);
    return this;
  }

  /**
   * Adds a group of conditions, equivalent to wrapping them in parentheses.
   * Use it to control precedence when mixing `and()` and `or()`.
   *
   * @param fn - Callback that receives a builder scoped to the group. Tokens
   *   added to it always append inside the group.
   * @param at - Where to insert the whole group: an index or `{ insertAtIndex }`.
   *   Appends when omitted.
   * @returns The current {@link Query} instance, for chaining.
   *
   * @example
   * ```ts
   * // name = "Jhael" OR (password != "123" AND name contains "Jhael")
   * new Query<User>()
   *   .where("name", Op.EQUAL, "Jhael")
   *   .or()
   *   .group((q) =>
   *     q.where("password", Op.NOT_EQUAL, "123").and().where("name", Op.CONTAINS, "Jhael"),
   *   );
   * ```
   */
  group(fn: (query: GroupQuery<T>) => void, at?: InsertAt): Query<T> {
    const inner = new Query<T>();
    fn(inner as unknown as GroupQuery<T>);
    this._add(
      [
        { type: "startGroup", operator: LogicalOperators.START_GROUP },
        ...inner._filters,
        { type: "endGroup", operator: LogicalOperators.END_GROUP },
      ],
      at,
    );
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
   *   .where("age", Op.GREATER_THAN, 18)
   *   .and()
   *   .where("address.city", Op.EQUAL, "la paz", { caseInsensitive: true });
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
   * @param operator - `Op.EQUAL` to match `null`, `Op.NOT_EQUAL` to exclude it.
   * @param value - Always `null`.
   * @param options - Insertion options.
   * @returns The current {@link Query} instance, for chaining.
   *
   * @example
   * ```ts
   * new Query<User>().where("deletedAt", Op.EQUAL, null);
   * ```
   */
  where<P extends NullableKeyOf<T>>(
    property: P,
    operator: NullOperator,
    value: null,
    options?: InsertOptions,
  ): Query<T>;
  where(
    property: string,
    operator: Operator,
    value: unknown,
    options?: InsertOptions & { caseInsensitive?: boolean },
  ): Query<T> {
    const condition: Record<string, unknown> = {
      type: "condition",
      property,
      operator: OperatorBaseline[operator as Operator],
      value: serialize(value),
      valueType: valueTypeOf(value),
    };
    if (options?.caseInsensitive) condition.caseInsensitive = true;

    this._add([condition as Condition<T>], options);
    return this;
  }

  /**
   * Checks the token sequence against {@link FORBIDDEN_NEXT} and the group depth,
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
