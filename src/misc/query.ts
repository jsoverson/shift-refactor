import {Node} from 'shift-ast';
import {isArray} from 'util';

const {query: shiftQuery, matches: queryMatches, parse: queryParse} = require('shift-query');

export function query(tree: Node | Node[], query: string | string[]): Node[] {
  const trees = isArray(tree) ? tree : [tree];
  const queries = isArray(query) ? query : [query];
  return trees.flatMap(node => queries.flatMap(query => shiftQuery(node, query)));
}

export function matches(node: Node, query: string): boolean {
  const selectorAst = queryParse(query);
  return queryMatches(node, selectorAst);
}
