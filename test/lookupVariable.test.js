const { RefactorSession } = require("../src/index.js");
const { parseScript: parse } = require("shift-parser");

const chai = require("chai");

describe("lookupVariable", function() {
//TODO
});
describe("lookupVariableByName", function() {
  it("should return variables by name", () => {
    let ast = parse(`var a = 2; var b = 3; (function(b){ var a = "foo" }())`);
    const refactor = new RefactorSession(ast);
    const varsA = refactor.lookupVariableByName('a');
    chai.expect(varsA).to.be.lengthOf(2);
    const varsB = refactor.lookupVariableByName('b');
    chai.expect(varsB).to.be.lengthOf(2);
  });
});
  