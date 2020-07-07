import { Node } from 'shift-ast';
import { Declaration, Reference, Variable } from 'shift-scope';
import pluginCommon from './refactor-plugin-common';
import pluginUnsafe from './refactor-plugin-unsafe';
import { RefactorSession } from './refactor-session';
import { Replacer, SelectorOrNode, SimpleIdentifier, SimpleIdentifierOwner } from './types';

// type ApiExtension = { [key: string]: any };
// type RefactorPlugin = (instance: RefactorSessionChainable) => ApiExtension;
type RefactorPlugin = (instance: RefactorSessionChainable) => any;
type Constructor<T> = new (...args: any[]) => T;

export type $QueryInput = string | Node | Node[]

/**
 * The Chainable Refactor interface
 * @public
 */
export class RefactorSessionChainable {
  session: RefactorSession;
  static plugins: RefactorPlugin[] = [];

  constructor(session: RefactorSession) {
    this.session = session;
    const classConstructor = this.constructor as typeof RefactorSessionChainable;
    classConstructor.plugins.forEach(plugin => {
      Object.assign(this, plugin(this));
    });
  }

  static with<S extends Constructor<any> & { plugins: RefactorPlugin[] }, T extends RefactorPlugin>
    (this: S, plugin: T) {
    const currentPlugins = this.plugins;

    const BaseWithPlugins = class extends this {
      static plugins = currentPlugins.concat(plugin);
      static with = RefactorSessionChainable.with;
      static create = RefactorSessionChainable.create;
    };

    return BaseWithPlugins as typeof BaseWithPlugins & Constructor<ReturnType<T>>;
  }

  static create(session: RefactorSession) {
    const chainable = new RefactorChainableWithPlugins(session);
    const prototype = Object.getPrototypeOf(chainable);

    const $query = function (selector: $QueryInput) {
      const subSession = session.subSession(selector);
      return RefactorChainableWithPlugins.create(subSession);
    }

    const hybridObject = Object.assign($query, chainable);
    Object.setPrototypeOf(hybridObject, prototype);
    Object.defineProperty(hybridObject, 'length', {
      get() { return session.length }
    });
    return hybridObject;
  }

  get root(): Node {
    return this.session.root;
  }

  get length(): number {
    return this.session.length;
  }

  get nodes(): Node[] {
    return this.session.nodes;
  }

  rename(newName: string) {
    this.session.rename(this.nodes, newName);
    return this;
  }

  /**
  * Delete nodes
  *
  * @example
  *
  * ```js
  * const { refactor } = require('shift-refactor');
  *
  * $script = refactor('foo();bar();');
  *
  * $script('ExpressionStatement[expression.callee.name="foo"]').delete();
  *
  * ```
  * 
  * @assert
  * 
  * ```js
  * assert.equal($script.generate(), 'bar();\n');
  * ```
  * 
  */
  delete() {
    this.session.delete(this.nodes);
    return this;
  }

  replace(replacer: Replacer): RefactorSessionChainable {
    this.session.replace(this.nodes, replacer);
    return this;
  }

  /**
   * Async version of .replace() that supports asynchronous replacer functions
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * $script = refactor('var a = "hello";');
   * 
   * async function work() {
   *  await $script('LiteralStringExpression').replaceAsync(
   *    (node) => Promise.resolve(`"goodbye"`)
   *  )
   * }
   *
   * ```
   * @assert 
   * 
   * ```js
   * // TODO this doesn't work, every async function is an instance of Promise
   * work().then(_ => assert.equal($script.generate(), 'var a = "goodbye";'));
   * ```
   */
  replaceAsync(replacer: (node: Node) => Promise<string | Node>) {
    return this.session.replaceAsync(this.nodes, replacer);
  }


  /**
   * Recursively replaces child nodes until no nodes have been replaced.
   * 
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   * const Shift = require('shift-ast');
   * 
   * const src = `
   * 1 + 2 + 3
   * `
   *
   * $script = refactor(src);
   *
   * $script.replaceChildren(
   *  'BinaryExpression[left.type=LiteralNumericExpression][right.type=LiteralNumericExpression]',
   *  (node) => new Shift.LiteralNumericExpression({value: node.left.value + node.right.value})
   * );
   * ```
   * 
   * @assert
   * 
   * ```js
   * assert.equal($script.generate().trim(), '6;');
   * ```
   * 
   */
  replaceChildren(query: SelectorOrNode, replacer: Replacer): RefactorSessionChainable {
    this.session.replaceRecursive(query, replacer);
    return this;
  }

  first(): Node {
    return this.session.first();
  }

  /**
  * Retrieve parent node(s)
  * 
  * @example
  *
  * ```js
  * const { refactor } = require('shift-refactor');
  * 
  * const src = `
  * var a = 1, b = 2;
  * `
  *
  * $script = refactor(src);
  * const declarators = $script('VariableDeclarator');
  * const declaration = declarators.parents();
  * ```
  * 
  * @assert
  * 
  * ```js
  * assert.equal(declaration.length, 1);
  * ```
  * 
  */

  parents() {
    return this.$(this.session.findParents(this.nodes));
  }

  // TODO appendInto prependInto to auto-insert into body blocks

  prepend(replacer: Replacer): RefactorSessionChainable {
    this.session.prepend(this.nodes, replacer);
    return this;
  }

  append(replacer: Replacer): RefactorSessionChainable {
    this.session.append(this.nodes, replacer);
    return this;
  }

  $(queryOrNodes: SelectorOrNode) {
    return RefactorSessionChainable.create(this.session.subSession(queryOrNodes));
  }

  query(selector: string | string[]) {
    return this.$(this.session.query(selector));
  }

  forEach(iterator: (node: any) => any): RefactorSessionChainable {
    this.nodes.forEach(iterator);
    return this;
  }

  // TODO: should this match Array.prototype.find?
  find(selectorOrNode: string) {
    return this.query(selectorOrNode);
  }

  findMatchingExpression(sampleSrc: string) {
    return this.$(this.session.findMatchingExpression(sampleSrc));
  }

  findMatchingStatement(sampleSrc: string) {
    return this.$(this.session.findMatchingStatement(sampleSrc));
  }

  findOne(selectorOrNode: string) {
    return this.$(this.session.findOne(selectorOrNode));
  }

  references(): Reference[] {
    return this.session.findReferences(this.first() as SimpleIdentifier | SimpleIdentifierOwner);
  }

  declarations(): Declaration[] {
    return this.session.findDeclarations(this.first() as SimpleIdentifier | SimpleIdentifierOwner)
  }

  closest(closestSelector: string) {
    return this.$(this.session.closest(this.nodes, closestSelector));
  }

  lookupVariable(): Variable {
    const id = this.first() as SimpleIdentifierOwner | SimpleIdentifierOwner[] | SimpleIdentifier | SimpleIdentifier[];
    return this.session.lookupVariable(id);
  }

  lookupVariableByName(name: string): Variable[] {
    return this.session.lookupVariableByName(name);
  }

  generate() {
    return this.session.generate();
  }

  print() {
    return this.session.generate();
  }

}

export const RefactorChainableWithPlugins = RefactorSessionChainable.with(pluginUnsafe).with(pluginCommon);

/**
 * Initialization of a RefactorSession via the chainable API
 *
 * @alpha
 */
export function refactor(input: string | Node, { autoCleanup = true } = {}) {
  const globalSession = new RefactorSession(input, { autoCleanup });
  return RefactorSessionChainable.with(pluginUnsafe).with(pluginCommon).create(globalSession);
}
