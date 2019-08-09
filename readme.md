# Shift-refactor

`shift-refactor` is a suite a utility functions designed to make quick work of modifying JavaScript source files.

It started as a tool to aid in reverse engineering but has been generalized to be a quick solution for querying and modifying any JavaScript.

## Status

[Experimental](http://nodejs.org/api/documentation.html#documentation_stability_index).

The features and methods here are regularly used but are not guaranteed to be stable.

## Installation

```sh
$ npm install shift-refactor
```

## Usage

Start by instantiating a RefactorSession with a Shift-format JavaScript AST.

```js
const { RefactorSession } = require('shift-refactor');
const { parseScript } = require('shift-parser');

const ast = parseScript(javaScriptSource);

const refactor = new RefactorSession(ast);
```

By default the RefactorSession cleans up after all major tree-modifying actions. This can be a serious
performance drain when you are running lots of small changes on a big tree.

You can pass `{ autoCleanup: false }` to the constructor to turn this off and then manually call `.cleanup()` at a time you choose.

```js
const refactor = new RefactorSession(ast, { autoCleanup: false });

// lots of work

refactor.cleanup();
```

## Query syntax

Query syntax comes from shift-query which comes from esquery. It is heavily based on CSS style selectors.
See [shift-query](https://github.com/jsoverson/shift-query) for details and use [shift-query-cli](https://github.com/jsoverson/shift-query-cli) to experiment with the query syntax on the command line.

## API methods

### .query(selector)

Run selector on the original AST and return the result.

### .queryFrom(nodes, selector)

Run selector on the passed nodes and return the result.

### .print()

Print the generated source for the current state of the AST.

### .rename(query | nodes, newName)

Renames nodes to `newName`

```js
refactor.rename(`IdentifierExpression[name="oldName"]`, 'newName');
```

From

```js
function oldName(){}
oldName();
```

To 

```js
function newName(){}
newName();
```

### delete

Deletes nodes

```js
refactor.delete(`FunctionDeclaration[name.name="newName"]`);
```

From

```js
function newName(){}
newName();
```

To 

```js
// To
newName();
```

### .replace(query | nodes, source | nodes | callback(node))

Replaces nodes with the passed program or nodes. If this is passed a callback then the callback will be 
executed with the node passed as a parameter and the return value being the replacement value.

```js
refactor.replace(`IdentifierExpression[name.name="someVar"]`, `console.log("Hi")`);
```

From

```js
someVar;
```

To 

```js
console.log("Hi");
```

### .replaceRecursive(query, source | nodes | callback(node))

Same as .replace() except will be continually called until `query` returns no more nodes. Useful for sweeping refactors of a consistent format.

```js
this.replaceRecursive(
  `ComputedMemberExpression[expression.type="LiteralStringExpression"]`, 
  node => {
      return new Shift.StaticMemberExpression({
        object: node.object,
        property: node.expression.value
      });
    }
);
```

From

```js
object["property1"]["property2"];
```

To 

```js
object.property1.property2;
```

### .insertBefore(query | nodes, source | callback(node))

Inserts statements before target statement. Callback can return source or Shift nodes.

```js
refactor.insertBefore(
  `ExpressionStatement[expression.type="CallExpression"]`, 
  node => `console.log("Calling ${node.expression.callee.name}()")`
);
```

From

```js
function someFunc(){}
someFunc();
otherFunc();
```

To 

```js
function someFunc(){}
console.log("Calling someFunc()");
someFunc();
console.log("Calling otherFunc()");
otherFunc();
```

### .insertAfter(query | nodes, source | callback(node))

Same as insertBefore except it inserts after the target statements.

```js
refactor.insertAfter(
  `ExpressionStatement[expression.type="CallExpression"]`, 
  node => `console.log("Called ${node.expression.callee.name}()")`
);
```

From

```js
function someFunc(){}
someFunc();
otherFunc();
```

To 

```js
function someFunc(){}
someFunc();
console.log("Called someFunc()");
otherFunc();
console.log("Called otherFunc()");
```

## Utility methods

These methods are specific implementations of the above included in because they are used so frequently.

### .convertComputedToStatic()

Transforms computed properties and the like to static properties. Meant to be used near the end of a refactor session to clean up the resulting code

From

```js
const loc = window["document"]["location"];
```

To 

```js
const loc = window.document.location;
```

### .expandBoolean()

Turns !0 and !1 into their respective boolean values;

From

```js
if (!0 || !1) {}
```

To 

```js
if (true || false) {}
```

### .normalizeIdentifiers() 

Turns every identifier into a simple identifier unique for the entire program. This greatly simplifies query-ability and 
also normalizes code that dynamically updates variable names over time.

From

```js
const arst=1, aryl=2; 
var aiai; 
function foie() {
  const arst=2;
  arst++;
}
foie();
```

To 

```js
const c=1, d=2; 
var a; 
function b() {
  const e=2;
  e++
}
b();
```

## Example

Assuming an input file named `obfuscated.js` containing this:

```js
var a=['\x74\x61\x72\x67\x65\x74','\x73\x65\x74\x54\x61\x72\x67\x65\x74','\x77\x6f\x72\x6c\x64','\x67\x72\x65\x65\x74','\x72\x65\x61\x64\x65\x72'];var b=function(c,d){c=c-0x0;var e=a[c];return e;};(function(){class c{constructor(d){this[b('0x0')]=d;}['\x67\x72\x65\x65\x74'](){console['\x6c\x6f\x67']('\x48\x65\x6c\x6c\x6f\x20'+this[b('0x0')]);}[b('0x1')](e){this['\x74\x61\x72\x67\x65\x74']=e;}}const f=new c(b('0x2'));f[b('0x3')]();f[b('0x1')](b('0x4'));f[b('0x3')]();}());
```

You can use the following program to deobfuscate it:

```js
const { RefactorSession } = require('shift-refactor');
const { parseScript } = require('shift-parser');
const Shift = require('shift-ast');

const fileContents = require('fs').readFileSync('./original-obfuscated.js', 'utf8');

const tree = parseScript(fileContents);

const refactor = new RefactorSession(tree);

const strings = refactor.query(`Script > :first-child ArrayExpression > .elements`);

const destringifyDeclarator = refactor.query(`VariableDeclarator[binding.name="b"][init.params.items.length=2]`);

refactor.rename(destringifyDeclarator, 'destringify');

const destringifyOffset = refactor.queryFrom(destringifyDeclarator, `BinaryExpression > LiteralNumericExpression`);

const findIndex = (c, d) => c - destringifyOffset[0].value;

refactor.replace(
  `CallExpression[callee.name="destringify"]`, 
  node => new Shift.LiteralStringExpression({value: strings[findIndex(node.arguments[0].value)].value})
)

refactor.delete(`[binding.name="a"]`)
refactor.delete(`[binding.name="destringify"]`)

refactor.convertComputedToStatic();

console.log(refactor.print());
```

resulting in:

```js
(function () {
  class c {
    constructor(d) {
      this.target = d;
    }
    greet() {
      console.log("Hello " + this.target);
    }
    setTarget(e) {
      this.target = e;
    }
  }
  const f = new c("world");
  f.greet();
  f.setTarget("reader");
  f.greet();
}());
```
