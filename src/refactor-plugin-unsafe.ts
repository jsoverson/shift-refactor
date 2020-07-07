import { ClassDeclaration, FunctionDeclaration, VariableDeclarator } from 'shift-ast';
import { Reference, Scope, ScopeType, Variable } from 'shift-scope';
import { PureFunctionAssessment, PureFunctionAssessmentOptions, PureFunctionVerdict } from './pure-functions';
import { RefactorSessionChainable } from './refactor-session-chainable';
import { copy, isLiteral, isStatement } from './util';

export default function pluginUnsafe() {
  return {
    // findPureFunctionCandidates(this: RefactorSessionChainable, options?: PureFunctionAssessmentOptions) {
    //   return new Map(
    //     (this.query('FunctionDeclaration') as FunctionDeclaration[])
    //       .map((fn: FunctionDeclaration) => new PureFunctionAssessment(fn, options))
    //       .filter((assmt: PureFunctionAssessment) => assmt.verdict === PureFunctionVerdict.Probably)
    //       .map((assmt: PureFunctionAssessment) => [assmt.node, assmt]),
    //   );
    // },

    massRename(this: RefactorSessionChainable, namePairs: string[][]) {
      namePairs.forEach(([from, to]) => {
        this.session.lookupVariableByName(from).forEach((lookup: Variable) => this.session.renameInPlace(lookup, to));
      });
    },

    inlineLiterals(this: RefactorSessionChainable) {
      for (const variable of this.session.variables.values()) {
        // Haven't thought about how to deal with this yet. Might be easy. PR welcome.
        if (variable.declarations.length !== 1) continue;
        const declaration = variable.declarations[0];
        // Look for reassignments, written references outside of declaration.
        const writes = variable.references.filter(ref => ref.node !== declaration.node && ref.accessibility.isWrite);
        // if we reassign this variable at any time, forget about it.
        if (writes.length > 0) continue;
        const parent = this.session.findParents(declaration.node)[0];
        // Shouldn't happen, but will if we've got a broken tree.
        if (!parent) continue;
        if (parent.type === 'VariableDeclarator') {
          if (parent.init && isLiteral(parent.init)) {
            const literalReplacement = parent.init;
            variable.references.forEach(ref => {
              // skip declaration
              if (ref.node !== declaration.node) this.session.replace(ref.node, copy(literalReplacement));
            });
          }
        }
      }
      this.session.conditionalCleanup();
    },

    removeDeadVariables(this: RefactorSessionChainable) {
      this
        .query('VariableDeclarator, FunctionDeclaration, ClassDeclaration')
        .forEach((decl: VariableDeclarator | FunctionDeclaration | ClassDeclaration) => {
          let nameNode = decl.type === 'VariableDeclarator' ? decl.binding : decl.name;

          // TODO handle this at some point.
          if (nameNode.type === 'ArrayBinding' || nameNode.type === 'ObjectBinding') return;

          const lookup = this.session.lookupVariable(nameNode);
          const scope = this.session.lookupScope(lookup) as Scope;

          if (scope.type === ScopeType.GLOBAL) return;

          const reads = lookup.references.filter((ref: Reference) => {
            const isRead = ref.accessibility.isRead;
            const isBoth = ref.accessibility.isReadWrite;
            if (isBoth) {
              // if we're an UpdateExpression
              const immediateParent = this.session.findParents(ref.node)[0];
              if (!immediateParent) return false;
              const nextParent = this.session.findParents(immediateParent)[0];
              if (isStatement(nextParent)) return false;
              else return true;
            } else {
              return isRead;
            }
          });

          if (reads.length === 0) {
            lookup.references.forEach((ref: Reference) => {
              const node = ref.node;
              const immediateParent = this.session.findParents(node)[0];
              if (!immediateParent) return;
              const contextualParent = this.session.findParents(immediateParent)[0];

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
        });
      return this.session.conditionalCleanup();
    }
  }

}
