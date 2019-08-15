const { RefactorSession } = require("../src/index.js");
const { parseScript: parse } = require("shift-parser");

const chai = require("chai");

describe("delete", function() {
  it("should delete statements", () => {
    let ast = parse(`function foo(){}\nfoo();`);
    const refactor = new RefactorSession(ast);
    refactor.delete(`FunctionDeclaration[name.name="foo"]`);
    chai.expect(refactor.ast.statements.length).to.equal(1);
    chai.expect(refactor.ast).to.deep.equal(parse("foo();"));
  });
  it("should accept actual nodes", () => {
    let ast = parse(`function foo(){}\nfoo();`);
    const refactor = new RefactorSession(ast);
    refactor.delete(ast.statements[0]);
    chai.expect(refactor.ast.statements.length).to.equal(1);
    chai.expect(refactor.ast).to.deep.equal(parse("foo();"));
  });
});
