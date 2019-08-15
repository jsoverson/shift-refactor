const shiftScope = require("shift-scope");
const { parseScript } = require("shift-parser");
const traverse = require("shift-traverser");
const { default: codegen, FormattedCodeGen } = require("shift-codegen");
const { default: isValid } = require("shift-validator");
const Shift = require("shift-ast");

const { IdGenerator } = require("./id-generator");

const { query } = require("shift-query");

function copy(object) {
  return JSON.parse(JSON.stringify(object));
}

function isString(input) {
  return typeof input === "string";
}
function isFunction(input) {
  return typeof input === "function";
}
function isArray(input) {
  return Array.isArray(input);
}
function isShiftNode(input) {
  return input && typeof input.type !== "undefined";
}
function isStatement(input) {
  return input && input.type && input.type.match(/(Statement|Declaration)$/);
}

class RefactorError extends Error {}

function findNodes(ast, input) {
  if (isString(input)) return query(ast, input);
  else if (isArray(input)) return input;
  else if (isShiftNode(input)) return [input];
  else return [];
}

class RefactorSession {
  constructor(ast, { autoCleanup = true } = {}) {
    if (isString(ast)) ast = parseScript(ast);
    this.ast = ast;
    this.autoCleanup = autoCleanup;
    this.dirty = false;

    this._replacements = new WeakMap();
    this._deletions = new WeakSet();
    this._insertions = new WeakMap();
  }
  rename(selector, newName) {
    const nodes = findNodes(this.ast, selector);
    nodes.forEach(node => {
      if (node.type === Shift.VariableDeclarator.name) node = node.binding;
      const lookupTable = this._getGlobalLookupTable(this.ast);
      const lookup = lookupTable.variableMap.get(node);
      if (!lookup) return;
      lookup[0].declarations.forEach(decl => (decl.node.name = newName));
      lookup[0].references.forEach(ref => (ref.node.name = newName));
    });
  }
  delete(selector) {
    const nodes = findNodes(this.ast, selector);
    if (nodes.length > 0) {
      nodes.forEach(node => this._queueDeletion(node));
    }
    if (this.autoCleanup) this.cleanup();
  }
  replace(selector, program) {
    const nodes = query(this.ast, selector);

    const replacement =
      typeof program === "string" ? parseScript(program) : null;

    nodes.forEach(node => {
      if (isFunction(program)) {
        this._queueReplacement(node, program(node));
      } else if (isStatement(node)) {
        this._queueReplacement(node, copy(replacement.statements[0]));
      } else {
        this._queueReplacement(
          node,
          copy(replacement.statements[0].expression)
        );
      }
    });
    if (this.autoCleanup) this.cleanup();
    return nodes.length;
  }
  replaceRecursive(selector, program) {
    const nodesReplaced = this.replace(selector, program);
    this.cleanup();
    if (nodesReplaced > 0) this.replaceRecursive(selector, program);
  }
  _insert(selector, program, after = false) {
    const nodes = findNodes(this.ast, selector);

    let insertion = null;
    let getInsertion = (program, node) => {
      if (isFunction(program)) {
        const result = program(node);
        if (isShiftNode(result)) return result;
        return parseScript(result).statements[0];
      } else {
        if (insertion) return copy(insertion);
        return (insertion = parseScript(program).statements[0]);
      }
    };

    nodes.forEach(node => {
      if (!isStatement(node))
        throw new RefactorError(
          "Can only insert before or after Statements or Declarations"
        );
      this.dirty = true;
      const toInsert = getInsertion(program, node);
      if (!isStatement(toInsert))
        throw new RefactorError(
          "Will not insert anything but a Statement or Declaration"
        );
      this._insertions.set(node, {
        after,
        statement: getInsertion(program, node)
      });
    });

    if (this.autoCleanup) this.cleanup();
  }
  insertBefore(selector, program) {
    this._insert(selector, program, false);
  }
  insertAfter(selector, program) {
    this._insert(selector, program, true);
  }
  unshorten(selector) {
    if (!this.lookupTable) this._getGlobalLookupTable(this.ast);
    const nodes = findNodes(this.ast, selector);
    nodes.forEach(node => {
      const from = node.binding;
      const to = node.init;
      const lookup = this.lookupTable.variableMap.get(from);
      lookup[0].declarations.forEach(decl => (decl.node.name = to.name));
      lookup[0].references.forEach(ref => (ref.node.name = to.name));
      this._queueDeletion(node);
    });
    if (this.autoCleanup) this.cleanup();
  }
  _queueDeletion(node) {
    this.dirty = true;
    this._deletions.add(node);
  }
  _queueReplacement(from, to) {
    this.dirty = true;
    this._replacements.set(from, to);
  }
  _getGlobalLookupTable(ast) {
    if (this.lookupTable) return this.lookupTable;
    const globalScope = shiftScope.default(ast);
    return (this.lookupTable = new shiftScope.ScopeLookup(globalScope));
  }
  _isDirty() {
    return this.dirty;
  }
  _makeDirty() {
    this.dirty = true;
  }
  cleanup() {
    if (!this.dirty) return;
    const context = this;
    const result = traverse.replace(this.ast, {
      leave: function(node, parent) {
        if (node.type === "VariableDeclarationStatement") {
          if (node.declaration.declarators.length === 0) return this.remove();
        }
        if (context._replacements.has(node)) {
          const newNode = context._replacements.get(node);
          context._replacements.delete(node);
          return newNode;
        }
        if (context._deletions.has(node)) {
          context._replacements.delete(node);
          this.remove();
        }
        if (context._insertions.has(node)) {
          const insertion = context._insertions.get(node);
          let statementIndex = parent.statements.indexOf(node);
          if (insertion.after) statementIndex++;
          parent.statements.splice(statementIndex, 0, insertion.statement);
          return;
        }
      }
    });
    return (this.ast = result);
  }
  query(selector) {
    return query(this.ast, selector);
  }
  queryFrom(astNodes, selector) {
    return isArray(astNodes)
      ? astNodes.map(node => query(node, selector)).flat()
      : query(astNodes, selector);
  }
  print() {
    return codegen(this.ast, new FormattedCodeGen());
  }

