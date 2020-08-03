import {expect} from 'chai';
import {
  LiteralStringExpression,
  Node,
  DebuggerStatement,
  IdentifierExpression,
  StaticMemberExpression,
  VariableDeclarator,
  FunctionDeclaration,
  BindingIdentifier,
} from 'shift-ast';
import {parseScript as parse, parseScript} from 'shift-parser';
import {RefactorSession} from '../src/refactor-session';
import {RefactorError} from '../src/misc/types';
import {describe} from 'mocha';
//@ts-ignore VSCode bug? VSC is complaining about this import but TypeScript is fine with it.
import {Scope} from 'shift-scope';

describe('RefactorSession', () => {
  it('.query()', () => {
    const refactor = new RefactorSession(`function foo(){}\nfoo();`);
    const nodes = refactor.query(`FunctionDeclaration[name.name="foo"]`);
    expect(nodes.length).to.equal(1);
  });
  describe('.delete()', () => {
    it('should delete statements', () => {
      let ast = parse(`function foo(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      refactor.delete(`FunctionDeclaration[name.name="foo"]`);
      expect(refactor.first()).to.deep.equal(parse('foo();'));
    });
    it('should accept actual nodes', () => {
      let ast = parse(`function foo(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      refactor.delete(ast.statements[0]);
      expect(refactor.first()).to.deep.equal(parse('foo();'));
    });
  });
  describe('insert', function() {
    describe('prepend', () => {
      it('should insert statement before', () => {
        let ast = parse(`function foo(){}\nfoo();`);
        const refactor = new RefactorSession(ast);
        refactor.prepend(`[expression.callee.name="foo"]`, `console.log(0)`);
        expect(refactor.first()).to.deep.equal(parse('function foo(){}\nconsole.log(0);\nfoo();'));
      });
      it('should accept a function that has access to the nodes queried', () => {
        let ast = parse(`function foo(){}\nfoo();`);
        const refactor = new RefactorSession(ast);
        refactor.prepend(
          `ExpressionStatement[expression.type="CallExpression"]`,
          //@ts-ignore
          (node: Node) => `console.log("Calling ${node.expression.callee.name}()")`,
        );
        expect(refactor.first()).to.deep.equal(parse('function foo(){}\nconsole.log("Calling foo()");\nfoo();'));
      });
      it('should accept a function that returns a shift type', () => {
        let ast = parse(`function foo(){}\nfoo();`);
        const refactor = new RefactorSession(ast);
        refactor.prepend(`ExpressionStatement[expression.type="CallExpression"]`, () => new DebuggerStatement());
        expect(refactor.first()).to.deep.equal(parse('function foo(){}\ndebugger;\nfoo();'));
      });
      it('should fail with an error if you try to insert an expression', () => {
        let ast = parse(`function foo(){}\nfoo();`);
        const refactor = new RefactorSession(ast);
        const shouldThrow = () => {
          refactor.prepend(
            `ExpressionStatement[expression.type="CallExpression"]`,
            () => new IdentifierExpression({name: 'breaks'}),
          );
        };
        expect(shouldThrow).to.throw(RefactorError);
      });
      it('should fail with an error if you query anything other than a statement or declaration', () => {
        let ast = parse(`function foo(){}\nfoo();`);
        const refactor = new RefactorSession(ast);
        const shouldThrow = () => {
          refactor.prepend(`IdentifierExpression`, `shouldNotMatter()`);
        };
        expect(shouldThrow).to.throw(RefactorError);
      });
    });
    describe('append', () => {
      it('should insert statements after', () => {
        let ast = parse(`function foo(){}\nfunction bar(){}\nfoo();`);
        const refactor = new RefactorSession(ast);
        refactor.append(`FunctionDeclaration`, `console.log(0)`);
        expect(refactor.first()).to.deep.equal(
          parse('function foo(){}\nconsole.log(0)\nfunction bar(){}\nconsole.log(0)\nfoo();'),
        );
      });
    });
  });
  describe('rename', function() {
    it('rename function declarations', () => {
      let ast = parse(`function foo(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      refactor.rename(`FunctionDeclaration > BindingIdentifier[name="foo"]`, 'bar');
      expect(ast).to.deep.equal(parse('function bar(){}\nbar();'));
    });
    it('rename function calls', () => {
      let ast = parse(`function foo(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      refactor.rename(`IdentifierExpression[name="foo"]`, 'bar');
      expect(ast).to.deep.equal(parse('function bar(){}\nbar();'));
    });
    it('rename BindingIdentifiers', () => {
      let ast = parse(`const a=2,b=3;a++;b++`);
      const refactor = new RefactorSession(ast);
      refactor.rename(`BindingIdentifier[name="a"]`, 'renamed');
      expect(ast).to.deep.equal(parse('const renamed=2,b=3;renamed++;b++'));
    });
    it('should be able to consume VariableDeclarators', () => {
      let ast = parse(`const a=2,b=3;a++;b++`);
      const refactor = new RefactorSession(ast);
      refactor.rename(`[binding.name="a"][init.value=2]`, 'renamed');
      expect(ast).to.deep.equal(parse('const renamed=2,b=3;renamed++;b++'));
    });
    it('should be able to consume nodes directly', () => {
      let ast = parse(`const a=2,b=3;a++;b++`);
      const refactor = new RefactorSession(ast);
      const declarator = refactor.query('VariableDeclarator[binding.name="a"]') as VariableDeclarator[];
      refactor.rename(declarator[0].binding, 'renamed');
      expect(ast).to.deep.equal(parse('const renamed=2,b=3;renamed++;b++'));
    });
  });

  describe('subSession', () => {
    it('should scope a refactor session to child nodes via a query', async () => {
      let r = new RefactorSession(`b;function foo(a){return d}`);
      let rootIdExprs = r.query('IdentifierExpression');
      expect(rootIdExprs.length).to.equal(2);
      let callExpression = r.subSession('FunctionDeclaration');
      expect(callExpression.nodes.length).to.equal(1);
      let idExpr = callExpression.query('IdentifierExpression');
      expect(idExpr.length).to.equal(1);
    });
    it('should scope a refactor session to nodes passed as arguments', async () => {
      let r = new RefactorSession(`b;function foo(a){return d}`);
      let rootIdExprs = r.query('IdentifierExpression');
      expect(rootIdExprs.length).to.equal(2);
      let callExpressions = r.subSession('FunctionDeclaration');
      expect(callExpressions.nodes.length).to.equal(1);
      const subSession = r.subSession(callExpressions);
      let idExpr = subSession.query('IdentifierExpression');
      expect(idExpr.length).to.equal(1);
    });
  });
  describe('replaceAsync', () => {
    it('should replace nodes with Node instances', async () => {
      let script = new RefactorSession(`foo(a)`);
      await script.replaceAsync(
        `IdentifierExpression[name="a"]`,
        async (node: Node) => await new IdentifierExpression({name: 'b'}),
      );
      expect(script.first()).to.deep.equal(parse('foo(b)'));
    });

    it('should accept same nodes and move on without changes', async () => {
      let script = new RefactorSession(`foo(a)`);
      await script.replaceAsync(`IdentifierExpression[name="a"]`, async (node: any) => node);
      expect(script.first()).to.deep.equal(parse('foo(a)'));
      //@ts-ignore
      expect(script.first().statements[0].expression.arguments[0]).to.equal(
        //@ts-ignore
        script.first().statements[0].expression.arguments[0],
      );
    });
  });

  describe('first', () => {
    it('should return the first node', () => {
      let ast = parse(`function foo(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      expect(refactor.first()).to.equal(ast);
    });
  });

  describe('replace', function() {
    it('should replace statements', () => {
      let ast = parse(`function foo(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      refactor.replace(`FunctionDeclaration[name.name="foo"]`, `console.log(0)`);
      expect(refactor.first()).to.deep.equal(parse('console.log(0);foo();'));
    });
    it('should replace expressions', () => {
      let ast = parse(`foo(a)`);
      const refactor = new RefactorSession(ast);
      refactor.replace(`IdentifierExpression[name="a"]`, `bar()`);
      expect(refactor.first()).to.deep.equal(parse('foo(bar())'));
    });
    it('should accept a node list as a replacement', () => {
      let ast = parse(`foo(a)`);
      const refactor = new RefactorSession(ast);
      const callExpressions = refactor.query('CallExpression');
      refactor.replace(callExpressions, '`foo`');
      expect(refactor.first()).to.deep.equal(parse('`foo`'));
    });
    it('should be able to pass a function in to replace', () => {
      let ast = parse(`foo(a)`);
      const refactor = new RefactorSession(ast);
      refactor.replace(
        `IdentifierExpression[name="a"]`,
        // @ts-ignore
        (node: Node) => new IdentifierExpression({name: node.name + 'b'}),
      );
      expect(refactor.first()).to.deep.equal(parse('foo(ab)'));
    });

    it('should throw on an async replacement function', () => {
      let ast = parse(`foo(a)`);
      const refactor = new RefactorSession(ast);
      const fn = () => {
        refactor.replace(
          `IdentifierExpression[name="a"]`,
          async (node: any) => await new IdentifierExpression({name: 'b'}),
        );
      };
      expect(fn).to.throw();
    });

    it('should accept source containing a lone string from a passed function (catch directive case)', () => {
      let ast = parse(`foo(a)`);
      const refactor = new RefactorSession(ast);
      //@ts-ignore
      refactor.replace(`IdentifierExpression[name="a"]`, (node: Node) => `"${node.name}"`);
      expect(refactor.first()).to.deep.equal(parse("foo('a')"));
    });
    it('should accept raw source from a passed function to replace expressions', () => {
      let ast = parse(`foo(a)`);
      const refactor = new RefactorSession(ast);
      refactor.replace(`IdentifierExpression[name="a"]`, (node: any) => `true`);
      expect(refactor.first()).to.deep.equal(parse('foo(true)'));
    });
    it('should accept raw source from a passed function to replace statements', () => {
      let ast = parse(`a;foo(a);b;`);
      const refactor = new RefactorSession(ast);
      refactor.replace(`ExpressionStatement[expression.type="CallExpression"]`, (node: any) => `console.log(test)`);
      expect(refactor.first()).to.deep.equal(parse('a;console.log(test);b;'));
    });
  });

  describe('replaceRecursive', function() {
    it('should replace until the query is empty', () => {
      let ast = parse(`a["b"]["c"]`);
      const refactor = new RefactorSession(ast);
      refactor.replaceRecursive(
        `ComputedMemberExpression[expression.type="LiteralStringExpression"]`,
        (node: Node) =>
          //@ts-ignore
          new StaticMemberExpression({object: node.object, property: node.expression.value}),
      );
      expect(refactor.first()).to.deep.equal(parse('a.b.c'));
    });
  });

  it('.findOne()', () => {
    const refactor = new RefactorSession(`function foo(){}\nfunction bar(){}`);
    const node = refactor.findOne(`FunctionDeclaration[name.name="foo"]`) as FunctionDeclaration;
    expect(node.name.name).to.equal('foo');
    function shouldBreak() {
      refactor.findOne(`FunctionDeclaration`);
    }
    expect(shouldBreak).to.throw();
  });
  it('.findParents()', () => {
    const refactor = new RefactorSession(`function foo(){}\nfunction bar(){}`);
    const nodes = refactor.find(`BindingIdentifier`);
    expect(nodes.length).to.equal(2);
    const parents = refactor.findParents(nodes);
    expect(parents.length).to.equal(2);
  });
  it('.findReferences()', () => {
    const refactor = new RefactorSession(`function foo(){}\nfoo();var a = foo();`);
    const fn = refactor.findOne(`FunctionDeclaration[name.name="foo"]`) as FunctionDeclaration;
    expect(refactor.findReferences(fn).length).to.equal(2);
  });
  it('.findDeclarations()', () => {
    const refactor = new RefactorSession(`function foo(){}\nfoo();var a = foo();`);
    const fn = refactor.findOne(`FunctionDeclaration[name.name="foo"]`) as FunctionDeclaration;
    expect(refactor.findDeclarations(fn).length).to.equal(1);
  });
  describe('.findMatchingExpression()', () => {
    it('should find nodes by complete sample source', () => {
      const $script = new RefactorSession(`function foo(){}\nfoo(); a = foo(); b = foo(2); b = foo();`);
      let nodes: Node[] = $script.findMatchingExpression('b = foo()');
      expect(nodes.length).to.equal(1);
      //@ts-ignore blindly poking deeply
      expect(nodes[0]).to.deep.equal($script.first().statements[4].expression);
    });
  });
  describe('.findMatchingStatement()', () => {
    it('should find nodes by complete sample source', () => {
      const $script = new RefactorSession(`function foo(){}\nfoo(); a = foo(); b = foo(2); b = foo();`);
      let nodes = $script.findMatchingStatement('b = foo(2)');
      expect(nodes.length).to.equal(1);
      //@ts-ignore blindly poking deeply
      expect(nodes[0]).to.deep.equal($script.first().statements[3]);
    });
    it('should find nodes by partial sample source', () => {
      const $script = new RefactorSession(`function foo(a,b){ return a+b;}\n function bar(){}`);
      let nodes = $script.findMatchingStatement('function foo(a,b){}');
      expect(nodes.length).to.equal(1);
      //@ts-ignore blindly poking deeply
      expect(nodes[0]).to.deep.equal($script.first().statements[0]);
    });
  });
  it('.queryFrom()', () => {
    let ast = parse(`var a = 2; function foo(){var a = 4}`);
    const refactor = new RefactorSession(ast);
    const nodes = refactor.query(`FunctionDeclaration[name.name="foo"]`);
    const innerNodes = refactor.queryFrom(nodes, `VariableDeclarator[binding.name="a"]`);
    expect(innerNodes.length).to.equal(1);
  });
  describe('.print()', () => {
    it('should print a structurally equivalent program', () => {
      let ast = parse(`var a = 2; function foo(){var a = 4}`);
      const refactor = new RefactorSession(ast);
      const newSource = refactor.print();
      expect(ast).to.deep.equal(parse(newSource));
    });
    it('should take in and print any ast', () => {
      let ast = parse(`var a = 2; function foo(){var a = 4}`);
      const refactor = new RefactorSession(ast);
      const newSource = refactor.print(new LiteralStringExpression({value: 'hi'}));
      expect(newSource).to.equal('"hi"');
    });
  });
  describe('.closest()', () => {
    it('should walk up a tree looking for a matching selector', () => {
      let ast = parse(`var a = 2; function foo(){var b = 4}`);
      const refactor = new RefactorSession(ast);
      const innerBinding = refactor.query('BindingIdentifier[name="b"]');
      const parentStatement = refactor.closest(innerBinding, 'VariableDeclarationStatement');
      expect(parentStatement.length).to.equal(1);
    });
    it('should accept generic Statement|Expression queries', () => {
      let ast = parse(`var a = 2; function foo(){var b = 4}`);
      const refactor = new RefactorSession(ast);
      const innerBinding = refactor.query('BindingIdentifier[name="b"]');
      const parentStatement = refactor.closest(innerBinding, ':statement');
      expect(parentStatement.length).to.equal(1);
    });
    it("should find all selected nodes' parents", () => {
      let ast = parse(`function someFunction() {
        interestingFunction();
        }
        function otherFunction() {
        interestingFunction();
        }`);
      const refactor = new RefactorSession(ast);
      const calls = refactor.query('CallExpression[callee.name="interestingFunction"]');
      const decls = refactor.closest(calls, ':statement');
      expect(decls.length).to.equal(2);
    });
  });
  describe('lookupVariableByName', function() {
    it('should return variables by name', () => {
      let ast = parse(`var a = 2; var b = 3; (function(b){ var a = "foo" }())`);
      const refactor = new RefactorSession(ast);
      const varsA = refactor.globalSession.lookupVariableByName('a');
      expect(varsA).to.be.lengthOf(2);
      const varsB = refactor.globalSession.lookupVariableByName('b');
      expect(varsB).to.be.lengthOf(2);
    });
  });

  it('.lookupVariable() should return variable lookup by Identifier node', () => {
    let ast = parse(`var a = 2; function foo(){var b = 4}`);
    const refactor = new RefactorSession(ast);
    const innerBinding = refactor.query('BindingIdentifier[name="b"]') as BindingIdentifier[];
    const lookup = refactor.globalSession.lookupVariable(innerBinding);
    expect(lookup).to.be.ok;
    expect(lookup.declarations.length).to.equal(1);
  });
  it('.lookupScope() should return variable scope', () => {
    let ast = parse(`var a = 2; function foo(){var b = 4}`);
    const refactor = new RefactorSession(ast);
    const innerBinding = refactor.query('BindingIdentifier[name="b"]') as BindingIdentifier[];
    const lookup = refactor.globalSession.lookupScope(innerBinding) as Scope;
    expect(lookup).to.be.ok;
    expect(lookup.astNode).to.equal(ast.statements[1]);
  });
  it('.cleanup()', () => {
    let ast = parse(``);
    const refactor = new RefactorSession(ast);
    expect(() => refactor.cleanup()).to.not.throw();
  });
});
