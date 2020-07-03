import { Node } from "shift-ast";
import { isArray } from "util";

const { query: shiftQuery } = require('shift-query');

export function query(tree: Node | Node[], query: string | string[]): Node[] {
  const trees = isArray(tree) ? tree : [tree];
  const queries = isArray(query) ? query : [query];
  return trees.flatMap(node => queries.flatMap(query => shiftQuery(node, query)));
}
