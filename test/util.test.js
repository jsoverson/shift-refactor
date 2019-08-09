const { RefactorSession } = require("../src/index.js");
const { parseScript: parse } = require("shift-parser");

const chai = require("chai");

describe("util", function() {
  describe("computedToStatic", () => {
    it("should replace all ComputedMemberProperties", () => {
      let ast = parse(`a["b"]["c"];a["b"]["c"]=2`);
      const refactor = new RefactorSession(ast);
      refactor.convertComputedToStatic();
      chai.expect(refactor.ast).to.deep.equal(parse("a.b.c;a.b.c=2"));
    });
    it("should replace all ComputedPropertyNames", () => {
      let ast = parse(`a = {["b"]:2}`);
      const refactor = new RefactorSession(ast);
      refactor.convertComputedToStatic();
      chai.expect(refactor.ast).to.deep.equal(parse("a = {b:2}"));
    });
  });
  it("expandBoolean", () => {
    let ast = parse(`if (!0 || !1) true`);
    const refactor = new RefactorSession(ast);
    refactor.expandBoolean();
    chai.expect(refactor.ast).to.deep.equal(parse("if (true || false) true"));
  });
  describe("normalizeIdentifiers", () => {
    it("should replace id names with simple versions", () => {
      let ast = parse(
        `const arst=1, aryl=2; var aiai; function foie(){const arst=2;arst++;};foie();`
      );
      const refactor = new RefactorSession(ast);
      refactor.normalizeIdentifiers();
      chai
        .expect(refactor.ast)
        .to.deep.equal(
          parse("const c=1, d=2; var a; function b(){const e=2;e++};b();")
        );
    });
  });
  xit("uncollapseVars", () => {
    let ast = parse(`let r = require, w = window;w.document = r("test")`);
    const refactor = new RefactorSession(ast);
    refactor.uncollapseVars();
    chai
      .expect(refactor.ast)
      .to.deep.equal(parse('window.document = require("test")'));
  });
});
