import { ClassDeclaration, FunctionDeclaration, VariableDeclarator } from "shift-ast";
import { Reference, Variable } from "shift-scope";
import { RefactorPlugin } from "./refactor-plugin";
import { isLiteral, isStatement } from "./util";

declare module "." {
  interface RefactorSession {
    unsafe: RefactorUnsafePlugin;
  }
}

export class RefactorUnsafePlugin extends RefactorPlugin {
  register() {
    this.session.unsafe = this;
  }

  findPureFunctions() {
    return this.session.query('FunctionDeclaration').map((fn: FunctionDeclaration) => {
      const scope = this.session.getInnerScope(fn);
      if (!scope) return undefined;
      const numThrough = scope.through.size;
      const callExpressions = this.session.queryFrom(fn, 'CallExpression');
      if (numThrough === 0 && callExpressions.length === 0) return fn;
    }).filter((fn: any) => !!fn);
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