import { default as codegen, FormattedCodeGen } from '@jsoverson/shift-codegen';
import DEBUG from 'debug';
import { BindingIdentifier, ClassDeclaration, ComputedMemberAssignmentTarget, ComputedMemberExpression, ComputedPropertyName, Expression, ExpressionStatement, FormalParameters, FunctionDeclaration, IdentifierExpression, LiteralBooleanExpression, LiteralStringExpression, Script, Node, Statement, StaticMemberAssignmentTarget, StaticMemberExpression, StaticPropertyName, VariableDeclarator, LiteralInfinityExpression, LiteralNumericExpression, LiteralRegExpExpression, LiteralNullExpression } from 'shift-ast';
import { parseScript } from 'shift-parser';
import shiftScope, { Declaration, Reference, Scope, ScopeLookup, Variable } from 'shift-scope';
import traverser from 'shift-traverser';
import { default as isValid } from 'shift-validator';
import { isString, findNodes, isFunction, isShiftNode, isStatement, copy, isArray, extractStatement, extractExpression } from './util';
import { SelectorOrNode, Replacer, RefactorError } from './types';
import { RefactorCommonPlugin } from "./refactor-plugin-common";
import { RefactorPlugin } from './refactor-plugin';
import { RefactorUnsafePlugin } from './refactor-plugin-unsafe';

const debug = DEBUG('shift-refactor');

const { query } = require('shift-query');

export class RefactorSession {
  ast: Node;
  autoCleanup = true;
  dirty = false;

  _scopeMap = new WeakMap();
  _scopeOwnerMap = new WeakMap<Node, Scope>();
  _parentMap = new WeakMap<Node, Node>();

  _replacements = new WeakMap();
  _deletions = new WeakSet();
  _insertions = new WeakMap();

  _lookupTable: ScopeLookup | undefined;

  constructor(ast: string | Node, { autoCleanup = true } = {}) {
    if (isString(ast)) ast = parseScript(ast);
    this.ast = ast;
    this.autoCleanup = autoCleanup;

    this._rebuildParentMap(); 
    this.use(RefactorCommonPlugin);
    this.use(RefactorUnsafePlugin);
    
    this.getLookupTable();
  }

  use<T extends RefactorPlugin>(Plugin: new(session:RefactorSession) => T) {
    const plugin = new Plugin(this);
    plugin.register();
  }

  static parse(src:string): Script {
    return parseScript(src);
  }

  _rebuildParentMap() {
    this._parentMap = new WeakMap();
    traverser.traverse(this.ast, {
      enter: (node: Node, parent: Node) => {
        this._parentMap.set(node, parent);
      },
    });
  }

  rename(selector: SelectorOrNode, newName: string) {
    const lookupTable = this.getLookupTable();

    const nodes = findNodes(this.ast, selector);

    nodes.forEach((node: Node) => {
      if (node instanceof VariableDeclarator) node = node.binding;
      const lookup = lookupTable.variableMap.get(node);
      if (!lookup) return;
      this._renameInPlace(lookup[0], newName);
    });

    return this;
  }

  _renameInPlace(lookup: Variable, newName: string) {
    if (!lookup || !newName) return;
    lookup.declarations.forEach(decl => ((decl.node as BindingIdentifier).name = newName));
    lookup.references.forEach(ref => ((ref.node as IdentifierExpression).name = newName));
  }

  delete(selector: SelectorOrNode) {
    const nodes = findNodes(this.ast, selector);
    if (nodes.length > 0) {
      nodes.forEach((node: Node) => this._queueDeletion(node));
    }
    if (this.autoCleanup) this.cleanup();
    return this;
  }

  replace(selector: SelectorOrNode, replacer: Replacer) {
    const nodes = findNodes(this.ast, selector);

    const replacementScript = typeof replacer === 'string' ? parseScript(replacer) : null;

    const replaced = nodes.map((node: Node) => {
      let replacement = null;
      if (isFunction(replacer)) {
        const rv = replacer(node);
        if (isShiftNode(rv)) {
          replacement = replacer(node);
        } else if (isString(rv)) {
          const returnedTree = parseScript(rv);
          if (isStatement(node)) {
            replacement = extractStatement(returnedTree);
          } else {
            replacement = extractExpression(returnedTree);
          }
        } else {
          throw new RefactorError(`Invalid return type from replacement function: ${rv}`);
        }
      } else if (isShiftNode(replacer)) {
        replacement = copy(replacer);
      } else if (replacementScript) {
        if (isStatement(node)) {
          replacement = copy(replacementScript.statements[0]);
        } else {
          if (replacementScript.statements[0] instanceof ExpressionStatement) {
            replacement = copy(replacementScript.statements[0].expression);
          }
        }
      }
      if (node && replacement !== node) {
        this._queueReplacement(node, replacement);
        return true;
      } else {
        return false;
      }
    });

    if (this.autoCleanup) this.cleanup();
    return replaced.filter((wasReplaced: any) => wasReplaced).length;
  }

  replaceRecursive(selector: SelectorOrNode, replacer: Replacer) {
    const nodesReplaced = this.replace(selector, replacer);
    this.cleanup();
    if (nodesReplaced > 0) this.replaceRecursive(selector, replacer);
    return this;
  }

