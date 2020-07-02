import chai from 'chai';
import {parseScript as parse} from 'shift-parser';
import {RefactorSession} from '../../src';
import {MemorableIdGenerator} from '../../src/id-generator';

describe('plugin-common', () => {
  describe('normalizeIdentifiers', () => {
    it('should replace id names with memorable names', () => {
      let ast = parse(`const arst=1; var aiai; function foie(rses){const arst=2;arst++;};foie();`);
      const gen = new MemorableIdGenerator(10);
      const first = gen.next().value,
        second = gen.next().value;
      const refactor = new RefactorSession(ast);
      refactor.common.normalizeIdentifiers(10);
      chai
        .expect(refactor.ast)
        .to.deep.equal(
          parse(`const arst=1; var aiai; function foie($arg0_${second}){const $$${first}=2;$$${first}++};foie();`),
        );
    });
    it('should not change global vars', () => {
      let ast = parse(`(function(){const zzzz=1; console.log(zzzz)})`);
      const gen = new MemorableIdGenerator(10);
      const first = gen.next().value;
      const refactor = new RefactorSession(ast);
      refactor.common.normalizeIdentifiers(10);
      chai.expect(refactor.ast).to.deep.equal(parse(`(function () {const $$${first}=1; console.log($$${first})})`));
    });
  });

  describe('expandBoolean', () => {
    it('should expand !0 and !1', () => {
      let ast = parse(`if (!0 || !1) true`);
      const refactor = new RefactorSession(ast);
      refactor.common.expandBoolean();
      chai.expect(refactor.ast).to.deep.equal(parse('if (true || false) true'));
    });
  });

  describe('unshorten', function() {
    it('should unshorten variable declarations', () => {
      let ast = parse(`let a=2,r=require;r()`);
      const refactor = new RefactorSession(ast);
      refactor.common.unshorten(`VariableDeclarator[init.name="require"]`);
      chai.expect(refactor.ast).to.deep.equal(parse('let a=2;require()'));
    });
  });

  describe('compressCommaOperator', function() {
    it('should eliminate literals in a comma expression', () => {
      let ast = parse(`let a=(1,2,3,4)`);
      const refactor = new RefactorSession(ast);
      refactor.common.compressCommaOperators();
      chai.expect(refactor.ast).to.deep.equal(parse('let a=4;'));
    });
  });

  describe('compressConditonalExpressions', function() {
    it('should do simple evaluation of conditionals with literals', () => {
      let ast = parse(`let a=true ? 1 : 2;`);
      const refactor = new RefactorSession(ast);
      refactor.common.compressConditonalExpressions();
      chai.expect(refactor.ast).to.deep.equal(parse('let a=1;'));
    });
  });

  describe('computedToStatic', () => {
    it('should replace all ComputedMemberProperties', () => {
      let ast = parse(`a["b"]["c"];a["b"]["c"]=2`);
      const refactor = new RefactorSession(ast);
      refactor.common.convertComputedToStatic();
      chai.expect(refactor.ast).to.deep.equal(parse('a.b.c;a.b.c=2'));
    });
    it('should not replace what would make an invalid StaticMemberProperty', () => {
      let ast = parse(`a["2b"] = 2`);
      const refactor = new RefactorSession(ast);
      refactor.common.convertComputedToStatic();
      chai.expect(refactor.ast).to.deep.equal(parse('a["2b"] = 2'));
    });
    it('should replace all ComputedPropertyNames', () => {
      let ast = parse(`a = {["b"]:2}`);
      const refactor = new RefactorSession(ast);
      refactor.common.convertComputedToStatic();
      chai.expect(refactor.ast).to.deep.equal(parse('a = {b:2}'));
    });
  });
});
