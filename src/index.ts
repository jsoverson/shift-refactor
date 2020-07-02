import { default as codegen, FormattedCodeGen } from '@jsoverson/shift-codegen';
import DEBUG from 'debug';
import deepEqual from 'fast-deep-equal';
import {
  BindingIdentifier,
  DebuggerStatement,
  Expression,
  FunctionBody,
  FunctionDeclaration,
  IdentifierExpression,
  Node,
  ReturnStatement,
  Script,
  Statement,
} from 'shift-ast';
import { parseScript } from 'shift-parser';
import shiftScope, { Declaration, Reference, Scope, ScopeLookup, Variable } from 'shift-scope';
import traverser from 'shift-traverser';
import { default as isValid } from 'shift-validator';
import { RefactorPlugin } from './refactor-plugin';
import { RefactorCommonPlugin } from './refactor-plugin-common';
import { RefactorUnsafePlugin } from './refactor-plugin-unsafe';
import { RefactorError, Replacer, SelectorOrNode, SimpleIdentifier, SimpleIdentifierOwner } from './types';
import {
  buildParentMap,
  copy,
  extractExpression,
  extractStatement,
  findNodes,
  isArray,
  isFunction,
  isShiftNode,
  isStatement,
  isString,
} from './util';
import { waterfallMap } from './waterfall';

/**
 * Parse JavaScript source with shift-parser
 *
 * @param src - JavaScript source
 * @returns Shift AST
 *
 * @public
 */
export const parse = parseScript;

const debug = DEBUG('shift-refactor');

const { query } = require('shift-query');

/**
 * Experimental start to a chainable API a'la jQuery
 *
 * @alpha
 */
export function $r(input: string | Node, { autoCleanup = true } = {}) {
  const $script = new RefactorSession(input, { autoCleanup });

  function $query(selectorOrNode: string) {
    return $script.query(selectorOrNode);
  }
  const prototype = Object.getPrototypeOf($script);
  const hybridObject = Object.assign($query, $script);
  Object.setPrototypeOf(hybridObject, prototype);
  return hybridObject;
}



/**
 * The main Shift Refactor class
 * @public
 */
export class RefactorSession {
  ast: Node;
  autoCleanup = true;
  private dirty = false;

  scopeMap: WeakMap<Variable, Scope> = new WeakMap();
  scopeOwnerMap: WeakMap<Node, Scope> = new WeakMap();
  parentMap: WeakMap<Node, Node> = new WeakMap();
  variables: Set<Variable> = new Set();

  private replacements = new WeakMap();
  private deletions = new WeakSet();
  private insertions = new WeakMap();

  private lookupTable: ScopeLookup | undefined;

  constructor(ast: string | Node, { autoCleanup = true } = {}) {
    if (isString(ast)) ast = parseScript(ast);
    this.ast = ast;
    this.autoCleanup = autoCleanup;

    this.rebuildParentMap();
    this.use(RefactorCommonPlugin);
    this.use(RefactorUnsafePlugin);

    this.getLookupTable();
  }

  /**
   * Register plugin
   *
   * @remarks
   *
   * Experimental.
   *
   * @param Plugin - The Refactor plugin
   *
   * @alpha
   */
  use<T extends RefactorPlugin>(Plugin: new (session: RefactorSession) => T) {
    const plugin = new Plugin(this);
    plugin.register();
  }

  private rebuildParentMap() {
    this.parentMap = buildParentMap(this.ast);
  }

  /**
   * Rename Identifiers
   *
   * @remarks
   *
   * Only works on Identifier nodes. Other nodes are ignored.
   *
   * @param selectorOrNode - A selector or node
   */
  rename(selectorOrNode: SelectorOrNode, newName: string) {
    const lookupTable = this.getLookupTable();

    const nodes = findNodes(this.ast, selectorOrNode);

    nodes.forEach((node: Node) => {
      if (node.type === 'VariableDeclarator') node = node.binding;
      const lookup = lookupTable.variableMap.get(node);
      if (!lookup) return;
      this.renameInPlace(lookup[0], newName);
    });

    return this;
  }

  /**
   * Rename all declarations and references of a Variable lookup to newName
   *
   * @param lookup
   * @param newName
   *
   * @internal
   */
  renameInPlace(lookup: Variable, newName: string) {
    if (!lookup || !newName) return;
    lookup.declarations.forEach(decl => ((decl.node as BindingIdentifier).name = newName));
    lookup.references.forEach(ref => ((ref.node as IdentifierExpression).name = newName));
  }

