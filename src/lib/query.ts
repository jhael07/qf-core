import type { NestedKeyOf, NestedValueOf } from "./types.helpers.ts";
import { checkIndex, indexOf, serialize, valueTypeOf } from "./helpers/index.ts";
import { FORBIDDEN_NEXT, LABELS } from "./types/validation-errors.types.ts";
import { ValidationError, type ValidationErrorCode } from "./errors.ts";
import {
  OperatorBaseline,
  type OrderByDirection,
  type ExpressionToken,
  type WhereOptions,
  LogicalOperators,
  type OperatorFor,
  type QueryResult,
  type GroupQuery,
  type Condition,
  type InsertAt,
  type Operator,
  type OrderBy,
  type ExpressionType,
  type Or,
  type And,
} from "./types.ts";

// biome-ignore lint/suspicious/noExplicitAny: <By providing any you can use the class without being required to specify the type>
class Query<T = any> {
  private _filters: Array<ExpressionToken<T>> = [];
  private _orderBy?: OrderBy<T>[] | null = null;

  /** The number of tokens in the filters: conditions, connectors and group brackets. */
  get totalCount(): number {
    return this._filters.length;
  }

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
   * Finds the position of the first condition on `key` whose value matches
   * `value`. Values are compared the way they are stored, so a `Date` matches
   * its ISO string. Pass the result to {@link Query.remove} or as an
   * insertion index.
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
      (x) => x.type === "condition" && x.property === key && x.value === serialize(value),
    );
  }

  getIndexByConditionPropertyName(property: NestedKeyOf<T>): number {
    return this._filters.findIndex((x) => x.type === "condition" && x.property === property);
  }

  getTokenByIndex(idx: number): ExpressionToken<T> {
    checkIndex(idx, this._filters.length - 1);

    const tokenExpression = this._filters[idx];
    return tokenExpression;
  }

  getConditionByPropertyName(property: NestedKeyOf<T>): Condition<T> | undefined {
    const condtion = this._filters.find(
      (x) => x.type === "condition" && x.property === property,
    ) as Condition<T> | undefined;

    return condtion;
  }

  getAllConditionsByPropertyName(property: NestedKeyOf<T>): Condition<T>[] {
    const conditions = this._filters.filter(
      (x) => x.type === "condition" && x.property === property,
    );

    return conditions as Condition<T>[];
  }

  /**
   * Removes the condition at `idx` together with the tokens that would be left
   * dangling, so the filters stay valid:
   *
   * - the connector after it, or the one before it when it is the last
   *   condition in the filters or its group;
   * - its group when it is the only thing inside, applying the same rule to
   *   the group, so emptied nested groups go as well.
   *
   * A group left with a single condition is kept as is.
   *
   * @param idx - The condition's position, usually from {@link Query.getIndexByToken}.
   *
   * @throws - {@link ValidationError} with code `CONDITION_NOT_FOUND` when `idx`
   *   is `-1`, the value {@link Query.getIndexByToken} returns for no match.
   * @throws - {@link ValidationError} with code `INVALID_INDEX` when `idx` is
   *   not an existing position or the token there is not a condition.
   *
   * @example
   * ```ts
   * // filters: [age > 18, &&, name = "Ana", ||, active = true]
   * query.remove(query.getIndexByToken("name", "Ana"));
   * // filters: [age > 18, &&, active = true]
   * ```
   */
  remove(idx: number): void {
    this._validateRemovalIndex(idx);

    const [start, end] = this._findRemovalRange(idx);
    this._filters.splice(start, end - start + 1);
  }

  private _validateRemovalIndex(idx: number): void {
    if (idx === -1) {
      throw new ValidationError(
        "CONDITION_NOT_FOUND",
        "No condition matches: nothing to remove.",
        idx,
      );
    }

    checkIndex(idx, this._filters.length - 1);

    if (this._filters[idx].type !== "condition") {
      throw new ValidationError(
        "INVALID_INDEX",
        `Invalid index ${idx}: the token there is not a condition.`,
        idx,
      );
    }
  }

  private _findRemovalRange(idx: number): [number, number] {
    const isConnector = (i: number) => {
      const type = this._filters[i]?.type;
      return type === "and" || type === "or";
    };

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

      if (this._filters[start - 1]?.type !== "startGroup") break;
      if (this._filters[end + 1]?.type !== "endGroup") break;

      start--;
      end++;
    }

    return [start, end];
  }

  /**
   * Updates any element inside the query.
   *
   * @param idx - positional index to update the element
   * @param expressionToken - Any form of operator such as {@link LogicalOperators} or {@link Condition}
   * @returns Query<T>
   */
  updateCondition<P extends NestedKeyOf<T>>(idx: number, value: NestedValueOf<T, P>): Query<T>;
  updateCondition(idx: number, value: unknown): Query<T> {
    checkIndex(idx, this._filters.length - 1);

    const currentTokenExpression = this.getTokenByIndex(idx);
    this._filters.splice(idx, 1, { ...currentTokenExpression, value } as ExpressionToken<T>);

    return this;
  }

  updateLogicalOperator(idx: number, operator: Or | And): Query<T> {
    checkIndex(idx, this._filters.length - 1);

    const currentTokenExpression = this.getTokenByIndex(idx);

    this._filters.splice(idx, 1, { ...currentTokenExpression, ...operator } as ExpressionToken<T>);

    return this;
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
    this._orderBy?.push({ property, direction });
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
  where<P extends NestedKeyOf<T>>(
    property: P,
    operator: OperatorFor<NestedValueOf<T, P>>,
    value: unknown,
    options?: WhereOptions<T, P>,
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
