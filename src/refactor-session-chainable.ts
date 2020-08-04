import {Node, Statement} from 'shift-ast';
import {Declaration, Reference, Variable} from 'shift-scope';
import {GlobalState} from './global-state';
import {matches} from './misc/query';
import {
  AsyncReplacer,
  Constructor,
  NodesWithStatements,
  Replacer,
  SelectorOrNode,
  SimpleIdentifier,
  SimpleIdentifierOwner,
} from './misc/types';
import {innerBodyStatements, isNodeWithStatements} from './misc/util';
import {RefactorSession} from './refactor-session';

type Plugin = (instance: RefactorSessionChainable) => any;

/**
 * Plugin interface
 *
 * @internal
 */
export interface Pluggable {
  /**
   * @internal
   */
  plugins: Plugin[];
  /**
   * @internal
   */
  with<S extends Constructor<any> & Pluggable, T extends Plugin>(this: S, plugin: T): S & Pluggable;
}

/**
 * Refactor query objects can take a string, a single node, or a list of nodes as input
 */
export type RefactorQueryInput = string | Node | Node[];

/**
 * Necessary typing for RefactorSessionChainable static methods
 *
 * @public
 */
export interface RefactorSessionChainable extends Pluggable {}

/**
 * The Chainable Refactor interface
 *
 * @remarks
 *
 * This is not intended to be instantiated directly. Use refactor() to create your instances.
 *
 * @public
 */
export class RefactorSessionChainable {
  session: RefactorSession;
  static plugins: Plugin[] = [];

  constructor(session: RefactorSession) {
    this.session = session;
    const classConstructor = this.constructor as typeof RefactorSessionChainable;
    classConstructor.plugins.forEach(plugin => {
      Object.assign(this, plugin(this));
    });
  }

  /**
   * @internal
   */
  static with<S extends Constructor<any> & Pluggable, T extends Plugin>(this: S, plugin: T) {
    const currentPlugins = this.plugins;

    const BaseWithPlugins: Pluggable = class extends this {
      static plugins = currentPlugins.concat(plugin);
      static with = RefactorSessionChainable.with;
      // static create = RefactorSessionChainable.create;
    };

    return BaseWithPlugins as S & typeof BaseWithPlugins & Constructor<ReturnType<T>>;
  }

