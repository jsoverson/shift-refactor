import { expect } from 'chai';
import {
  LiteralStringExpression,
  Node,
  DebuggerStatement,
  IdentifierExpression,
  StaticMemberExpression,
} from 'shift-ast';
import { parseScript as parse, parseScript } from 'shift-parser';
import { RefactorSession, $r } from '../src/index';
import { RefactorError } from '../src/types';
import { describe } from 'mocha';
//@ts-ignore VSCode bug? VSC is complaining about this import but TypeScript is fine with it.
import { Scope } from 'shift-scope';

describe('shift-refactor', function () {
  it('$r (beta)', () => {
    const $script = $r(`function foo(){}\nfoo();`);
    const nodes = $script(`FunctionDeclaration[name.name="foo"]`);
    expect(nodes.length).to.equal(1);
  });

  it('RefactorSession', () => {
    const $script = new RefactorSession(`function foo(){}\nfoo();`);
    const nodes = $script.query(`FunctionDeclaration[name.name="foo"]`);
    expect(nodes.length).to.equal(1);
  });

  xdescribe('chainable interface', () => {
    it('should be able to take a single source as input', () => {
      const src = `function foo(){}\nfoo();`;
      const printedSource = $r(src).print();
      expect(parse(printedSource)).to.deep.equal(parse(src));
    });
    it('every return value should be a query function scoped to the child node', () => {
      const src = `idExp;function foo(){}\nfoo();`;
      const $script = $r(src);
      const $child = $script('CallExpression');
      expect($child.length).to.equal(1);
      expect($child[0].type).to.equal('CallExpression');
      const $args = $child('IdentifierExpression');
      expect($args.length).to.equal(1);
      expect($args[0].type).to.equal('IdentifierExpression');
    })
  })

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
        expect(refactor.ast).to.deep.equal(parse('foo();'));
      });
      it('should accept actual nodes', () => {
        let ast = parse(`function foo(){}\nfoo();`);
        const refactor = new RefactorSession(ast);
        refactor.delete(ast.statements[0]);
        expect(refactor.ast).to.deep.equal(parse('foo();'));
      });
    });
    describe('insert', function () {
      describe('insertBefore', () => {
        it('should insert statement before', () => {
          let ast = parse(`function foo(){}\nfoo();`);
          const refactor = new RefactorSession(ast);
          refactor.insertBefore(`[expression.callee.name="foo"]`, `console.log(0)`);
          expect(refactor.ast).to.deep.equal(parse('function foo(){}\nconsole.log(0);\nfoo();'));
        });
        it('should accept a function that has access to the nodes queried', () => {
          let ast = parse(`function foo(){}\nfoo();`);
          const refactor = new RefactorSession(ast);
          refactor.insertBefore(
            `ExpressionStatement[expression.type="CallExpression"]`,
            (node: { expression: { callee: { name: any } } }) => `console.log("Calling ${node.expression.callee.name}()")`,
          );
          expect(refactor.ast).to.deep.equal(parse('function foo(){}\nconsole.log("Calling foo()");\nfoo();'));
        });
        it('should accept a function that returns a shift type', () => {
          let ast = parse(`function foo(){}\nfoo();`);
          const refactor = new RefactorSession(ast);
          refactor.insertBefore(`ExpressionStatement[expression.type="CallExpression"]`, () => new DebuggerStatement());
          expect(refactor.ast).to.deep.equal(parse('function foo(){}\ndebugger;\nfoo();'));
        });
        it('should fail with an error if you try to insert an expression', () => {
          let ast = parse(`function foo(){}\nfoo();`);
          const refactor = new RefactorSession(ast);
          const shouldThrow = () => {
            refactor.insertBefore(
              `ExpressionStatement[expression.type="CallExpression"]`,
              () => new IdentifierExpression({ name: 'breaks' }),
            );
          };
          expect(shouldThrow).to.throw(RefactorError);
        });
        it('should fail with an error if you query anything other than a statement or declaration', () => {
          let ast = parse(`function foo(){}\nfoo();`);
          const refactor = new RefactorSession(ast);
          const shouldThrow = () => {
            refactor.insertBefore(`IdentifierExpression`, `shouldNotMatter()`);
          };
          expect(shouldThrow).to.throw(RefactorError);
        });
      });
      describe('insertAfter', () => {
        it('should insert statements after', () => {
          let ast = parse(`function foo(){}\nfunction bar(){}\nfoo();`);
          const refactor = new RefactorSession(ast);
          refactor.insertAfter(`FunctionDeclaration`, `console.log(0)`);
          expect(refactor.ast)
            .to.deep.equal(parse('function foo(){}\nconsole.log(0)\nfunction bar(){}\nconsole.log(0)\nfoo();'));
        });
      });
    });
    describe('rename', function () {
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
        const declarator = refactor.query('VariableDeclarator[binding.name="a"]');
        refactor.rename(declarator[0].binding, 'renamed');
        expect(ast).to.deep.equal(parse('const renamed=2,b=3;renamed++;b++'));
      });
    });

    describe('replaceAsync', () => {
      it('should replace nodes with Node instances', async () => {
        let $script = $r(`foo(a)`);
        await $script.replaceAsync(
          `IdentifierExpression[name="a"]`,
          async (node: any) => await new IdentifierExpression({ name: 'b' }),
        );
        expect($script.ast).to.deep.equal(parse('foo(b)'));
      });

      it('should accept same nodes and move on without changes', async () => {
        let $script = $r(`foo(a)`);
        await $script.replaceAsync(`IdentifierExpression[name="a"]`, async (node: any) => node);
        expect($script.ast).to.deep.equal(parse('foo(a)'));
        //@ts-ignore
        expect($script.ast.statements[0].expression.arguments[0]).to.equal($script.ast.statements[0].expression.arguments[0]);
      });
    });

    describe('replace', function () {
      it('should replace statements', () => {
        let ast = parse(`function foo(){}\nfoo();`);
        const refactor = new RefactorSession(ast);
        refactor.replace(`FunctionDeclaration[name.name="foo"]`, `console.log(0)`);
        expect(refactor.ast).to.deep.equal(parse('console.log(0);foo();'));
      });
      it('should replace expressions', () => {
        let ast = parse(`foo(a)`);
        const refactor = new RefactorSession(ast);
        refactor.replace(`IdentifierExpression[name="a"]`, `bar()`);
        expect(refactor.ast).to.deep.equal(parse('foo(bar())'));
      });
      it('should accept a node list as a replacement', () => {
        let ast = parse(`foo(a)`);
        const refactor = new RefactorSession(ast);
        const callExpressions = refactor.query('CallExpression');
        refactor.replace(callExpressions, '`foo`');
        expect(refactor.ast).to.deep.equal(parse('`foo`'));
      });
      it('should be able to pass a function in to replace', () => {
        let ast = parse(`foo(a)`);
        const refactor = new RefactorSession(ast);
        refactor.replace(
          `IdentifierExpression[name="a"]`,
          (node: { name: string }) => new IdentifierExpression({ name: node.name + 'b' }),
        );
        expect(refactor.ast).to.deep.equal(parse('foo(ab)'));
      });

      it('should throw on an async replacement function', () => {
        let ast = parse(`foo(a)`);
        const refactor = new RefactorSession(ast);
        const fn = () => {
          refactor.replace(
            `IdentifierExpression[name="a"]`,
            async (node: any) => await new IdentifierExpression({ name: 'b' }),
          );
        };
        expect(fn).to.throw();
      });

      it('should accept source containing a lone string from a passed function (catch directive case)', () => {
        let ast = parse(`foo(a)`);
        const refactor = new RefactorSession(ast);
        refactor.replace(`IdentifierExpression[name="a"]`, (node: { name: any }) => `"${node.name}"`);
        expect(refactor.ast).to.deep.equal(parse("foo('a')"));
      });
      it('should accept raw source from a passed function to replace expressions', () => {
        let ast = parse(`foo(a)`);
        const refactor = new RefactorSession(ast);
        refactor.replace(`IdentifierExpression[name="a"]`, (node: any) => `true`);
        expect(refactor.ast).to.deep.equal(parse('foo(true)'));
      });
      it('should accept raw source from a passed function to replace statements', () => {
        let ast = parse(`a;foo(a);b;`);
        const refactor = new RefactorSession(ast);
        refactor.replace(`ExpressionStatement[expression.type="CallExpression"]`, (node: any) => `console.log(test)`);
        expect(refactor.ast).to.deep.equal(parse('a;console.log(test);b;'));
      });
    });

    describe('replaceRecursive', function () {
      it('should replace until the query is empty', () => {
        let ast = parse(`a["b"]["c"]`);
        const refactor = new RefactorSession(ast);
        refactor.replaceRecursive(
          `ComputedMemberExpression[expression.type="LiteralStringExpression"]`,
          (node: { object: any; expression: { value: any } }) =>
            new StaticMemberExpression({
              object: node.object,
              property: node.expression.value,
            }),
        );
        expect(refactor.ast).to.deep.equal(parse('a.b.c'));
      });
    });

    it('.debug()', () => {
      const refactor = new RefactorSession(`b = _ => foo(); c = _ => {bar()}; a.x = function(){b();c();}`);
      refactor.common.debug(`FunctionExpression, ArrowExpression`);
      expect(refactor.ast)
        .to.deep.equal(
          parseScript(
            'b = _ => {debugger; return foo()}; c = _ => {debugger; bar()}; a.x = function(){debugger;b();c();}',
          ),
        );
    });
    it('.findOne()', () => {
      const refactor = new RefactorSession(`function foo(){}\nfunction bar(){}`);
      const node = refactor.findOne(`FunctionDeclaration[name.name="foo"]`);
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
      const fn = refactor.findOne(`FunctionDeclaration[name.name="foo"]`);
      expect(refactor.findReferences(fn).length).to.equal(2);
    });
    it('.findDeclarations()', () => {
      const refactor = new RefactorSession(`function foo(){}\nfoo();var a = foo();`);
      const fn = refactor.findOne(`FunctionDeclaration[name.name="foo"]`);
      expect(refactor.findDeclarations(fn).length).to.equal(1);
    });
    it('should find nodes by sample source', () => {
      const $script = $r(`function foo(){}\nfoo(); a = foo(); b = foo(2); b = foo();`);
      let nodes: Node[] = $script.findMatchingExpression('b = foo()');
      expect(nodes.length).to.equal(1);
      //@ts-ignore
      expect(nodes[0]).to.deep.equal($script.ast.statements[4].expression);
      nodes = $script.findMatchingStatement('b = foo()');
      expect(nodes.length).to.equal(1);
      //@ts-ignore
      expect(nodes[0]).to.deep.equal($script.ast.statements[4]);
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
        const newSource = refactor.print(new LiteralStringExpression({ value: 'hi' }));
        expect(newSource).to.equal('"hi"');
      });
    })
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
    })
    describe('lookupVariableByName', function () {
      it('should return variables by name', () => {
        let ast = parse(`var a = 2; var b = 3; (function(b){ var a = "foo" }())`);
        const refactor = new RefactorSession(ast);
        const varsA = refactor.lookupVariableByName('a');
        expect(varsA).to.be.lengthOf(2);
        const varsB = refactor.lookupVariableByName('b');
        expect(varsB).to.be.lengthOf(2);
      });
    });

    it('.lookupVariable() should return variable lookup by Identifier node', () => {
      let ast = parse(`var a = 2; function foo(){var b = 4}`);
      const refactor = new RefactorSession(ast);
      const innerBinding = refactor.query('BindingIdentifier[name="b"]');
      const lookup = refactor.lookupVariable(innerBinding);
      expect(lookup).to.be.ok;
      expect(lookup.declarations.length).to.equal(1);
    });
    it('.lookupScope() should return variable scope', () => {
      let ast = parse(`var a = 2; function foo(){var b = 4}`);
      const refactor = new RefactorSession(ast);
      const innerBinding = refactor.query('BindingIdentifier[name="b"]');
      const lookup = refactor.lookupScope(innerBinding) as Scope;
      expect(lookup).to.be.ok;
      expect(lookup.astNode).to.equal(ast.statements[1]);
    });
    it('.cleanup()', () => {
      let ast = parse(``);
      const refactor = new RefactorSession(ast);
      expect(() => refactor.cleanup).to.not.throw();
    });
  });
});
