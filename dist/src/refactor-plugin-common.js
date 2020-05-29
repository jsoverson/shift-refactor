"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefactorCommonPlugin = void 0;
const debug_1 = __importDefault(require("debug"));
const shift_ast_1 = require("shift-ast");
const shift_validator_1 = __importDefault(require("shift-validator"));
const id_generator_1 = require("./id-generator");
const refactor_plugin_1 = require("./refactor-plugin");
const util_1 = require("./util");
class RefactorCommonPlugin extends refactor_plugin_1.RefactorPlugin {
    register() {
        this.session.common = this;
    }
    compressConditonalExpressions() {
        this.session.replaceRecursive('ConditionalExpression', (expr) => {
            if (util_1.isLiteral(expr.test))
                return expr.test ? expr.consequent : expr.alternate;
            else
                return expr;
        });
    }
    compressCommaOperators() {
        this.session.replaceRecursive('BinaryExpression[operator=","]', (expr) => {
            if (util_1.isLiteral(expr.left))
                return expr.right;
            else
                return expr;
        });
    }
    convertComputedToStatic() {
        this.session.replaceRecursive(`ComputedMemberExpression[expression.type="LiteralStringExpression"]`, (node) => {
            if (node.expression.type === 'LiteralStringExpression') {
                const replacement = new shift_ast_1.StaticMemberExpression({
                    object: node.object,
                    property: node.expression.value,
                });
                return shift_validator_1.default(replacement) ? replacement : node;
            }
            else {
                return node;
            }
        });
        this.session.replaceRecursive(`ComputedMemberAssignmentTarget[expression.type="LiteralStringExpression"]`, (node) => {
            if (node.expression.type === 'LiteralStringExpression') {
                const replacement = new shift_ast_1.StaticMemberAssignmentTarget({
                    object: node.object,
                    property: node.expression.value,
                });
                return shift_validator_1.default(replacement) ? replacement : node;
            }
            else {
                return node;
            }
        });
        this.session.replaceRecursive(`ComputedPropertyName[expression.type="LiteralStringExpression"]`, (node) => {
            if (node.expression.type === 'LiteralStringExpression') {
                const replacement = new shift_ast_1.StaticPropertyName({
                    value: node.expression.value,
                });
                return shift_validator_1.default(replacement) ? replacement : node;
            }
            else {
                return node;
            }
        });
        return this;
    }
    unshorten(selector) {
        const lookupTable = this.session.getLookupTable();
        const nodes = util_1.findNodes(this.session.ast, selector);
        nodes.forEach((node) => {
            if (node.type !== 'VariableDeclarator') {
                debug_1.default('Non-VariableDeclarator passed to unshorten(). Skipping.');
                return;
            }
            const from = node.binding;
            const to = node.init;
            if (to.type !== 'IdentifierExpression') {
                debug_1.default('Tried to unshorten() Declarator with a non-IdentifierExpression. Skipping.');
                return;
            }
            const lookup = lookupTable.variableMap.get(from);
            lookup[0].declarations.forEach((decl) => (decl.node.name = to.name));
            lookup[0].references.forEach((ref) => (ref.node.name = to.name));
            this.session._queueDeletion(node);
        });
        if (this.session.autoCleanup)
            this.session.cleanup();
        return this;
    }
    expandBoolean() {
        this.session.replace(`UnaryExpression[operator="!"][operand.value=0]`, () => new shift_ast_1.LiteralBooleanExpression({ value: true }));
        this.session.replace(`UnaryExpression[operator="!"][operand.value=1]`, () => new shift_ast_1.LiteralBooleanExpression({ value: false }));
        return this;
    }
    normalizeIdentifiers(seed = 1, _Generator = id_generator_1.MemorableIdGenerator) {
        const lookupTable = this.session.getLookupTable();
        const idGenerator = new _Generator(seed);
        util_1.renameScope(lookupTable.scope, idGenerator, this.session._parentMap);
        if (this.session.autoCleanup)
            this.session.cleanup();
        return this;
    }
}
exports.RefactorCommonPlugin = RefactorCommonPlugin;
//# sourceMappingURL=refactor-plugin-common.js.map