  /**
   * @internal
   */
  static create(session: RefactorSession): RefactorQueryAPI {
    const Klass = this;
    const chainable = new Klass(session);
    const prototype = Object.getPrototypeOf(chainable);

    const $query = function(selector: RefactorQueryInput): RefactorQueryAPI {
      const subSession = session.subSession(selector);
      return Klass.create(subSession);
    };

    const hybridObject = Object.assign($query, chainable);
    Object.setPrototypeOf(hybridObject, prototype);
    Object.defineProperty(hybridObject, 'length', {
      get() {
        return session.length;
      },
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

  /**
   * Get selected node at index.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * someFunction('first string', 'second string', 'third string');
   * `
   * $script = refactor(src);
   *
   * const thirdString = $script('LiteralStringExpression').get(2);
   *
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(thirdString.value, 'third string');
   * ```
   *
   */
  get(index: number): Node {
    return this.nodes[index];
  }

  /**
   * Rename all references to the first selected node to the passed name.
   *
   * @remarks
   *
   * Uses the selected node as the target, but affects the global state.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * const myVariable = 2;
   * myVariable++;
   * const other = myVariable;
   * function unrelated(myVariable) { return myVariable }
   * `
   * $script = refactor(src);
   *
   * $script('VariableDeclarator[binding.name="myVariable"]').rename('newName');
   *
   * ```
   *
   * @assert
   *
   * ```js
   * assert.treesEqual($script, 'const newName = 2;newName++;const other = newName;function unrelated(myVariable) { return myVariable }');
   * ```
   *
   */
  rename(newName: string) {
    this.session.rename(this.raw(), newName);
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
   * assert.treesEqual($script, 'bar();');
   * ```
   *
   */
  delete() {
    this.session.delete(this.nodes);
    return this;
  }

  /**
   * Replace selected node with the result of the replacer parameter
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   * const Shift = require('shift-ast');
   *
   * const src = `
   * function sum(a,b) { return a + b }
   * function difference(a,b) {return a - b}
   * `
   *
   * $script = refactor(src);
   *
   * $script('FunctionDeclaration').replace(node => new Shift.VariableDeclarationStatement({
   *   declaration: new Shift.VariableDeclaration({
   *     kind: 'const',
   *     declarators: [
   *       new Shift.VariableDeclarator({
   *         binding: node.name,
   *         init: new Shift.ArrowExpression({
   *           isAsync: false,
   *           params: node.params,
   *           body: node.body
   *         })
   *       })
   *     ]
   *   })
   * }))
   *
   * ```
   * @assert
   *
   * ```js
   * assert.treesEqual($script, 'const sum = (a,b) => { return a + b }; const difference = (a,b) => { return a - b };')
   * ```
   *
   * @public
   */
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
   * work().then(_ => assert.treesEqual($script, 'var a = "goodbye";'));
   * ```
   *
   * @public
   */
  replaceAsync(replacer: AsyncReplacer) {
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
   * assert.treesEqual($script, '6;');
   * ```
   *
   * @public
   */
  replaceChildren(query: SelectorOrNode, replacer: Replacer): RefactorSessionChainable {
    this.session.replaceRecursive(query, replacer);
    return this;
  }

  /**
   * Return the type of the first selected node
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   * const Shift = require('shift-ast');
   *
   * const src = `
   * myFunction();
   * `
   *
   * $script = refactor(src);
   *
   * const type = $script('CallExpression').type();
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(type, 'CallExpression');
   * ```
   *
   * @public
   */
  type(): string {
    return this.raw().type;
  }

  /**
   * Returns the first selected node. Optionally takes a selector and returns the first node that matches the selector.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * func1();
   * func2();
   * func3();
   * `
   *
   * $script = refactor(src);
   *
   * const func1CallExpression = $script('CallExpression').first();
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(func1CallExpression.raw(), $script.root.statements[0].expression);
   * ```
   *
   * @public
   */
  first(selector?: string): RefactorSessionChainable {
    if (selector) {
      return this.find(node => matches(node, selector)).first();
    }
    return this.$(this.session.first());
  }

  /**
   * Returns the raw Shift node for the first selected node.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * const a = 2;
   * `
   *
   * $script = refactor(src);
   *
   * const declStatement = $script('VariableDeclarationStatement').raw();
   * ```
   *
   * @assert
   *
   * ```js
   * assert(declStatement === $script.root.statements[0]);
   * ```
   *
   * @public
   */
  raw(): Node {
    return this.nodes[0];
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
   * assert.equal(declarators.length, 2);
   * ```
   *
   * @public
   */
  parents() {
    return this.$(this.session.findParents(this.nodes));
  }

  /**
   * Retrieve the names of the first selected node. Returns undefined for nodes without names.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * var first = 1, second = 2;
   * `
   *
   * $script = refactor(src);
   * const firstName = $script('BindingIdentifier[name="first"]').nameString();
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(firstName, 'first');
   * ```
   *
   * @public
   */
  nameString(): string {
    const node = this.raw();
    if (!('name' in node)) return '';
    const nameNode = node.name;
    if (!nameNode) return '';
    if (typeof nameNode === 'string') return nameNode;
    switch (nameNode.type) {
      case 'BindingIdentifier':
      case 'IdentifierExpression':
        return nameNode.name;
      case 'StaticPropertyName':
        return nameNode.value;
      case 'ComputedPropertyName':
        throw new Error('can not return names of computed properties');
    }
  }

  // TODO appendInto prependInto to auto-insert into body blocks

  /**
   * Inserts the result of `replacer` before the selected statement.
   *
   * @param replacer - `string` | Shift `Node` | `(node) => string | Node`: Replaces a node with the result of the replacer parameter
   *
   * @remarks
   *
   * Only works on Statement nodes.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   * const Shift = require('shift-ast');
   *
   * const src = `
   * var message = "Hello";
   * console.log(message);
   * `
   *
   * $script = refactor(src);
   *
   * $script('ExpressionStatement[expression.type="CallExpression"]').prepend(new Shift.DebuggerStatement());
   * ```
   *
   * @assert
   *
   * ```js
   * assert.treesEqual($script, 'var message = "Hello";debugger;console.log(message)');
   * ```
   *
   * @public
   */
  prepend(replacer: Replacer): RefactorSessionChainable {
    this.session.prepend(this.nodes, replacer);
    return this;
  }

  /**
   * Inserts the result of `replacer` after the selected statement.
   *
   * @param replacer - `string` | Shift `Node` | `(node) => string | Node`: Replaces a node with the result of the replacer parameter
   *
   * @remarks
   *
   * Only works on Statement nodes.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   * const Shift = require('shift-ast');
   *
   * const src = `
   * var message = "Hello";
   * console.log(message);
   * `
   *
   * $script = refactor(src);
   *
   * $script('LiteralStringExpression[value="Hello"]').closest(':statement').append('debugger');
   * ```
   *
   * @assert
   *
   * ```js
   * assert.treesEqual($script, 'var message = "Hello";debugger;console.log(message)');
   * ```
   *
   * @public
   */
  append(replacer: Replacer): RefactorSessionChainable {
    this.session.append(this.nodes, replacer);
    return this;
  }

  /**
   * Sub-query from selected nodes
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * let a = 1;
   * function myFunction() {
   *   let b = 2, c = 3;
   * }
   * `
   *
   * $script = refactor(src);
   *
   * const funcDecl = $script('FunctionDeclaration[name.name="myFunction"]');
   * const innerIdentifiers = funcDecl.$('BindingIdentifier');
   * // innerIdentifiers.nodes: myFunction, b, c (note: does not include a)
   *
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(innerIdentifiers.length, 3);
   * ```
   *
   * @public
   */
  $(queryOrNodes: SelectorOrNode) {
    return RefactorSessionChainable.create(this.session.subSession(queryOrNodes));
  }

  /**
   * Sub-query from selected nodes
   *
   * @remarks
   *
   * synonym for .$()
   *
   * @public
   */
  query(selector: string | string[]) {
    return this.$(this.session.query(selector));
  }

  /**
   * Iterate over selected nodes
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * let a = [1,2,3,4];
   * `
   *
   * $script = refactor(src);
   *
   * $script('LiteralNumericExpression').forEach(node => node.value *= 2);
   * ```
   *
   * @assert
   *
   * ```js
   * assert.treesEqual($script, 'let a = [2,4,6,8]');
   * ```
   *
   * @public
   */
  forEach(iterator: (node: any, i?: number) => any): RefactorSessionChainable {
    this.nodes.forEach(iterator);
    return this;
  }

  /**
   * Transform selected nodes via passed iterator
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * let doc = window.document;
   * function addListener(event, fn) {
   *   doc.addEventListener(event, fn);
   * }
   * `
   *
   * $script = refactor(src);
   *
   * const values = $script('BindingIdentifier').map(node => node.name);
   * ```
   *
   * @assert
   *
   * ```js
   * assert.deepEqual(values, ['doc', 'addListener', 'event', 'fn']);
   * ```
   *
   * @public
   */
  map(iterator: (node: any, i?: number) => any): any[] {
    return this.nodes.map(iterator);
  }

  /**
   * Filter selected nodes via passed iterator
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * let doc = window.document;
   * function addListener(event, fn) {
   *   doc.addEventListener(event, fn);
   * }
   * `
   *
   * $script = refactor(src);
   *
   * const values = $script('BindingIdentifier').filter(node => node.name === 'doc');
   * ```
   *
   * @assert
   *
   * ```js
   * assert.deepEqual(values.nodes, [{type: "BindingIdentifier", name:"doc"}]);
   * ```
   *
   * @public
   */
  filter(iterator: (node: any, i?: number) => any): RefactorSessionChainable {
    return this.$(this.nodes.filter(iterator));
  }

  /**
   * Finds node via the passed iterator iterator
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * const myMessage = "He" + "llo" + " " + "World";
   * `
   *
   * $script = refactor(src);
   *
   * $script('LiteralStringExpression')
   *   .find(node => node.value === 'World')
   *   .replace('"Reader"');
   * ```
   *
   * @assert
   *
   * ```js
   * assert.treesEqual($script, 'const myMessage = "He" + "llo" + " " + "Reader";');
   * ```
   *
   * @public
   */
  find(iterator: (node: any, i?: number) => any) {
    return this.$(this.nodes.find(iterator) || []);
  }

  /**
   *
   * Finds an expression that closely matches the passed source.
   *
   * @remarks
   *
   * Used for selecting nodes by source pattern instead of query. The passed source is parsed as a Script and the first statement is expected to be an ExpressionStatement.Matching is done by matching the properties of the parsed statement, ignoring additional properties/nodes in the source tree.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * const a = someFunction(paramOther);
   * const b = targetFunction(param1, param2);
   * `
   *
   * $script = refactor(src);
   *
   * const targetCallExpression = $script.findMatchingExpression('targetFunction(param1, param2)');
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(targetCallExpression.length, 1);
   * ```
   *
   * @public
   */
  findMatchingExpression(sampleSrc: string) {
    return this.$(this.session.findMatchingExpression(sampleSrc));
  }

  /**
   * Finds a statement that matches the passed source.
   *
   * @remarks
   *
   * Used for selecting nodes by source pattern vs query. The passed source is parsed as a Script and the first statement alone is used as the statement to match. Matching is done by matching the properties of the parsed statement, ignoring additional properties/nodes in the source tree.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * function someFunction(a,b) {
   *   var innerVariable = "Lots of stuff in here";
   *   foo(a);
   *   bar(b);
   * }
   * `
   *
   * $script = refactor(src);
   *
   * const targetDeclaration = $script.findMatchingStatement('function someFunction(a,b){}');
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(targetDeclaration.length, 1);
   * ```
   *
   * @public
   */
  findMatchingStatement(sampleSrc: string) {
    return this.$(this.session.findMatchingStatement(sampleSrc));
  }

  /**
   * Finds and selects a single node, throwing an error if zero or more than one is found.
   *
   * @remarks
   *
   * This is useful for when you want to target a single node but aren't sure how specific your query needs to be to target that node and only that node.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * let outerVariable = 1;
   * function someFunction(a,b) {
   *   let innerVariable = 2;
   * }
   * `
   *
   * $script = refactor(src);
   *
   * // This would throw, because there are multiple VariableDeclarators
   * // $script.findOne('VariableDeclarator');
   *
   * // This won't throw because there is only one within the only FunctionDeclaration.
   * const innerVariableDecl = $script('FunctionDeclaration').findOne('VariableDeclarator');
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(innerVariableDecl.length, 1);
   * assert.throws(() => {
   *   $script.findOne('VariableDeclarator');
   * })
   * ```
   *
   * @public
   */
  findOne(selectorOrNode: string) {
    return this.$(this.session.findOne(selectorOrNode));
  }

  /**
   * Finds the references for the selected Identifier nodes.
   *
   * @remarks
   *
   * Returns a list of Reference objects for each selected node, not a shift-refactor query object.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * let myVar = 1;
   * function someFunction(a,b) {
   *   myVar++;
   *   return myVar;
   * }
   * `
   *
   * $script = refactor(src);
   *
   * const refs = $script('BindingIdentifier[name="myVar"]').references();
   *
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(refs.length, 3);
   * ```
   *
   * @public
   */
  references(): Reference[] {
    return this.nodes.flatMap(node =>
      this.session.globalSession.findReferences(node as SimpleIdentifier | SimpleIdentifierOwner),
    );
  }

  /**
   * Finds the declaration for the selected Identifier nodes.
   *
   * @remarks
   *
   * Returns a list of Declaration objects for each selected node, not a shift-refactor query object.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * const myVariable = 2, otherVar = 3;
   * console.log(myVariable, otherVar);
   * `
   *
   * $script = refactor(src);
   *
   * // selects the parameters to console.log() and finds their declarations
   * const decls = $script('CallExpression[callee.object.name="console"][callee.property="log"] > .arguments').declarations();
   *
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(decls.length, 2);
   * ```
   *
   * @public
   */
  declarations(): Declaration[] {
    return this.nodes.flatMap(node =>
      this.session.globalSession.findDeclarations(node as SimpleIdentifier | SimpleIdentifierOwner),
    );
  }

  /**
   * Finds the closest parent node that matches the passed selector.
   *
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * function someFunction() {
   *   interestingFunction();
   * }
   * function otherFunction() {
   *   interestingFunction();
   * }
   * `
   *
   * $script = refactor(src);
   *
   * // finds all functions that call `interestingFunction`
   * const fnDecls = $script('CallExpression[callee.name="interestingFunction"]').closest('FunctionDeclaration');
   *
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(fnDecls.length, 2);
   * ```
   *
   * @public
   */
  closest(closestSelector: string) {
    return this.$(this.session.closest(this.nodes, closestSelector));
  }

  /**
   * Returns the selects the statements for the selected nodes. Note: it will "uplevel" the inner statements of nodes with a `.body` property.
   *
   * Does nothing for nodes that have no statements property.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * console.log(1);
   * console.log(2);
   * `
   *
   * $script = refactor(src);
   *
   * const rootStatements = $script.statements();
   *
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(rootStatements.length, 2);
   * ```
   *
   * @public
   */
  statements() {
    const statements: Statement[] = this.nodes
      .map(innerBodyStatements)
      .filter(isNodeWithStatements)
      .flatMap((node: NodesWithStatements) => node.statements);
    return this.$(statements);
  }

  /**
   * Looks up the Variable from the passed identifier node
   *
   * @remarks
   *
   * Returns `Variable` objects from shift-scope, that contain all the references and declarations for a program variable.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * const someVariable = 2, other = 3;
   * someVariable++;
   * function thisIsAVariabletoo(same, as, these) {}
   * `
   *
   * $script = refactor(src);
   *
   * // Finds all variables declared within a program
   * const variables = $script('BindingIdentifier').lookupVariable();
   *
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(variables.length, 6);
   * ```
   *
   * @public
   */
  lookupVariable(): Variable[] {
    return this.nodes.map(node =>
      this.session.globalSession.lookupVariable(node as SimpleIdentifierOwner | SimpleIdentifier),
    );
  }

  /**
   * Looks up Variables by name.
   *
   * @remarks
   *
   * There may be multiple across a program. Variable lookup operates on the global program state. This method ignores selected nodes.
   *
   * @example
   *
   * ```js
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * const someVariable = 2, other = 3;
   * `
   *
   * $script = refactor(src);
   *
   * const variables = $script.lookupVariableByName('someVariable');
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(variables.length, 1);
   * assert.equal(variables[0].name, 'someVariable');
   * ```
   *
   * @public
   */
  lookupVariableByName(name: string): Variable[] {
    return this.session.globalSession.lookupVariableByName(name);
  }

  /**
   * Generates JavaScript source for the first selected node.
   *
   * @example
   *
   *
   * ```js
   *
   * const { refactor } = require('shift-refactor');
   * const Shift = require('shift-ast');
   *
   * const src = `
   * window.addEventListener('load', () => {
   *   lotsOfWork();
   * })
   * `
   *
   * $script = refactor(src);
   *
   * $script("CallExpression[callee.property='addEventListener'] > ArrowExpression")
   *   .replace(new Shift.IdentifierExpression({name: 'myListener'}));
   *
   * console.log($script.print());
   *
   * ```
   *
   * @assert
   *
   * ```js
   * assert.treesEqual($script, "window.addEventListener('load', myListener)");
   * ```
   *
   * @public
   */
  print() {
    return this.session.print();
  }

  /**
   * Generates JavaScript source for the first selected node.
   *
   * @example
   *
   *
   * ```js
   *
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * for (var i=1; i < 101; i++){
   *   if (i % 15 == 0) console.log("FizzBuzz");
   *   else if (i % 3 == 0) console.log("Fizz");
   *   else if (i % 5 == 0) console.log("Buzz");
   *   else console.log(i);
   * }
   * `
   *
   * $script = refactor(src);
   *
   * const strings = $script("LiteralStringExpression")
   *
   * console.log(strings.codegen());
   *
   * ```
   *
   * @assert
   *
   * ```js
   * assert.equal(strings.length,3);
   * ```
   *
   * @public
   */
  codegen() {
    return this.nodes.map(node => this.session.print(node));
  }

  /**
   * `console.log()`s the selected nodes. Useful for inserting into a chain to see what
   * nodes you are working with.
   *
   * @example
   *
   *
   * ```js
   *
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * let a = 1, b = 2;
   * `
   *
   * $script = refactor(src);
   *
   * $script("VariableDeclarator").logOut().delete();
   * ```
   *
   * @assert
   *
   * ```js
   * assert.treesEqual($script,'');
   * ```
   *
   * @public
   */
  logOut() {
    console.log(this.nodes);
    return this;
  }

  /**
   * JSON-ifies the current selected nodes.
   *
   * @example
   *
   *
   * ```js
   *
   * const { refactor } = require('shift-refactor');
   *
   * const src = `
   * (function(){ console.log("Hey")}())
   * `
   *
   * $script = refactor(src);
   *
   * const json = $script.toJSON();
   * ```
   *
   * @assert
   *
   * ```js
   * assert.deepEqual(json,JSON.stringify([_parse('(function(){ console.log("Hey")}())')]));
   * ```
   *
   * @public
   */
  toJSON() {
    return JSON.stringify(this.nodes);
  }
}

/**
 * Refactor query object type
 */
export type RefactorQueryAPI = {
  (selectorOrNode: RefactorQueryInput): RefactorQueryAPI;
} & InstanceType<typeof RefactorSessionChainable>;

/**
 * Create a refactor query object.
 *
 * @remarks
 *
 * This function assumes that it is being passed complete JavaScript source or a *root* AST node (Script or Module) so that it can create and maintain global state.
 *
 * @example
 *
 * ```js
 * const { refactor } = require('shift-refactor');
 *
 * const $script = refactor(`/* JavaScript Source *\/`);
 * ```
 *
 * @assert
 *
 * ```js
 * assert.treesEqual($script, `/* JavaScript Source *\/`);
 * ```
 *
 * @public
 */
export function refactor(input: string | Node, ...plugins: Plugin[]): RefactorQueryAPI {
  const globalSession = new GlobalState(input);
  const refactorSession = new RefactorSession(globalSession.root, globalSession);
  if (plugins)
    return plugins
      .reduce((chainable, plugin) => chainable.with(plugin), RefactorSessionChainable)
      .create(refactorSession) as any;
  return RefactorSessionChainable.create(refactorSession);
}
