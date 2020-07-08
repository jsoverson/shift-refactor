
function stripFunctionWrapper(fn) {
  return fn.toString()
    .replace(/^\s*function\s*\w*\s*\(\)\s*\{/m, '')
    .replace(/\}.*$/, '');
}

exports.testFunction = stripFunctionWrapper(function testFunction() {
  (function (context, require, reference, src, assertion) {
    eval([src, assertion].join('\n'));

  }(this, require, reference, src, assertion));
})

exports.wrapAssertion = function wrapAssertion(assertion) {
  function prelude() {
    const { parseScript: _parse } = require('shift-parser');
    const assert = require('assert-diff');
    assert.treesEqual = (a, b) => {
      let bTree;
      try {
        bTree = _parse(b);
        assert.deepEqual(a.root, bTree);
      } catch (e) {
        e.aTree = a.root;
        e.bTree = bTree;
        throw e;
      }
    }
  }
  function postlude() {
    // const __module = require(reference.package);
    // console.log(reference);
    // const __requested = reference.class ? __module[reference.class] : __module[reference.name];
    // if (reference.type === 'member') {
    //   assert(__requested.prototype[reference.name].called, `documented method ${reference.ref} was not actually called`);
    // } else {
    //   assert(__requested.called, `documented function ${reference.ref} was not actually called`);
    // }
  }
  return `${stripFunctionWrapper(prelude)}\n${assertion}\n${stripFunctionWrapper(postlude)}`;
}