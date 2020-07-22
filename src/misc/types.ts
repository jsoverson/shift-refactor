import {
  Node,
  BindingIdentifier,
  IdentifierExpression,
  AssignmentTargetIdentifier,
  AssignmentExpression,
  ClassDeclaration,
  ClassExpression,
  FunctionDeclaration,
  FunctionExpression,
  VariableDeclarator,
  Block,
  FunctionBody,
  Script,
} from 'shift-ast';

export type Constructor<T> = new (...args: any[]) => T;

/**
 * Error thrown by Refactor methods
 *
 * @public
 */
export class RefactorError extends Error {}

/**
 * Input type for many methods
 *
 * @public
 */
export type SelectorOrNode = string | string[] | Node | Node[];

/**
 * Node, JavaScript source, or a function that takes a node and returns a Node or JavaScript source.
 *
 * @public
 */
export type Replacer = Node | string | ((node: Node) => string | Node);

/**
 * Async version of Replacer
 *
 * @public
 */
export type AsyncReplacer = Replacer | ((node: Node) => Promise<Node | string>);

/**
 * Nodes that have statements
 */
export type NodesWithStatements = Block | FunctionBody | Script;

/**
 * Identifiers that are easy to reason about
 */
export type SimpleIdentifier = BindingIdentifier | IdentifierExpression | AssignmentTargetIdentifier;

/**
 * Nodes containing a SimpleIdentifier that are similarly easy to reason about
 */
export type SimpleIdentifierOwner =
  | AssignmentExpression
  | ClassDeclaration
  | ClassExpression
  | FunctionDeclaration
  | FunctionExpression
  | VariableDeclarator;
