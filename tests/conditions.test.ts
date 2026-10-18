import { expect, it } from "vite-plus/test";
import { Op, QueryBuilder } from "../src/index.ts";

it("Should build filters", () => {
  const query = new QueryBuilder<{ name: string; age: number }>().where(
    "name",
    Op.CONTAINS,
    "John Doe",
  );

  expect(query.build().filters).toHaveLength(1);
});

// TODO: validate that invalid filters throw error
// TODO: Validate that updateCondition works
// TODO: Validate that updateLogicalOperator works
// TODO: Validate that remove works
// TODO: Validate the helpers
