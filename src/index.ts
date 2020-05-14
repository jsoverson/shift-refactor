import { default as codegen, FormattedCodeGen } from '@jsoverson/shift-codegen';
import Shift, {
  Literal,
  ShiftNode,
  Statement,
  VariableDeclarator,
  BindingIdentifier,
  IdentifierExpression,
  FunctionDeclaration,
  ClassDeclaration,
  BlockStatement,
  Expression,
  ExpressionStatement,
  AssignmentTargetIdentifier,
  ComputedMemberExpression,
  ArrayExpression,
  LiteralStringExpression,
  ComputedMemberAssignmentTarget,
  ComputedPropertyName,
  Script,
  FormalParameters,
  StaticPropertyName,
  StaticMemberAssignmentTarget,
  StaticMemberExpression,
  LiteralBooleanExpression,
} from 'shift-ast';
import { parseScript } from 'shift-parser';
import shiftScope, { Scope, ScopeLookup, Variable, Reference, Declaration } from 'shift-scope';
import traverser from 'shift-traverser';
import { default as isValid } from 'shift-validator';
import DEBUG from 'debug';

const debug = DEBUG('shift-refactor');

const { IdGenerator } = require('./id-generator');

const { query } = require('shift-query');

function copy(object: any) {
  return JSON.parse(JSON.stringify(object));
}

function isString(input: any): input is string {
  return typeof input === 'string';
}
function isFunction(input: any): input is Function {
  return typeof input === 'function';
}
function isArray(input: any): input is any[] {
  return Array.isArray(input);
}
function isShiftNode(input: any): input is ShiftNode {
  return input && typeof input.type !== 'undefined';
}
function isStatement(input: any): input is Statement {
  return input && input.type && input.type.match(/(Statement|Declaration)$/);
}
function isExpression(input: any): input is Expression {
  return !isStatement(input);
}
function isLiteral(input: any): input is Literal {
  return input && input.type && input.type.match(/^Literal/);
}

export class RefactorError extends Error {}

type SelectorOrNode = string | ShiftNode | ShiftNode[];

function findNodes(ast: ShiftNode, input: SelectorOrNode) {
  if (isString(input)) return query(ast, input);
  else if (isArray(input)) return input;
  else if (isShiftNode(input)) return [input];
  else return [];
}

type Replacer = Function | ShiftNode | string;

export class RefactorSession {
  ast: ShiftNode;
  autoCleanup = true;
  dirty = false;
  _scopeMap = new WeakMap();
  _parentMap = new WeakMap<ShiftNode, ShiftNode>();

  _replacements = new WeakMap();
  _deletions = new WeakSet();
  _insertions = new WeakMap();

  _lookupTable: ScopeLookup | undefined;

  constructor(ast: string | ShiftNode, { autoCleanup = true } = {}) {
    if (isString(ast)) ast = parseScript(ast);
    this.ast = ast;
    this.autoCleanup = autoCleanup;

    this._rebuildParentMap();
  }

  static parse(src:string): Script {
    return parseScript(src);
  }

  _rebuildParentMap() {
    this._parentMap = new WeakMap();
    traverser.traverse(this.ast, {
      enter: (node: ShiftNode, parent: ShiftNode) => {
        this._parentMap.set(node, parent);
      },
    });
  }

