"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefactorUnsafePlugin = void 0;
const refactor_plugin_1 = require("./refactor-plugin");
const util_1 = require("./util");
const shift_scope_1 = require("shift-scope");
const pure_functions_1 = require("./pure-functions");
class RefactorUnsafePlugin extends refactor_plugin_1.RefactorPlugin {
    register() {
        this.session.unsafe = this;
    }
    findPureFunctionCandidates(options) {
        return new Map(this.session.query('FunctionDeclaration')
            .map((fn) => new pure_functions_1.PureFunctionAssessment(fn, options))
            .filter((assmt) => assmt.verdict === pure_functions_1.PureFunctionVerdict.Probably)
            .map((assmt) => [assmt.node, assmt]));
    }
    massRename(namePairs) {
        namePairs.forEach(([from, to]) => {
            this.session.lookupVariableByName(from).forEach((lookup) => this.session._renameInPlace(lookup, to));
        });
    }
    inlineLiterals() {
        for (const variable of this.session._variables.values()) {
            // Haven't thought about how to deal with this yet. Might be easy. PR welcome.
            if (variable.declarations.length !== 1)
                continue;
            const declaration = variable.declarations[0];
            // Look for reassignments, written references outside of declaration.
            const writes = variable.references.filter(ref => ref.node !== declaration.node && ref.accessibility.isWrite);
            // if we reassign this variable at any time, forget about it.
            if (writes.length > 0)
                continue;
            const parent = this.session.findParents(declaration.node)[0];
            // Shouldn't happen, but will if we've got a broken tree.
            if (!parent)
                continue;
            if (parent.type === 'VariableDeclarator') {
                if (parent.init && util_1.isLiteral(parent.init)) {
                    const literalReplacement = parent.init;
                    variable.references.forEach(ref => {
                        // skip declaration
                        if (ref.node !== declaration.node)
                            this.session.replace(ref.node, util_1.copy(literalReplacement));
                    });
                }
            }
        }
        if (this.session.autoCleanup)
            this.session.cleanup();
    }
    removeDeadVariables() {
        this.session.query('VariableDeclarator, FunctionDeclaration, ClassDeclaration').forEach((decl) => {
            let name = decl.type === 'VariableDeclarator' ? decl.binding : decl.name;
            // TODO handle this at some point.
            if (name.type === 'ArrayBinding' || name.type === 'ObjectBinding')
                return;
            const lookup = this.session.lookupVariable(name);
            const scope = this.session.lookupScope(lookup);
            if (scope.type === shift_scope_1.ScopeType.GLOBAL)
                return;
            const reads = lookup.references.filter((ref) => {
                const isRead = ref.accessibility.isRead;
                const isBoth = ref.accessibility.isReadWrite;
                if (isBoth) {
                    // if we're an UpdateExpression
                    const immediateParent = this.session.findParents(ref.node)[0];
                    if (!immediateParent)
                        return false;
                    const nextParent = this.session.findParents(immediateParent)[0];
                    if (util_1.isStatement(nextParent))
                        return false;
                    else
                        return true;
                }
                else {
                    return isRead;
                }
            });
            if (reads.length === 0) {
                lookup.references.forEach((ref) => {
                    const node = ref.node;
                    const immediateParent = this.session.findParents(node)[0];
                    if (!immediateParent)
                        return;
                    const contextualParent = this.session.findParents(immediateParent)[0];
                    if (['VariableDeclarator', 'FunctionDeclaration', 'ClassDeclaration'].indexOf(immediateParent.type) > -1) {
                        this.session.delete(immediateParent);
                    }
                    else if (immediateParent.type === 'UpdateExpression' && util_1.isStatement(contextualParent)) {
                        this.session.delete(contextualParent);
                    }
                    else if (node.type === 'AssignmentTargetIdentifier') {
                        if (immediateParent.type === 'AssignmentExpression') {
                            if (util_1.isLiteral(immediateParent.expression)) {
                                if (util_1.isStatement(contextualParent)) {
                                    this.session.delete(contextualParent);
                                }
                                else {
                                    this.session.replace(immediateParent, immediateParent.expression);
                                }
                            }
                            else {
                                this.session.replace(immediateParent, immediateParent.expression);
                            }
                        }
                    }
                });
                this.session.delete(decl);
            }
        });
        if (this.session.autoCleanup)
            this.session.cleanup();
        return this;
    }
}
exports.RefactorUnsafePlugin = RefactorUnsafePlugin;
//# sourceMappingURL=refactor-plugin-unsafe.js.map