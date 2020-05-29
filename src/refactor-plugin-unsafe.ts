import { ClassDeclaration, FunctionDeclaration, VariableDeclarator } from "shift-ast";
import { RefactorPlugin } from "./refactor-plugin";
import { copy, isLiteral, isStatement } from "./util";
import { Variable, Reference, ScopeType, Scope } from "shift-scope";
import { PureFunctionVerdict, PureFunctionAssessment, PureFunctionAssessmentOptions } from "./pure-functions";

declare module "." {
  interface RefactorSession {
    unsafe: RefactorUnsafePlugin;
  }
}

export class RefactorUnsafePlugin extends RefactorPlugin {
  register() {
    this.session.unsafe = this;
  }

  findPureFunctionCandidates(options?: PureFunctionAssessmentOptions) {
    return new Map(this.session.query('FunctionDeclaration')
      .map((fn: FunctionDeclaration) => new PureFunctionAssessment(fn, options))
      .filter((assmt: PureFunctionAssessment) => assmt.verdict === PureFunctionVerdict.Probably)
      .map((assmt: PureFunctionAssessment) => [assmt.node, assmt])
      );
  }

  massRename(namePairs: string[][]) {
    namePairs.forEach(([from, to]) => {
      this.session.lookupVariableByName(from).forEach((lookup: Variable) => this.session._renameInPlace(lookup, to));
    });
  }

  inlineLiterals() {
    for (const variable of this.session._variables.values()) {
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
            if (ref.node !== declaration.node) this.session.replace(ref.node, copy(literalReplacement))
          });
        }
      }
    }
    if (this.session.autoCleanup) this.session.cleanup();
  }

  removeDeadVariables() {
    this.session.query('VariableDeclarator, FunctionDeclaration, ClassDeclaration').forEach(
      (decl: VariableDeclarator | FunctionDeclaration | ClassDeclaration) => {
        let name = decl.type === 'VariableDeclarator' ? decl.binding : decl.name;

        // TODO handle this at some point.
        if (name.type === 'ArrayBinding' || name.type==='ObjectBinding') return;

        const lookup = this.session.lookupVariable(name);
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
      },
    );
    if (this.session.autoCleanup) this.session.cleanup();
    return this;
  }

}