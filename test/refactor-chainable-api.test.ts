import {expect} from 'chai';
import {describe} from 'mocha';
import {parseScript} from 'shift-parser';
import {refactor} from '../src/refactor-session-chainable';
import {LiteralNumericExpression, Script, LiteralStringExpression} from 'shift-ast';

function parse(src: string): Script {
  return parseScript(src);
}

// A lot of these tests have been moved to inline in the documentation.

describe('chainable interface', () => {
  it('should be able to take a single source as input', () => {
    const src = `function foo(){}\nfoo();`;
    const printedSource = refactor(src).print();
    expect(parse(printedSource)).to.deep.equal(parse(src));
  });

  it('every return value should be a query function scoped to the child node', () => {
    const src = `idExp;function foo(){}\nfoo();`;
    const $script = refactor(src);
    const $rootIds = $script('IdentifierExpression');
    expect($rootIds.length).to.equal(2);
    const $child = $script('CallExpression');
    expect($child.length).to.equal(1);
    expect($child.raw().type).to.equal('CallExpression');
    const $idExpr = $child('IdentifierExpression');
    expect($idExpr.length).to.equal(1);
    expect($idExpr.raw().type).to.equal('IdentifierExpression');
  });
  it('should support chaining across methods that return nodes', () => {
    const src = `b(1);`;
    const $script = refactor(src);
    $script('CallExpression')
      .closest(':statement')
      .prepend(`a()`);

    expect($script.root).to.deep.equal(parse(`a();b(1);`));
  });
  it('should have .forEach to iterate over nodes', () => {
    const src = `var a = [1,2,3,4]`;
    const $script = refactor(src);
    $script('LiteralNumericExpression').forEach((node: LiteralNumericExpression) => {
      node.value *= 2;
    });
    expect($script.root).to.deep.equal(parse(`var a = [2,4,6,8]`));
  });
  it('should have .find to select nodes via an iterator', () => {
    const src = `const myMessage = "He" + "llo" + " " + "World"`;
    const $script = refactor(src);
    const worldNode = $script('LiteralStringExpression').find(
      (node: LiteralStringExpression) => node.value === 'World',
    );
    expect(worldNode.length).to.equal(1);
    worldNode.replace('"Reader"');
    expect($script.root).to.deep.equal(parse(`const myMessage = "He" + "llo" + " " + "Reader"`));
  });
  it('.closest() should find the closest selector for all selected nodes', () => {
    const src = `function someFunction() {
      interestingFunction();
      }
      function otherFunction() {
      interestingFunction();
      }`;
    const $script = refactor(src);
    const fnDecls = $script('CallExpression[callee.name="interestingFunction"]').closest('FunctionDeclaration');
    expect(fnDecls.length).to.equal(2);
  });

  it('should allow first() to be run with a selector', () => {
    const src = `idExp = () => {function notThisOne(){}}\nfunction foo(){}\nfoo();`;
    const $s = refactor(src);
    const rootStatements = $s.statements();
    const firstFn = rootStatements.first('FunctionDeclaration').raw();
    expect(firstFn.type).to.equal('FunctionDeclaration');
    expect($s(firstFn).nameString()).to.equal('foo');
  });

  it('statements should also get .body.statements', () => {
    const src = `try { var foo = 1; } catch(e){}`;
    const $s = refactor(src);
    const innerStatements = $s(
      $s
        .statements()
        .first('TryCatchStatement')
        .raw(),
    ).statements();
    expect(innerStatements.length).to.equal(1);
    expect(innerStatements.raw().type).to.equal('VariableDeclarationStatement');
    expect(
      refactor(`!(function(){foo();}())`)('FunctionExpression')
        .statements()
        .raw().type,
    ).to.equal('ExpressionStatement');
  });

  describe('methods w/o arguments', () => {
    it('.delete() should delete self', () => {
      const src = `idExp;function foo(){}\nfoo();`;
      const $script = refactor(src);
      $script('ExpressionStatement[expression.type="CallExpression"]').delete();
      expect($script.root).to.deep.equal(parse(`idExp;function foo(){}`));
    });
    it('.replace() should replace self', () => {
      const src = `idExp;function foo(){}\nfoo();`;
      const $script = refactor(src);
      $script('ExpressionStatement[expression.type="CallExpression"]').replace(`bar();`);
      expect($script.root).to.deep.equal(parse(`idExp;function foo(){}\nbar()`));
    });
  });
});
