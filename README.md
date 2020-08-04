Shift Refactor
--------------

`shift-refactor` is a suite of utility functions designed to analyze and modify JavaScript source files.

It originated as a tool to reverse engineer obfuscated JavaScript but is general-purpose enough for arbitrary transformations.

### Who is this for?

Anyone who works with JavaScript ASTs (Abstract Syntax Trees). If you're not familiar with ASTs, here are a few use cases where they come in useful:

- Automatic refactoring, making sweeping changes to JavaScript source files (Developers, QA).
- Analyzing JavaScript for linting, complexity scoring, etc (Developers, QA).
- Extracting API details to auto-generate documentation or tests (Developers, QA).
- Scraping JavaScript for information or security vulnerabilities (Pen Testers, QA, Security Teams, Hacker types).
- Programmatically transforming malicious or obfuscated JavaScript (Reverse Engineers).

## Status

Stable.

## Installation

```
$ npm install shift-refactor
```

## Usage

The script below finds and prints all literal strings in a script.

```js
// Read 'example.js' as text
const fs = require('fs');
const src = fs.readFileSync('example.js', 'utf-8');

const { refactor } = require('.');

// Create a refactor query object
const $script = refactor(src);

// Select all `LiteralStringExpression`s
const $stringNodes = $script('LiteralStringExpression')

// Turn the string AST nodes into real JS strings
const strings = $stringNodes.codegen();

// Output the strings to the console
strings.forEach(string => console.log(string));

```

### Advanced Example

This script takes the obfuscated source and turns it into something much more readable.

```js
const { refactor } = require('.'); // require('shift-refactor');
const Shift = require('shift-ast');

// Obfuscated source
const src = `var a=['\x74\x61\x72\x67\x65\x74','\x73\x65\x74\x54\x61\x72\x67\x65\x74','\x77\x6f\x72\x6c\x64','\x67\x72\x65\x65\x74','\x72\x65\x61\x64\x65\x72'];var b=function(c,d){c=c-0x0;var e=a[c];return e;};(function(){class c{constructor(d){this[b('0x0')]=d;}['\x67\x72\x65\x65\x74'](){console['\x6c\x6f\x67']('\x48\x65\x6c\x6c\x6f\x20'+this[b('0x0')]);}[b('0x1')](e){this['\x74\x61\x72\x67\x65\x74']=e;}}const f=new c(b('0x2'));f[b('0x3')]();f[b('0x1')](b('0x4'));f[b('0x3')]();}());`;

const $script = refactor(src);

const strings = $script(`Script > :first-child ArrayExpression > .elements`);

const destringifyDeclarator = $script(`VariableDeclarator[binding.name="b"][init.params.items.length=2]`);

destringifyDeclarator.rename('destringify');

const destringifyOffset = destringifyDeclarator.$(`BinaryExpression > LiteralNumericExpression`);

const findIndex = (c, d) => c - destringifyOffset.first().value;

$script(`CallExpression[callee.name="destringify"]`).replace(
  node => {
    return new Shift.LiteralStringExpression({
      value: strings.get(findIndex(node.arguments[0].value)).value
    })
  }
)

$script(`[binding.name="a"]`).delete();
$script(`[binding.name="destringify"]`).delete();

$script.convertComputedToStatic();

console.log($script.print());
```

## Query Syntax