  /**
   * Delete nodes
   *
   * @example
   *
   * ```js
   * const { RefactorSession, parse } = require('shift-refactor');
   *
   * $script = new RefactorSession(parse('foo();bar();'));
   *
   * $script.delete('ExpressionStatement[expression.callee.name="foo"]');
   *
   * ```
   * 
   * @assert
   * 
   * assert.equal($script.print(), 'bar();\n');
   */

  delete(selectorOrNode: SelectorOrNode) {
    const nodes = findNodes(this.ast, selectorOrNode);
    if (nodes.length > 0) {
      nodes.forEach((node: Node) => this._queueDeletion(node));
    }
    return this.conditionalCleanup();
  }

  /**
   * Replace nodes
   *
   * @param selectorOrNode
   * @param replacer - JavaScript source, a Node, or a function that returns source or a node
   */
  replace(selectorOrNode: SelectorOrNode, replacer: Replacer) {
    const nodes = findNodes(this.ast, selectorOrNode);

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

  /**
   * Async version of .replace() that supports asynchronous replacer functions
   *
   * @example
   *
   * ```js
   * const { RefactorSession, parse } = require('shift-refactor');
   *
   * $script = new RefactorSession(parse('var a = "hello";'));
   * 
   * async function work() {
   *  await $script.replaceAsync(
   *    'LiteralStringExpression',
   *    async (node) => Promise.resolve(`"goodbye"`)
   *  )
   * }
   *
   * ```
   * @assert 
   * 
   * assert(work() instanceof Promise);
   */
  async replaceAsync(selectorOrNode: SelectorOrNode, replacer: (node: Node) => Promise<Node | string>) {
    const nodes = findNodes(this.ast, selectorOrNode);

    if (!isFunction(replacer)) {
      throw new RefactorError(`Invalid replacer type for replaceAsync. Pass a function or use .replace() instead.`);
    }

    const promiseResults = await waterfallMap(nodes, async (node: Node, i: number) => {
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

  /**
   * Recursively replaces nodes until no nodes have been replaced.
   * 
   * @example
   *
   * ```js
   * const { RefactorSession, parse } = require('shift-refactor');
   * const Shift = require('shift-ast');
   * 
   * const src = `
   * 1 + 2 + 3
   * `
   *
   * $script = new RefactorSession(parse(src));
   *
   * $script.replaceRecursive(
   *  'BinaryExpression[left.type=LiteralNumericExpression][right.type=LiteralNumericExpression]',
   *  (node) => new Shift.LiteralNumericExpression({value: node.left.value + node.right.value})
   * );
   * ```
   * 
   * @assert
   * 
   * assert.equal($script.print().trim(), '6;');
   */
  replaceRecursive(selectorOrNode: SelectorOrNode, replacer: Replacer) {
    const nodesReplaced = this.replace(selectorOrNode, replacer);
    this.cleanup();
    if (nodesReplaced > 0) this.replaceRecursive(selectorOrNode, replacer);
    return this;
  }

  private insert(selectorOrNode: SelectorOrNode, replacer: Replacer, after = false) {
    const nodes = findNodes(this.ast, selectorOrNode);

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
      this.insertions.set(node, {
        after,
        statement: getInsertion(replacer, node),
      });
    });

    return this.conditionalCleanup();
  }

  /**
 * Find the parent of a node
 * 
 * @example
 *
 * ```js
 * const { RefactorSession, parse } = require('shift-refactor');
 * const Shift = require('shift-ast');
 * 
 * const src = `
 * 1 + 2 + 3
 * `
 *
 * $script = new RefactorSession(parse(src));
 * ```
 * 
 * @assert
 * 
 * assert.equal($script.print().trim(), '6;');
 */
  findParents(selectorOrNode: SelectorOrNode): Node[] {
    const nodes = findNodes(this.ast, selectorOrNode);
    const a = this.parentMap.get(nodes[0]);
    return nodes.map(node => this.parentMap.get(node)).filter((node): node is Node => !!node);
  }

  insertBefore(selectorOrNode: SelectorOrNode, replacer: Replacer) {
    return this.insert(selectorOrNode, replacer, false);
  }

  insertAfter(selectorOrNode: SelectorOrNode, replacer: Replacer) {
    return this.insert(selectorOrNode, replacer, true);
  }

  _queueDeletion(node: Node) {
    this.isDirty(true);
    this.deletions.add(node);
  }

  _queueReplacement(from: Node, to: Node) {
    this.isDirty(true);
    this.replacements.set(from, to);
  }

  getLookupTable(): ScopeLookup {
    if (this.lookupTable) return this.lookupTable;
    const globalScope = shiftScope(this.ast);
    this.lookupTable = new ScopeLookup(globalScope);
    this._rebuildScopeMap();
    return this.lookupTable;
  }

  _rebuildScopeMap() {
    const lookupTable = this.getLookupTable();
    this.scopeMap = new WeakMap();
    this.variables = new Set();
    const recurse = (scope: Scope) => {
      this.scopeOwnerMap.set(scope.astNode, scope);
      scope.variableList.forEach((variable: Variable) => {
        this.variables.add(variable);
        this.scopeMap.set(variable, scope);
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
      leave: function (node: Node, parent: Node) {
        if (node.type === 'VariableDeclarationStatement') {
          if (node.declaration.declarators.length === 0) return this.remove();
        }
        if (_this.replacements.has(node)) {
          const newNode = _this.replacements.get(node);
          _this.replacements.delete(node);
          return newNode;
        }
        if (_this.insertions.has(node)) {
          if (isStatement(node)) {
            const insertion = _this.insertions.get(node);
            if ('statements' in parent) {
              let statementIndex = parent.statements.indexOf(node);
              if (insertion.after) statementIndex++;
              parent.statements.splice(statementIndex, 0, insertion.statement);
              _this.insertions.delete(node);
            } else {
              debug(`Tried to insert ${node.type} but I lost track of my parent block :-(`);
            }
          } else {
            debug(`Tried to insert a non-Statement (${node.type}). Skipping.`);
          }
        }
        if (_this.deletions.has(node)) {
          _this.replacements.delete(node);
          this.remove();
        }
      },
    });
    this.lookupTable = undefined;
    this.rebuildParentMap();
    this.isDirty(false);
    return (this.ast = result);
  }

  query(selectorOrNode: string) {
    return query(this.ast, selectorOrNode);
  }

  // alias for query because I refuse to name findOne()->queryOne() and I need the symmetry.
  find(selectorOrNode: string) {
    return this.query(selectorOrNode);
  }

  queryFrom(astNodes: Node | Node[], selectorOrNode: string) {
    return isArray(astNodes)
      ? astNodes.map(node => query(node, selectorOrNode)).flat()
      : query(astNodes, selectorOrNode);
  }

  findMatchingExpression(sampleSrc: string): Expression[] {
    const tree = parseScript(sampleSrc);
    if (tree.statements[0] && tree.statements[0].type === 'ExpressionStatement') {
      const sampleExpression = tree.statements[0].expression;
      const potentialMatches = this.query(sampleExpression.type);
      const matches = potentialMatches.filter((realNode: Node) => deepEqual(sampleExpression, realNode));
      return matches;
    }
    return [];
  }

  findMatchingStatement(sampleSrc: string): Statement[] {
    const tree = parseScript(sampleSrc);
    if (tree.statements[0]) {
      const sampleStatement = tree.statements[0];
      const potentialMatches = this.query(sampleStatement.type);
      const matches = potentialMatches.filter((realNode: Node) => deepEqual(sampleStatement, realNode));
      return matches;
    }
    return [];
  }

  findOne(selectorOrNode: string) {
    const nodes = this.query(selectorOrNode);
    if (nodes.length !== 1)
      throw new Error(`findOne('${selectorOrNode}') found ${nodes.length} nodes. If this is intentional, use .find()`);
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

  closest(originSelector: SelectorOrNode, closestSelector: string): Node[] {
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

    return this.scopeMap.get(variableLookup);
  }

  getInnerScope(node: FunctionDeclaration) {
    return this.scopeOwnerMap.get(node);
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
    if (this.isDirty())
      throw new RefactorError(
        'refactor .print() called with a dirty AST. This is almost always a bug. Call .cleanup() before printing.',
      );
    return codegen(ast || this.ast, new FormattedCodeGen());
  }
}
