import type { ExpressionToken, ExpressionType } from "../types.ts";

export type GetTokenOfType<T> = {
  idx: number;
  types: ExpressionType[];
  label: string;
  filters: Array<ExpressionToken<T>>;
};
