import type {
  NestedKeyOf,
  NestedValueOf,
  NullableKeyOf,
  SerializedValue,
} from "./types.helpers.ts";

export enum Op {
  EQUAL = "eq",
  NOT_EQUAL = "neq",
  LESS_THAN = "lt",
  GREATER_THAN = "gt",
  GREATER_THAN_OR_EQUAL = "gte",
  LESS_THAN_OR_EQUAL = "lte",
  CONTAINS = "contains",
  NOT_CONTAINS = "notContains",
  STARTS_WITH = "startsWith",
  NOT_STARTS_WITH = "notStartsWith",
  ENDS_WITH = "endsWith",
  NOT_ENDS_WITH = "notEndsWith",
}

export enum OpToken {
  EQUAL = "=",
  NOT_EQUAL = "!=",
  LESS_THAN = "<",
  GREATER_THAN = ">",
  GREATER_THAN_OR_EQUAL = ">=",
  LESS_THAN_OR_EQUAL = "<=",
  CONTAINS = "*=",
  NOT_CONTAINS = "!*=",
  STARTS_WITH = "^=",
  NOT_STARTS_WITH = "!^=",
  ENDS_WITH = "$=",
  NOT_ENDS_WITH = "!$=",
}

export type OpTokenName = keyof typeof OpToken;

export type OpStr = `${Op}` | `${OpToken}` | OpTokenName;

/** Every accepted spelling of an operator: `Op.EQUAL`, `"eq"`, `"="` or `"EQUAL"`. */
export type Operator = Op | OpToken | OpStr;

/** The `Op` an operator spelling stands for, e.g. `OpOf<"=">` is `Op.EQUAL`. */
export type OpOf<S extends Operator> = {
  [N in OpTokenName]: S extends Spellings<N> ? (typeof Op)[N] : never;
}[OpTokenName];

/**
 * Maps every accepted operator spelling to its standard `Op`:
 * `"EQUAL"`, `"eq"` and `"="` all resolve to `Op.EQUAL`.
 */
export const OperatorBaseline = Object.fromEntries(
  (Object.keys(OpToken) as OpTokenName[]).flatMap((name) => [
    [name, Op[name]],
    [Op[name], Op[name]],
    [OpToken[name], Op[name]],
  ]),
) as { readonly [S in OpStr]: OpOf<S> };

/** The kind of value a condition compares against. */
export enum ValueType {
  STRING = "string",
  NUMBER = "number",
  BOOLEAN = "boolean",
  DATE = "date",
  NULL = "null",
}

const EQUALITY = ["EQUAL", "NOT_EQUAL"] as const;
const TEXT = [
  ...EQUALITY,
  "CONTAINS",
  "NOT_CONTAINS",
  "STARTS_WITH",
  "NOT_STARTS_WITH",
  "ENDS_WITH",
  "NOT_ENDS_WITH",
] as const;
const RANGE = [
  ...EQUALITY,
  "LESS_THAN",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN_OR_EQUAL",
] as const;

/** Operators (by name) that each value type supports. */
export const OperatorsByValueType = {
  [ValueType.STRING]: TEXT,
  [ValueType.NUMBER]: RANGE,
  [ValueType.BOOLEAN]: EQUALITY,
  [ValueType.DATE]: RANGE,
  [ValueType.NULL]: EQUALITY,
} as const satisfies Record<ValueType, readonly OpTokenName[]>;

type Spellings<N extends OpTokenName> =
  | (typeof Op)[N]
  | `${(typeof Op)[N]}`
  | (typeof OpToken)[N]
  | `${(typeof OpToken)[N]}`
  | N;

type ValueTypeOf<V> = V extends string
  ? ValueType.STRING
  : V extends number
    ? ValueType.NUMBER
    : V extends boolean
      ? ValueType.BOOLEAN
      : V extends Date
        ? ValueType.DATE
        : never;

/** Operator spellings allowed for a value of type `V`. */
export type OperatorFor<V> = Spellings<(typeof OperatorsByValueType)[ValueTypeOf<V>][number]>;

/** Operator spellings allowed when comparing against `null`. */
export type NullOperator = Spellings<(typeof OperatorsByValueType)[ValueType.NULL][number]>;

export type InsertOptions = {
  /** Position in the token list where the token is inserted, from `0` to the list length. */
  insertAtIndex?: number;
};

/** Where to insert a token: an index or `{ insertAtIndex }`. Omit it to append. */
export type InsertAt = number | InsertOptions;

/** Comparison options for a condition on path `P`. */
export type CompareOptions<T, P extends NestedKeyOf<T>> = [NestedValueOf<T, P>] extends [string]
  ? {
      /** Compare strings ignoring case. Only available on string paths. */
      caseInsensitive?: boolean;
    }
  : { caseInsensitive?: never };

export type WhereOptions<T, P extends NestedKeyOf<T>> = InsertOptions & CompareOptions<T, P>;

export enum LogicalOperators {
  AND = "&&",
  OR = "||",
  START_GROUP = "(",
  END_GROUP = ")",
}

export type ExpressionType = "condition" | "startGroup" | "endGroup" | "or" | "and";

export type Condition<T, P extends NestedKeyOf<T> = NestedKeyOf<T>> = P extends unknown
  ? {
      type: "condition";
      property: P;
      /** Always the standard `Op`, whichever spelling was passed to `where`. */
      operator: Op;
      value: SerializedValue<NestedValueOf<T, P>> | null;
      valueType: ValueType;
      /** Present when the condition was added with `caseInsensitive: true`. */
      caseInsensitive?: true;
    }
  : never;

export type StartGroup = {
  type: "startGroup";
  operator: LogicalOperators.START_GROUP;
};

export type EndGroup = {
  type: "endGroup";
  operator: LogicalOperators.END_GROUP;
};

export type Or = {
  type: "or";
  operator: LogicalOperators.OR;
};
export type And = {
  type: "and";
  operator: LogicalOperators.AND;
};

export type ExpressionToken<T> = Condition<T> | StartGroup | EndGroup | Or | And;

export type OrderByDirection = "desc" | "asc";

export type OrderBy<T> = {
  property: NestedKeyOf<T>;
  direction: OrderByDirection;
};

export type QueryResult<T> = {
  filters: Array<ExpressionToken<T>>;
  order: OrderBy<T>[] | undefined | null;
};

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
