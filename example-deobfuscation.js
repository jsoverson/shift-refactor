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