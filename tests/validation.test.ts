import { describe, expect, it } from "vite-plus/test";
import { Query, ValidationError } from "../src/index.ts";

type User = { name: string; age: number };

const q = () => new Query<User>();

describe("build() accepts well-formed filters", () => {
  it("accepts an empty query", () => {
    expect(q().build().filters).toEqual([]);
  });

  it("accepts a single condition", () => {
    expect(() => q().where("age", ">", 18).build()).not.toThrow();
  });

  it("accepts conditions joined by logical operators", () => {
    const query = q().where("age", ">", 18).and().where("name", "=", "x").or().where("age", "<", 5);

    expect(() => query.build()).not.toThrow();
  });

  it("accepts a group joined to a condition", () => {
    const query = q()
      .startGroup()
      .where("age", ">", 18)
      .or()
      .where("age", "<", 5)
      .endGroup()
      .and()
      .where("name", "=", "x");

    expect(() => query.build()).not.toThrow();
  });

  it("accepts nested groups", () => {
    const query = q()
      .where("age", ">", 1)
      .and()
      .startGroup()
      .where("age", "<", 9)
      .or()
      .startGroup()
      .startGroup()
      .where("name", "=", "a")
      .endGroup()
      .endGroup()
      .endGroup();

    expect(() => query.build()).not.toThrow();
  });
});

describe("build() rejects malformed filters", () => {
  it("rejects filters that start with a logical operator", () => {
    expect(() => q().and().where("age", ">", 1).build()).toThrow(
      expect.objectContaining({ code: "INVALID_START", index: 0 }),
    );
    expect(() => q().or().where("age", ">", 1).build()).toThrow(
      expect.objectContaining({ code: "INVALID_START", index: 0 }),
    );
  });

  it("rejects filters that start with a closing group", () => {
    expect(() => q().endGroup().where("age", ">", 1).build()).toThrow(
      expect.objectContaining({ code: "INVALID_START", index: 0 }),
    );
  });

  it("rejects a group that starts with a logical operator", () => {
    const query = q().startGroup().and().where("age", ">", 1).endGroup();

    expect(() => query.build()).toThrow(
      expect.objectContaining({ code: "INVALID_START", index: 1 }),
    );
  });

  it("rejects filters that end with a logical operator", () => {
    const query = q().where("age", ">", 1).or();

    expect(() => query.build()).toThrow(expect.objectContaining({ code: "INVALID_END", index: 1 }));
  });

  it("rejects filters that end with an opening group", () => {
    const query = q().where("age", ">", 1).and().startGroup();

    expect(() => query.build()).toThrow(expect.objectContaining({ code: "INVALID_END", index: 2 }));
  });

  it("rejects two conditions without a logical operator between them", () => {
    const query = q().where("age", ">", 1).where("age", "<", 9);

    expect(() => query.build()).toThrow(
      expect.objectContaining({ code: "CONSECUTIVE_CONDITIONS", index: 1 }),
    );
  });

  it("rejects a group opened right after a condition", () => {
    const query = q().where("age", ">", 1).startGroup().where("age", "<", 9).endGroup();

    expect(() => query.build()).toThrow(
      expect.objectContaining({ code: "MISSING_CONNECTOR", index: 1 }),
    );
  });

  it("rejects a condition right after a closing group", () => {
    const query = q().startGroup().where("age", ">", 1).endGroup().where("age", "<", 9);

    expect(() => query.build()).toThrow(
      expect.objectContaining({ code: "MISSING_CONNECTOR", index: 3 }),
    );
  });

  it("rejects a group opened right after a closing group", () => {
    const query = q()
      .startGroup()
      .where("age", ">", 1)
      .endGroup()
      .startGroup()
      .where("age", "<", 9)
      .endGroup();

    expect(() => query.build()).toThrow(
      expect.objectContaining({ code: "MISSING_CONNECTOR", index: 3 }),
    );
  });

  it("rejects two logical operators in a row", () => {
    const query = q().where("age", ">", 1).and().or().where("age", "<", 9);

    expect(() => query.build()).toThrow(
      expect.objectContaining({ code: "CONSECUTIVE_LOGICAL_OPERATORS", index: 2 }),
    );
  });

  it("rejects a group closed right after a logical operator", () => {
    const query = q().startGroup().where("age", ">", 1).and().endGroup();

    expect(() => query.build()).toThrow(
      expect.objectContaining({ code: "CONSECUTIVE_LOGICAL_OPERATORS", index: 3 }),
    );
  });

  it("rejects an empty group", () => {
    expect(() => q().startGroup().endGroup().build()).toThrow(
      expect.objectContaining({ code: "EMPTY_GROUP", index: 1 }),
    );
  });

  it("rejects a closing group with no matching opening group", () => {
    const query = q().where("age", ">", 1).endGroup();

    expect(() => query.build()).toThrow(
      expect.objectContaining({ code: "UNBALANCED_GROUP", index: 1 }),
    );
  });

  it("rejects a group that is never closed", () => {
    const query = q().startGroup().where("age", ">", 1).and().where("age", "<", 9);

    expect(() => query.build()).toThrow(
      expect.objectContaining({ code: "UNBALANCED_GROUP", index: 3 }),
    );
  });

  it("throws a ValidationError that names the offending index in its message", () => {
    const query = q().where("age", ">", 1).and().or().where("age", "<", 9);

    expect(() => query.build()).toThrow(ValidationError);
    expect(() => query.build()).toThrow(/index 2/);
  });

  it("validates tokens inserted at an index, not just appended ones", () => {
    const query = q().where("age", ">", 1).and().where("age", "<", 9);
    query.or(1);

    expect(() => query.build()).toThrow(
      expect.objectContaining({ code: "CONSECUTIVE_LOGICAL_OPERATORS", index: 2 }),
    );
  });
});
