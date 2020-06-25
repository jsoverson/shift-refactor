import { default as codegen, FormattedCodeGen } from '@jsoverson/shift-codegen';
import DEBUG from 'debug';
import {
  BindingIdentifier,
  ExpressionStatement,
  FunctionDeclaration,
  IdentifierExpression,
  Node,
  Script,
  VariableDeclarator,
  AssignmentTargetIdentifier,
  ClassDeclaration,
  FunctionExpression,
  AssignmentExpression,
  ClassExpression,
  ArrayBinding,
  ObjectBinding,
  ObjectAssignmentTarget,
  Statement,
  Expression,
  DebuggerStatement,
  FunctionBody,
  ReturnStatement
} from 'shift-ast';
import { parseScript } from 'shift-parser';
import shiftScope, { Scope, ScopeLookup, Variable, Reference, Declaration } from 'shift-scope';
import traverser from 'shift-traverser';
import { default as isValid } from 'shift-validator';
import { RefactorPlugin } from './refactor-plugin';
import { RefactorCommonPlugin } from './refactor-plugin-common';
import { RefactorUnsafePlugin } from './refactor-plugin-unsafe';
import { RefactorError, Replacer, SelectorOrNode } from './types';
import {
  copy,
  extractExpression,
  extractStatement,
  findNodes,
  isArray,
  isFunction,
  isShiftNode,
  isStatement,
  isString,
  buildParentMap,
} from './util';
import deepEqual from 'fast-deep-equal';
import { waterfallMap } from './waterfall';
import { threadId } from 'worker_threads';

const debug = DEBUG('shift-refactor');

const { query } = require('shift-query');

// Identifiers that are easy to reason about
export type SimpleIdentifier = BindingIdentifier | IdentifierExpression | AssignmentTargetIdentifier;
// Nodes containing a SimpleIdentifier that are similarly easy to reason about
export type SimpleIdentifierOwner =
  | AssignmentExpression
  | ClassDeclaration
  | ClassExpression
  | FunctionDeclaration
  | FunctionExpression
  | VariableDeclarator;

export { isLiteral } from './util';

// experimental start to a jQuery-like chaining
export function $r(ast: string | Node, { autoCleanup = true } = {}) {
  const $script = new RefactorSession(ast, {autoCleanup});

  function query(selector: string) {
    return $script.query(selector);
  }
  const prototype = Object.getPrototypeOf($script);
  const hybridObject = Object.assign(query, $script);
  Object.setPrototypeOf(hybridObject, prototype);
  return hybridObject;
}

export class RefactorSession {
  ast: Node;
  autoCleanup = true;
  dirty = false;

  _scopeMap = new WeakMap<Variable, Scope>();
  _scopeOwnerMap = new WeakMap<Node, Scope>();
  _parentMap = new WeakMap<Node, Node>();
  _variables = new Set<Variable>();

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

  use<T extends RefactorPlugin>(Plugin: new (session: RefactorSession) => T) {
    const plugin = new Plugin(this);
    plugin.register();
  }

  static parse(src: string): Script {
    return parseScript(src);
  }

  _rebuildParentMap() {
    this._parentMap = buildParentMap(this.ast);
  }

