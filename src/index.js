const shiftScope = require("shift-scope");
const { parseScript } = require("shift-parser");
const traverser = require("shift-traverser");
const {
  default: codegen,
  FormattedCodeGen,
} = require("@jsoverson/shift-codegen");
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
function isLiteral(input) {
  return input && input.type && input.type.match(/^Literal/);
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

    this._rebuildParentMap();

    this._scopeMap = new WeakMap();

    this._replacements = new WeakMap();
    this._deletions = new WeakSet();
    this._insertions = new WeakMap();
  }
  _rebuildParentMap() {
    this._parentMap = new WeakMap();
    traverser.traverse(this.ast, {
      enter: (node, parent) => {
        this._parentMap.set(node, parent);
      },
    });
  }
  rename(selector, newName) {
    if (!this._lookupTable) this._getGlobalLookupTable(this.ast);

    const nodes = findNodes(this.ast, selector);

    nodes.forEach((node) => {
      if (node.type === Shift.VariableDeclarator.name) node = node.binding;
      const lookup = this._lookupTable.variableMap.get(node);
      if (!lookup) return;
      this._renameInPlace(lookup[0], newName);
    });

    return this;
  }
  _renameInPlace(lookup, newName) {
    if (!lookup || !newName) return;
    lookup.declarations.forEach((decl) => (decl.node.name = newName));
    lookup.references.forEach((ref) => (ref.node.name = newName));
  }
  massRename(namePairs) {
    if (!this._lookupTable) this._getGlobalLookupTable(this.ast);
    namePairs.forEach(([from, to]) => {
      this.lookupVariableByName(from).forEach(lookup => this._renameInPlace(lookup, to));
    }); 
  }
  delete(selector) {
    const nodes = findNodes(this.ast, selector);
    if (nodes.length > 0) {
      nodes.forEach((node) => this._queueDeletion(node));
    }
    if (this.autoCleanup) this.cleanup();
    return this;
  }
  removeDeadVariables() {
    this.query(
      "VariableDeclarator, FunctionDeclaration, ClassDeclaration"
    ).forEach((decl) => {
      const lookup = this.lookupVariable(decl.binding || decl.name);
      const reads = lookup.references.filter(
        (ref) =>
          ref.accessibility.isRead && !(ref.accessibility.isReadWrite && isStatement(this.findParent(this.findParent(ref.node))))
      );


      if (reads.length === 0) {
        
        lookup.references.forEach((ref) => {
          const node = ref.node;
          const immediateParent = this.findParent(node);
          const contextualParent = this.findParent(immediateParent);

          if (
            [
              "VariableDeclarator",
              "FunctionDeclaration",
              "ClassDeclaration",
            ].indexOf(immediateParent.type) > -1
          ) {
            this.delete(immediateParent);
          } else if (
            immediateParent.type === "UpdateExpression" &&
            isStatement(contextualParent)
          ) {
            this.delete(contextualParent);
          } else if (node.type === "AssignmentTargetIdentifier") {
            if (immediateParent.type === "AssignmentExpression") {
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
    });
    if (this.autoCleanup) this.cleanup();
    return this;
  }
  replace(selector, program) {
    const nodes = findNodes(this.ast, selector);

    const replacementScript =
      typeof program === "string" ? parseScript(program) : null;

    const replaced = nodes.map((node) => {
      let replacement = null;
      if (isFunction(program)) {
        const rv = program(node);
        if (isShiftNode(rv)) {
          replacement = program(node);
        } else if (isString(rv)) {
          const returnedTree = parseScript(rv);
          if (isStatement(node)) {
            replacement = extractStatement(returnedTree);
          } else {
            replacement = extractExpression(returnedTree);
          }
        } else {
          throw new RefactorError(
            `Invalid return type from replacement function: ${rv}`
          );
        }
      } else if (isShiftNode(program)) {
        replacement = copy(program);
      } else if (isStatement(node)) {
        replacement = copy(replacementScript.statements[0]);
      } else {
        replacement = copy(replacementScript.statements[0].expression);
      }
      if (node && replacement !== node) {
        this._queueReplacement(node,replacement);
        return true;
      } else {
        return false;
      }
    });

    if (this.autoCleanup) this.cleanup();
    return replaced.filter(wasReplaced => wasReplaced).length;
  }
  
  replaceRecursive(selector, program) {
    const nodesReplaced = this.replace(selector, program);
    this.cleanup();
    if (nodesReplaced > 0) this.replaceRecursive(selector, program);
    return this;
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
        if (isShiftNode(program)) return copy(program);
        return (insertion = parseScript(program).statements[0]);
      }
    };

    nodes.forEach((node) => {
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
        statement: getInsertion(program, node),
      });
    });

    if (this.autoCleanup) this.cleanup();
    return this;
  }

  findParent(node) {
    return this._parentMap.get(node);
  }

  insertBefore(selector, program) {
    return this._insert(selector, program, false);
  }

  insertAfter(selector, program) {
    return this._insert(selector, program, true);
  }

  unshorten(selector) {
    if (!this._lookupTable) this._getGlobalLookupTable(this.ast);
    const nodes = findNodes(this.ast, selector);
    nodes.forEach((node) => {
      const from = node.binding;
      const to = node.init;
      const lookup = this._lookupTable.variableMap.get(from);
      lookup[0].declarations.forEach((decl) => (decl.node.name = to.name));
      lookup[0].references.forEach((ref) => (ref.node.name = to.name));
      this._queueDeletion(node);
    });
    if (this.autoCleanup) this.cleanup();
    return this;
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
    if (this._lookupTable) return this._lookupTable;
    const globalScope = shiftScope.default(ast);
    this._lookupTable = new shiftScope.ScopeLookup(globalScope);
    this._rebuildScopeMap();
    return this._lookupTable;
  }

  _rebuildScopeMap() {
    this._scopeMap = new WeakMap();
    const recurse = (scope) => {
      scope.variableList.forEach(variable => this._scopeMap.set(variable, scope));
      scope.children.forEach(recurse);
    }
    recurse(this._lookupTable.scope);
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
    const result = traverser.replace(this.ast, {
      leave: function(node, parent) {
        if (node.type === "VariableDeclarationStatement") {
          if (node.declaration.declarators.length === 0) return this.remove();
        }
        if (context._replacements.has(node)) {
          const newNode = context._replacements.get(node);
          context._replacements.delete(node);
          return newNode;
        }
        if (context._insertions.has(node)) {
          const insertion = context._insertions.get(node);
          let statementIndex = parent.statements.indexOf(node);
          if (insertion.after) statementIndex++;
          parent.statements.splice(statementIndex, 0, insertion.statement);
          context._insertions.delete(node);
        }
        if (context._deletions.has(node)) {
          context._replacements.delete(node);
          this.remove();
        }
      },
    });
    this._lookupTable = undefined;
    this._rebuildParentMap();
    return (this.ast = result);
  }

  query(selector) {
    return query(this.ast, selector);
  }

  queryFrom(astNodes, selector) {
    return isArray(astNodes)
      ? astNodes.map((node) => query(node, selector)).flat()
      : query(astNodes, selector);
  }

  closest(originSelector, closestSelector) {
    const nodes = findNodes(this.ast, originSelector);

    const recurse = (node, selector) => {
      const parent = this.findParent(node);
      if (!parent) return [];
      const matches = query(parent, selector);
      if (matches.length > 0) return matches;
      else return recurse(parent, selector);
    }

    return nodes.flatMap(node => recurse(node, closestSelector))
  }

  lookupScope(variableLookup) {
    if (!this._lookupTable) this._getGlobalLookupTable(this.ast);
    if (isArray(variableLookup)) variableLookup = variableLookup[0];

    if (isShiftNode(variableLookup)) variableLookup = this.lookupVariable(variableLookup);

    return this._scopeMap.get(variableLookup);
  }

  lookupVariable(node) {
    if (!this._lookupTable) this._getGlobalLookupTable(this.ast);
    if (isArray(node)) node = node[0];
    
    const lookup = this._lookupTable.variableMap.get(node);
    if (!lookup)
      throw new Error(
        "Could not find reference to passed identifier. Ensure you are passing a valid Identifier node."
      );
    if (lookup.length > 1)
      throw new Error(
        "When does this happen? Submit an issue with this case so I can handle it better."
      );
    return lookup[0];
  }

  lookupVariableByName(name) {
    if (!this._lookupTable) this._getGlobalLookupTable(this.ast);
    const varSet = new Set();
    for (let [lookup] of this._lookupTable.variableMap._.values()) {
      if (name === lookup.name) varSet.add(lookup);
    }
    return Array.from(varSet);
  }

  print(ast) {
    return codegen(ast || this.ast, new FormattedCodeGen());
  }

  /* Util functions : common refactors that use methods above */
  convertComputedToStatic() {
    this.replaceRecursive(
      `ComputedMemberExpression[expression.type="LiteralStringExpression"]`,
      (node) => {
        const replacement = new Shift.StaticMemberExpression({
          object: node.object,
          property: node.expression.value,
        })
        return isValid(replacement) ? replacement : node;
      }
    );

    this.replaceRecursive(
      `ComputedMemberAssignmentTarget[expression.type="LiteralStringExpression"]`,
      (node) => {
        const replacement = new Shift.StaticMemberAssignmentTarget({
          object: node.object,
          property: node.expression.value,
        });
        return isValid(replacement) ? replacement : node;
      }
    );

    this.replaceRecursive(
      `ComputedPropertyName[expression.type="LiteralStringExpression"]`,
      (node) => {
        const replacement = new Shift.StaticPropertyName({
          value: node.expression.value,
        });
        return isValid(replacement) ? replacement : node;
      }
    );

    return this;
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
    return this;
  }

  normalizeIdentifiers(seed = 1, Generator = IdGenerator) {
    const lookupTable = this._getGlobalLookupTable(this.ast);
    const idGenerator = new Generator(seed);
    renameScope(lookupTable.scope, idGenerator, this._parentMap);
    if (this.autoCleanup) this.cleanup();
    return this;
  }
}

