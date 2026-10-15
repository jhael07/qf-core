type Leaf = string | number | boolean | Date; // values a condition can compare against
type Unwrap<V> = V extends readonly (infer U)[] ? U : V; // Profession[] -> Profession
type Clean<V> = Unwrap<NonNullable<V>>; // drop undefined/null, then unwrap arrays
type IsNullable<V> = null extends V ? true : undefined extends V ? true : false;

export type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T & (string | number)]: [Clean<T[K]>] extends [Leaf]
        ? `${K}`
        : Clean<T[K]> extends object
          ? `${K}.${NestedKeyOf<Clean<T[K]>>}` // object -> ONLY its children, not K itself
          : never;
    }[keyof T & (string | number)]
  : never;

// Paths whose leaf value can be null or undefined, e.g. `deletedAt: Date | null`
export type NullableKeyOf<T> = T extends object
  ? {
      [K in keyof T & (string | number)]: [Clean<T[K]>] extends [Leaf]
        ? IsNullable<T[K]> extends true
          ? `${K}`
          : never
        : Clean<T[K]> extends object
          ? `${K}.${NullableKeyOf<Clean<T[K]>>}`
          : never;
    }[keyof T & (string | number)]
  : never;

// Paths that point at an array, including arrays nested inside arrays of objects
export type ArrayKeyOf<T> = T extends object
  ? {
      [K in keyof T & (string | number)]: NonNullable<T[K]> extends readonly unknown[]
        ? `${K}` | ([Clean<T[K]>] extends [Leaf] ? never : `${K}.${ArrayKeyOf<Clean<T[K]>>}`)
        : [Clean<T[K]>] extends [Leaf]
          ? never
          : `${K}.${ArrayKeyOf<Clean<T[K]>>}`;
    }[keyof T & (string | number)]
  : never;

// Internal: walks the path
type ValueAt<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? ValueAt<Clean<T[K]>, Rest>
    : never
  : P extends keyof T
    ? [Clean<T[P]>] extends [Leaf]
      ? Clean<T[P]> // leaf -> its type
      : never // object/array of objects -> forbidden
    : never;

// Public: P must be a valid leaf path, otherwise it's a compile error
export type NestedValueOf<T, P extends NestedKeyOf<T>> = ValueAt<T, P>;

// How a value is stored in a built token: dates become ISO strings
export type SerializedValue<V> = V extends Date ? string : V;
