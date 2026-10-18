# @qfilter/core

Type-safe, chainable query builder for composing validated filter expressions with nested paths, grouping, and ordering.

## Install

```bash
pnpm add @qfilter/core
```

```bash
npm install @qfilter/core
```

## Quick start

```ts
import { Op, Query } from "@qfilter/core";

type User = {
  name: string;
  age: number;
  active: boolean;
  deletedAt: Date | null;
  address: { city: string };
};

const result = new Query<User>()
  .where("age", Op.GREATER_THAN_OR_EQUAL, 18)
  .and()
  .where("address.city", Op.EQUAL, "Madrid")
  .orderBy("name", "asc")
  .build();
```

`result`:

```ts
{
  filters: [
    { type: "condition", property: "age", operator: "gte", value: 18, valueType: "number" },
    { type: "and", operator: "&&" },
    { type: "condition", property: "address.city", operator: "eq", value: "Madrid", valueType: "string" },
  ],
  order: [{ property: "name", direction: "asc" }],
}
```

Property names, operators and values are all checked against `User` at compile time.

## Operators

Each property only accepts the operators that fit its value type:

| Value type      | Allowed operators                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| `string`        | `EQUAL`, `NOT_EQUAL`, `CONTAINS`, `NOT_CONTAINS`, `STARTS_WITH`, `NOT_STARTS_WITH`, `ENDS_WITH`, `NOT_ENDS_WITH` |
| `number`/`Date` | `EQUAL`, `NOT_EQUAL`, `LESS_THAN`, `GREATER_THAN`, `LESS_THAN_OR_EQUAL`, `GREATER_THAN_OR_EQUAL`                 |
| `boolean`       | `EQUAL`, `NOT_EQUAL`                                                                                             |
| `null`          | `EQUAL`, `NOT_EQUAL`                                                                                             |

```ts
new Query<User>().where("name", Op.STARTS_WITH, "Jo"); // ok
new Query<User>().where("age", Op.CONTAINS, 18); // type error
```

Every operator can also be written as a string. All spellings are stored as the same `Op` value:

| `Op`                       | Value             | Token   | Name                      |
| -------------------------- | ----------------- | ------- | ------------------------- |
| `Op.EQUAL`                 | `"eq"`            | `"="`   | `"EQUAL"`                 |
| `Op.NOT_EQUAL`             | `"neq"`           | `"!="`  | `"NOT_EQUAL"`             |
| `Op.LESS_THAN`             | `"lt"`            | `"<"`   | `"LESS_THAN"`             |
| `Op.GREATER_THAN`          | `"gt"`            | `">"`   | `"GREATER_THAN"`          |
| `Op.LESS_THAN_OR_EQUAL`    | `"lte"`           | `"<="`  | `"LESS_THAN_OR_EQUAL"`    |
| `Op.GREATER_THAN_OR_EQUAL` | `"gte"`           | `">="`  | `"GREATER_THAN_OR_EQUAL"` |
| `Op.CONTAINS`              | `"contains"`      | `"*="`  | `"CONTAINS"`              |
| `Op.NOT_CONTAINS`          | `"notContains"`   | `"!*="` | `"NOT_CONTAINS"`          |
| `Op.STARTS_WITH`           | `"startsWith"`    | `"^="`  | `"STARTS_WITH"`           |
| `Op.NOT_STARTS_WITH`       | `"notStartsWith"` | `"!^="` | `"NOT_STARTS_WITH"`       |
| `Op.ENDS_WITH`             | `"endsWith"`      | `"$="`  | `"ENDS_WITH"`             |
| `Op.NOT_ENDS_WITH`         | `"notEndsWith"`   | `"!$="` | `"NOT_ENDS_WITH"`         |

```ts
new Query<User>().where("age", ">", 18).build().filters[0].operator; // "gt"
```

## Nested paths

Use dot-paths to reach nested properties. Paths into arrays of objects work too:

