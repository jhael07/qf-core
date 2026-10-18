import { describe, expect, it } from "vite-plus/test";
import { LogicalOperators, Query, ValidationError } from "../src/index.ts";

type Person = { name: string; age: number; active: boolean; joined: Date };

const throwsCode = (fn: () => unknown, code: string, index: number) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ code, index });
    return;
  }
  throw new Error(`expected a ${code} error`);
};

const and = { type: "and", operator: LogicalOperators.AND } as const;
const or = { type: "or", operator: LogicalOperators.OR } as const;

describe("updateCondition", () => {
  it("replaces the value and keeps property, operator and options", () => {
    const query = new Query<Person>().where("name", "*=", "an", { caseInsensitive: true });

    query.updateCondition(0, "jo");

    expect(query.build().filters[0]).toEqual({
      type: "condition",
      property: "name",
      operator: "contains",
      value: "jo",
      valueType: "string",
      caseInsensitive: true,
    });
  });

  it("stores dates as ISO strings", () => {
    const query = new Query<Person>().where("joined", ">", new Date("2024-01-01"));

    query.updateCondition(0, new Date("2025-06-01"));

    expect(query.build().filters[0]).toMatchObject({
      value: "2025-06-01T00:00:00.000Z",
      valueType: "date",
    });
    expect(query.hasValue("joined", new Date("2025-06-01"))).toBe(true);
  });

  it("returns the query for chaining", () => {
    const query = new Query<Person>().where("age", ">", 18);

    expect(query.updateCondition(0, 21)).toBe(query);
  });

  it("throws INVALID_INDEX when the token is not a condition", () => {
    const query = new Query<Person>().where("age", ">", 18).and().where("name", "=", "Ana");

    throwsCode(() => query.updateCondition(1, 21), "INVALID_INDEX", 1);
  });

  it("throws INVALID_INDEX for an index out of range", () => {
    const query = new Query<Person>().where("age", ">", 18);

    throwsCode(() => query.updateCondition(1, 21), "INVALID_INDEX", 1);
  });
});

describe("updateLogicalOperator", () => {
  it("switches a connector", () => {
    const query = new Query<Person>().where("age", ">", 18).and().where("name", "=", "Ana");

    query.updateLogicalOperator(1, or);

    expect(query.build().filters[1]).toEqual(or);
  });

  it("returns the query for chaining", () => {
    const query = new Query<Person>().where("age", ">", 18).or().where("name", "=", "Ana");

    expect(query.updateLogicalOperator(1, and)).toBe(query);
  });

  it("throws INVALID_INDEX when the token is not a connector", () => {
    const query = new Query<Person>().where("age", ">", 18).and().where("name", "=", "Ana");

    throwsCode(() => query.updateLogicalOperator(0, or), "INVALID_INDEX", 0);
  });

  it("throws INVALID_INDEX on a group bracket", () => {
    const query = new Query<Person>().group((g) => {
      g.where("age", ">", 18);
    });

    throwsCode(() => query.updateLogicalOperator(0, or), "INVALID_INDEX", 0);
  });
});

describe("lookups", () => {
  const query = () =>
    new Query<Person>()
      .where("age", ">", 18)
      .and()
      .where("name", "=", "Ana")
      .or()
      .where("name", "=", "Bea");

  it("getTokenByIndex returns the token at an index", () => {
    expect(query().getTokenByIndex(1)).toEqual(and);
  });

  it("getTokenByIndex throws INVALID_INDEX out of range", () => {
    throwsCode(() => query().getTokenByIndex(5), "INVALID_INDEX", 5);
  });

  it("getIndexByConditionPropertyName finds the first condition on a property", () => {
    expect(query().getIndexByConditionPropertyName("name")).toBe(2);
    expect(query().getIndexByConditionPropertyName("active")).toBe(-1);
  });

  it("getConditionByPropertyName returns the first condition on a property", () => {
    expect(query().getConditionByPropertyName("name")).toMatchObject({ value: "Ana" });
    expect(query().getConditionByPropertyName("active")).toBeUndefined();
  });

  it("getAllConditionsByPropertyName returns every condition on a property", () => {
    const values = query()
      .getAllConditionsByPropertyName("name")
      .map((c) => c.value);

    expect(values).toEqual(["Ana", "Bea"]);
    expect(query().getAllConditionsByPropertyName("active")).toEqual([]);
  });
});

describe("orderBy", () => {
  it("is null when not called", () => {
    expect(new Query<Person>().build().order).toBeNull();
  });

  it("collects sort keys in call order", () => {
    const order = new Query<Person>().orderBy("name", "asc").orderBy("age", "desc").build().order;

    expect(order).toEqual([
      { property: "name", direction: "asc" },
      { property: "age", direction: "desc" },
    ]);
  });
});
