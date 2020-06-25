import chai from 'chai';
import { LiteralStringExpression, Node } from 'shift-ast';
import { parseScript as parse, parseScript } from 'shift-parser';
import { RefactorSession, $r } from '../src/index';
// import { Scope } from 'shift-scope';

describe('API', function() {
  it('$r (beta)', () => {
    const $script = $r(`function foo(){}\nfoo();`);
    const nodes = $script(`FunctionDeclaration[name.name="foo"]`);
    chai.expect(nodes.length).to.equal(1);
  });

  it('RefactorSession', () => {
    const $script = new RefactorSession(`function foo(){}\nfoo();`);
    const nodes = $script.query(`FunctionDeclaration[name.name="foo"]`);
    chai.expect(nodes.length).to.equal(1);
  });

  describe('RefactorSession', () => {
    it('.query()', () => {
      const refactor = new RefactorSession(`function foo(){}\nfoo();`);
      const nodes = refactor.query(`FunctionDeclaration[name.name="foo"]`);
      chai.expect(nodes.length).to.equal(1);
    });
    it('.debug()', () => {
      const refactor = new RefactorSession(`b = _ => foo(); c = _ => {bar()}; a.x = function(){b();c();}`);
      refactor.debug(`FunctionExpression, ArrowExpression`);
      chai.expect(refactor.ast).to.deep.equal(parseScript('b = _ => {debugger; return foo()}; c = _ => {debugger; bar()}; a.x = function(){debugger;b();c();}'));
    });
    it('.findOne()', () => {
      const refactor = new RefactorSession(`function foo(){}\nfunction bar(){}`);
      const node = refactor.findOne(`FunctionDeclaration[name.name="foo"]`);
      chai.expect(node.name.name).to.equal('foo');
      function shouldBreak() {
        refactor.findOne(`FunctionDeclaration`);
      }
      chai.expect(shouldBreak).to.throw();
    });
    it('.findParents()', () => {
      const refactor = new RefactorSession(`function foo(){}\nfunction bar(){}`);
      const nodes = refactor.find(`BindingIdentifier`);
      chai.expect(nodes.length).to.equal(2);
      const parents = refactor.findParents(nodes);
      chai.expect(parents.length).to.equal(2);
    });
    it('.findReferences()', () => {
      const refactor = new RefactorSession(`function foo(){}\nfoo();var a = foo();`);
      const fn = refactor.findOne(`FunctionDeclaration[name.name="foo"]`);
      chai.expect(refactor.findReferences(fn).length).to.equal(2);
    });
    it('.findDeclarations()', () => {
      const refactor = new RefactorSession(`function foo(){}\nfoo();var a = foo();`);
      const fn = refactor.findOne(`FunctionDeclaration[name.name="foo"]`);
      chai.expect(refactor.findDeclarations(fn).length).to.equal(1);
    });
    it('should find nodes by sample source', () => {
      const $script = $r(`function foo(){}\nfoo(); a = foo(); b = foo(2); b = foo();`);
      let nodes: Node[] = $script.findMatchingExpression('b = foo()');
      chai.expect(nodes.length).to.equal(1);
      //@ts-ignore
      chai.expect(nodes[0]).to.deep.equal($script.ast.statements[4].expression);
      nodes = $script.findMatchingStatement('b = foo()');
      chai.expect(nodes.length).to.equal(1);
      //@ts-ignore
      chai.expect(nodes[0]).to.deep.equal($script.ast.statements[4]);
    });
    it('.parse()', () => {
      const src = `var a = 2; function foo(){var a = 4}`;
      const ast = parse(src);
      const r_ast = RefactorSession.parse(src);
      chai.expect(r_ast).to.deep.equal(ast);
    });
    it('.queryFrom()', () => {
      let ast = parse(`var a = 2; function foo(){var a = 4}`);
      const refactor = new RefactorSession(ast);
      const nodes = refactor.query(`FunctionDeclaration[name.name="foo"]`);
      const innerNodes = refactor.queryFrom(nodes, `VariableDeclarator[binding.name="a"]`);
      chai.expect(innerNodes.length).to.equal(1);
    });
    it('.print()', () => {
      let ast = parse(`var a = 2; function foo(){var a = 4}`);
      const refactor = new RefactorSession(ast);
      const newSource = refactor.print();
      chai.expect(ast).to.deep.equal(parse(newSource));
    });
    it('.print() should take any ast', () => {
      let ast = parse(`var a = 2; function foo(){var a = 4}`);
      const refactor = new RefactorSession(ast);
      const newSource = refactor.print(new LiteralStringExpression({ value: 'hi' }));
      chai.expect(newSource).to.equal('"hi"');
    });
    it('.closest() should walk up a tree looking for a matching selector', () => {
      let ast = parse(`var a = 2; function foo(){var b = 4}`);
      const refactor = new RefactorSession(ast);
      const innerBinding = refactor.query('BindingIdentifier[name="b"]');
      const parentStatement = refactor.closest(innerBinding, 'VariableDeclarationStatement');
      chai.expect(parentStatement.length).to.equal(1);
    });
    it('.lookupVariable() should return variable lookup by Identifier node', () => {
      let ast = parse(`var a = 2; function foo(){var b = 4}`);
      const refactor = new RefactorSession(ast);
      const innerBinding = refactor.query('BindingIdentifier[name="b"]');
      const lookup = refactor.lookupVariable(innerBinding);
      chai.expect(lookup).to.be.ok;
      chai.expect(lookup.declarations.length).to.equal(1);
    });
    // it('.lookupScope() should return variable scope', () => {
    //   let ast = parse(`var a = 2; function foo(){var b = 4}`);
    //   const refactor = new RefactorSession(ast);
    //   const innerBinding = refactor.query('BindingIdentifier[name="b"]');
    //   const lookup = refactor.lookupScope(innerBinding) as Scope;
    //   chai.expect(lookup).to.be.ok;
    //   chai.expect(lookup.astNode).to.equal(ast.statements[1]);
    // });
    it('.cleanup()', () => {
      let ast = parse(``);
      const refactor = new RefactorSession(ast);
      chai.expect(() => refactor.cleanup).to.not.throw();
    });
  })

});