  rename(selector: SelectorOrNode, newName: string) {
    const lookupTable = this.getLookupTable();

    const nodes = findNodes(this.ast, selector);

    nodes.forEach((node: Node) => {
      if (node.type === 'VariableDeclarator') node = node.binding;
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
    return this.conditionalCleanup();
  }

  async replaceAsync(selector: SelectorOrNode, replacer: (node:Node)=>Promise<Node | string>) {
    const nodes = findNodes(this.ast, selector);

    if (!isFunction(replacer)) {
      throw new RefactorError(`Invalid replacer type for replaceAsync. Pass a function or use .replace() instead.`);
    }

    const promiseResults = await waterfallMap(nodes, async (node: Node, i:number) => {
      let replacement = null;
      const rv = await replacer(node);
      if (isShiftNode(rv)) {
        replacement = rv;
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

      if (node && replacement !== node) {
        this._queueReplacement(node, replacement);
        return true;
      } else {
        return false;
      }
    });

    this.conditionalCleanup();

    return promiseResults.filter(result => result);
  }

  replace(selector: SelectorOrNode, replacer: Replacer) {
    const nodes = findNodes(this.ast, selector);

    const replacementScript = typeof replacer === 'string' ? parseScript(replacer) : null;

    const replaced = nodes.map((node: Node) => {
      let replacement = null;
      if (isFunction(replacer)) {
        const rv = replacer(node);
        if (rv && typeof rv.then === 'function') {
          throw new RefactorError(`Promise returned from replacer function, use .replaceAsync() instead.`);
        }
        if (isShiftNode(rv)) {
          replacement = rv;
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
          if (replacementScript.statements[0].type === 'ExpressionStatement') {
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

    this.conditionalCleanup();
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
      this.isDirty(true);
      const toInsert = getInsertion(replacer, node);
      if (!isStatement(toInsert)) throw new RefactorError('Will not insert anything but a Statement or Declaration');
      this._insertions.set(node, {
        after,
        statement: getInsertion(replacer, node),
      });
    });

    return this.conditionalCleanup();
  }

  findParents(selector: SelectorOrNode) {
    const nodes = findNodes(this.ast, selector);
    return nodes.map((node:Node) => this._parentMap.get(node));
  }

  debug(selector: SelectorOrNode) {
    const nodes = findNodes(this.ast, selector);
    const injectIntoBody = (body: FunctionBody) => {
      if (body.statements.length > 0) {
        this.insertBefore(body.statements[0], new DebuggerStatement());
      } else {
        this.replace(body, new FunctionBody({
          directives: [],
          statements: [
            new DebuggerStatement(),
          ]
        }));
      }
    } 
    nodes.forEach(node => {
      switch (node.type) {
        case 'FunctionExpression':
        case 'FunctionDeclaration':
        case 'Method':
          injectIntoBody(node.body);
          break;
        case 'ArrowExpression':
          if (node.body.type !== 'FunctionBody') {
            this.replace(node.body, new FunctionBody({directives:[], statements:[
              new DebuggerStatement(),
              new ReturnStatement({expression: node.body })
            ]}))
          } else {
            injectIntoBody(node.body);
          }
        default:
          debug('can not call inject debugger statement on %o node', node.type);
          // nothing;
      }
    });
  }

  insertBefore(selector: SelectorOrNode, replacer: Replacer) {
    return this._insert(selector, replacer, false);
  }

  insertAfter(selector: SelectorOrNode, replacer: Replacer) {
    return this._insert(selector, replacer, true);
  }

  _queueDeletion(node: Node) {
    this.isDirty(true);
    this._deletions.add(node);
  }

  _queueReplacement(from: Node, to: Node) {
    this.isDirty(true);
    this._replacements.set(from, to);
  }

  getLookupTable(): ScopeLookup {
    if (this._lookupTable) return this._lookupTable;
    const globalScope = shiftScope(this.ast);
    this._lookupTable = new ScopeLookup(globalScope);
    this._rebuildScopeMap();
    return this._lookupTable;
  }

  _rebuildScopeMap() {
    const lookupTable = this.getLookupTable();
    this._scopeMap = new WeakMap();
    this._variables = new Set();
    const recurse = (scope: Scope) => {
      this._scopeOwnerMap.set(scope.astNode, scope);
      scope.variableList.forEach((variable: Variable) => {
        this._variables.add(variable);
        this._scopeMap.set(variable, scope);
      });
      scope.children.forEach(recurse);
    };
    recurse(lookupTable.scope);
  }

  isDirty(dirty?: boolean) {
    if (dirty !== undefined) this.dirty = dirty;
    return this.dirty;
  }

  validate() {
    return isValid(this.ast);
  }

  private conditionalCleanup() {
    if (this.autoCleanup) this.cleanup();
    return this;
  }

  cleanup() {
    if (!this.isDirty()) return;
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
    this.isDirty(false);
    return (this.ast = result);
  }

  query(selector: string) {
    return query(this.ast, selector);
  }

  // alias for query because I refuse to name findOne()->queryOne() and I need the symmetry.
  find(selector: string) {
    return this.query(selector);
  }

  queryFrom(astNodes: Node | Node[], selector: string) {
    return isArray(astNodes) ? astNodes.map(node => query(node, selector)).flat() : query(astNodes, selector);
  }

  findMatchingExpression(sampleSrc:string): Expression[] {
    const tree = parseScript(sampleSrc);
    if (tree.statements[0] && tree.statements[0].type === 'ExpressionStatement') {
      const sampleExpression = tree.statements[0].expression;
      const potentialMatches = this.query(sampleExpression.type);
      const matches = potentialMatches.filter((realNode:Node) => deepEqual(sampleExpression, realNode));
      return matches;
    }
    return [];
  }

  findMatchingStatement(sampleSrc:string): Statement[] {
    const tree = parseScript(sampleSrc);
    if (tree.statements[0]) {
      const sampleStatement = tree.statements[0];
      const potentialMatches = this.query(sampleStatement.type);
      const matches = potentialMatches.filter((realNode:Node) => deepEqual(sampleStatement, realNode));
      return matches;
    }
    return [];
  }

  findOne(selector: string) {
    const nodes = this.query(selector);
    if (nodes.length !== 1)
      throw new Error(`findOne('${selector}') found ${nodes.length} nodes. If this is intentional, use .find()`);
    return nodes[0];
  }

  findReferences(node: SimpleIdentifier | SimpleIdentifierOwner): Reference[] {
    const lookup = this.lookupVariable(node);
    return lookup.references;
  }

  findDeclarations(node: SimpleIdentifier | SimpleIdentifierOwner): Declaration[] {
    const lookup = this.lookupVariable(node);
    return lookup.declarations;
  }

  closest(originSelector: SelectorOrNode, closestSelector: string) {
    const nodes = findNodes(this.ast, originSelector);

    const recurse = (node: Node, selector: string): Node[] => {
      const parent = this.findParents(node)[0];
      if (!parent) return [];
      const matches = query(parent, selector);
      if (matches.length > 0) return matches;
      else return recurse(parent, selector);
    };

    return nodes.flatMap((node: Node) => recurse(node, closestSelector));
  }

  lookupScope(variableLookup: Variable | SimpleIdentifierOwner | SimpleIdentifier) {
    if (isArray(variableLookup)) variableLookup = variableLookup[0];

    if (isShiftNode(variableLookup)) variableLookup = this.lookupVariable(variableLookup);

    return this._scopeMap.get(variableLookup);
  }

  getInnerScope(node: FunctionDeclaration) {
    return this._scopeOwnerMap.get(node);
  }

  lookupVariable(node: SimpleIdentifierOwner | SimpleIdentifier) {
    const lookupTable = this.getLookupTable();
    if (isArray(node)) node = node[0];

    let lookup: Variable[];
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
    if (this.isDirty()) throw new RefactorError('refactor .print() called with a dirty AST. This is almost always a bug. Call .cleanup() before printing.')
    return codegen(ast || this.ast, new FormattedCodeGen());
  }
}
