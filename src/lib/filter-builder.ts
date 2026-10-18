import {
  checkIndex,
  findRemovalRange,
  getTokenOfType,
  indexOf,
  serialize,
  validateBuild,
  validateRemovalIndex,
  valueTypeOf,
} from "./helpers/index.ts";
import type { NestedKeyOf, NestedValueOf } from "./types.helpers.ts";
import {
  type ExpressionToken,
  type WhereOptions,
  type OperatorFor,
  OperatorBaseline,
  LogicalOperators,
  type GroupQuery,
  type Condition,
  type InsertAt,
  type Operator,
  type And,
  type Or,
} from "./types.ts";

export type FilterBuilderResult<T> = ExpressionToken<T>[];

export class FilterBuilder<T> {
  protected _filters: ExpressionToken<T>[] = [];

  private _add(tokens: Array<ExpressionToken<T>>, at?: InsertAt): void {
    const idx = indexOf(at);

    if (idx === undefined) {
      this._filters.push(...tokens);
      return;
    }

    checkIndex(idx, this._filters.length);

    this._filters.splice(idx, 0, ...tokens);
  }

  /**
   * Adds an `&&` connector.
   *
   * @param at - Where to insert it: an index or `{ insertAtIndex }`. Appends when omitted.
   * @returns The current {@link FilterBuilder} instance, for chaining.
   */
  and(at?: InsertAt): FilterBuilder<T> {
    this._add([{ type: "and", operator: LogicalOperators.AND }], at);
    return this;
  }

  /**
   * Adds an `||` connector.
   *
   * @param at - Where to insert it: an index or `{ insertAtIndex }`. Appends when omitted.
   * @returns The current {@link FilterBuilder} instance, for chaining.
   */
  or(at?: InsertAt): FilterBuilder<T> {
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
   * @returns The current {@link FilterBuilder} instance, for chaining.
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
  group(fn: (query: GroupQuery<T>) => void, at?: InsertAt): FilterBuilder<T> {
    const inner = new FilterBuilder<T>();
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
   * @returns The current {@link FilterBuilder} instance, for chaining.
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
  ): FilterBuilder<T>;
  where<P extends NestedKeyOf<T>>(
    property: P,
    operator: OperatorFor<NestedValueOf<T, P>>,
    value: unknown,
    options?: WhereOptions<T, P>,
  ): FilterBuilder<T> {
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
   * Replaces the value of the condition at `idx`, keeping its property,
   * operator and options. The value is stored the way {@link QueryBuilder.where}
   * stores it: `Date`s become ISO strings and `valueType` is recomputed.
   *
   * @param idx - The condition's position, usually from {@link QueryBuilder.getIndexByToken}.
   * @param value - The new value to compare against.
   * @returns The current {@link QueryBuilder} instance, for chaining.
   *
   * @throws - {@link ValidationError} with code `INVALID_INDEX` when `idx` is
   *   not an existing position or the token there is not a condition.
   *
   * @example
   * ```ts
   * // filters: [age > 18]
   * query.updateCondition(query.getIndexByToken("age", 18), 21);
   * // filters: [age > 21]
   * ```
   */
  updateCondition<P extends NestedKeyOf<T>>(
    idx: number,
    value: NestedValueOf<T, P>,
  ): FilterBuilder<T>;
  updateCondition(idx: number, value: unknown): FilterBuilder<T> {
    const current = getTokenOfType({
      idx,
      filters: this._filters,
      label: "a condition",
      types: ["condition"],
    }) as Condition<T>;

    this._filters[idx] = {
      ...current,
      value: serialize(value),
      valueType: valueTypeOf(value),
    } as Condition<T>;

    return this;
  }

  /**
   * Replaces the `&&` / `||` connector at `idx`.
   *
   * @param idx - The connector's position.
   * @param operator - The new connector, `{ type: "and", operator: "&&" }` or
   *   `{ type: "or", operator: "||" }`.
   * @returns The current {@link QueryBuilder} instance, for chaining.
   *
   * @throws - {@link ValidationError} with code `INVALID_INDEX` when `idx` is
   *   not an existing position or the token there is not a connector.
   */
  updateLogicalOperator(idx: number, operator: Or | And): FilterBuilder<T> {
    getTokenOfType({
      idx,
      filters: this._filters,
      label: "a connector",
      types: ["and", "or"],
    }) as Condition<T>;

    this._filters[idx] = { type: operator.type, operator: operator.operator } as Or | And;

    return this;
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
   * @param idx - The condition's position, usually from {@link QueryBuilder.getIndexByToken}.
   *
   * @throws - {@link ValidationError} with code `CONDITION_NOT_FOUND` when `idx`
   *   is `-1`, the value {@link QueryBuilder.getIndexByToken} returns for no match.
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
    validateRemovalIndex(idx, this._filters);
    const [start, end] = findRemovalRange(idx, this._filters);

    this._filters.splice(start, end - start + 1);
  }

  build(): FilterBuilderResult<T> {
    validateBuild(this._filters);
    return [...this._filters];
  }
}