```ts
type Order = { total: number };
type Customer = { address: { city: string }; orders: Order[] };

new Query<Customer>()
  .where("address.city", Op.EQUAL, "Madrid")
  .and()
  .where("orders.total", Op.GREATER_THAN, 100);
```

## Null checks

On a nullable property, compare against `null` with `Op.EQUAL` or `Op.NOT_EQUAL`:

```ts
new Query<User>().where("deletedAt", Op.EQUAL, null); // is null
new Query<User>().where("deletedAt", Op.NOT_EQUAL, null); // is not null
```

## Case-insensitive strings

String properties accept a `caseInsensitive` option:

```ts
new Query<User>().where("name", Op.CONTAINS, "jo", { caseInsensitive: true });
```

The condition gets `caseInsensitive: true`. Using the option on a non-string property is a type error.

## Grouping

Pass a callback to `group` to wrap conditions in parentheses:

```ts
// name = "Ana" OR (age > 18 AND active = true)
new Query<User>()
  .where("name", Op.EQUAL, "Ana")
  .or()
  .group((g) => {
    g.where("age", Op.GREATER_THAN, 18).and().where("active", Op.EQUAL, true);
  });
```

The group appears in `filters` as `{ type: "startGroup", operator: "(" }` and `{ type: "endGroup", operator: ")" }` tokens.

Groups can be nested:

```ts
// name = "Ana" OR (active = true AND (age < 18 OR age > 65))
new Query<User>()
  .where("name", Op.EQUAL, "Ana")
  .or()
  .group((g) => {
    g.where("active", Op.EQUAL, true)
      .and()
      .group((inner) => {
        inner.where("age", Op.LESS_THAN, 18).or().where("age", Op.GREATER_THAN, 65);
      });
  });
```

Inside the callback, tokens always append to the group: the builder's `where`, `and`, `or` and `group` take no index. To place a whole group at a position, see [Inserting at an index](#inserting-at-an-index).

## Ordering

```ts
new Query<User>().orderBy("address.city", "desc");
```

Each call adds a sort key, so you can sort by several properties. Keys apply in the order they were added:

```ts
// ORDER BY address.city DESC, name ASC
new Query<User>().orderBy("address.city", "desc").orderBy("name", "asc").build().order;
// [{ property: "address.city", direction: "desc" }, { property: "name", direction: "asc" }]
```

`order` is `null` in the result when `orderBy` is not called.

## Output

`build()` returns a `QueryResult<T>`:

```ts
type QueryResult<T> = {
  filters: ExpressionToken<T>[];
  order: { property: string; direction: "asc" | "desc" }[] | null;
};
```

`filters` is a flat list of tokens:

| Token        | Shape                                                                           |
| ------------ | ------------------------------------------------------------------------------- |
| `Condition`  | `{ type: "condition", property, operator, value, valueType, caseInsensitive? }` |
| `And`        | `{ type: "and", operator: "&&" }`                                               |
| `Or`         | `{ type: "or", operator: "\|\|" }`                                              |
| `StartGroup` | `{ type: "startGroup", operator: "(" }`                                         |
| `EndGroup`   | `{ type: "endGroup", operator: ")" }`                                           |

- `operator` on a condition is always the `Op` value (`"eq"`, `"gt"`, …).
- `valueType` is one of `ValueType`: `"string"`, `"number"`, `"boolean"`, `"date"`, `"null"`.
- `Date` values are stored as ISO strings.

## Validation

`build()` checks the token order and throws a `ValidationError` on the first problem. Index arguments are checked right away, when `where`, `and`, `or`, `group`, `remove`, `updateCondition`, `updateLogicalOperator` or `getTokenByIndex` is called.

```ts
import { Query, Op, ValidationError } from "@qfilter/core";

try {
  new Query<User>().where("age", Op.GREATER_THAN, 18).and().build();
} catch (error) {
  if (error instanceof ValidationError) {
    error.code; // "INVALID_END"
    error.index; // 1
    error.message; // 'Invalid filter at index 1: filters cannot end with "&&".'
  }
}
```