  _insert(selector: SelectorOrNode, replacer: Replacer, after = false) {
    const nodes = findNodes(this.ast, selector);

    let insertion: Node | null = null;
    let getInsertion = (program: Replacer, node: Node) => {
      if (isFunction(program)) {
        const result = program(node);
        if (isShiftNode(result)) return result;
        return parseScript(result).statements[0];
      } else {
        if (insertion) return copy(insertion);
        if (isShiftNode(program)) return copy(program);
        return (insertion = parseScript(program).statements[0]);
      }
    };

    nodes.forEach((node: Node) => {
      if (!isStatement(node)) throw new RefactorError('Can only insert before or after Statements or Declarations');
      this.dirty = true;
      const toInsert = getInsertion(replacer, node);
      if (!isStatement(toInsert)) throw new RefactorError('Will not insert anything but a Statement or Declaration');
      this._insertions.set(node, {
        after,
        statement: getInsertion(replacer, node),
      });
    });

    if (this.autoCleanup) this.cleanup();
    return this;
  }

  findParent(node: Node) {
    return this._parentMap.get(node);
  }

  insertBefore(selector: SelectorOrNode, replacer: Replacer) {
    return this._insert(selector, replacer, false);
  }

  insertAfter(selector: SelectorOrNode, replacer: Replacer) {
    return this._insert(selector, replacer, true);
  }

  _queueDeletion(node: Node) {
    this.dirty = true;
    this._deletions.add(node);
  }

  _queueReplacement(from: Node, to: Node) {
    this.dirty = true;
    this._replacements.set(from, to);
  }

  getLookupTable() {
    if (this._lookupTable) return this._lookupTable;
    const globalScope = shiftScope(this.ast);
    this._lookupTable = new ScopeLookup(globalScope);
    this._rebuildScopeMap();
    return this._lookupTable;
  }

  _rebuildScopeMap() {
    const lookupTable = this.getLookupTable();
    this._scopeMap = new WeakMap();
    const recurse = (scope: Scope) => {
      this._scopeOwnerMap.set(scope.astNode, scope);
      scope.variableList.forEach((variable: Variable) => this._scopeMap.set(variable, scope));
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
    return isValid(this.ast);
  }

  cleanup() {
    if (!this.dirty) return;
    const _this = this;
    const result = traverser.replace(this.ast, {
      leave: function(node: Node, parent: Node) {
        if (node.type === 'VariableDeclarationStatement') {
          if (node.declaration.declarators.length === 0) return this.remove();
        }
        if (_this._replacements.has(node)) {
          const newNode = _this._replacements.get(node);
          _this._replacements.delete(node);
          return newNode;
        }
        if (_this._insertions.has(node)) {
          if (isStatement(node)) {
            const insertion = _this._insertions.get(node);
            if ('statements' in parent) {
              let statementIndex = parent.statements.indexOf(node);
              if (insertion.after) statementIndex++;
              parent.statements.splice(statementIndex, 0, insertion.statement);
              _this._insertions.delete(node);
            } else {
              debug(`Tried to insert ${node.type} but I lost track of my parent block :-(`);
            }
          } else {
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

  query(selector: string) {
    return query(this.ast, selector);
  }

  queryFrom(astNodes: Node | Node[], selector: string) {
    return isArray(astNodes) ? astNodes.map(node => query(node, selector)).flat() : query(astNodes, selector);
  }

  closest(originSelector: SelectorOrNode, closestSelector: string) {
    const nodes = findNodes(this.ast, originSelector);

    const recurse = (node: Node, selector: string): Node[] => {
      const parent = this.findParent(node);
      if (!parent) return [];
      const matches = query(parent, selector);
      if (matches.length > 0) return matches;
      else return recurse(parent, selector);
    };

    return nodes.flatMap((node: Node) => recurse(node, closestSelector));
  }

  lookupScope(variableLookup: ScopeLookup) {
    if (isArray(variableLookup)) variableLookup = variableLookup[0];

    if (isShiftNode(variableLookup)) variableLookup = this.lookupVariable(variableLookup);

    return this._scopeMap.get(variableLookup);
  }

  getInnerScope(node: FunctionDeclaration) {
    return this._scopeOwnerMap.get(node);
  }

  lookupVariable(node: Node) {
    const lookupTable = this.getLookupTable();
    if (isArray(node)) node = node[0];

    const lookup = lookupTable.variableMap.get(node);
    if (!lookup)
      throw new Error('Could not find reference to passed identifier. Ensure you are passing a valid Identifier node.');
    if (lookup.length > 1)
      throw new Error('When does this happen? Submit an issue with this case so I can handle it better.');
    return lookup[0];
  }

  lookupVariableByName(name: string) {
    const lookupTable = this.getLookupTable();
    const varSet = new Set();

    // @ts-ignore: Poking where I shouldn't
    for (let [lookup] of lookupTable.variableMap._.values()) {
      if (name === lookup.name) varSet.add(lookup);
    }
    return Array.from(varSet) as Variable[];
  }

  print(ast?: Node) {
    return codegen(ast || this.ast, new FormattedCodeGen());
  }

}

