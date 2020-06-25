import chai from 'chai';
import { parseScript as parse } from 'shift-parser';
import { RefactorSession } from '../../src';

describe('plugin-unsafe',() => {
  describe('massRename', () => {
    it('should rename arbitrary variables by name alone', () => {
      let ast = parse(`var a = 2; b = 3; function d(a) {let c = a;}`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.massRename([['a', 'a1'], ['b', 'b1'], ['c', 'c1']]);
      chai.expect(refactor.ast).to.deep.equal(parse('var a1 = 2; b1 = 3; function d(a1) {let c1 = a1;}'));
    });
  });
  
  //TODO: This needs more tests
  describe("inlineLiterals", () => {
    it("should replace references to literals with actual literal", () => {
      let ast = parse(`var a = 1, b = "string", c = -1;fn(a,b,c);`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.inlineLiterals();
      chai.expect(ast).to.deep.equal(parse(`var a = 1, b = "string", c = -1;fn(1,"string",-1);`));
    });
  })

  describe("removeDeadVariables", () => {
    it("should not remove global variables", () => {
      let ast = parse(`var globalVar = 2; !function(){ var foo = 1; }()`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("var globalVar = 2; !function(){ }()"));
    });
    it("should remove unused variables", () => {
      let ast = parse(`!function(){ var foo = 1; let bar = 2; const baz = 3; var FOO = 'one'; let BAR = 'two'; const BAZ = 'three'; x = FOO + BAR + BAZ; }()`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("!function() {var FOO = 'one'; let BAR = 'two'; const BAZ = 'three'; x = FOO + BAR + BAZ;}()"));
    });
    it("should remove unused declarators within one statement", () => {
      let ast = parse(`!function(){ var foo = 1, bar = 2, baz = 3; x = baz; }()`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("!function() {var baz = 3; x = baz;}()"));
    });
    it("should remove unused declarators & assignment expressions if variable is unreferenced", () => {
      let ast = parse(`!function(){ var foo; foo = 2; foo = bar(); baz(foo = "foo")}()`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("!function() {bar();baz('foo')}()"));
    });
    it("should remove unused function declarations", () => {
      let ast = parse(`!function(){ function foo(){}\n function bar(){}\n bar();}()`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("!function() {function bar(){}\n bar();}()"));
    });
    it("should not remove named function expressions", () => {
      let ast = parse(`!function(){ (function foo(){}())}()`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("!function() {(function foo(){}())}()"));
    });
    it("should not remove parameters", () => {
      let ast = parse(`!function(){ (function (a,b){}())}()`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("!function(){(function (a,b){}())}()"));
    });
    it("should re-run scope lookup after tree modifications", () => {
      let ast = parse(`
      !function(){
        var a = 2;
        a = 3;
        b = a + A;
      }()
      `);
      const refactor = new RefactorSession(ast);
      refactor.lookupVariable(refactor.findOne('BindingIdentifier[name="a"]'));
      refactor.findOne('BindingIdentifier[name="a"]');
      refactor.delete('CallExpression ExpressionStatement');
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("!function(){}()"));
    });
    it("should consider increment/decrement operations write only in statement context", () => {
      let ast = parse(`
      !function(){
      var a = 2, b = 3;
      a++;
      a--;
      window.foo = b++;
      }()
      `);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("!function(){var b = 3; window.foo=b++}()"));
    });
  });
});