| Code                            | When                                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `INVALID_START`                 | Filters or a group start with `and`, `or` or `)`                                                                       |
| `INVALID_END`                   | Filters end with `and`, `or` or an open `(`                                                                            |
| `MISSING_CONNECTOR`             | A group sits next to a condition or another group without `and` / `or`                                                 |
| `CONSECUTIVE_CONDITIONS`        | Two conditions in a row                                                                                                |
| `CONSECUTIVE_LOGICAL_OPERATORS` | `and` / `or` followed by another `and`, `or` or `)`                                                                    |
| `EMPTY_GROUP`                   | A group with nothing inside                                                                                            |
| `UNBALANCED_GROUP`              | A `)` without a matching `(`, or a `(` that is never closed                                                            |
| `INVALID_INDEX`                 | An index that is not an integer within the filters, or that points at the wrong kind of token for `remove` / `update*` |
| `CONDITION_NOT_FOUND`           | `remove(-1)`: `getIndexByToken` found no matching condition                                                            |

## Inserting at an index

Tokens are appended by default. `where`, `and`, `or` and `group` can insert at a position instead:

| Method  | Index argument                                      |
| ------- | --------------------------------------------------- |
| `where` | `{ insertAtIndex: 1 }` in the options               |
| `and`   | `and(1)` or `and({ insertAtIndex: 1 })`             |
| `or`    | `or(1)` or `or({ insertAtIndex: 1 })`               |
| `group` | `group(fn, 1)` or `group(fn, { insertAtIndex: 1 })` |

Connectors are not added for you. When you insert a condition, insert its `and` / `or` too:

```ts
// age > 18
const query = new Query<User>().where("age", Op.GREATER_THAN, 18);

// name = "Ana" AND age > 18
query.where("name", Op.EQUAL, "Ana", { insertAtIndex: 0 }).and(1);
```

Without `.and(1)`, `build()` throws `CONSECUTIVE_CONDITIONS`.

A group is inserted as one block. Count its parentheses when picking the next index:

```ts
// filters: [name = "Ana", &&, age > 18]

// (active = true OR age > 65) AND name = "Ana" AND age > 18
query
  .group((g) => {
    g.where("active", Op.EQUAL, true).or().where("age", Op.GREATER_THAN, 65);
  }, 0)
  .and(5); // the group takes indices 0–4
```

The index must be an integer from `0` to the number of tokens, where the number of tokens appends. Anything else throws a `ValidationError` with code `INVALID_INDEX`:

```ts
new Query<User>().where("age", Op.GREATER_THAN, 18).and(5);
// ValidationError: Invalid index 5: expected an integer from 0 to 1.
```

## Helpers

| Method                               | Description                                                 |
| ------------------------------------ | ----------------------------------------------------------- |
| `hasKey(property)`                   | `true` if any condition uses `property`                     |
| `hasValue(property, v)`              | `true` if a condition on `property` has value `v`           |
| `getIndexByToken(p, v)`              | Index of the first condition on `p` with value `v`, or `-1` |
| `getIndexByConditionPropertyName(p)` | Index of the first condition on `p`, or `-1`                |
| `getTokenByIndex(index)`             | The token at `index`                                        |
| `getConditionByPropertyName(p)`      | The first condition on `p`, or `undefined`                  |
| `getAllConditionsByPropertyName(p)`  | Every condition on `p`, in order (`[]` when none)           |
| `remove(index)`                      | Removes the condition at `index` and its connector          |
| `updateCondition(index, value)`      | Replaces the value of the condition at `index`              |
| `updateLogicalOperator(index, op)`   | Replaces the `and` / `or` connector at `index`              |
| `totalCount`                         | Number of tokens in `filters`                               |

### Add a filter only once

Use `hasKey` to avoid stacking a second condition on the same property, for example to keep a single city filter:

```ts
const query = new Query<User>().where("active", Op.EQUAL, true);

function filterByCity(city: string) {
  if (query.hasKey("address.city")) return; // already filtering by city
  query.and().where("address.city", Op.EQUAL, city);
}

filterByCity("Madrid"); // active = true AND address.city = "Madrid"
filterByCity("Lisbon"); // no change
```

