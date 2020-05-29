import debug from "debug";
import { ComputedMemberAssignmentTarget, ComputedMemberExpression, ComputedPropertyName, IdentifierExpression, LiteralBooleanExpression, LiteralStringExpression, StaticMemberAssignmentTarget, StaticMemberExpression, StaticPropertyName, VariableDeclarator, Node, BinaryExpression, ConditionalExpression } from "shift-ast";
import { Declaration, Reference } from "shift-scope";
import { default as isValid } from 'shift-validator';
import { IdGenerator, MemorableIdGenerator } from "./id-generator";
import { RefactorPlugin } from "./refactor-plugin";
import { SelectorOrNode } from "./types";
import { findNodes, renameScope, isLiteral } from "./util";

declare module "." {
  interface RefactorSession {
    common: RefactorCommonPlugin;
  }
}

export class RefactorCommonPlugin extends RefactorPlugin {
  register() {
    this.session.common = this;
  }

  compressConditonalExpressions() {
    this.session.replaceRecursive('ConditionalExpression', (expr:ConditionalExpression) => {
      if (isLiteral(expr.test)) return expr.test ? expr.consequent : expr.alternate;
      else return expr;
    });
  }

  compressCommaOperators() {
    this.session.replaceRecursive('BinaryExpression[operator=","]', (expr:BinaryExpression) => {
      if (isLiteral(expr.left)) return expr.right;
      else return expr;
    });
  }

  convertComputedToStatic() {
    this.session.replaceRecursive(
      `ComputedMemberExpression[expression.type="LiteralStringExpression"]`,
      (node: ComputedMemberExpression) => {
        if (node.expression.type === 'LiteralStringExpression') {
          const replacement = new StaticMemberExpression({
            object: node.object,
            property: node.expression.value,
          });
          return isValid(replacement) ? replacement : node;
        } else {
          return node;
        }
      },
    );

    this.session.replaceRecursive(
      `ComputedMemberAssignmentTarget[expression.type="LiteralStringExpression"]`,
      (node: ComputedMemberAssignmentTarget) => {
        if (node.expression.type === 'LiteralStringExpression') {
          const replacement = new StaticMemberAssignmentTarget({
            object: node.object,
            property: node.expression.value,
          });
          return isValid(replacement) ? replacement : node;
        } else {
          return node;
        }
      },
    );

    this.session.replaceRecursive(
      `ComputedPropertyName[expression.type="LiteralStringExpression"]`,
      (node: ComputedPropertyName) => {
        if (node.expression.type === 'LiteralStringExpression') {
          const replacement = new StaticPropertyName({
            value: node.expression.value,
          });
          return isValid(replacement) ? replacement : node;
        } else {
          return node;
        }
      },
    );

    return this;
  }

  unshorten(selector: SelectorOrNode) {
    const lookupTable = this.session.getLookupTable();
    const nodes = findNodes(this.session.ast, selector);

    nodes.forEach((node: Node) => {
      if (node.type !== 'VariableDeclarator') {
        debug('Non-VariableDeclarator passed to unshorten(). Skipping.');
        return;
      }
      const from = node.binding;
      const to = node.init as IdentifierExpression;
      if (to.type !== 'IdentifierExpression') {
        debug('Tried to unshorten() Declarator with a non-IdentifierExpression. Skipping.');
        return;
      }
      const lookup = lookupTable.variableMap.get(from);
      lookup[0].declarations.forEach((decl: Declaration) => (decl.node.name = to.name));
      lookup[0].references.forEach((ref: Reference) => (ref.node.name = to.name));
      this.session._queueDeletion(node);
    });
    if (this.session.autoCleanup) this.session.cleanup();
    return this;
  }

  expandBoolean() {
    this.session.replace(
      `UnaryExpression[operator="!"][operand.value=0]`,
      () => new LiteralBooleanExpression({ value: true }),
    );
    this.session.replace(
      `UnaryExpression[operator="!"][operand.value=1]`,
      () => new LiteralBooleanExpression({ value: false }),
    );
    return this;
  }

  normalizeIdentifiers(seed = 1, _Generator: new (seed:number) => IdGenerator = MemorableIdGenerator) {
    const lookupTable = this.session.getLookupTable();
    const idGenerator = new _Generator(seed);
    renameScope(lookupTable.scope, idGenerator, this.session._parentMap);
    if (this.session.autoCleanup) this.session.cleanup();
    return this;
  }

}