The query syntax is from [`shift-query`](https://github.com/jsoverson/shift-query) (which is a port of [esquery](https://github.com/estools/esquery)) and closely resemble CSS selector syntax.

The following selectors are supported:
* AST node type: `FunctionDeclaration`
* [wildcard](http://dev.w3.org/csswg/selectors4/#universal-selector): `*`
* [attribute existence](http://dev.w3.org/csswg/selectors4/#attribute-selectors): `[attr]`
* [attribute value](http://dev.w3.org/csswg/selectors4/#attribute-selectors): `[attr="foo"]` or `[attr=123]`
* attribute regex: `[attr=/foo.*/]`
* attribute conditons: `[attr!="foo"]`, `[attr>2]`, `[attr<3]`, `[attr>=2]`, or `[attr<=3]` 
* nested attribute: `[attr.level2="foo"]`
* field: `FunctionDeclaration > IdentifierExpression.name`
* [First](http://dev.w3.org/csswg/selectors4/#the-first-child-pseudo) or [last](http://dev.w3.org/csswg/selectors4/#the-last-child-pseudo) child: `:first-child` or `:last-child`
* [nth-child](http://dev.w3.org/csswg/selectors4/#the-nth-child-pseudo) (no ax+b support): `:nth-child(2)`
* [nth-last-child](http://dev.w3.org/csswg/selectors4/#the-nth-last-child-pseudo) (no ax+b support): `:nth-last-child(1)`
* [descendant](http://dev.w3.org/csswg/selectors4/#descendant-combinators): `ancestor descendant`
* [child](http://dev.w3.org/csswg/selectors4/#child-combinators): `parent > child`
* [following sibling](http://dev.w3.org/csswg/selectors4/#general-sibling-combinators): `node ~ sibling`
* [adjacent sibling](http://dev.w3.org/csswg/selectors4/#adjacent-sibling-combinators): `node + adjacent`
* [negation](http://dev.w3.org/csswg/selectors4/#negation-pseudo): `:not(ExpressionStatement)`
* [matches-any](http://dev.w3.org/csswg/selectors4/#matches): `:matches([attr] > :first-child, :last-child)`
* [subject indicator](http://dev.w3.org/csswg/selectors4/#subject): `!IfStatement > [name="foo"]`
* class of AST node: `:statement`, `:expression`, `:declaration`, `:function`, or `:target`

## Useful sites & tools

- [Shift-query's online sandbox](https://jsoverson.github.io/shift-query-demo/) to test queries quickly.
- [Shift-query CLI tool](https://www.npmjs.com/package/shift-query-cli) to query JavaScript on the command line.
- [AST Explorer](https://astexplorer.net/) to explore JavaScript AST's visually (make sure to select "shift" on the top menu bar).
- [Shift-AST.org](https://shift-ast.org/) - home of the Shift JavaScript tool suite.

## API

### `refactor(string | Shift AST)`

Create a refactor query object.

#### Note:

This function assumes that it is being passed complete JavaScript source or a *root* AST node (Script or Module) so that it can create and maintain global state.

#### Example

```js
const { refactor } = require('shift-refactor');

const $script = refactor(`/* JavaScript Source *\/`);
```

## Refactor Query Object

The API is meant to look and feel like jQuery since – like jQuery – it works with CSS-style queries and regularly accesses nodes on a tree. Each query object is both a function and an instance of the internal `RefactorSession` class.

Calling the query object as a function will produce a new query object, You can call a refactor query with a query to produce a new query object with the new nodes or you can call methods off the object to act on the nodes already selected. The examples prefix refactor query objects with a `$` to indicate they are refactor query objects and not naked Nodes or other objects.

### Example

```js
const { refactor } = require('shift-refactor');

const $script = refactor(src);
const $variableDecls = $script('VariableDeclarationStatement')
const $bindingIdentifiers = $variableDecls('BindingIdentifier');
const names = $bindingIdentifiers.map(node => node.name);
```

### Methods

- [`.$(queryOrNodes)`](#$queryornodes)
- [`.append(replacer)`](#appendreplacer)
- [`.closest(closestSelector)`](#closestclosestselector)
- [`.codegen()`](#codegen)
- [`.declarations()`](#declarations)
- [`.delete()`](#delete)
- [`.filter(iterator)`](#filteriterator)
- [`.find(iterator)`](#finditerator)
- [`.findMatchingExpression(sampleSrc)`](#findmatchingexpressionsamplesrc)
- [`.findMatchingStatement(sampleSrc)`](#findmatchingstatementsamplesrc)
- [`.findOne(selectorOrNode)`](#findoneselectorornode)
- [`.first(selector)`](#firstselector)
- [`.forEach(iterator)`](#foreachiterator)
- [`.get(index)`](#getindex)
- [`.logOut()`](#logout)
- [`.lookupVariable()`](#lookupvariable)
- [`.lookupVariableByName(name)`](#lookupvariablebynamename)
- [`.map(iterator)`](#mapiterator)
- [`.nameString()`](#namestring)
- [`.parents()`](#parents)
- [`.prepend(replacer)`](#prependreplacer)
- [`.print()`](#print)
- [`.query(selector)`](#queryselector)
- [`.raw()`](#raw)
- [`.references()`](#references)
- [`.rename(newName)`](#renamenewname)
- [`.replace(replacer)`](#replacereplacer)
- [`.replaceAsync(replacer)`](#replaceasyncreplacer)
- [`.replaceChildren(query, replacer)`](#replacechildrenquery-replacer)
- [`.statements()`](#statements)
- [`.toJSON()`](#tojson)
- [`.type()`](#type)

#### `.$(queryOrNodes)`

Sub-query from selected nodes

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
let a = 1;
function myFunction() {
  let b = 2, c = 3;
}
`

$script = refactor(src);

const funcDecl = $script('FunctionDeclaration[name.name="myFunction"]');
const innerIdentifiers = funcDecl.$('BindingIdentifier');
// innerIdentifiers.nodes: myFunction, b, c (note: does not include a)
```

#### `.append(replacer)`

Inserts the result of`replacer`after the selected statement.

#### Note:

Only works on Statement nodes.

#### Example

```js
const { refactor } = require('shift-refactor');
const Shift = require('shift-ast');

const src = `
var message = "Hello";
console.log(message);
`

$script = refactor(src);

$script('LiteralStringExpression[value="Hello"]').closest(':statement').append('debugger');
```

#### `.closest(closestSelector)`

Finds the closest parent node that matches the passed selector.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
function someFunction() {
  interestingFunction();
}
function otherFunction() {
  interestingFunction();
}
`

$script = refactor(src);

// finds all functions that call `interestingFunction`
const fnDecls = $script('CallExpression[callee.name="interestingFunction"]').closest('FunctionDeclaration');
```

#### `.codegen()`

Generates JavaScript source for the first selected node.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
for (var i=1; i < 101; i++){
  if (i % 15 == 0) console.log("FizzBuzz");
  else if (i % 3 == 0) console.log("Fizz");
  else if (i % 5 == 0) console.log("Buzz");
  else console.log(i);
}
`

$script = refactor(src);

const strings = $script("LiteralStringExpression")

console.log(strings.codegen());
```

#### `.declarations()`

Finds the declaration for the selected Identifier nodes.

#### Note:

Returns a list of Declaration objects for each selected node, not a shift-refactor query object.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
const myVariable = 2, otherVar = 3;
console.log(myVariable, otherVar);
`

$script = refactor(src);

// selects the parameters to console.log() and finds their declarations
const decls = $script('CallExpression[callee.object.name="console"][callee.property="log"] > .arguments').declarations();
```

#### `.delete()`

Delete nodes

#### Example

```js
const { refactor } = require('shift-refactor');

$script = refactor('foo();bar();');

$script('ExpressionStatement[expression.callee.name="foo"]').delete();
```

#### `.filter(iterator)`

Filter selected nodes via passed iterator

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
let doc = window.document;
function addListener(event, fn) {
  doc.addEventListener(event, fn);
}
`

$script = refactor(src);

const values = $script('BindingIdentifier').filter(node => node.name === 'doc');
```

#### `.find(iterator)`

Finds node via the passed iterator iterator

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
const myMessage = "He" + "llo" + " " + "World";
`

$script = refactor(src);

$script('LiteralStringExpression')
  .find(node => node.value === 'World')
  .replace('"Reader"');
```

#### `.findMatchingExpression(sampleSrc)`

Finds an expression that closely matches the passed source.

#### Note:

Used for selecting nodes by source pattern instead of query. The passed source is parsed as a Script and the first statement is expected to be an ExpressionStatement.Matching is done by matching the properties of the parsed statement, ignoring additional properties/nodes in the source tree.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
const a = someFunction(paramOther);
const b = targetFunction(param1, param2);
`

$script = refactor(src);

const targetCallExpression = $script.findMatchingExpression('targetFunction(param1, param2)');
```

#### `.findMatchingStatement(sampleSrc)`

Finds a statement that matches the passed source.

#### Note:

Used for selecting nodes by source pattern vs query. The passed source is parsed as a Script and the first statement alone is used as the statement to match. Matching is done by matching the properties of the parsed statement, ignoring additional properties/nodes in the source tree.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
function someFunction(a,b) {
  var innerVariable = "Lots of stuff in here";
  foo(a);
  bar(b);
}
`

$script = refactor(src);

const targetDeclaration = $script.findMatchingStatement('function someFunction(a,b){}');
```

#### `.findOne(selectorOrNode)`

Finds and selects a single node, throwing an error if zero or more than one is found.

#### Note:

This is useful for when you want to target a single node but aren't sure how specific your query needs to be to target that node and only that node.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
let outerVariable = 1;
function someFunction(a,b) {
  let innerVariable = 2;
}
`

$script = refactor(src);

// This would throw, because there are multiple VariableDeclarators
// $script.findOne('VariableDeclarator');

// This won't throw because there is only one within the only FunctionDeclaration.
const innerVariableDecl = $script('FunctionDeclaration').findOne('VariableDeclarator');
```

#### `.first(selector)`

Returns the first selected node. Optionally takes a selector and returns the first node that matches the selector.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
func1();
func2();
func3();
`

$script = refactor(src);

const func1CallExpression = $script('CallExpression').first();
```

#### `.forEach(iterator)`

Iterate over selected nodes

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
let a = [1,2,3,4];
`

$script = refactor(src);

$script('LiteralNumericExpression').forEach(node => node.value *= 2);
```

#### `.get(index)`

Get selected node at index.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
someFunction('first string', 'second string', 'third string');
`
$script = refactor(src);

const thirdString = $script('LiteralStringExpression').get(2);
```

#### `.logOut()`

`console.log()`s the selected nodes. Useful for inserting into a chain to see what nodes you are working with.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
let a = 1, b = 2;
`

$script = refactor(src);

$script("VariableDeclarator").logOut().delete();
```

#### `.lookupVariable()`

Looks up the Variable from the passed identifier node

#### Note:

Returns`Variable`objects from shift-scope, that contain all the references and declarations for a program variable.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
const someVariable = 2, other = 3;
someVariable++;
function thisIsAVariabletoo(same, as, these) {}
`

$script = refactor(src);

// Finds all variables declared within a program
const variables = $script('BindingIdentifier').lookupVariable();
```

#### `.lookupVariableByName(name)`

Looks up Variables by name.

#### Note:

There may be multiple across a program. Variable lookup operates on the global program state. This method ignores selected nodes.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
const someVariable = 2, other = 3;
`

$script = refactor(src);

const variables = $script.lookupVariableByName('someVariable');
```

#### `.map(iterator)`

Transform selected nodes via passed iterator

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
let doc = window.document;
function addListener(event, fn) {
  doc.addEventListener(event, fn);
}
`

$script = refactor(src);

const values = $script('BindingIdentifier').map(node => node.name);
```

#### `.nameString()`

Retrieve the names of the first selected node. Returns undefined for nodes without names.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
var first = 1, second = 2;
`

$script = refactor(src);
const firstName = $script('BindingIdentifier[name="first"]').nameString();
```

#### `.parents()`

Retrieve parent node(s)

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
var a = 1, b = 2;
`

$script = refactor(src);
const declarators = $script('VariableDeclarator');
const declaration = declarators.parents();
```

#### `.prepend(replacer)`

Inserts the result of`replacer`before the selected statement.

#### Note:

Only works on Statement nodes.

#### Example

```js
const { refactor } = require('shift-refactor');
const Shift = require('shift-ast');

const src = `
var message = "Hello";
console.log(message);
`

$script = refactor(src);

$script('ExpressionStatement[expression.type="CallExpression"]').prepend(new Shift.DebuggerStatement());
```

#### `.print()`

Generates JavaScript source for the first selected node.

#### Example

```js
const { refactor } = require('shift-refactor');
const Shift = require('shift-ast');

const src = `
window.addEventListener('load', () => {
  lotsOfWork();
})
`

$script = refactor(src);

$script("CallExpression[callee.property='addEventListener'] > ArrowExpression")
  .replace(new Shift.IdentifierExpression({name: 'myListener'}));

console.log($script.print());
```

#### `.query(selector)`

Sub-query from selected nodes

#### Note:

synonym for .$()

#### `.raw()`

Returns the raw Shift node for the first selected node.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
const a = 2;
`

$script = refactor(src);

const declStatement = $script('VariableDeclarationStatement').raw();
```

#### `.references()`

Finds the references for the selected Identifier nodes.

#### Note:

Returns a list of Reference objects for each selected node, not a shift-refactor query object.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
let myVar = 1;
function someFunction(a,b) {
  myVar++;
  return myVar;
}
`

$script = refactor(src);

const refs = $script('BindingIdentifier[name="myVar"]').references();
```

#### `.rename(newName)`

Rename all references to the first selected node to the passed name.

#### Note:

Uses the selected node as the target, but affects the global state.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
const myVariable = 2;
myVariable++;
const other = myVariable;
function unrelated(myVariable) { return myVariable }
`
$script = refactor(src);

$script('VariableDeclarator[binding.name="myVariable"]').rename('newName');
```

#### `.replace(replacer)`

Replace selected node with the result of the replacer parameter

#### Example

```js
const { refactor } = require('shift-refactor');
const Shift = require('shift-ast');

const src = `
function sum(a,b) { return a + b }
function difference(a,b) {return a - b}
`

$script = refactor(src);

$script('FunctionDeclaration').replace(node => new Shift.VariableDeclarationStatement({
  declaration: new Shift.VariableDeclaration({
    kind: 'const',
    declarators: [
      new Shift.VariableDeclarator({
        binding: node.name,
        init: new Shift.ArrowExpression({
          isAsync: false,
          params: node.params,
          body: node.body
        })
      })
    ]
  })
}))
```

#### `.replaceAsync(replacer)`

Async version of .replace() that supports asynchronous replacer functions

#### Example

```js
const { refactor } = require('shift-refactor');

$script = refactor('var a = "hello";');

async function work() {
 await $script('LiteralStringExpression').replaceAsync(
   (node) => Promise.resolve(`"goodbye"`)
 )
}
```

#### `.replaceChildren(query, replacer)`

Recursively replaces child nodes until no nodes have been replaced.

#### Example

```js
const { refactor } = require('shift-refactor');
const Shift = require('shift-ast');

const src = `
1 + 2 + 3
`

$script = refactor(src);

$script.replaceChildren(
 'BinaryExpression[left.type=LiteralNumericExpression][right.type=LiteralNumericExpression]',
 (node) => new Shift.LiteralNumericExpression({value: node.left.value + node.right.value})
);
```

#### `.statements()`

Returns the selects the statements for the selected nodes. Note: it will "uplevel" the inner statements of nodes with a`.body`property.Does nothing for nodes that have no statements property.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
console.log(1);
console.log(2);
`

$script = refactor(src);

const rootStatements = $script.statements();
```

#### `.toJSON()`

JSON-ifies the current selected nodes.

#### Example

```js
const { refactor } = require('shift-refactor');

const src = `
(function(){ console.log("Hey")}())
`

$script = refactor(src);

const json = $script.toJSON();
```

#### `.type()`

Return the type of the first selected node

#### Example

```js
const { refactor } = require('shift-refactor');
const Shift = require('shift-ast');

const src = `
myFunction();
`

$script = refactor(src);

const type = $script('CallExpression').type();
```

