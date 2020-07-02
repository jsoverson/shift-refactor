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
} from 'shift-ast';

export class RefactorError extends Error {}

export type SelectorOrNode = string | Node | Node[];

export type Replacer = Function | Node | string;

// Identifiers that are easy to reason about
export type SimpleIdentifier = BindingIdentifier | IdentifierExpression | AssignmentTargetIdentifier;
// Nodes containing a SimpleIdentifier that are similarly easy to reason about
export type SimpleIdentifierOwner =
  | AssignmentExpression
  | ClassDeclaration
  | ClassExpression
  | FunctionDeclaration
  | FunctionExpression
  | VariableDeclarator;
