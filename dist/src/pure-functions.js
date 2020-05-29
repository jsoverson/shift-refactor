"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PureFunctionAssessment = exports.PureFunctionVerdict = exports.ImpureFunctionQualities = void 0;
const shift_ast_1 = require("shift-ast");
const shift_scope_1 = __importStar(require("shift-scope"));
const shift_traverser_1 = require("shift-traverser");
const util_1 = require("./util");
const shift_parser_1 = require("shift-parser");
const { query } = require('shift-query');
var ImpureFunctionQualities;
(function (ImpureFunctionQualities) {
    ImpureFunctionQualities[ImpureFunctionQualities["ThroughAccess"] = 0] = "ThroughAccess";
    ImpureFunctionQualities[ImpureFunctionQualities["ParameterMemberMutation"] = 1] = "ParameterMemberMutation";
    ImpureFunctionQualities[ImpureFunctionQualities["ArgumentsMemberMutation"] = 2] = "ArgumentsMemberMutation";
    ImpureFunctionQualities[ImpureFunctionQualities["CallsImpureFunctions"] = 3] = "CallsImpureFunctions";
})(ImpureFunctionQualities = exports.ImpureFunctionQualities || (exports.ImpureFunctionQualities = {}));
var PureFunctionVerdict;
(function (PureFunctionVerdict) {
    PureFunctionVerdict["Probably"] = "Probably";
    PureFunctionVerdict["ProbablyNot"] = "ProbablyNot";
})(PureFunctionVerdict = exports.PureFunctionVerdict || (exports.PureFunctionVerdict = {}));
function processAllowList(fnsSrc) {
    return fnsSrc.map(fnSrc => {
        const ast = shift_parser_1.parseScript(fnSrc);
        const firstStatement = ast.statements.shift();
        if (firstStatement && firstStatement.type === 'ExpressionStatement') {
            if (firstStatement.expression.type === 'CallExpression')
                return firstStatement.expression;
        }
        throw new Error('Source passed to fnAllowList must result in a CallExpression (first statement must be a function call)');
    });
}
class PureFunctionAssessment {
    constructor(fnNode, options = {}) {
        this.verdict = PureFunctionVerdict.ProbablyNot;
        this.qualities = new Set();
        this.node = fnNode;
        const tempProgram = new shift_ast_1.Script({ directives: [], statements: [fnNode] });
        const globalScope = shift_scope_1.default(tempProgram);
        const lookupTable = new shift_scope_1.ScopeLookup(globalScope);
        function lookup(id) {
            return lookupTable.variableMap.get(id)[0];
        }
        let throughVariables = Array.from(
        //@ts-ignore
        globalScope.through._.values()).flatMap((ref) => lookup(ref[0].node));
        const qualities = {
            throughAccess: false,
            parameterMemberMutation: false,
            argumentsMemberMutation: false,
            callsImpureFunctions: false,
        };
        const paramIdentifiers = query(fnNode.params, 'BindingIdentifier').map((id) => lookup(id));
        const innerFunctionAssessments = new WeakMap();
        const fnAllowList = options.fnAllowList ? processAllowList(options.fnAllowList) : [];
        shift_traverser_1.traverse(tempProgram, {
            enter: function (node, parent) {
                if (node === fnNode)
                    return;
                // need to hoist...
                if (node.type === 'FunctionDeclaration') {
                    const variable = lookup(node.name);
                    if (variable) {
                        innerFunctionAssessments.set(variable, new PureFunctionAssessment(node));
                    }
                    return this.skip();
                }
                else if (util_1.isMemberAssignment(node) && node.object.type === 'IdentifierExpression') {
                    const variable = lookup(node.object);
                    if (paramIdentifiers.includes(variable))
                        qualities.parameterMemberMutation = true;
                }
                else if (util_1.isMemberExpression(node) && util_1.isMemberAssignment(parent) && node.object.type === 'IdentifierExpression') {
                    const variable = lookup(node.object);
                    if (variable.name === 'arguments')
                        qualities.argumentsMemberMutation = true;
                }
                else if (node.type === 'CallExpression') {
                    let bypass = false;
                    if (fnAllowList) {
                        const allowed = fnAllowList.filter(fnGeneric => util_1.isDeepSimilar(fnGeneric, node));
                        if (allowed.length > 0) {
                            bypass = true;
                            if (util_1.isMemberExpression(node.callee) || node.callee.type === 'IdentifierExpression') {
                                const id = util_1.getRootIdentifier(node.callee);
                                const variable = lookup(id);
                                //@ts-ignore
                                throughVariables = throughVariables.filter((v) => variable !== v);
                            }
                        }
                    }
                    if (!bypass) {
                        if (node.callee.type === 'IdentifierExpression') {
                            const variable = lookup(node.callee);
                            if (innerFunctionAssessments.has(variable)) {
                                const calleeAssessment = innerFunctionAssessments.get(variable);
                                if (calleeAssessment.verdict !== PureFunctionVerdict.Probably)
                                    qualities.callsImpureFunctions = true;
                            }
                        }
                    }
                }
            }
        });
        if (qualities.parameterMemberMutation)
            this.qualities.add(ImpureFunctionQualities.ParameterMemberMutation);
        if (qualities.argumentsMemberMutation)
            this.qualities.add(ImpureFunctionQualities.ArgumentsMemberMutation);
        if (qualities.callsImpureFunctions)
            this.qualities.add(ImpureFunctionQualities.CallsImpureFunctions);
        if (throughVariables.length > 0)
            this.qualities.add(ImpureFunctionQualities.ThroughAccess);
        if (this.qualities.size === 0)
            this.verdict = PureFunctionVerdict.Probably;
    }
}
exports.PureFunctionAssessment = PureFunctionAssessment;
//# sourceMappingURL=pure-functions.js.map