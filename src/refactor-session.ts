import {default as codegen, FormattedCodeGen} from '@jsoverson/shift-codegen';
import DEBUG from 'debug';
import deepEqual from 'fast-deep-equal';
import {BindingIdentifier, Expression, IdentifierExpression, LiteralStringExpression, Node, Statement} from 'shift-ast';
import {parseScript} from 'shift-parser';
import {Declaration, Reference, Variable} from 'shift-scope';
import {GlobalState} from './global-state';
import {query} from './misc/query';
import {
  AsyncReplacer,
  RefactorError,
  Replacer,
  SelectorOrNode,
  SimpleIdentifier,
  SimpleIdentifierOwner,
} from './misc/types';
import {
  copy,
  extractExpression,
  extractStatement,
  findNodes,
  isArray,
  isDeepSimilar,
  isFunction,
  isShiftNode,
  isStatement,
  isString,
} from './misc/util';
import {waterfallMap} from './misc/waterfall';

const debug = DEBUG('shift-refactor');

/**
 * The Shift Refactor class that manages
 *
 * @deprecated
 * This was the original interface for shift-refactor pre-1.0. It remains similarly usable but is no longer intended to be instantiated directly.
 * Extend the chainable interface when necessary and use refactor() to instantiate. If a use case is not covered, submit an issue.
 *
 * @internal
 */
export class RefactorSession {
  nodes: Node[];
  _root?: Node;
  globalSession: GlobalState;

  constructor(sourceOrNodes: Node | Node[] | string, globalSession?: GlobalState) {
    let nodes: Node[], tree: Node;
    if (!globalSession) {
      if (typeof sourceOrNodes === 'string' || !isArray(sourceOrNodes))
        this.globalSession = new GlobalState(sourceOrNodes);
      else throw new Error('Only source or a single Script/Module node can be passed as input');
    } else {
      this.globalSession = globalSession;
    }

    if (isArray(sourceOrNodes)) {
      nodes = (sourceOrNodes as any[]).filter((x: string | Node): x is Node => typeof x !== 'string');
    } else {
      if (!isString(sourceOrNodes)) nodes = [sourceOrNodes];
      else nodes = [this.globalSession.root];
    }
    this.nodes = nodes;
  }

  get root(): Node {
    return this.globalSession.root;
  }

  get length(): number {
    return this.nodes.length;
  }

  $(querySessionOrNodes: SelectorOrNode | RefactorSession) {
    return this.subSession(querySessionOrNodes);
  }

  subSession(querySessionOrNodes: SelectorOrNode | RefactorSession) {
    const nodes =
      querySessionOrNodes instanceof RefactorSession
        ? querySessionOrNodes.nodes
        : findNodes(this.nodes, querySessionOrNodes);
    const subSession = new RefactorSession(nodes, this.globalSession);
    return subSession;
  }

  rename(selectorOrNode: SelectorOrNode, newName: string) {
    const lookupTable = this.globalSession.getLookupTable();

    const nodes = findNodes(this.nodes, selectorOrNode);

    nodes.forEach((node: Node) => {
      if (node.type === 'VariableDeclarator') node = node.binding;
      const lookup = lookupTable.variableMap.get(node);
      if (!lookup) return;
      this.renameInPlace(lookup[0], newName);
    });

    return this;
  }

  renameInPlace(lookup: Variable, newName: string) {
    if (!lookup || !newName) return;
    lookup.declarations.forEach(decl => ((decl.node as BindingIdentifier).name = newName));
    lookup.references.forEach(ref => ((ref.node as IdentifierExpression).name = newName));
  }

  delete(selectorOrNode: SelectorOrNode = this.nodes) {
    const nodes = findNodes(this.nodes, selectorOrNode);
    if (nodes.length > 0) {
      nodes.forEach((node: Node) => this.globalSession._queueDeletion(node));
    }
    return this.globalSession.conditionalCleanup();
  }

