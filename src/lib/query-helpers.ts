import type { FilterBuilder } from "./filter-builder.ts";
import { checkIndex, serialize } from "./helpers/index.ts";
import type { NestedKeyOf } from "./types.helpers.ts";
import type { Condition, ExpressionToken } from "./types.ts";

export class QueryHelpers<T> {
  private _filterBuilder: FilterBuilder<T>;

  constructor(filterBuilder: FilterBuilder<T>) {
    this._filterBuilder = filterBuilder;
  }

  hasKey(key: NestedKeyOf<T>): boolean {
    return this._filterBuilder.build().some((x) => x.type === "condition" && x.property === key);
  }

  hasValue(key: NestedKeyOf<T>, value: unknown): boolean {
    return this._filterBuilder
      .build()
      .some((x) => x.type === "condition" && x.property === key && x.value === serialize(value));
  }

  /**
   * Finds the position of the first condition on `key` whose value matches
   * `value`. Values are compared the way they are stored, so a `Date` matches
   * its ISO string. Pass the result to {@link QueryBuilder.remove} or as an
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
    return this._filterBuilder
      .build()
      .findIndex(
        (x) => x.type === "condition" && x.property === key && x.value === serialize(value),
      );
  }

  getIndexByConditionPropertyName(property: NestedKeyOf<T>): number {
    return this._filterBuilder
      .build()
      .findIndex((x) => x.type === "condition" && x.property === property);
  }

  getTokenByIndex(idx: number): ExpressionToken<T> {
    checkIndex(idx, this._filterBuilder.build().length - 1);

    const tokenExpression = this._filterBuilder.build()[idx];
    return tokenExpression;
  }

  getConditionByPropertyName(property: NestedKeyOf<T>): Condition<T> | undefined {
    const condtion = this._filterBuilder
      .build()
      .find((x) => x.type === "condition" && x.property === property) as Condition<T> | undefined;

    return condtion;
  }

  getAllConditionsByPropertyName(property: NestedKeyOf<T>): Condition<T>[] {
    const conditions = this._filterBuilder
      .build()
      .filter((x) => x.type === "condition" && x.property === property);

    return conditions as Condition<T>[];
  }
}
