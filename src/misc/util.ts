import {
  ComputedMemberAssignmentTarget,
  ComputedMemberExpression,
  ExpressionStatement,
  IdentifierExpression,
  LiteralInfinityExpression,
  LiteralNullExpression,
  LiteralNumericExpression,
  LiteralRegExpExpression,
  LiteralStringExpression,
  Node,
  Script,
  Statement,
  StaticMemberAssignmentTarget,
  StaticMemberExpression,
  UnaryExpression,
} from 'shift-ast';
import traverser from 'shift-traverser';
import {query} from './query';
import {NodesWithStatements, RefactorError, SelectorOrNode} from './types';

export function copy(object: any) {
  return JSON.parse(JSON.stringify(object));
}

export function isString(input: any): input is string {
  return typeof input === 'string';
}
export function isFunction(input: any): input is Function {
  return typeof input === 'function';
}
export function isArray(input: any): input is any[] {
  return Array.isArray(input);
}
export function isShiftNode(input: any): input is Node {
  return input && typeof input.type !== 'undefined';
}
export function isStatement(input: any): input is Statement {
  return input && input.type && input.type.match(/(Statement|Declaration)$/);
}
export function forceIntoArray<T>(input: T | T[]): T[] {
  return isArray(input) ? input : [input];
}

export function isNodeWithStatements(input: any): input is NodesWithStatements {
  return 'statements' in input;
}

export function innerBodyStatements(input: any): Node {
  return 'body' in input ? input.body : input;
}

export function isLiteral(
  input: any,
): input is
  | LiteralStringExpression
  | LiteralInfinityExpression
  | LiteralNumericExpression
  | LiteralNullExpression
  | LiteralRegExpExpression
  | UnaryExpression {
  return (
    input &&
    input.type &&
    (input.type.match(/^Literal/) ||
      (input.type === 'UnaryExpression' && input.operand.type === 'LiteralNumericExpression'))
  );
}

export function findNodes(ast: Node[], input: SelectorOrNode): Node[] {
  if (isString(input)) return query(ast, input);
  else if (isArray(input)) {
    if (isString(input[0])) {
      return (input as any)
        .filter((x: string | Node): x is string => typeof x === 'string')
        .flatMap((x: string) => query(ast, x));
    } else {
      return input as Node[];
    }
  } else if (isShiftNode(input)) return [input];
  else return [];
}

export function extractStatement(tree: Script) {
  // catch the case where a string was parsed alone and read as a directive.
  if (tree.directives.length > 0) {
    return new ExpressionStatement({
      expression: new LiteralStringExpression({
        value: tree.directives[0].rawValue,
      }),
    });
  } else {
    return tree.statements[0];
  }
}

export function extractExpression(tree: Script) {
  // catch the case where a string was parsed alone and read as a directive.
  if (tree.directives.length > 0) {
    return new LiteralStringExpression({
      value: tree.directives[0].rawValue,
    });
  } else {
    if (tree.statements[0].type === 'ExpressionStatement') {
      return tree.statements[0].expression;
    } else {
      throw new RefactorError(`Can't replace an expression with a node of type ${tree.statements[0].type}`);
    }
  }
}

export function buildParentMap(tree: Node) {
  const parentMap = new WeakMap();
  traverser.traverse(tree, {
    enter: (node: Node, parent: Node) => {
      parentMap.set(node, parent);
    },
  });
  return parentMap;
}

export function isMemberAssignment(node: Node): node is ComputedMemberAssignmentTarget | StaticMemberAssignmentTarget {
  return node.type === 'StaticMemberAssignmentTarget' || node.type === 'ComputedMemberAssignmentTarget';
}

export function isMemberExpression(node: Node): node is ComputedMemberExpression | StaticMemberExpression {
  return node.type === 'StaticMemberExpression' || node.type === 'ComputedMemberExpression';
}

export function isDeepSimilar(partial: any, actual: any): boolean {
  let similar = false;
  if (partial === undefined) return true;
  if (partial === null && actual === null) return true;
  for (let key in partial) {
    if (isArray(partial[key])) {
      similar =
        key in actual && isArray(actual[key])
          ? partial[key].length === 0
            ? true
            : isDeepSimilar(partial[key], actual[key])
          : false;
    } else if (typeof partial[key] === 'object') {
      similar = key in actual ? isDeepSimilar(partial[key], actual[key]) : false;
    } else {
      similar = partial[key] === actual[key];
    }
    if (!similar) break;
  }
  return similar;
}

export function getRootIdentifier(
  expr:
    | StaticMemberExpression
    | ComputedMemberExpression
    | StaticMemberAssignmentTarget
    | ComputedMemberAssignmentTarget
    | IdentifierExpression,
): IdentifierExpression {
  if (expr.type === 'IdentifierExpression') {
    return expr;
  } else {
    switch (expr.object.type) {
      case 'IdentifierExpression':
        return expr.object;
      case 'ComputedMemberExpression':
      case 'StaticMemberExpression':
        return getRootIdentifier(expr.object);
      default:
        throw new Error('Can not get the identifier associated with the passed expression.');
    }
  }
}

export function identityLogger<T>(x: T): T {
  console.log(x);
  return x;
}
