import { describe, expect, it } from "vite-plus/test";
import { Query, ValidationError } from "../src/index.ts";

type Person = { name: string; age: number; active: boolean; joined: Date };

const shape = (query: Query<Person>) =>
  query
    .build()
    .filters.map((token) => (token.type === "condition" ? token.property : token.operator));

const removeByValue = <K extends "name" | "age" | "active" | "joined">(
  query: Query<Person>,
  key: K,
  value: Person[K],
) => query.remove(query.getIndexByToken(key, value));

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

describe("remove", () => {
  it("removes the only condition", () => {
    const query = new Query<Person>().where("age", ">", 18);

    removeByValue(query, "age", 18);

    expect(query.totalCount).toBe(0);
  });

  it("removes the first condition with the connector after it", () => {
    const query = new Query<Person>().where("age", ">", 18).and().where("name", "=", "Ana");

    removeByValue(query, "age", 18);

    expect(shape(query)).toEqual(["name"]);
  });

  it("removes a middle condition with the connector after it", () => {
    const query = new Query<Person>()
      .where("age", ">", 18)
      .and()
      .where("name", "=", "Ana")
      .or()
      .where("active", "=", true);

    removeByValue(query, "name", "Ana");

    expect(shape(query)).toEqual(["age", "&&", "active"]);
  });

  it("removes the last condition with the connector before it", () => {
    const query = new Query<Person>().where("age", ">", 18).and().where("name", "=", "Ana");

    removeByValue(query, "name", "Ana");

    expect(shape(query)).toEqual(["age"]);
  });

  it("keeps a group left with a single condition", () => {
    const query = new Query<Person>()
      .group((g) => g.where("age", ">", 18).or().where("name", "=", "Ana"))
      .and()
      .where("active", "=", true);

    removeByValue(query, "name", "Ana");

    expect(shape(query)).toEqual(["(", "age", ")", "&&", "active"]);
  });

  it("removes the first condition in a group with the connector after it", () => {
    const query = new Query<Person>().group((g) =>
      g.where("age", ">", 18).or().where("name", "=", "Ana"),
    );

    removeByValue(query, "age", 18);

    expect(shape(query)).toEqual(["(", "name", ")"]);
  });

  it("removes an emptied group with the connector after it", () => {
    const query = new Query<Person>()
      .where("age", ">", 18)
      .and()
      .group((g) => g.where("name", "=", "Ana"))
      .or()
      .where("active", "=", true);

    removeByValue(query, "name", "Ana");

    expect(shape(query)).toEqual(["age", "&&", "active"]);
  });

  it("removes an emptied group at the end with the connector before it", () => {
    const query = new Query<Person>()
      .where("age", ">", 18)
      .and()
      .group((g) => g.where("name", "=", "Ana"));

    removeByValue(query, "name", "Ana");

    expect(shape(query)).toEqual(["age"]);
  });

  it("removes nested groups that become empty", () => {
    const query = new Query<Person>()
      .where("age", ">", 18)
      .and()
      .group((g) => g.group((inner) => inner.where("name", "=", "Ana")));

    removeByValue(query, "name", "Ana");

    expect(shape(query)).toEqual(["age"]);
  });

  it("removes a group that is the whole query", () => {
    const query = new Query<Person>().group((g) => g.where("name", "=", "Ana"));

    removeByValue(query, "name", "Ana");

    expect(query.totalCount).toBe(0);
  });

  it("removes only the first matching condition", () => {
    const query = new Query<Person>()
      .where("name", "=", "Ana")
      .or()
      .where("age", ">", 18)
      .or()
      .where("name", "=", "Ana");

    removeByValue(query, "name", "Ana");

    expect(shape(query)).toEqual(["age", "||", "name"]);
  });

  it("finds Date values", () => {
    const query = new Query<Person>()
      .where("age", ">", 18)
      .and()
      .where("joined", ">", new Date("2024-01-01"));

    removeByValue(query, "joined", new Date("2024-01-01"));

    expect(shape(query)).toEqual(["age"]);
  });

  it("throws CONDITION_NOT_FOUND when nothing matches", () => {
    const query = new Query<Person>().where("age", ">", 18);

    throwsCode(() => removeByValue(query, "name", "Ana"), "CONDITION_NOT_FOUND", -1);
    expect(shape(query)).toEqual(["age"]);
  });

  it("throws INVALID_INDEX for a token that is not a condition", () => {
    const query = new Query<Person>()
      .where("age", ">", 18)
      .and()
      .group((g) => g.where("name", "=", "Ana"));

    throwsCode(() => query.remove(1), "INVALID_INDEX", 1);
    throwsCode(() => query.remove(2), "INVALID_INDEX", 2);
    expect(query.totalCount).toBe(5);
  });

  it("throws INVALID_INDEX for a position that does not exist", () => {
    const query = new Query<Person>().where("age", ">", 18);

    throwsCode(() => query.remove(1), "INVALID_INDEX", 1);
    throwsCode(() => query.remove(-2), "INVALID_INDEX", -2);
  });
});

describe("totalCount", () => {
  it("tracks every token as filters change", () => {
    const query = new Query<Person>();
    expect(query.totalCount).toBe(0);

    query
      .where("age", ">", 18)
      .and()
      .group((g) => g.where("name", "=", "Ana"));
    expect(query.totalCount).toBe(5);

    query.remove(0);
    expect(query.totalCount).toBe(3);
  });
});
