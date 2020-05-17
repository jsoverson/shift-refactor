import {Node, Statement, LiteralStringExpression, LiteralInfinityExpression, LiteralNumericExpression, LiteralNullExpression, LiteralRegExpExpression, Script, ExpressionStatement, FormalParameters, BindingIdentifier} from "shift-ast";
import { SelectorOrNode, RefactorError } from "./types";
import { Scope } from "shift-scope";
import { IdGenerator } from "./id-generator";

const { query } = require('shift-query');

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

export function isLiteral(input: any): input is LiteralStringExpression | LiteralInfinityExpression | LiteralNumericExpression | LiteralNullExpression | LiteralRegExpExpression {
  return input && input.type && input.type.match(/^Literal/);
}

export function findNodes(ast: Node, input: SelectorOrNode) {
  if (isString(input)) return query(ast, input);
  else if (isArray(input)) return input;
  else if (isShiftNode(input)) return [input];
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

export function renameScope(scope: Scope, idGenerator: IdGenerator, parentMap: WeakMap<Node, Node>) {
  scope.variableList.forEach(variable => {
    if (variable.declarations.length === 0) return;
    const nextId = idGenerator.next().value;
    const isParam = variable.declarations.find(_ => _.type.name === 'Parameter');
    let newName = `$$${nextId}`;
    if (isParam) {
      const parent = parentMap.get(isParam.node) as FormalParameters;
      const position = parent.items.indexOf(isParam.node as BindingIdentifier);
      newName = `$arg${position}_${nextId}`;
    }
    variable.declarations.forEach(_ => (_.node.name = newName));
    variable.references.forEach(_ => (_.node.name = newName));
  });
  scope.children.forEach(_ => renameScope(_, idGenerator, parentMap));
}