  rename(selector: SelectorOrNode, newName: string) {
    const lookupTable = this.getLookupTable();

    const nodes = findNodes(this.ast, selector);

    nodes.forEach((node: ShiftNode) => {
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

  massRename(namePairs: string[][]) {
    if (!this._lookupTable) this.getLookupTable();
    namePairs.forEach(([from, to]) => {
      this.lookupVariableByName(from).forEach((lookup: Variable) => this._renameInPlace(lookup, to));
    });
  }

  delete(selector: SelectorOrNode) {
    const nodes = findNodes(this.ast, selector);
    if (nodes.length > 0) {
      nodes.forEach((node: ShiftNode) => this._queueDeletion(node));
    }
    if (this.autoCleanup) this.cleanup();
    return this;
  }
  removeDeadVariables() {
    this.query('VariableDeclarator, FunctionDeclaration, ClassDeclaration').forEach(
      (decl: VariableDeclarator | FunctionDeclaration | ClassDeclaration) => {
        let name = decl instanceof VariableDeclarator ? decl.binding : decl.name;
        const lookup = this.lookupVariable(name);

        const reads = lookup.references.filter((ref: Reference) => {
          const isRead = ref.accessibility.isRead;
          const isBoth = ref.accessibility.isReadWrite;
          if (isBoth) {
            // if we're an UpdateExpression
            const immediateParent = this.findParent(ref.node);
            if (!immediateParent) return false;
            const nextParent = this.findParent(immediateParent);
            if (isStatement(nextParent)) return false;
            else return true;
          } else {
            return isRead;
          }
        });

        if (reads.length === 0) {
          lookup.references.forEach((ref: Reference) => {
            const node = ref.node;
            const immediateParent = this.findParent(node);
            if (!immediateParent) return;
            const contextualParent = this.findParent(immediateParent);

            if (['VariableDeclarator', 'FunctionDeclaration', 'ClassDeclaration'].indexOf(immediateParent.type) > -1) {
              this.delete(immediateParent);
            } else if (immediateParent.type === 'UpdateExpression' && isStatement(contextualParent)) {
              this.delete(contextualParent);
            } else if (node.type === 'AssignmentTargetIdentifier') {
              if (immediateParent.type === 'AssignmentExpression') {
                if (isLiteral(immediateParent.expression)) {
                  if (isStatement(contextualParent)) {
                    this.delete(contextualParent);
                  } else {
                    this.replace(immediateParent, immediateParent.expression);
                  }
                } else {
                  this.replace(immediateParent, immediateParent.expression);
                }
              }
            }
          });
          this.delete(decl);
        }
      },
    );
    if (this.autoCleanup) this.cleanup();
    return this;
  }

  replace(selector: SelectorOrNode, replacer: Replacer) {
    const nodes = findNodes(this.ast, selector);

    const replacementScript = typeof replacer === 'string' ? parseScript(replacer) : null;

    const replaced = nodes.map((node: ShiftNode) => {
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

    let insertion: ShiftNode | null = null;
    let getInsertion = (program: Replacer, node: ShiftNode) => {
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

    nodes.forEach((node: ShiftNode) => {
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

  findParent(node: ShiftNode) {
    return this._parentMap.get(node);
  }

  insertBefore(selector: SelectorOrNode, replacer: Replacer) {
    return this._insert(selector, replacer, false);
  }

  insertAfter(selector: SelectorOrNode, replacer: Replacer) {
    return this._insert(selector, replacer, true);
  }

  unshorten(selector: SelectorOrNode) {
    const lookupTable = this.getLookupTable();
    const nodes = findNodes(this.ast, selector);

    nodes.forEach((node: ShiftNode) => {
      if (!(node instanceof VariableDeclarator)) {
        debug('Non-VariableDeclarator passed to unshorten(). Skipping.');
        return;
      }
      const from = node.binding;
      const to = node.init;
      if (!(to instanceof IdentifierExpression)) {
        debug('Tried to unshorten() Declarator with a non-IdentifierExpression. Skipping.');
        return;
      }
      const lookup = lookupTable.variableMap.get(from);
      lookup[0].declarations.forEach((decl: Declaration) => (decl.node.name = to.name));
      lookup[0].references.forEach((ref: Reference) => (ref.node.name = to.name));
      this._queueDeletion(node);
    });
    if (this.autoCleanup) this.cleanup();
    return this;
  }

  _queueDeletion(node: ShiftNode) {
    this.dirty = true;
    this._deletions.add(node);
  }

  _queueReplacement(from: ShiftNode, to: ShiftNode) {
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

  cleanup() {
    if (!this.dirty) return;
    const _this = this;
    const result = traverser.replace(this.ast, {
      leave: function(node: ShiftNode, parent: ShiftNode) {
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

  queryFrom(astNodes: ShiftNode | ShiftNode[], selector: string) {
    return isArray(astNodes) ? astNodes.map(node => query(node, selector)).flat() : query(astNodes, selector);
  }

  closest(originSelector: SelectorOrNode, closestSelector: string) {
    const nodes = findNodes(this.ast, originSelector);

    const recurse = (node: ShiftNode, selector: string): ShiftNode[] => {
      const parent = this.findParent(node);
      if (!parent) return [];
      const matches = query(parent, selector);
      if (matches.length > 0) return matches;
      else return recurse(parent, selector);
    };

    return nodes.flatMap((node: ShiftNode) => recurse(node, closestSelector));
  }

  lookupScope(variableLookup: ScopeLookup) {
    if (isArray(variableLookup)) variableLookup = variableLookup[0];

    if (isShiftNode(variableLookup)) variableLookup = this.lookupVariable(variableLookup);

    return this._scopeMap.get(variableLookup);
  }

  lookupVariable(node: ShiftNode) {
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

  print(ast?: ShiftNode) {
    return codegen(ast || this.ast, new FormattedCodeGen());
  }

  /* Util functions : common refactors that use methods above */
  convertComputedToStatic() {
    this.replaceRecursive(
      `ComputedMemberExpression[expression.type="LiteralStringExpression"]`,
      (node: ComputedMemberExpression) => {
        if (node.expression instanceof LiteralStringExpression) {
          const replacement = new StaticMemberExpression({
            object: node.object,
            property: node.expression.value,
          });
          return isValid(replacement) ? replacement : node;
        } else {
          return node;
        }
      },
    );

    this.replaceRecursive(
      `ComputedMemberAssignmentTarget[expression.type="LiteralStringExpression"]`,
      (node: ComputedMemberAssignmentTarget) => {
        if (node.expression instanceof LiteralStringExpression) {
          const replacement = new StaticMemberAssignmentTarget({
            object: node.object,
            property: node.expression.value,
          });
          return isValid(replacement) ? replacement : node;
        } else {
          return node;
        }
      },
    );

    this.replaceRecursive(
      `ComputedPropertyName[expression.type="LiteralStringExpression"]`,
      (node: ComputedPropertyName) => {
        if (node.expression instanceof LiteralStringExpression) {
          const replacement = new StaticPropertyName({
            value: node.expression.value,
          });
          return isValid(replacement) ? replacement : node;
        } else {
          return node;
        }
      },
    );

    return this;
  }

  validate() {
    return isValid(this.ast);
  }

  expandBoolean() {
    this.replace(
      `UnaryExpression[operator="!"][operand.value=0]`,
      () => new LiteralBooleanExpression({ value: true }),
    );
    this.replace(
      `UnaryExpression[operator="!"][operand.value=1]`,
      () => new LiteralBooleanExpression({ value: false }),
    );
    return this;
  }

  normalizeIdentifiers(seed = 1, Generator = IdGenerator) {
    const lookupTable = this.getLookupTable();
    const idGenerator = new Generator(seed);
    renameScope(lookupTable.scope, idGenerator, this._parentMap);
    if (this.autoCleanup) this.cleanup();
    return this;
  }
}

function extractStatement(tree: Script) {
  // catch the case where a string was parsed alone and read as a directive.
  if (tree.directives.length > 0) {
    return new ExpressionStatement({
      expression: new LiteralStringExpression({
        value: tree.directives[0].rawValue,
      }),
    });
  } else {
    return tree.statements[0];
  }
}

function extractExpression(tree: Script) {
  // catch the case where a string was parsed alone and read as a directive.
  if (tree.directives.length > 0) {
    return new LiteralStringExpression({
      value: tree.directives[0].rawValue,
    });
  } else {
    if (tree.statements[0].type === 'ExpressionStatement') {
      return tree.statements[0].expression;
    } else {
      throw new RefactorError(`Can't replace an expression with a node of type ${tree.statements[0].type}`);
    }
  }
}

function renameScope(scope: Scope, idGenerator: IterableIterator<string>, parentMap: WeakMap<ShiftNode, ShiftNode>) {
  scope.variableList.forEach(variable => {
    if (variable.declarations.length === 0) return;
    const nextId = idGenerator.next();
    const isParam = variable.declarations.find(_ => _.type.name === 'Parameter');
    let newName = `$$${nextId}`;
    if (isParam) {
      const parent = parentMap.get(isParam.node) as FormalParameters;
      const position = parent.items.indexOf(isParam.node as BindingIdentifier);
      newName = `$arg${position}_${nextId}`;
    }
    variable.declarations.forEach(_ => (_.node.name = newName));
    variable.references.forEach(_ => (_.node.name = newName));
  });
  scope.children.forEach(_ => renameScope(_, idGenerator, parentMap));
}
