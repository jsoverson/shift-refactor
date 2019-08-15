const { RefactorSession } = require("../src/index.js");
const { parseScript: parse } = require("shift-parser");

const chai = require("chai");

describe("API", function() {
  it("should expose.query()", () => {
    const refactor = new RefactorSession(`function foo(){}\nfoo();`);
    const nodes = refactor.query(`FunctionDeclaration[name.name="foo"]`);
    chai.expect(nodes.length).to.equal(1);
  });
  it("should expose .queryFrom()", () => {
    let ast = parse(`var a = 2; function foo(){var a = 4}`);
    const refactor = new RefactorSession(ast);
    const nodes = refactor.query(`FunctionDeclaration[name.name="foo"]`);
    const innerNodes = refactor.queryFrom(
      nodes,
      `VariableDeclarator[binding.name="a"]`
    );
    chai.expect(innerNodes.length).to.equal(1);
  });
  it("should expose .print()", () => {
    let ast = parse(`var a = 2; function foo(){var a = 4}`);
    const refactor = new RefactorSession(ast);
    const newSource = refactor.print();
    chai.expect(ast).to.deep.equal(parse(newSource));
  });
  it("should expose .cleanup()", () => {
    let ast = parse(``);
    const refactor = new RefactorSession(ast);
    chai.expect(() => refactor.cleanup).to.not.throw();
  });
});
