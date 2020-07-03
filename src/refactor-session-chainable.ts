import {
  Expression,
  Node,
  Statement
} from 'shift-ast';
import { Declaration, Reference } from 'shift-scope';
import { RefactorSession } from './refactor-session';
import { Replacer, SimpleIdentifier, SimpleIdentifierOwner } from './types';

// Plugin interface lovingly taken from https://github.com/gr2m/javascript-plugin-architecture-with-typescript-definitions/blob/master/src/index.ts

type ApiExtension = { [key: string]: any };
type TestPlugin = (instance: RefactorSessionChainable) => ApiExtension | undefined;
type Constructor<T> = new (...args: any[]) => T;

/**
 * @author https://stackoverflow.com/users/2887218/jcalz
 * @see https://stackoverflow.com/a/50375286/10325032
 */
type UnionToIntersection<Union> = (Union extends any
  ? (argument: Union) => void
  : never) extends (argument: infer Intersection) => void // tslint:disable-line: no-unused
  ? Intersection
  : never;

type AnyFunction = (...args: any) => any;

type ReturnTypeOf<T extends AnyFunction | AnyFunction[]> = T extends AnyFunction
  ? ReturnType<T>
  : T extends AnyFunction[]
  ? UnionToIntersection<ReturnType<T[number]>>
  : never;

/**
 * The Chainable Refactor interface
 * @public
 */
export class RefactorSessionChainable {
  session: RefactorSession;
  static plugins: TestPlugin[] = [];

  constructor(session: RefactorSession) {
    this.session = session;
    const classConstructor = this.constructor as typeof RefactorSessionChainable;
    classConstructor.plugins.forEach(plugin => {
      Object.assign(this, plugin(this));
    });
  }

  static with<S extends Constructor<any> & { plugins: any[] }, T extends TestPlugin | TestPlugin[]>(this: S, plugin: T) {
    const currentPlugins = this.plugins;

    const BaseWithPlugins = class extends this {
      static plugins = currentPlugins.concat(plugin);
    };

    type Extension = ReturnTypeOf<T>;
    return BaseWithPlugins as typeof BaseWithPlugins & Constructor<Extension>;
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

  subSession(query: string | string[]) {
    return this.session.subSession(query);
  }

  rename(newName: string) {
    return this.session.rename(this.nodes, newName);
  }

  delete() {
    return this.session.delete(this.nodes);
  }

  replace(replacer: Replacer) {
    return this.session.replace(this.nodes, replacer);
  }

  replaceAsync(replacer: (node: Node) => Promise<Node | string>) {
    return this.session.replaceAsync(this.nodes, replacer);
  }

  replaceRecursive(replacer: Replacer) {
    return this.session.replaceRecursive(this.nodes, replacer);
  }

  first(): Node {
    return this.session.first();
  }

  parents(): Node[] {
    return this.session.findParents(this.nodes);
  }

  prepend(replacer: Replacer) {
    return this.session.prepend(this.nodes, replacer);
  }

  append(replacer: Replacer) {
    return this.session.append(this.nodes, replacer);
  }

  query(selector: string | string[]) {
    return this.session.query(selector);
  }

  forEach(iterator: (node: any) => any) {
    this.nodes.forEach(iterator);
    return this;
  }

  // TODO: should this match Array.prototype.find?
  find(selectorOrNode: string) {
    return this.query(selectorOrNode);
  }

  findMatchingExpression(sampleSrc: string): Expression[] {
    return this.session.findMatchingExpression(sampleSrc);
  }

  findMatchingStatement(sampleSrc: string): Statement[] {
    return this.session.findMatchingStatement(sampleSrc);
  }

  findOne(selectorOrNode: string) {
    return this.session.findOne(selectorOrNode);
  }

  findReferences(): Reference[] {
    return this.session.findReferences(this.first() as SimpleIdentifier | SimpleIdentifierOwner);
  }

  findDeclarations(): Declaration[] {
    return this.session.findDeclarations(this.first() as SimpleIdentifier | SimpleIdentifierOwner)
  }

  closest(closestSelector: string): Node[] {
    return this.session.closest(this.nodes, closestSelector);
  }

  lookupVariable() {
    return this.session.lookupVariable(this.first() as SimpleIdentifierOwner | SimpleIdentifierOwner[] | SimpleIdentifier | SimpleIdentifier[])
  }

  lookupVariableByName(name: string) {
    return this.session.lookupVariableByName(name);
  }

  print(ast?: Node) {
    return this.session.print();
  }
}