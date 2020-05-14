import { RefactorSession } from "../src/index";
import { parseScript as parse } from "shift-parser";

import chai from "chai";
import { LiteralStringExpression } from "shift-ast";

describe("API", function() {
  it("should expose.query()", () => {
    const refactor = new RefactorSession(`function foo(){}\nfoo();`);
    const nodes = refactor.query(`FunctionDeclaration[name.name="foo"]`);
    chai.expect(nodes.length).to.equal(1);
  });
  it("should expose .parse()", () => {
    const src = `var a = 2; function foo(){var a = 4}`;
    const ast = parse(src);
    const r_ast = RefactorSession.parse(src);
    chai.expect(r_ast).to.deep.equal(ast);
  });
  it("should expose .queryFrom()", () => {
    let ast = parse(`var a = 2; function foo(){var a = 4}`);
    const refactor = new RefactorSession(ast);
    const nodes = refactor.query(`FunctionDeclaration[name.name="foo"]`);
    const innerNodes = refactor.queryFrom(
      nodes,
      `VariableDeclarator[binding.name="a"]`
    );
    chai.expect(innerNodes.length).to.equal(1);
  });
  it("should expose .print()", () => {
    let ast = parse(`var a = 2; function foo(){var a = 4}`);
    const refactor = new RefactorSession(ast);
    const newSource = refactor.print();
    chai.expect(ast).to.deep.equal(parse(newSource));
  });
  it(".print() should take any ast", () => {
    let ast = parse(`var a = 2; function foo(){var a = 4}`);
    const refactor = new RefactorSession(ast);
    const newSource = refactor.print(new LiteralStringExpression({value:"hi"}));
    chai.expect(newSource).to.equal('"hi"');
  });
  it(".closest() should walk up a tree looking for a matching selector", () => {
    let ast = parse(`var a = 2; function foo(){var b = 4}`);
    const refactor = new RefactorSession(ast);
    const innerBinding = refactor.query('BindingIdentifier[name="b"]');
    const parentStatement = refactor.closest(innerBinding, 'VariableDeclarationStatement');
    chai.expect(parentStatement.length).to.equal(1);
  });
  it(".lookupVariable() should return variable lookup by Identifier node", () => {
    let ast = parse(`var a = 2; function foo(){var b = 4}`);
    const refactor = new RefactorSession(ast);
    const innerBinding = refactor.query('BindingIdentifier[name="b"]');
    const lookup = refactor.lookupVariable(innerBinding);
    chai.expect(lookup).to.be.ok; 
    chai.expect(lookup.declarations.length).to.equal(1);
  });
  it(".lookupScope() should return variable scope", () => {
    let ast = parse(`var a = 2; function foo(){var b = 4}`);
    const refactor = new RefactorSession(ast);
    const innerBinding = refactor.query('BindingIdentifier[name="b"]');
    const lookup = refactor.lookupScope(innerBinding);
    chai.expect(lookup).to.be.ok; 
    chai.expect(lookup.astNode).to.equal(ast.statements[1]);
  });
  it("should expose .cleanup()", () => {
    let ast = parse(``);
    const refactor = new RefactorSession(ast);
    chai.expect(() => refactor.cleanup).to.not.throw();
  });
});
