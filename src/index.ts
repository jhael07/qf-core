import Query from "./lib/query.ts";
export { default as Query } from "./lib/query.ts";
export { ValidationError, type ValidationErrorCode } from "./lib/errors.ts";
export {
  type And,
  type Condition,
  type EndGroup,
  type ExpressionToken,
  type Or,
  type StartGroup,
  Op as ConditionalOperators,
  OpToken,
  type Operator,
  type OperatorFor,
  OperatorsByValueType,
  LogicalOperators,
  type OrderBy,
  type QueryResult,
  ValueType,
  type WhereOptions,
} from "./lib/types.ts";

type User = { name: string; password: string };

const query = new Query<User>()
  .where("name", "*=", "Jhael", { caseInsensitive: true })
  .or()
  .where((q) => {
    q.where("name", "eq", "miguel").or().where("name", "CONTAINS", "el");
  });

console.log(query);
