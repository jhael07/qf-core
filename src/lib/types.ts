import type { ArrayKeyOf, NestedKeyOf, NestedValueOf, SerializedValue } from "./types.helpers.ts";

export enum Op {
  EQUAL = "eq",
  NOT_EQUAL = "neq",
  LESS_THAN = "lt",
  GREATER_THAN = "gt",
  GREATER_THAN_OR_EQUAL = "gte",
  LESS_THAN_OR_EQUAL = "lte",
  CONTAINS = "ctns",
  NOT_CONTAINS = "nctns",
  STARTS_WITH = "sw",
  NOT_STARTS_WITH = "nsw",
  ENDS_WITH = "ew",
  NOT_ENDS_WITH = "new",
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

/** The kind of value a condition compares against. */
export enum ValueType {
  STRING = "string",
  NUMBER = "number",
  BOOLEAN = "boolean",
  DATE = "date",
  NULL = "null",
}

const EQUALITY = ["EQUAL", "NOT_EQUAL"] as const;
const RANGE = [
  ...EQUALITY,
  "LESS_THAN",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN_OR_EQUAL",
] as const;

/** Operators (by name) that each value type supports. */
export const OperatorsByValueType = {
  [ValueType.STRING]: Object.keys(OpToken) as OpTokenName[],
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

export type WhereOptions<T, P extends NestedKeyOf<T>> = {
  /** Position in the token list where the condition is inserted. */
  insertAtIndex?: number;
} & ([NestedValueOf<T, P>] extends [string]
  ? {
      /** Compare strings ignoring case. Only available on string paths. */
      caseInsensitive?: boolean;
    }
  : { caseInsensitive?: never });

export type QuerySchema<T> = {
  /** Paths of `T` that hold arrays. Conditions on or under them are marked `isArray`. */
  arrays?: ReadonlyArray<ArrayKeyOf<T>>;
};

// username new 'Marinai'

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
      operator: Operator;
      value: SerializedValue<NestedValueOf<T, P>> | null;
      valueType: ValueType;
      /** Present when the path is listed in the schema's `arrays`. */
      isArray?: true;
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
  order: OrderBy<T> | undefined | null;
};
