import { describe, expect, it } from "vite-plus/test";
import { Query, ValueType } from "../src/index.ts";

type Person = {
  name: string;
  age: number;
  active: boolean;
  createdAt: Date;
  deletedAt: Date | null;
  nickname?: string;
  clubs: string[];
  orders: { total: number; sku: string }[];
  address: { city: string };
};

const conditionAt = (query: Query<Person>, index = 0) => query.build().filters[index];

describe("condition value types", () => {
  it("tags string, number and boolean values with their value type", () => {
    const { filters } = new Query<Person>()
      .where("name", "=", "Ana")
      .and()
      .where("age", ">", 18)
      .and()
      .where("active", "=", true)
      .build();

    expect(filters.map((token) => "valueType" in token && token.valueType)).toEqual([
      ValueType.STRING,
      false,
      ValueType.NUMBER,
      false,
      ValueType.BOOLEAN,
    ]);
  });

  it("stores dates as ISO strings tagged as dates", () => {
    const createdAt = new Date("2024-01-01T00:00:00.000Z");

    expect(conditionAt(new Query<Person>().where("createdAt", ">", createdAt))).toEqual({
      type: "condition",
      property: "createdAt",
      operator: ">",
      value: "2024-01-01T00:00:00.000Z",
      valueType: ValueType.DATE,
    });
  });

  it("tags null comparisons as null", () => {
    expect(conditionAt(new Query<Person>().where("deletedAt", "eq", null))).toEqual({
      type: "condition",
      property: "deletedAt",
      operator: "eq",
      value: null,
      valueType: ValueType.NULL,
    });
  });

  it("infers value types without a type argument", () => {
    expect(conditionAt(new Query().where("score", ">=", 9.5))).toMatchObject({
      valueType: ValueType.NUMBER,
    });
  });
});

describe("case-insensitive conditions", () => {
  it("marks the condition when caseInsensitive is true", () => {
    const query = new Query<Person>().where("name", "eq", "ana", { caseInsensitive: true });

    expect(conditionAt(query)).toMatchObject({ caseInsensitive: true });
  });

  it("leaves the flag out when caseInsensitive is false or missing", () => {
    const query = new Query<Person>()
      .where("name", "eq", "ana", { caseInsensitive: false })
      .and()
      .where("name", "eq", "ana");

    expect(conditionAt(query, 0)).not.toHaveProperty("caseInsensitive");
    expect(conditionAt(query, 2)).not.toHaveProperty("caseInsensitive");
  });

  it("combines with insertAtIndex", () => {
    const query = new Query<Person>()
      .where("age", ">", 18)
      .where("name", "eq", "ana", { caseInsensitive: true, insertAtIndex: 0 })
      .and(1);

    expect(conditionAt(query, 0)).toMatchObject({ property: "name", caseInsensitive: true });
  });
});

describe("array paths from the schema", () => {
  const query = () => new Query<Person>({ arrays: ["clubs", "orders"] });

  it("marks conditions on a listed array path", () => {
    expect(conditionAt(query().where("clubs", "eq", "chess"))).toMatchObject({
      property: "clubs",
      value: "chess",
      valueType: ValueType.STRING,
      isArray: true,
    });
  });

  it("marks conditions on a path nested inside a listed array", () => {
    expect(conditionAt(query().where("orders.total", ">", 100))).toMatchObject({ isArray: true });
  });

  it("does not mark paths that only share a prefix with a listed array", () => {
    const shared = new Query<{ clubs: string[]; clubsCount: number }>({ arrays: ["clubs"] });

    expect(shared.where("clubsCount", ">", 1).build().filters[0]).not.toHaveProperty("isArray");
  });

  it("does not mark conditions when no schema is given", () => {
    expect(conditionAt(new Query<Person>().where("clubs", "eq", "chess"))).not.toHaveProperty(
      "isArray",
    );
  });
});

describe("hasValue", () => {
  it("finds a date condition by an equal Date", () => {
    const query = new Query<Person>().where("createdAt", "=", new Date("2024-01-01"));

    expect(query.hasValue("createdAt", new Date("2024-01-01"))).toBe(true);
    expect(query.hasValue("createdAt", new Date("2025-01-01"))).toBe(false);
  });
});
