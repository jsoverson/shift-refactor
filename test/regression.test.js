const { RefactorSession } = require("../src/index.js");
const { parseScript: parse } = require("shift-parser");

const chai = require("chai");

describe("Regression", function() {
  describe("https://github.com/jsoverson/shift-refactor/issues/3", () => {
    it("inserts should not mess up deletes", () => {
      let ast = parse(`var a = 2, b = 3;`);
      const refactor = new RefactorSession(ast);
      refactor.insertBefore('VariableDeclarationStatement', `test();`);
      const a = refactor.query('VariableDeclarationStatement');
      refactor.delete('VariableDeclarationStatement');
      const b = refactor.query('VariableDeclarationStatement');
      chai.expect(refactor.ast).to.deep.equal(parse("test()"));
      chai.expect(a.length).to.equal(1);
      chai.expect(b.length).to.equal(0);
    });
  });
});
