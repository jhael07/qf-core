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
      operator: "gt",
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

describe("operator spellings", () => {
  it("stores every spelling of an operator as its standard form", () => {
    const { filters } = new Query<Person>()
      .where("age", "GREATER_THAN_OR_EQUAL", 18)
      .or()
      .where("age", "gte", 18)
      .or()
      .where("age", ">=", 18)
      .build();

    expect(filters.filter((token) => token.type === "condition").map((c) => c.operator)).toEqual([
      "gte",
      "gte",
      "gte",
    ]);
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

describe("hasValue", () => {
  it("finds a date condition by an equal Date", () => {
    const query = new Query<Person>().where("createdAt", "=", new Date("2024-01-01"));

    expect(query.hasValue("createdAt", new Date("2024-01-01"))).toBe(true);
    expect(query.hasValue("createdAt", new Date("2025-01-01"))).toBe(false);
  });
});
