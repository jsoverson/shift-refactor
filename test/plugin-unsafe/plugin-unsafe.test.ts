import chai from 'chai';
import { parseScript as parse } from 'shift-parser';
import { RefactorSession } from '../../src';

describe('plugin-unsafe',() => {

  describe('findPureFunctions', () => {
    
    it('should produce a list of likely-pure functions',() => {
      let ast = parse(`function add(a,b) {return a+b};function other(a,b) {return a+window.somewhereElse};`);
      const refactor = new RefactorSession(ast);
      const functions = refactor.unsafe.findPureFunctions();
      chai.expect(functions.length).to.equal(1);
      chai.expect(functions[0]).to.deep.equal(ast.statements[0]);
    })

  });

  describe('massRename', () => {
    it('should rename arbitrary variables by name alone', () => {
      let ast = parse(`var a = 2; b = 3; function d(a) {let c = a;}`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.massRename([['a', 'a1'], ['b', 'b1'], ['c', 'c1']]);
      chai.expect(refactor.ast).to.deep.equal(parse('var a1 = 2; b1 = 3; function d(a1) {let c1 = a1;}'));
    });
  });
  

  describe("removeDeadVariables", function() {
    it("should remove unused variables", () => {
      let ast = parse(`var foo = 1; let bar = 2; const baz = 3; var FOO = 'one'; let BAR = 'two'; const BAZ = 'three'; x = FOO + BAR + BAZ;`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("var FOO = 'one'; let BAR = 'two'; const BAZ = 'three'; x = FOO + BAR + BAZ;"));
    });
    it("should remove unused declarators within one statement", () => {
      let ast = parse(`var foo = 1, bar = 2, baz = 3; x = baz;`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("var baz = 3; x = baz;"));
    });
    it("should remove unused declarators & assignment expressions if variable is unreferenced", () => {
      let ast = parse(`var foo; foo = 2; foo = bar(); baz(foo = "foo")`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("bar();baz('foo')"));
    });
    it("should remove unused function declarations", () => {
      let ast = parse(`function foo(){}\n function bar(){}\n bar();`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse(" function bar(){}\n bar();"));
    });
    it("should not remove named function expressions", () => {
      let ast = parse(`(function foo(){}())`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("(function foo(){}())"));
    });
    it("should not remove parameters", () => {
      let ast = parse(`(function (a,b){}())`);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("(function (a,b){}())"));
    });
    it("should re-run scope lookup after tree modifications", () => {
      let ast = parse(`
      var a = 2;
      a = 3;
      b = a + A;
      `);
      const refactor = new RefactorSession(ast);
      // need lookup first, scope lookup is lazy.
      // @ts-ignore
      refactor.lookupVariable(ast.statements[0].declaration.declarators[0].binding);
      refactor.delete(ast.statements[2]);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse(""));
    });
    it("should consider increment/decrement operations write only in statement context", () => {
      let ast = parse(`
      var a = 2, b = 3;
      a++;
      a--;
      window.foo = b++;
      `);
      const refactor = new RefactorSession(ast);
      refactor.unsafe.removeDeadVariables();
      chai.expect(ast).to.deep.equal(parse("var b = 3; window.foo=b++"));
    });
  });
});
