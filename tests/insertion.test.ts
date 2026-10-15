import { describe, expect, it } from "vite-plus/test";
import { Query, ValidationError } from "../src/index.ts";

type Person = { name: string; age: number; active: boolean };

const shape = (query: Query<Person>) =>
  query
    .build()
    .filters.map((token) => (token.type === "condition" ? token.property : token.operator));

const invalidIndex = (fn: () => unknown, index: number) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ code: "INVALID_INDEX", index });
    return;
  }
  throw new Error("expected an INVALID_INDEX error");
};

describe("inserting at an index", () => {
  it("inserts a condition and its connector", () => {
    const query = new Query<Person>()
      .where("age", ">", 18)
      .where("name", "=", "Ana", { insertAtIndex: 0 })
      .and(1);

    expect(shape(query)).toEqual(["name", "&&", "age"]);
  });

  it("accepts an index or { insertAtIndex } on and, or and group", () => {
    const positional = new Query<Person>()
      .where("age", ">", 18)
      .where("name", "=", "Ana", { insertAtIndex: 0 })
      .or(1)
      .group((g) => g.where("active", "=", true), 0)
      .and(3);
    const object = new Query<Person>()
      .where("age", ">", 18)
      .where("name", "=", "Ana", { insertAtIndex: 0 })
      .or({ insertAtIndex: 1 })
      .group((g) => g.where("active", "=", true), { insertAtIndex: 0 })
      .and({ insertAtIndex: 3 });

    expect(shape(positional)).toEqual(["(", "active", ")", "&&", "name", "||", "age"]);
    expect(shape(object)).toEqual(shape(positional));
  });

  it("appends at the list length", () => {
    expect(
      shape(new Query<Person>().where("age", ">", 18).and(1).where("name", "=", "Ana")),
    ).toEqual(["age", "&&", "name"]);
  });
});

describe("groups", () => {
  it("wraps the callback's tokens in parentheses", () => {
    const query = new Query<Person>()
      .where("name", "=", "Ana")
      .or()
      .group((g) => g.where("age", ">", 18).and().where("active", "=", true));

    expect(shape(query)).toEqual(["name", "||", "(", "age", "&&", "active", ")"]);
  });

  it("nests", () => {
    const query = new Query<Person>().group((g) =>
      g
        .where("name", "=", "Ana")
        .or()
        .group((inner) => inner.where("age", ">", 18)),
    );

    expect(shape(query)).toEqual(["(", "name", "||", "(", "age", ")", ")"]);
  });
});

describe("index bounds", () => {
  const twoTokens = () => new Query<Person>().where("age", ">", 18).and();

  it("rejects negative indices", () => {
    invalidIndex(() => twoTokens().or(-1), -1);
  });

  it("rejects indices past the list length", () => {
    invalidIndex(() => twoTokens().where("name", "=", "Ana", { insertAtIndex: 3 }), 3);
    invalidIndex(() => twoTokens().group((g) => g.where("name", "=", "Ana"), 3), 3);
  });

  it("rejects non-integer indices", () => {
    invalidIndex(() => twoTokens().and({ insertAtIndex: 1.5 }), 1.5);
  });

  it("rejects removing a position that does not exist", () => {
    invalidIndex(() => twoTokens().remove(2), 2);
    invalidIndex(() => new Query<Person>().remove(0), 0);
  });

  it("explains the valid range", () => {
    expect(() => twoTokens().and(5)).toThrow("Invalid index 5: expected an integer from 0 to 2.");
    expect(() => new Query<Person>().remove(0)).toThrow("Invalid index 0: there are no filters.");
  });
});

describe("remove", () => {
  it("removes a condition together with its connector", () => {
    const query = new Query<Person>().where("age", ">", 18).and().where("name", "=", "Ana");

    query.remove(2);
    query.remove(1);

    expect(shape(query)).toEqual(["age"]);
  });
});
