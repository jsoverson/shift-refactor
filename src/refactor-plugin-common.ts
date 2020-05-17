import { RefactorSession } from ".";
import { ComputedMemberExpression, LiteralStringExpression, StaticMemberExpression, ComputedMemberAssignmentTarget, StaticMemberAssignmentTarget, ComputedPropertyName, StaticPropertyName, VariableDeclarator, IdentifierExpression, LiteralBooleanExpression, FunctionDeclaration, ClassDeclaration } from "shift-ast";
import debug from "debug";
import { Declaration, Reference, Variable } from "shift-scope";
import { MemorableIdGenerator, IdGenerator } from "./id-generator";
import { default as isValid } from 'shift-validator';
import { SelectorOrNode } from "./types";
import { findNodes, isStatement, isLiteral, renameScope } from "./util";
import { RefactorPlugin } from "./refactor-plugin";

declare module "." {
  interface RefactorSession {
    common: RefactorCommonPlugin;
  }
}

export class RefactorCommonPlugin extends RefactorPlugin {
  name = "common";

  register() {
    this.session.common = this;
  }

  convertComputedToStatic() {
    this.session.replaceRecursive(
      `ComputedMemberExpression[expression.type="LiteralStringExpression"]`,
      (node: ComputedMemberExpression) => {
        if (node.expression instanceof LiteralStringExpression) {
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
        if (node.expression instanceof LiteralStringExpression) {
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
        if (node.expression instanceof LiteralStringExpression) {
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
      if (!(node instanceof VariableDeclarator)) {
        debug('Non-VariableDeclarator passed to unshorten(). Skipping.');
        return;
      }
      const from = node.binding;
      const to = node.init;
      if (!(to instanceof IdentifierExpression)) {
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

  massRename(namePairs: string[][]) {
    namePairs.forEach(([from, to]) => {
      this.session.lookupVariableByName(from).forEach((lookup: Variable) => this.session._renameInPlace(lookup, to));
    });
  }

  removeDeadVariables() {
    this.session.query('VariableDeclarator, FunctionDeclaration, ClassDeclaration').forEach(
      (decl: VariableDeclarator | FunctionDeclaration | ClassDeclaration) => {
        let name = decl instanceof VariableDeclarator ? decl.binding : decl.name;
        const lookup = this.session.lookupVariable(name);

        const reads = lookup.references.filter((ref: Reference) => {
          const isRead = ref.accessibility.isRead;
          const isBoth = ref.accessibility.isReadWrite;
          if (isBoth) {
            // if we're an UpdateExpression
            const immediateParent = this.session.findParent(ref.node);
            if (!immediateParent) return false;
            const nextParent = this.session.findParent(immediateParent);
            if (isStatement(nextParent)) return false;
            else return true;
          } else {
            return isRead;
          }
        });

        if (reads.length === 0) {
          lookup.references.forEach((ref: Reference) => {
            const node = ref.node;
            const immediateParent = this.session.findParent(node);
            if (!immediateParent) return;
            const contextualParent = this.session.findParent(immediateParent);

            if (['VariableDeclarator', 'FunctionDeclaration', 'ClassDeclaration'].indexOf(immediateParent.type) > -1) {
              this.session.delete(immediateParent);
            } else if (immediateParent.type === 'UpdateExpression' && isStatement(contextualParent)) {
              this.session.delete(contextualParent);
            } else if (node.type === 'AssignmentTargetIdentifier') {
              if (immediateParent.type === 'AssignmentExpression') {
                if (isLiteral(immediateParent.expression)) {
                  if (isStatement(contextualParent)) {
                    this.session.delete(contextualParent);
                  } else {
                    this.session.replace(immediateParent, immediateParent.expression);
                  }
                } else {
                  this.session.replace(immediateParent, immediateParent.expression);
                }
              }
            }
          });
          this.session.delete(decl);
        }
      },
    );
    if (this.session.autoCleanup) this.session.cleanup();
    return this;
  }

}