### Reflect the filters in a UI

Use `hasValue` to tell which options are selected, for example to render checkboxes:

```ts
const query = new Query<User>()
  .where("address.city", Op.EQUAL, "Madrid")
  .or()
  .where("address.city", Op.EQUAL, "Lisbon");

query.hasValue("address.city", "Madrid"); // true: checked
query.hasValue("address.city", "Paris"); // false: unchecked
```

`Date` values are compared the way they are stored, as ISO strings, so pass a `Date`:

```ts
const query = new Query<User>().where("deletedAt", Op.GREATER_THAN, new Date("2024-01-01"));

query.hasValue("deletedAt", new Date("2024-01-01")); // true
```

### Read the current filters

`getConditionByPropertyName` and `getAllConditionsByPropertyName` return the stored conditions, which is handy for pre-filling form inputs from an existing query:

```ts
// filters: [age > 18, &&, address.city = "Madrid", ||, address.city = "Lisbon"]

query.getConditionByPropertyName("age")?.value; // 18
query.getAllConditionsByPropertyName("address.city").map((c) => c.value); // ["Madrid", "Lisbon"]
query.getConditionByPropertyName("name"); // undefined
```

The conditions come back in their [output shape](#output), so `Date` values are ISO strings.

Use `getIndexByConditionPropertyName` when you need the position but not the value, for example to update a filter whose current value you don't know:

```ts
const idx = query.getIndexByConditionPropertyName("age"); // 0
query.getTokenByIndex(idx); // { type: "condition", property: "age", operator: "gt", value: 18, ... }
```

`getTokenByIndex` returns any token (condition, connector or parenthesis) and throws `INVALID_INDEX` when there is no token at `index`.

### Remove a condition

`remove(index)` removes the condition at `index` together with its connector, so the filters stay valid. It takes the connector after the condition, or the one before it when the condition is last in the filters or its group. Find the index with `getIndexByToken`:

```ts
// filters: [address.city = "Madrid", ||, address.city = "Lisbon"]

// The user unchecks Lisbon
query.remove(query.getIndexByToken("address.city", "Lisbon"));

// filters: [address.city = "Madrid"]
```

When the condition is the only thing in a group, the group goes too, with its own connector:

```ts
// filters: [age > 18, &&, (, name = "Ana", ), ||, active = true]
query.remove(query.getIndexByToken("name", "Ana"));
// filters: [age > 18, &&, active = true]
```

A group left with one condition, such as `(age > 18)`, is kept.

`remove` throws `CONDITION_NOT_FOUND` when `index` is `-1`, which is what `getIndexByToken` returns when nothing matches. It throws `INVALID_INDEX` when there is no token at `index` or the token there is not a condition.

### Update a condition or connector

`updateCondition(index, value)` replaces the value of the condition at `index`. Its property, operator and `caseInsensitive` option stay the same. The value is stored the way `where` stores it: `Date`s become ISO strings and `valueType` is recomputed.

`updateLogicalOperator(index, op)` swaps the `and` / `or` connector at `index`.

Both return the query, so calls can be chained:

```ts
import { LogicalOperators } from "@qfilter/core";

// filters: [address.city = "Madrid", ||, address.city = "Lisbon"]

query
  .updateLogicalOperator(1, { type: "and", operator: LogicalOperators.AND })
  .updateCondition(query.getIndexByToken("address.city", "Lisbon"), "Paris");

// filters: [address.city = "Madrid", &&, address.city = "Paris"]
```

Each method only accepts the kind of token it updates. `updateCondition` throws `INVALID_INDEX` when the token at `index` is not a condition, and `updateLogicalOperator` throws it when the token is not an `and` / `or`. Both also throw it when there is no token at `index`. To change a condition's property or operator, `remove` it and add a new one with `where`.

## License

MIT. Report issues at [github.com/jhael07/qf-core/issues](https://github.com/jhael07/qf-core/issues).