function extractStatement(tree) {
  // catch the case where a string was parsed alone and read as a directive.
  if (tree.directives.length > 0) {
    return new Shift.ExpressionStatement({
      expression: new Shift.LiteralStringExpression({
        value: tree.directives[0].rawValue,
      }),
    });
  } else {
    return tree.statements[0];
  }
}

function extractExpression(tree) {
  // catch the case where a string was parsed alone and read as a directive.
  if (tree.directives.length > 0) {
    return new Shift.LiteralStringExpression({
      value: tree.directives[0].rawValue,
    });
  } else {
    if (tree.statements[0].type === "ExpressionStatement") {
      return tree.statements[0].expression;
    } else {
      throw new RefactorError(
        `Can't replace an expression with a node of type ${returnedTree.statements[0].type}`
      );
    }
  }
}

function renameScope(scope, idGenerator, parentMap) {
  scope.variableList.forEach((variable) => {
    if (variable.declarations.length === 0) return;
    const nextId = idGenerator.next();
    const isParam = variable.declarations.find(_ => _.type.name === 'Parameter');
    let newName = `$$${nextId}`;
    if (isParam) {
      const parent = parentMap.get(isParam.node);
      const position = parent.items.indexOf(isParam.node);
      newName = `$arg${position}_${nextId}`;
    }
    variable.declarations.forEach((_) => (_.node.name = newName));
    variable.references.forEach((_) => (_.node.name = newName));
  });
  scope.children.forEach((_) => renameScope(_, idGenerator, parentMap));
}

exports.RefactorSession = RefactorSession;
exports.RefactorError = RefactorError;