  replace(selectorOrNode: SelectorOrNode, replacer: Replacer | AsyncReplacer) {
    const nodes = findNodes(this.nodes, selectorOrNode);

    const replacementScript = typeof replacer === 'string' ? parseScript(replacer) : null;

    const replaced = nodes.map((node: Node) => {
      let replacement = null;
      if (isFunction(replacer)) {
        const rv = replacer(node);
        if (rv && rv instanceof Promise) {
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
          // if we have a directive, assume we parsed a single string and use it as a LiteralStringExpression
          if (replacementScript.directives.length > 0) {
            replacement = new LiteralStringExpression({value: replacementScript.directives[0].rawValue});
          } else if (replacementScript.statements[0].type === 'ExpressionStatement') {
            replacement = copy(replacementScript.statements[0].expression);
          }
        }
      }
      if (node && replacement !== node) {
        this.globalSession._queueReplacement(node, replacement);
        return true;
      } else {
        return false;
      }
    });

    this.globalSession.conditionalCleanup();
    return replaced.filter((wasReplaced: any) => wasReplaced).length;
  }

  async replaceAsync(selectorOrNode: SelectorOrNode, replacer: AsyncReplacer): Promise<number> {
    const nodes = findNodes(this.nodes, selectorOrNode);

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
        this.globalSession._queueReplacement(node, replacement);
        return true;
      } else {
        return false;
      }
    });

    this.globalSession.conditionalCleanup();

    return promiseResults.filter(result => result).length;
  }

  replaceRecursive(selectorOrNode: SelectorOrNode, replacer: Replacer) {
    const nodesReplaced = this.replace(selectorOrNode, replacer);
    this.globalSession.cleanup();
    if (nodesReplaced > 0) this.replaceRecursive(selectorOrNode, replacer);
    return this;
  }

  first(): Node {
    return this.nodes[0];
  }

  findParents(selectorOrNode: SelectorOrNode): Node[] {
    return this.globalSession.findParents(selectorOrNode);
  }

  prepend(selectorOrNode: SelectorOrNode, replacer: Replacer) {
    return this.globalSession.insert(selectorOrNode, replacer, false);
  }

  append(selectorOrNode: SelectorOrNode, replacer: Replacer) {
    return this.globalSession.insert(selectorOrNode, replacer, true);
  }

  query(selector: string | string[]) {
    return query(this.nodes, selector);
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
      return matches as Expression[];
    }
    return [];
  }

  findMatchingStatement(sampleSrc: string): Statement[] {
    const tree = parseScript(sampleSrc);
    if (tree.statements[0]) {
      const sampleStatement = tree.statements[0];
      const potentialMatches = this.query(sampleStatement.type);
      const matches = potentialMatches.filter((realNode: Node) => isDeepSimilar(sampleStatement, realNode));
      return matches as Statement[];
    }
    return [];
  }

  findReferences(node: SimpleIdentifier | SimpleIdentifierOwner): Reference[] {
    const lookup = this.globalSession.lookupVariable(node);
    return lookup.references;
  }

  findDeclarations(node: SimpleIdentifier | SimpleIdentifierOwner): Declaration[] {
    const lookup = this.globalSession.lookupVariable(node);
    return lookup.declarations;
  }

  findOne(selectorOrNode: string) {
    const nodes = this.query(selectorOrNode);
    if (nodes.length !== 1)
      throw new Error(`findOne('${selectorOrNode}') found ${nodes.length} nodes. If this is intentional, use .find()`);
    return nodes[0];
  }

  closest(originSelector: SelectorOrNode, closestSelector: string): Node[] {
    const nodes = findNodes(this.nodes, originSelector);

    const recurse = (node: Node, selector: string): Node[] => {
      const parent = this.findParents(node)[0];
      if (!parent) return [];
      const matches = query(parent, selector);
      if (matches.length > 0) return matches;
      else return recurse(parent, selector);
    };

    return nodes.flatMap((node: Node) => recurse(node, closestSelector));
  }

  cleanup() {
    this.globalSession.cleanup();
    return this;
  }

  print(ast?: Node) {
    const generator = new FormattedCodeGen();
    return codegen(ast || this.first(), generator);
  }
}
