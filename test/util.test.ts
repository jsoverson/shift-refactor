import { RefactorSession } from "../src/index";
import { parseScript as parse } from "shift-parser";

import chai from "chai";
import { IdGenerator } from "../src/id-generator";

describe("util", function() {
  describe("computedToStatic", () => {
    it("should replace all ComputedMemberProperties", () => {
      let ast = parse(`a["b"]["c"];a["b"]["c"]=2`);
      const refactor = new RefactorSession(ast);
      refactor.convertComputedToStatic();
      chai.expect(refactor.ast).to.deep.equal(parse("a.b.c;a.b.c=2"));
    });
    it("should not replace what would make an invalid StaticMemberProperty", () => {
      let ast = parse(`a["2b"] = 2`);
      const refactor = new RefactorSession(ast);
      refactor.convertComputedToStatic();
      chai.expect(refactor.ast).to.deep.equal(parse('a["2b"] = 2'));
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
  
  describe("massRename", () => {
    it("should rename arbitrary variables by name alone", () => {
      let ast = parse(`var a = 2; b = 3; function d(a) {let c = a;}`);
      const refactor = new RefactorSession(ast);
      refactor.massRename([
        ['a', 'a1'],
        ['b', 'b1'],
        ['c', 'c1'],
      ]);
      chai.expect(refactor.ast).to.deep.equal(parse("var a1 = 2; b1 = 3; function d(a1) {let c1 = a1;}"));
    });
  });

  describe("normalizeIdentifiers", () => {
    it("should replace id names with memorable names", () => {
      let ast = parse(
        `const arst=1, aryl=2; var aiai; function foie(rses){const arst=2;arst++;};foie();`
      );
      const gen = new IdGenerator(10);
      const first = gen.next(), second = gen.next(), third = gen.next(), fourth = gen.next(), fifth = gen.next(), sixth = gen.next();
      const refactor = new RefactorSession(ast);
      refactor.normalizeIdentifiers(10);
      chai
        .expect(refactor.ast)
        .to.deep.equal(
          parse(`const $$${third}=1, $$${fourth}=2; var $$${first}; function $$${second}($arg0_${sixth}){const $$${fifth}=2;$$${fifth}++};$$${second}();`)
        );
    });
    it("should not change global vars", () => {
      let ast = parse(
        `const zzzz=1; console.log(zzzz)`
      );
      const gen = new IdGenerator(10);
      const first = gen.next();
      const refactor = new RefactorSession(ast);
      refactor.normalizeIdentifiers();
      chai
        .expect(refactor.ast)
        .to.deep.equal(
          parse(`const $$${first}=1; console.log($$${first})`)
        );
    });
  });
  
});
