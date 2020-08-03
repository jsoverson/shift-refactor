import {default as codegen, FormattedCodeGen} from '@jsoverson/shift-codegen';
import debug from 'debug';
import {FunctionDeclaration, Node} from 'shift-ast';
import {parseScript} from 'shift-parser';
import shiftScope, {Declaration, Reference, Scope, ScopeLookup, Variable} from 'shift-scope';
import traverser from 'shift-traverser';
import {default as isValid} from 'shift-validator';
import {RefactorError, Replacer, SelectorOrNode, SimpleIdentifier, SimpleIdentifierOwner} from './misc/types';
import {buildParentMap, copy, findNodes, isArray, isFunction, isShiftNode, isStatement, isString} from './misc/util';

/**
 * Options for GlobalState
 */
export interface GlobalStateOptions {
  autoCleanup?: boolean;
}

/**
 * Global State object for a script. Manages the root node, insertions, deletions, and replacements. All queries start from a global state and subqueries are child nodes.
 *
 * @remarks
 *
 * Most users won't need to instantiate this directly. Access an instance via `.globalSession` on any refactor query instance.
 *
 * @public
 */
export class GlobalState {
  root: Node;
  autoCleanup = true;

  scopeMap: WeakMap<Variable, Scope> = new WeakMap();
  scopeOwnerMap: WeakMap<Node, Scope> = new WeakMap();
  parentMap: WeakMap<Node, Node> = new WeakMap();
  variables: Set<Variable> = new Set();

  private dirty = false;
  private replacements = new WeakMap();
  private deletions = new WeakSet();
  private insertions = new WeakMap();

  private lookupTable: ScopeLookup | undefined;

  constructor(sourceOrNode: string | Node, config: GlobalStateOptions = {}) {
    let tree;
    if (isString(sourceOrNode)) {
      try {
        tree = parseScript(sourceOrNode);
      } catch (e) {
        throw new RefactorError(`Could not parse passed source: ${e}`);
      }
    } else {
      tree = sourceOrNode;
    }
    this.root = tree;

    if (config.autoCleanup) this.autoCleanup = config.autoCleanup;

    this.rebuildParentMap();

    this.getLookupTable();
  }

  lookupScope(
    variableLookup:
      | Variable
      | Variable[]
      | SimpleIdentifierOwner
      | SimpleIdentifierOwner[]
      | SimpleIdentifier
      | SimpleIdentifier[],
  ) {
    if (isArray(variableLookup)) variableLookup = variableLookup[0];

    if (isShiftNode(variableLookup)) variableLookup = this.lookupVariable(variableLookup);

    return this.scopeMap.get(variableLookup);
  }

  findReferences(node: SimpleIdentifier | SimpleIdentifierOwner): Reference[] {
    const lookup = this.lookupVariable(node);
    return lookup.references;
  }

  findDeclarations(node: SimpleIdentifier | SimpleIdentifierOwner): Declaration[] {
    const lookup = this.lookupVariable(node);
    return lookup.declarations;
  }

  getInnerScope(node: FunctionDeclaration) {
    return this.scopeOwnerMap.get(node);
  }

  lookupVariable(node: SimpleIdentifierOwner | SimpleIdentifierOwner[] | SimpleIdentifier | SimpleIdentifier[]) {
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

  _queueDeletion(node: Node): void {
    this.isDirty(true);
    this.deletions.add(node);
  }

  _queueReplacement(from: Node, to: Node): void {
    this.isDirty(true);
    this.replacements.set(from, to);
  }

  getLookupTable(): ScopeLookup {
    if (this.lookupTable) return this.lookupTable;
    const globalScope = shiftScope(this.root);
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
    return isValid(this.root);
  }

  conditionalCleanup() {
    if (this.autoCleanup) this.cleanup();
    return this;
  }

  cleanup() {
    if (!this.isDirty()) return this;
    const _this = this;
    const result = traverser.replace(this.root, {
      leave: function(node: Node, parent: Node) {
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
    this.root = result;
    return this;
  }

  insert(
    selectorOrNode: SelectorOrNode,
    replacer: Replacer,
    after = false,
  ): ReturnType<typeof GlobalState.prototype.conditionalCleanup> {
    const nodes = findNodes([this.root], selectorOrNode);

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

  findParents(selectorOrNode: SelectorOrNode): Node[] {
    const nodes = findNodes([this.root], selectorOrNode);
    return Array.from(new Set(nodes.map(node => this.parentMap.get(node)).filter((node): node is Node => !!node)));
  }

  generate(ast?: Node) {
    if (this.isDirty())
      throw new RefactorError(
        'refactor .print() called with a dirty AST. This is almost always a bug. Call .cleanup() before printing.',
      );
    return codegen(ast || this.root, new FormattedCodeGen());
  }

  private rebuildParentMap() {
    this.parentMap = buildParentMap(this.root);
  }
}
