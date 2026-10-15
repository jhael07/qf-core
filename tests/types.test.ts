import { describe, expectTypeOf, it } from "vite-plus/test";
import { Query } from "../src/index.ts";

// These tests are checked by the compiler (`vp check`). Each `@ts-expect-error`
// fails the type check if the line below it ever compiles.

type Person = {
  name: string;
  age: number;
  active: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  nickname?: string;
  clubs: string[];
  orders: { total: number }[];
  address: { city: string };
};

const q = () => new Query<Person>();

describe("operators allowed per value type", () => {
  it("allows every operator on strings", () => {
    q().where("name", "*=", "a").where("name", "sw", "a").where("name", "NOT_ENDS_WITH", "a");
    q().where("name", ">", "a");
  });

  it("allows equality and range operators on numbers", () => {
    q().where("age", "=", 1).where("age", "!=", 1).where("age", ">=", 1).where("age", "lt", 1);
    // @ts-expect-error contains is a string-only operator
    q().where("age", "*=", 1);
    // @ts-expect-error startsWith is a string-only operator
    q().where("age", "STARTS_WITH", 1);
  });

  it("allows only equality operators on booleans", () => {
    q().where("active", "=", true).where("active", "neq", false);
    // @ts-expect-error range operators don't apply to booleans
    q().where("active", ">", true);
    // @ts-expect-error contains doesn't apply to booleans
    q().where("active", "ctns", true);
  });

  it("allows equality and range operators on dates", () => {
    q().where("createdAt", ">", new Date()).where("createdAt", "eq", new Date());
    // @ts-expect-error endsWith doesn't apply to dates
    q().where("createdAt", "$=", new Date());
  });

  it("applies the element's operators to array paths", () => {
    q().where("clubs", "^=", "ch").where("orders.total", ">", 100);
    // @ts-expect-error contains doesn't apply to the numbers inside orders
    q().where("orders.total", "*=", 100);
  });
});

describe("values", () => {
  it("requires the value to match the path's type", () => {
    // @ts-expect-error age is a number
    q().where("age", "=", "18");
    // @ts-expect-error createdAt takes a Date, not an ISO string
    q().where("createdAt", ">", "2024-01-01");
  });

  it("offers Date fields as paths, not their methods", () => {
    // @ts-expect-error Date methods are not filterable paths
    q().where("createdAt.getTime", "=", 1);
  });

  it("allows null only with equality operators on nullable paths", () => {
    q().where("deletedAt", "eq", null).where("nickname", "!=", null);
    // @ts-expect-error null can't be compared with a range operator
    q().where("deletedAt", ">", null);
    // @ts-expect-error name can't be null
    q().where("name", "eq", null);
  });
});

describe("where options", () => {
  it("allows caseInsensitive only on string paths", () => {
    q().where("name", "eq", "ana", { caseInsensitive: true, insertAtIndex: 0 });
    // @ts-expect-error age is not a string
    q().where("age", "eq", 1, { caseInsensitive: true });
  });
});

describe("schema", () => {
  it("accepts only array paths of the model", () => {
    new Query<Person>({ arrays: ["clubs", "orders"] });
    // @ts-expect-error name is not an array
    new Query<Person>({ arrays: ["name"] });
    // @ts-expect-error typo in the path
    new Query<Person>({ arrays: ["club"] });
  });

  it("is optional", () => {
    expectTypeOf(new Query<Person>()).toEqualTypeOf<Query<Person>>();
  });
});

describe("build() output", () => {
  it("types date values as ISO strings in the output", () => {
    const [token] = q().where("createdAt", ">", new Date()).build().filters;

    if (token?.type === "condition" && token.property === "createdAt") {
      expectTypeOf(token.value).toEqualTypeOf<string | null>();
    }
  });
});
