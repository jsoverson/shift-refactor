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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefactorSession = exports.$r = void 0;
const shift_codegen_1 = __importStar(require("@jsoverson/shift-codegen"));
const debug_1 = __importDefault(require("debug"));
const shift_parser_1 = require("shift-parser");
const shift_scope_1 = __importStar(require("shift-scope"));
const shift_traverser_1 = __importDefault(require("shift-traverser"));
const shift_validator_1 = __importDefault(require("shift-validator"));
const refactor_plugin_common_1 = require("./refactor-plugin-common");
const refactor_plugin_unsafe_1 = require("./refactor-plugin-unsafe");
const types_1 = require("./types");
const util_1 = require("./util");
const fast_deep_equal_1 = __importDefault(require("fast-deep-equal"));
const waterfall_1 = require("./waterfall");
const debug = debug_1.default('shift-refactor');
const { query } = require('shift-query');
var util_2 = require("./util");
Object.defineProperty(exports, "isLiteral", { enumerable: true, get: function () { return util_2.isLiteral; } });
// experimental start to a jQuery-like chaining
function $r(ast, { autoCleanup = true } = {}) {
    const $script = new RefactorSession(ast, { autoCleanup });
    function query(selector) {
        return $script.query(selector);
    }
    const prototype = Object.getPrototypeOf($script);
    const hybridObject = Object.assign(query, $script);
    Object.setPrototypeOf(hybridObject, prototype);
    return hybridObject;
}
exports.$r = $r;
class RefactorSession {
    constructor(ast, { autoCleanup = true } = {}) {
        this.autoCleanup = true;
        this.dirty = false;
        this._scopeMap = new WeakMap();
        this._scopeOwnerMap = new WeakMap();
        this._parentMap = new WeakMap();
        this._variables = new Set();
        this._replacements = new WeakMap();
        this._deletions = new WeakSet();
        this._insertions = new WeakMap();
        if (util_1.isString(ast))
            ast = shift_parser_1.parseScript(ast);
        this.ast = ast;
        this.autoCleanup = autoCleanup;
        this._rebuildParentMap();
        this.use(refactor_plugin_common_1.RefactorCommonPlugin);
        this.use(refactor_plugin_unsafe_1.RefactorUnsafePlugin);
        this.getLookupTable();
    }
    use(Plugin) {
        const plugin = new Plugin(this);
        plugin.register();
    }
    static parse(src) {
        return shift_parser_1.parseScript(src);
    }
    _rebuildParentMap() {
        this._parentMap = util_1.buildParentMap(this.ast);
    }
    rename(selector, newName) {
        const lookupTable = this.getLookupTable();
        const nodes = util_1.findNodes(this.ast, selector);
        nodes.forEach((node) => {
            if (node.type === 'VariableDeclarator')
                node = node.binding;
            const lookup = lookupTable.variableMap.get(node);
            if (!lookup)
                return;
            this._renameInPlace(lookup[0], newName);
        });
        return this;
    }
    _renameInPlace(lookup, newName) {
        if (!lookup || !newName)
            return;
        lookup.declarations.forEach(decl => (decl.node.name = newName));
        lookup.references.forEach(ref => (ref.node.name = newName));
    }
    delete(selector) {
        const nodes = util_1.findNodes(this.ast, selector);
        if (nodes.length > 0) {
            nodes.forEach((node) => this._queueDeletion(node));
        }
        if (this.autoCleanup)
            this.cleanup();
        return this;
    }
    async replaceAsync(selector, replacer) {
        const nodes = util_1.findNodes(this.ast, selector);
        if (!util_1.isFunction(replacer)) {
            throw new types_1.RefactorError(`Invalid replacer type for replaceAsync. Pass a function or use .replace() instead.`);
        }
        const promiseResults = await waterfall_1.waterfallMap(nodes, async (node, i) => {
            let replacement = null;
            const rv = await replacer(node);
            if (util_1.isShiftNode(rv)) {
                replacement = rv;
            }
            else if (util_1.isString(rv)) {
                const returnedTree = shift_parser_1.parseScript(rv);
                if (util_1.isStatement(node)) {
                    replacement = util_1.extractStatement(returnedTree);
                }
                else {
                    replacement = util_1.extractExpression(returnedTree);
                }
            }
            else {
                throw new types_1.RefactorError(`Invalid return type from replacement function: ${rv}`);
            }
            if (node && replacement !== node) {
                this._queueReplacement(node, replacement);
                return true;
            }
            else {
                return false;
            }
        });
        if (this.autoCleanup)
            this.cleanup();
        return promiseResults.filter(result => result);
    }
    replace(selector, replacer) {
        const nodes = util_1.findNodes(this.ast, selector);
        const replacementScript = typeof replacer === 'string' ? shift_parser_1.parseScript(replacer) : null;
        const replaced = nodes.map((node) => {
            let replacement = null;
            if (util_1.isFunction(replacer)) {
                const rv = replacer(node);
                if (rv && typeof rv.then === 'function') {
                    throw new types_1.RefactorError(`Promise returned from replacer function, use .replaceAsync() instead.`);
                }
                if (util_1.isShiftNode(rv)) {
                    replacement = rv;
                }
                else if (util_1.isString(rv)) {
                    const returnedTree = shift_parser_1.parseScript(rv);
                    if (util_1.isStatement(node)) {
                        replacement = util_1.extractStatement(returnedTree);
                    }
                    else {
                        replacement = util_1.extractExpression(returnedTree);
                    }
                }
                else {
                    throw new types_1.RefactorError(`Invalid return type from replacement function: ${rv}`);
                }
            }
            else if (util_1.isShiftNode(replacer)) {
                replacement = util_1.copy(replacer);
            }
            else if (replacementScript) {
                if (util_1.isStatement(node)) {
                    replacement = util_1.copy(replacementScript.statements[0]);
                }
                else {
                    if (replacementScript.statements[0].type === 'ExpressionStatement') {
                        replacement = util_1.copy(replacementScript.statements[0].expression);
                    }
                }
            }
            if (node && replacement !== node) {
                this._queueReplacement(node, replacement);
                return true;
            }
            else {
                return false;
            }
        });
        if (this.autoCleanup)
            this.cleanup();
        return replaced.filter((wasReplaced) => wasReplaced).length;
    }
    replaceRecursive(selector, replacer) {
        const nodesReplaced = this.replace(selector, replacer);
        this.cleanup();
        if (nodesReplaced > 0)
            this.replaceRecursive(selector, replacer);
        return this;
    }
    _insert(selector, replacer, after = false) {
        const nodes = util_1.findNodes(this.ast, selector);
        let insertion = null;
        let getInsertion = (program, node) => {
            if (util_1.isFunction(program)) {
                const result = program(node);
                if (util_1.isShiftNode(result))
                    return result;
                return shift_parser_1.parseScript(result).statements[0];
            }
            else {
                if (insertion)
                    return util_1.copy(insertion);
                if (util_1.isShiftNode(program))
                    return util_1.copy(program);
                return (insertion = shift_parser_1.parseScript(program).statements[0]);
            }
        };
        nodes.forEach((node) => {
            if (!util_1.isStatement(node))
                throw new types_1.RefactorError('Can only insert before or after Statements or Declarations');
            this.dirty = true;
            const toInsert = getInsertion(replacer, node);
            if (!util_1.isStatement(toInsert))
                throw new types_1.RefactorError('Will not insert anything but a Statement or Declaration');
            this._insertions.set(node, {
                after,
                statement: getInsertion(replacer, node),
            });
        });
        if (this.autoCleanup)
            this.cleanup();
        return this;
    }
    findParents(selector) {
        const nodes = util_1.findNodes(this.ast, selector);
        return nodes.map((node) => this._parentMap.get(node));
    }
    insertBefore(selector, replacer) {
        return this._insert(selector, replacer, false);
    }
    insertAfter(selector, replacer) {
        return this._insert(selector, replacer, true);
    }
    _queueDeletion(node) {
        this.dirty = true;
        this._deletions.add(node);
    }
    _queueReplacement(from, to) {
        this.dirty = true;
        this._replacements.set(from, to);
    }
    getLookupTable() {
        if (this._lookupTable)
            return this._lookupTable;
        const globalScope = shift_scope_1.default(this.ast);
        this._lookupTable = new shift_scope_1.ScopeLookup(globalScope);
        this._rebuildScopeMap();
        return this._lookupTable;
    }
    _rebuildScopeMap() {
        const lookupTable = this.getLookupTable();
        this._scopeMap = new WeakMap();
        this._variables = new Set();
        const recurse = (scope) => {
            this._scopeOwnerMap.set(scope.astNode, scope);
            scope.variableList.forEach((variable) => {
                this._variables.add(variable);
                this._scopeMap.set(variable, scope);
            });
            scope.children.forEach(recurse);
        };
        recurse(lookupTable.scope);
    }
    _isDirty() {
        return this.dirty;
    }
    _makeDirty() {
        this.dirty = true;
    }
    validate() {
        return shift_validator_1.default(this.ast);
    }
    cleanup() {
        if (!this.dirty)
            return;
        const _this = this;
        const result = shift_traverser_1.default.replace(this.ast, {
            leave: function (node, parent) {
                if (node.type === 'VariableDeclarationStatement') {
                    if (node.declaration.declarators.length === 0)
                        return this.remove();
                }
                if (_this._replacements.has(node)) {
                    const newNode = _this._replacements.get(node);
                    _this._replacements.delete(node);
                    return newNode;
                }
                if (_this._insertions.has(node)) {
                    if (util_1.isStatement(node)) {
                        const insertion = _this._insertions.get(node);
                        if ('statements' in parent) {
                            let statementIndex = parent.statements.indexOf(node);
                            if (insertion.after)
                                statementIndex++;
                            parent.statements.splice(statementIndex, 0, insertion.statement);
                            _this._insertions.delete(node);
                        }
                        else {
                            debug(`Tried to insert ${node.type} but I lost track of my parent block :-(`);
                        }
                    }
                    else {
                        debug(`Tried to insert a non-Statement (${node.type}). Skipping.`);
                    }
                }
                if (_this._deletions.has(node)) {
                    _this._replacements.delete(node);
                    this.remove();
                }
            },
        });
        this._lookupTable = undefined;
        this._rebuildParentMap();
        return (this.ast = result);
    }
    query(selector) {
        return query(this.ast, selector);
    }
    // alias for query because I refuse to name findOne()->queryOne() and I need the symmetry.
    find(selector) {
        return this.query(selector);
    }
    queryFrom(astNodes, selector) {
        return util_1.isArray(astNodes) ? astNodes.map(node => query(node, selector)).flat() : query(astNodes, selector);
    }
    findMatchingExpression(sampleSrc) {
        const tree = shift_parser_1.parseScript(sampleSrc);
        if (tree.statements[0] && tree.statements[0].type === 'ExpressionStatement') {
            const sampleExpression = tree.statements[0].expression;
            const potentialMatches = this.query(sampleExpression.type);
            const matches = potentialMatches.filter((realNode) => fast_deep_equal_1.default(sampleExpression, realNode));
            return matches;
        }
        return [];
    }
    findMatchingStatement(sampleSrc) {
        const tree = shift_parser_1.parseScript(sampleSrc);
        if (tree.statements[0]) {
            const sampleStatement = tree.statements[0];
            const potentialMatches = this.query(sampleStatement.type);
            const matches = potentialMatches.filter((realNode) => fast_deep_equal_1.default(sampleStatement, realNode));
            return matches;
        }
        return [];
    }
    findOne(selector) {
        const nodes = this.query(selector);
        if (nodes.length !== 1)
            throw new Error(`findOne('${selector}') found ${nodes.length} nodes. If this is intentional, use .find()`);
        return nodes[0];
    }
    findReferences(node) {
        const lookup = this.lookupVariable(node);
        return lookup.references;
    }
    findDeclarations(node) {
        const lookup = this.lookupVariable(node);
        return lookup.declarations;
    }
    closest(originSelector, closestSelector) {
        const nodes = util_1.findNodes(this.ast, originSelector);
        const recurse = (node, selector) => {
            const parent = this.findParents(node)[0];
            if (!parent)
                return [];
            const matches = query(parent, selector);
            if (matches.length > 0)
                return matches;
            else
                return recurse(parent, selector);
        };
        return nodes.flatMap((node) => recurse(node, closestSelector));
    }
    lookupScope(variableLookup) {
        if (util_1.isArray(variableLookup))
            variableLookup = variableLookup[0];
        if (util_1.isShiftNode(variableLookup))
            variableLookup = this.lookupVariable(variableLookup);
        return this._scopeMap.get(variableLookup);
    }
    getInnerScope(node) {
        return this._scopeOwnerMap.get(node);
    }
    lookupVariable(node) {
        const lookupTable = this.getLookupTable();
        if (util_1.isArray(node))
            node = node[0];
        let lookup;
        switch (node.type) {
            case 'AssignmentExpression':
            case 'VariableDeclarator':
                lookup = lookupTable.variableMap.get(node.binding);
                break;
            case 'AssignmentTargetIdentifier':
            case 'IdentifierExpression':
            case 'BindingIdentifier':
                lookup = lookupTable.variableMap.get(node);
                break;
            case 'ClassDeclaration':
            case 'ClassExpression':
            case 'FunctionDeclaration':
            case 'FunctionExpression':
                lookup = lookupTable.variableMap.get(node.name);
                break;
        }
        if (!lookup)
            throw new Error('Could not find reference to passed identifier. Ensure you are passing a valid Identifier node.');
        if (lookup.length > 1)
            throw new Error('When does this happen? Submit an issue with this case so I can handle it better.');
        return lookup[0];
    }
    lookupVariableByName(name) {
        const lookupTable = this.getLookupTable();
        const varSet = new Set();
        // @ts-ignore: Poking where I shouldn't
        for (let [lookup] of lookupTable.variableMap._.values()) {
            if (name === lookup.name)
                varSet.add(lookup);
        }
        return Array.from(varSet);
    }
    print(ast) {
        return shift_codegen_1.default(ast || this.ast, new shift_codegen_1.FormattedCodeGen());
    }
}
exports.RefactorSession = RefactorSession;
//# sourceMappingURL=index.js.map