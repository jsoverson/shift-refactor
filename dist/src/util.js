"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRootIdentifier = exports.isDeepSimilar = exports.isMemberExpression = exports.isMemberAssignment = exports.buildParentMap = exports.renameScope = exports.extractExpression = exports.extractStatement = exports.findNodes = exports.isLiteral = exports.isStatement = exports.isShiftNode = exports.isArray = exports.isFunction = exports.isString = exports.copy = void 0;
const shift_ast_1 = require("shift-ast");
const types_1 = require("./types");
const shift_traverser_1 = __importDefault(require("shift-traverser"));
const { query } = require('shift-query');
function copy(object) {
    return JSON.parse(JSON.stringify(object));
}
exports.copy = copy;
function isString(input) {
    return typeof input === 'string';
}
exports.isString = isString;
function isFunction(input) {
    return typeof input === 'function';
}
exports.isFunction = isFunction;
function isArray(input) {
    return Array.isArray(input);
}
exports.isArray = isArray;
function isShiftNode(input) {
    return input && typeof input.type !== 'undefined';
}
exports.isShiftNode = isShiftNode;
function isStatement(input) {
    return input && input.type && input.type.match(/(Statement|Declaration)$/);
}
exports.isStatement = isStatement;
function isLiteral(input) {
    return (input &&
        input.type &&
        (input.type.match(/^Literal/) ||
            (input.type === 'UnaryExpression' && input.operand.type === 'LiteralNumericExpression')));
}
exports.isLiteral = isLiteral;
function findNodes(ast, input) {
    if (isString(input))
        return query(ast, input);
    else if (isArray(input))
        return input;
    else if (isShiftNode(input))
        return [input];
    else
        return [];
}
exports.findNodes = findNodes;
function extractStatement(tree) {
    // catch the case where a string was parsed alone and read as a directive.
    if (tree.directives.length > 0) {
        return new shift_ast_1.ExpressionStatement({
            expression: new shift_ast_1.LiteralStringExpression({
                value: tree.directives[0].rawValue,
            }),
        });
    }
    else {
        return tree.statements[0];
    }
}
exports.extractStatement = extractStatement;
function extractExpression(tree) {
    // catch the case where a string was parsed alone and read as a directive.
    if (tree.directives.length > 0) {
        return new shift_ast_1.LiteralStringExpression({
            value: tree.directives[0].rawValue,
        });
    }
    else {
        if (tree.statements[0].type === 'ExpressionStatement') {
            return tree.statements[0].expression;
        }
        else {
            throw new types_1.RefactorError(`Can't replace an expression with a node of type ${tree.statements[0].type}`);
        }
    }
}
exports.extractExpression = extractExpression;
function renameScope(scope, idGenerator, parentMap) {
    scope.variableList.forEach(variable => {
        if (variable.declarations.length === 0)
            return;
        const nextId = idGenerator.next().value;
        const isParam = variable.declarations.find(_ => _.type.name === 'Parameter');
        let newName = `$$${nextId}`;
        if (isParam) {
            const parent = parentMap.get(isParam.node);
            const position = parent.items.indexOf(isParam.node);
            newName = `$arg${position}_${nextId}`;
        }
        variable.declarations.forEach(_ => (_.node.name = newName));
        variable.references.forEach(_ => (_.node.name = newName));
    });
    scope.children.forEach(_ => renameScope(_, idGenerator, parentMap));
}
exports.renameScope = renameScope;
function buildParentMap(ast) {
    const parentMap = new WeakMap();
    shift_traverser_1.default.traverse(ast, {
        enter: (node, parent) => {
            parentMap.set(node, parent);
        },
    });
    return parentMap;
}
exports.buildParentMap = buildParentMap;
function isMemberAssignment(node) {
    return node.type === 'StaticMemberAssignmentTarget' || node.type === 'ComputedMemberAssignmentTarget';
}
exports.isMemberAssignment = isMemberAssignment;
function isMemberExpression(node) {
    return node.type === 'StaticMemberExpression' || node.type === 'ComputedMemberExpression';
}
exports.isMemberExpression = isMemberExpression;
function isDeepSimilar(a, b) {
    let similar = false;
    for (let key in a) {
        if (isArray(a[key])) {
            similar = key in b && isArray(b[key]) ? (a[key].length === 0 ? true : isDeepSimilar(a[key], b[key])) : false;
        }
        else if (typeof a[key] === 'object') {
            similar = key in b ? isDeepSimilar(a[key], b[key]) : false;
        }
        else {
            similar = a[key] === b[key];
        }
        if (!similar)
            break;
    }
    return similar;
}
exports.isDeepSimilar = isDeepSimilar;
function getRootIdentifier(expr) {
    if (expr.type === 'IdentifierExpression') {
        return expr;
    }
    else {
        switch (expr.object.type) {
            case 'IdentifierExpression':
                return expr.object;
            case 'ComputedMemberExpression':
            case 'StaticMemberExpression':
                return getRootIdentifier(expr.object);
            default:
                throw new Error('Can not get the identifier associated with the passed expression.');
        }
    }
}
exports.getRootIdentifier = getRootIdentifier;
//# sourceMappingURL=util.js.map