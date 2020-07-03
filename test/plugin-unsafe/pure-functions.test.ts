import { expect } from 'chai';
import { parseScript as parse } from 'shift-parser';
import { FunctionDeclaration, CallExpression, ExpressionStatement } from 'shift-ast';
import { refactor } from '../../src';
import {
  PureFunctionAssessment,
  ImpureFunctionQualities,
  PureFunctionVerdict,
  PureFunctionAssessmentOptions,
} from '../../src/pure-functions';

function assess(src: string, options?: PureFunctionAssessmentOptions) {
  const ast = parse(src);
  const fn = ast.statements[0];
  return new PureFunctionAssessment(fn as FunctionDeclaration, options);
}

describe('findPureFunctionCandidates', () => {
  it('not consider functions that access outside scope', () => {
    let ast = parse(`var outer = 2; function impure(a) {return a + outer};`);
    const $script = refactor(ast);
    const candidates = $script.findPureFunctionCandidates();
    expect(candidates.size).to.equal(0);
  });

  it('should pass options to assessments', () => {
    let ast = parse(`function pureEnough(a) {return String.fromCharCode(a)};`);
    const $script = refactor(ast);
    const candidates = $script.findPureFunctionCandidates({
      fnAllowList: ['String.fromCharCode()'],
    });
    expect(candidates.size).to.equal(1);
  });

  describe('PureFunctionAssessment', () => {
    it('through access', () => {
      const assessment = assess(`function impure(a) {return a + outer};`);
      expect(assessment.qualities.has(ImpureFunctionQualities.ThroughAccess)).to.be.true;
      expect(assessment.verdict).to.equal(PureFunctionVerdict.ProbablyNot);
    });

    it('basic binary expression', () => {
      const assessment = assess(`function add(a,b) {return a+b};`);
      expect(assessment.qualities.has(ImpureFunctionQualities.ThroughAccess)).to.be.false;
      expect(assessment.verdict).to.equal(PureFunctionVerdict.Probably);
    });

    it('parameter member mutation', () => {
      let assessment = assess(`function test(a) { a.foo = b; }`);
      expect(assessment.qualities.has(ImpureFunctionQualities.ParameterMemberMutation)).to.be.true;
      expect(assessment.verdict).to.equal(PureFunctionVerdict.ProbablyNot);
      assessment = assess(`function test([a]) { a.foo = b; }`);
      expect(assessment.qualities.has(ImpureFunctionQualities.ParameterMemberMutation)).to.be.true;
      expect(assessment.verdict).to.equal(PureFunctionVerdict.ProbablyNot);
    });

    it('argument member mutation', () => {
      const assessment = assess(`function test(a) { arguments[0].foo = b; }`);
      expect(assessment.qualities.has(ImpureFunctionQualities.ArgumentsMemberMutation)).to.be.true;
      expect(assessment.verdict).to.equal(PureFunctionVerdict.ProbablyNot);
    });

    it('calls pure functions', () => {
      const assessment = assess(`function test(a) { function inner() {return 2} return a + inner(); }`);
      expect(assessment.verdict).to.equal(PureFunctionVerdict.Probably);
    });

    it('calls impure functions', () => {
      const assessment = assess(`function test(a) { function inner() {return k} return a + inner(); }`);
      expect(assessment.qualities.has(ImpureFunctionQualities.CallsImpureFunctions)).to.be.true;
      expect(assessment.verdict).to.equal(PureFunctionVerdict.ProbablyNot);
    });

    it('calls allowlisted functions', () => {
      const options = {
        fnAllowList: ['String.fromCharCode()'],
      };
      const assessment = assess(`function test(a) { return String.fromCharCode(a); }`, options);
      expect(assessment.verdict).to.equal(PureFunctionVerdict.Probably);
    });
  });

  it('should find functions with no calls and no through access and no writes to parameters', () => {
    let ast = parse(`function add(a,b) {return a+b};function other(a,b) {return a+window.somewhereElse};`);
    const $script = refactor(ast);
    const functions = $script.findPureFunctionCandidates();
    expect(functions.size).to.equal(1);
    const declarations = Array.from(functions.keys());
    expect(declarations[0]).to.deep.equal(ast.statements[0]);
  });
});
