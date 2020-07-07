import DEBUG from 'debug';
import {
  BinaryExpression, ComputedMemberAssignmentTarget,
  ComputedMemberExpression,
  ComputedPropertyName,
  ConditionalExpression,
  DebuggerStatement, FunctionBody, IdentifierExpression,
  LiteralBooleanExpression,
  Node,
  ReturnStatement, StaticMemberAssignmentTarget,
  StaticMemberExpression,
  StaticPropertyName
} from 'shift-ast';
import { Declaration, Reference } from 'shift-scope';
import { default as isValid } from 'shift-validator';
import { MemorableIdGenerator } from './id-generator';
import { RefactorSessionChainable } from './refactor-session-chainable';
import { isLiteral, renameScope } from './util';

const debug = DEBUG('shift-refactor:common');

export default function pluginCommon() {
  return {
    debug(this: RefactorSessionChainable) {
      const injectIntoBody = (body: FunctionBody) => {
        if (body.statements.length > 0) {
          this.session.prepend(body.statements[0], new DebuggerStatement());
        } else {
          this.session.replace(
            body,
            new FunctionBody({
              directives: [],
              statements: [new DebuggerStatement()],
            }),
          );
        }
      };
      this.nodes.forEach(node => {
        switch (node.type) {
          case 'FunctionExpression':
          case 'FunctionDeclaration':
          case 'Method':
            injectIntoBody(node.body);
            break;
          case 'ArrowExpression':
            if (node.body.type !== 'FunctionBody') {
              this.session.replace(
                node.body,
                new FunctionBody({
                  directives: [],
                  statements: [new DebuggerStatement(), new ReturnStatement({ expression: node.body })],
                }),
              );
            } else {
              injectIntoBody(node.body);
            }
          default:
            debug('can not call inject debugger statement on %o node', node.type);
          // nothing;
        }
      });
      return this;
    },

    compressConditonalExpressions(this: RefactorSessionChainable) {
      this.session.replaceRecursive('ConditionalExpression', (expr: ConditionalExpression) => {
        if (isLiteral(expr.test)) return expr.test ? expr.consequent : expr.alternate;
        else return expr;
      });
      return this;
    },

    compressCommaOperators(this: RefactorSessionChainable) {
      this.session.replaceRecursive('BinaryExpression[operator=","]', (expr: BinaryExpression) => {
        if (isLiteral(expr.left)) return expr.right;
        else return expr;
      });
      return this;
    },

    convertComputedToStatic(this: RefactorSessionChainable) {
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
    },

    unshorten(this: RefactorSessionChainable) {
      const lookupTable = this.session.getLookupTable();

      this.nodes.forEach((node: Node) => {
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
      return this.session.conditionalCleanup();
    },

    expandBoolean(this: RefactorSessionChainable) {
      this.session.replace(
        `UnaryExpression[operator="!"][operand.value=0]`,
        () => new LiteralBooleanExpression({ value: true }),
      );
      this.session.replace(
        `UnaryExpression[operator="!"][operand.value=1]`,
        () => new LiteralBooleanExpression({ value: false }),
      );
      return this.session.conditionalCleanup();
    },

    normalizeIdentifiers(this: RefactorSessionChainable, seed = 1) {
      const lookupTable = this.session.getLookupTable();
      const idGenerator = new MemorableIdGenerator(seed);
      renameScope(lookupTable.scope, idGenerator, this.session.parentMap);
      return this.session.conditionalCleanup();
    }

  }

}
