import { expect } from 'chai';
import { parseScript as parse, parseScript } from 'shift-parser';
import { refactor } from '../../src/';
import { MemorableIdGenerator } from '../../src/id-generator/id-generator';

describe('plugin-common', () => {
  describe('normalizeIdentifiers', () => {
    it('should replace id names with memorable names', () => {
      let ast = parse(`const arst=1; var aiai; function foie(rses){const arst=2;arst++;};foie();`);
      const gen = new MemorableIdGenerator(10);
      const first = gen.next().value,
        second = gen.next().value;
      const $script = refactor(ast);
      $script.normalizeIdentifiers(10);
      expect($script.first())
        .to.deep.equal(
          parse(`const arst=1; var aiai; function foie($arg0_${second}){const $$${first}=2;$$${first}++};foie();`),
        );
    });
    it('should not change global vars', () => {
      let ast = parse(`(function(){const zzzz=1; console.log(zzzz)})`);
      const gen = new MemorableIdGenerator(10);
      const first = gen.next().value;
      const $script = refactor(ast);
      $script.normalizeIdentifiers(10);
      expect($script.first()).to.deep.equal(parse(`(function () {const $$${first}=1; console.log($$${first})})`));
    });
  });

  describe('debug', () => {
    it('should insert debugger statements into functions', () => {
      const $script = refactor(`b = _ => foo(); c = _ => {bar()}; a.x = function(){b();c();}`);
      $script(`FunctionExpression, ArrowExpression`).debug();
      expect($script.first())
        .to.deep.equal(
          parseScript(
            'b = _ => {debugger; return foo()}; c = _ => {debugger; bar()}; a.x = function(){debugger;b();c();}',
          ),
        );
    });
  })

  describe('expandBoolean', () => {
    it('should expand !0 and !1', () => {
      let ast = parse(`if (!0 || !1) true`);
      const $script = refactor(ast);
      $script.expandBoolean();
      expect($script.first()).to.deep.equal(parse('if (true || false) true'));
    });
  });

  describe('unshorten', function () {
    it('should unshorten variable declarations', () => {
      let ast = parse(`let a=2,r=require;r()`);
      const $script = refactor(ast);
      $script(`VariableDeclarator[init.name="require"]`).unshorten();
      expect($script.first()).to.deep.equal(parse('let a=2;require()'));
    });
  });

  describe('compressCommaOperator', function () {
    it('should eliminate literals in a comma expression', () => {
      let ast = parse(`let a=(1,2,3,4)`);
      const $script = refactor(ast);
      $script.compressCommaOperators();
      expect($script.first()).to.deep.equal(parse('let a=4;'));
    });
  });

  describe('compressConditonalExpressions', function () {
    it('should do simple evaluation of conditionals with literals', () => {
      let ast = parse(`let a=true ? 1 : 2;`);
      const $script = refactor(ast);
      $script.compressConditonalExpressions();
      expect($script.first()).to.deep.equal(parse('let a=1;'));
    });
  });

  describe('computedToStatic', () => {
    it('should replace all ComputedMemberProperties', () => {
      let ast = parse(`a["b"]["c"];a["b"]["c"]=2`);
      const $script = refactor(ast);
      $script.convertComputedToStatic();
      expect($script.first()).to.deep.equal(parse('a.b.c;a.b.c=2'));
    });
    it('should not replace what would make an invalid StaticMemberProperty', () => {
      let ast = parse(`a["2b"] = 2`);
      const $script = refactor(ast);
      $script.convertComputedToStatic();
      expect($script.first()).to.deep.equal(parse('a["2b"] = 2'));
    });
    it('should replace all ComputedPropertyNames', () => {
      let ast = parse(`a = {["b"]:2}`);
      const $script = refactor(ast);
      $script.convertComputedToStatic();
      expect($script.first()).to.deep.equal(parse('a = {b:2}'));
    });
  });
});
