const { RefactorSession } = require("../src/index.js");
const { parseScript: parse } = require("shift-parser");
const Shift = require("shift-ast");

const chai = require("chai");

describe("replace", function() {
  it("should replace statements", () => {
    let ast = parse(`function foo(){}\nfoo();`);
    const refactor = new RefactorSession(ast);
    refactor.replace(`FunctionDeclaration[name.name="foo"]`, `console.log(0)`);
    chai.expect(refactor.ast).to.deep.equal(parse("console.log(0);foo();"));
  });
  it("should replace expressions", () => {
    let ast = parse(`foo(a)`);
    const refactor = new RefactorSession(ast);
    refactor.replace(`IdentifierExpression[name="a"]`, `bar()`);
    chai.expect(refactor.ast).to.deep.equal(parse("foo(bar())"));
  });
  it("should be able to pass a function in to replace", () => {
    let ast = parse(`foo(a)`);
    const refactor = new RefactorSession(ast);
    refactor.replace(
      `IdentifierExpression[name="a"]`,
      node => new Shift.IdentifierExpression({ name: node.name + "b" })
    );
    chai.expect(refactor.ast).to.deep.equal(parse("foo(ab)"));
  });
});
