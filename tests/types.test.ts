import { describe, expect, it } from "vite-plus/test";
import { Op, Query } from "../src/index.ts";

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
const date = new Date("2024-01-01T00:00:00.000Z");

describe("operators by value type", () => {
  it("allows text operators on strings", () => {
    q().where("name", Op.EQUAL, "Ana");
    q().where("name", Op.NOT_EQUAL, "Ana");
    q().where("name", Op.CONTAINS, "An");
    q().where("name", Op.NOT_CONTAINS, "An");
    q().where("name", Op.STARTS_WITH, "A");
    q().where("name", Op.NOT_STARTS_WITH, "A");
    q().where("name", Op.ENDS_WITH, "a");
    q().where("name", Op.NOT_ENDS_WITH, "a");
    q().where("address.city", "^=", "La");

    // @ts-expect-error strings have no range operators
    q().where("name", Op.GREATER_THAN, "Ana");
    expect(true).toBe(true);
  });

  it("allows range operators on numbers and dates", () => {
    q().where("age", Op.EQUAL, 18);
    q().where("age", Op.NOT_EQUAL, 18);
    q().where("age", Op.LESS_THAN, 18);
    q().where("age", Op.GREATER_THAN, 18);
    q().where("age", Op.LESS_THAN_OR_EQUAL, 18);
    q().where("age", Op.GREATER_THAN_OR_EQUAL, 18);
    q().where("createdAt", Op.GREATER_THAN, date);
    q().where("orders.total", ">=", 100);

    // @ts-expect-error numbers have no text operators
    q().where("age", Op.CONTAINS, 18);
    // @ts-expect-error dates have no text operators
    q().where("createdAt", Op.STARTS_WITH, date);
    expect(true).toBe(true);
  });

  it("allows only equality on booleans and null", () => {
    q().where("active", Op.EQUAL, true);
    q().where("active", Op.NOT_EQUAL, false);
    q().where("deletedAt", Op.EQUAL, null);
    q().where("deletedAt", Op.NOT_EQUAL, null);

    // @ts-expect-error booleans have no text operators
    q().where("active", Op.CONTAINS, true);
    // @ts-expect-error booleans have no range operators
    q().where("active", Op.GREATER_THAN, true);
    // @ts-expect-error null checks have no text operators
    q().where("deletedAt", Op.CONTAINS, null);
    expect(true).toBe(true);
  });
});

describe("index arguments", () => {
  it("accepts an index or { insertAtIndex } on and, or and group", () => {
    q().and(0).or({ insertAtIndex: 0 });
    q().group((g) => g.where("age", Op.GREATER_THAN, 18), 0);
    q().group((g) => g.where("age", Op.GREATER_THAN, 18), { insertAtIndex: 0 });

    // @ts-expect-error where only takes the options object
    q().where("age", Op.GREATER_THAN, 18, 0);
    expect(true).toBe(true);
  });

  it("is not available inside a group", () => {
    q().group((g) => {
      g.where("name", Op.EQUAL, "Ana", { caseInsensitive: true });
      // @ts-expect-error tokens always append inside a group
      g.where("age", Op.GREATER_THAN, 18, { insertAtIndex: 0 });
      // @ts-expect-error tokens always append inside a group
      g.where("deletedAt", Op.EQUAL, null, { insertAtIndex: 0 });
      // @ts-expect-error tokens always append inside a group
      g.and(0);
      // @ts-expect-error tokens always append inside a group
      g.or({ insertAtIndex: 0 });
      // @ts-expect-error tokens always append inside a group
      g.group((inner) => inner.where("age", Op.EQUAL, 1), 0);
    });
    expect(true).toBe(true);
  });

  it("no longer accepts a callback in where", () => {
    expect(() =>
      // @ts-expect-error groups use group()
      q().where((g) => g.where("age", Op.GREATER_THAN, 18)),
    ).toThrow();
  });
});
