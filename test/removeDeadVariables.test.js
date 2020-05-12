const { RefactorSession } = require("../src/index.js");
const { parseScript: parse } = require("shift-parser");

const chai = require("chai");

describe("removeDeadVariables", function() {
  it("should remove unused variables", () => {
    let ast = parse(`var foo = 1; let bar = 2; const baz = 3; var FOO = 'one'; let BAR = 'two'; const BAZ = 'three'; x = FOO + BAR + BAZ;`);
    const refactor = new RefactorSession(ast);
    refactor.removeDeadVariables();
    chai.expect(ast).to.deep.equal(parse("var FOO = 'one'; let BAR = 'two'; const BAZ = 'three'; x = FOO + BAR + BAZ;"));
  });
  it("should remove unused declarators within one statement", () => {
    let ast = parse(`var foo = 1, bar = 2, baz = 3; x = baz;`);
    const refactor = new RefactorSession(ast);
    refactor.removeDeadVariables();
    chai.expect(ast).to.deep.equal(parse("var baz = 3; x = baz;"));
  });
  it("should remove unused declarators & assignment expressions if variable is unreferenced", () => {
    let ast = parse(`var foo; foo = 2; foo = bar(); baz(foo = "foo")`);
    const refactor = new RefactorSession(ast);
    refactor.removeDeadVariables();
    chai.expect(ast).to.deep.equal(parse("bar();baz('foo')"));
  });
  it("should remove unused function declarations", () => {
    let ast = parse(`function foo(){}\n function bar(){}\n bar();`);
    const refactor = new RefactorSession(ast);
    refactor.removeDeadVariables();
    chai.expect(ast).to.deep.equal(parse(" function bar(){}\n bar();"));
  });
  it("should not remove named function expressions", () => {
    let ast = parse(`(function foo(){}())`);
    const refactor = new RefactorSession(ast);
    refactor.removeDeadVariables();
    chai.expect(ast).to.deep.equal(parse("(function foo(){}())"));
  });
  it("should not remove parameters", () => {
    let ast = parse(`(function (a,b){}())`);
    const refactor = new RefactorSession(ast);
    refactor.removeDeadVariables();
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
    refactor.lookupVariable(ast.statements[0].declaration.declarators[0].binding);
    refactor.delete(ast.statements[2]);
    refactor.removeDeadVariables();
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
    refactor.removeDeadVariables();
    chai.expect(ast).to.deep.equal(parse("var b = 3; window.foo=b++"));
  });
});
