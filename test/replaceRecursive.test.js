const { RefactorSession } = require("../src/index.js");
const { parseScript: parse } = require("shift-parser");
const Shift = require("shift-ast");

const chai = require("chai");

describe("replaceRecursive", function() {
  it("should replace until the query is empty", () => {
    let ast = parse(`a["b"]["c"]`);
    const refactor = new RefactorSession(ast);
    refactor.replaceRecursive(
      `ComputedMemberExpression[expression.type="LiteralStringExpression"]`,
      node =>
        new Shift.StaticMemberExpression({
          object: node.object,
          property: node.expression.value
        })
    );
    chai.expect(refactor.ast).to.deep.equal(parse("a.b.c"));
  });
});
