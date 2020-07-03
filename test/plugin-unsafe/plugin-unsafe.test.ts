import { expect } from 'chai';
import { parseScript as parse } from 'shift-parser';
import { refactor } from '../../src/';
import { BindingIdentifier } from 'shift-ast';

describe('plugin-unsafe', () => {
  describe('massRename', () => {
    it('should rename arbitrary variables by name alone', () => {
      let ast = parse(`var a = 2; b = 3; function d(a) {let c = a;}`);
      const $script = refactor(ast);
      $script.massRename([
        ['a', 'a1'],
        ['b', 'b1'],
        ['c', 'c1'],
      ]);
      expect($script.first()).to.deep.equal(parse('var a1 = 2; b1 = 3; function d(a1) {let c1 = a1;}'));
    });
  });

  //TODO: This needs more tests
  describe('inlineLiterals', () => {
    it('should replace references to literals with actual literal', () => {
      let ast = parse(`var a = 1, b = "string", c = -1;fn(a,b,c);`);
      const $script = refactor(ast);
      $script.inlineLiterals();
      expect(ast).to.deep.equal(parse(`var a = 1, b = "string", c = -1;fn(1,"string",-1);`));
    });
  });

  describe('removeDeadVariables', () => {
    it('should not remove global variables', () => {
      let ast = parse(`var globalVar = 2; !function(){ var foo = 1; }()`);
      const $script = refactor(ast);
      $script.removeDeadVariables();
      expect(ast).to.deep.equal(parse('var globalVar = 2; !function(){ }()'));
    });
    it('should remove unused variables', () => {
      let ast = parse(
        `!function(){ var foo = 1; let bar = 2; const baz = 3; var FOO = 'one'; let BAR = 'two'; const BAZ = 'three'; x = FOO + BAR + BAZ; }()`,
      );
      refactor(ast).removeDeadVariables();
      expect(ast)
        .to.deep.equal(
          parse("!function() {var FOO = 'one'; let BAR = 'two'; const BAZ = 'three'; x = FOO + BAR + BAZ;}()"),
        );
    });
    it('should remove unused declarators within one statement', () => {
      let ast = parse(`!function(){ var foo = 1, bar = 2, baz = 3; x = baz; }()`);
      refactor(ast).removeDeadVariables();
      expect(ast).to.deep.equal(parse('!function() {var baz = 3; x = baz;}()'));
    });
    it('should remove unused declarators & assignment expressions if variable is unreferenced', () => {
      let ast = parse(`!function(){ var foo; foo = 2; foo = bar(); baz(foo = "foo")}()`);
      refactor(ast).removeDeadVariables();
      expect(ast).to.deep.equal(parse("!function() {bar();baz('foo')}()"));
    });
    it('should remove unused function declarations', () => {
      let ast = parse(`!function(){ function foo(){}\n function bar(){}\n bar();}()`);
      refactor(ast).removeDeadVariables();
      expect(ast).to.deep.equal(parse('!function() {function bar(){}\n bar();}()'));
    });
    it('should not remove named function expressions', () => {
      let ast = parse(`!function(){ (function foo(){}())}()`);
      refactor(ast).removeDeadVariables();
      expect(ast).to.deep.equal(parse('!function() {(function foo(){}())}()'));
    });
    it('should not remove parameters', () => {
      let ast = parse(`!function(){ (function (a,b){}())}()`);
      refactor(ast).removeDeadVariables();
      expect(ast).to.deep.equal(parse('!function(){(function (a,b){}())}()'));
    });
    it('should re-run scope lookup after tree modifications', () => {
      let ast = parse(`
      !function(){
        var a = 2;
        a = 3;
        b = a + A;
      }()
      `);
      const $script = refactor(ast);
      $script('BindingIdentifier[name="a"]').lookupVariable();
      $script.findOne('BindingIdentifier[name="a"]');
      $script('CallExpression ExpressionStatement').delete();
      $script.removeDeadVariables();
      expect(ast).to.deep.equal(parse('!function(){}()'));
    });
    it('should consider increment/decrement operations write only in statement context', () => {
      let ast = parse(`
      !function(){
      var a = 2, b = 3;
      a++;
      a--;
      window.foo = b++;
      }()
      `);
      refactor(ast).removeDeadVariables();
      expect(ast).to.deep.equal(parse('!function(){var b = 3; window.foo=b++}()'));
    });
  });
});