  /* Util functions : common refactors that use methods above */
  convertComputedToStatic() {
    this.replaceRecursive(
      `ComputedMemberExpression[expression.type="LiteralStringExpression"]`,
      node => {
        const replacement = new Shift.StaticMemberExpression({
          object: node.object,
          property: node.expression.value
        });
        return isValid(replacement) ? replacement : node;
      }
    );

    this.replaceRecursive(
      `ComputedMemberAssignmentTarget[expression.type="LiteralStringExpression"]`,
      node => {
        const replacement = new Shift.StaticMemberAssignmentTarget({
          object: node.object,
          property: node.expression.value
        });
        return isValid(replacement) ? replacement : node;
      }
    );

    this.replaceRecursive(
      `ComputedPropertyName[expression.type="LiteralStringExpression"]`,
      node => {
        const replacement = new Shift.StaticPropertyName({
          value: node.expression.value
        });
        return isValid(replacement) ? replacement : node;
      }
    );
  }
  validate() {
    return isValid(this.ast);
  }
  expandBoolean() {
    this.replace(
      `UnaryExpression[operator="!"][operand.value=0]`,
      () => new Shift.LiteralBooleanExpression({ value: true })
    );
    this.replace(
      `UnaryExpression[operator="!"][operand.value=1]`,
      () => new Shift.LiteralBooleanExpression({ value: false })
    );
  }
  normalizeIdentifiers() {
    const lookupTable = this._getGlobalLookupTable(this.ast);
    const idGenerator = new IdGenerator();
    renameScope(lookupTable.scope, idGenerator);
  }
}

function renameScope(scope, idGenerator) {
  scope.variableList.forEach(variable => {
    if (variable.name === "arguments") return;
    const nextId = idGenerator.next();
    variable.declarations.forEach(_ => (_.node.name = nextId));
    variable.references.forEach(_ => (_.node.name = nextId));
  });
  scope.children.forEach(_ => renameScope(_, idGenerator));
}

exports.RefactorSession = RefactorSession;
exports.RefactorError = RefactorError;
