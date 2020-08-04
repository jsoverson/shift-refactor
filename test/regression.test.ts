import {refactor} from '../src/refactor-session-chainable';
import {parseScript as parse} from 'shift-parser';
import Shift from 'shift-ast';

import {expect} from 'chai';
describe('Regression', function() {
  describe('https://github.com/jsoverson/shift-refactor/issues/3', () => {
    it('inserts should not mess up deletes', () => {
      let ast = parse(`var a = 2, b = 3;`);
      const $script = refactor(ast);
      $script('VariableDeclarationStatement').prepend(`test();`);
      const a = $script('VariableDeclarationStatement');
      $script('VariableDeclarationStatement').delete();
      const b = $script('VariableDeclarationStatement');
      expect($script.raw()).to.deep.equal(parse('test()'));
      expect(a.length).to.equal(1);
      expect(b.length).to.equal(0);
    });
  });

  describe('https://github.com/jsoverson/shift-refactor/issues/7', () => {
    it('replaceRecursive should not fall into an infinite loop when skipping nodes', () => {
      let ast = parse(`var a = 2, b = 3;`);
      const $script = refactor(ast);
      function danger() {
        $script.replaceChildren('VariableDeclarator', (node: any) => node);
      }
      expect(danger).to.not.throw();
    });
  });

  describe('https://github.com/jsoverson/shift-refactor/issues/11', () => {
    it('single strings in replacement functions should not be parsed as directives', () => {
      let ast = parse(`var a = "foo";`);
      const $script = refactor(ast);
      $script('LiteralStringExpression').replace('"bar"');
      expect($script.root).to.deep.equal(parse('var a = "bar"'));
    });
  });
});
