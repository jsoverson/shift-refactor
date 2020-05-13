import { RefactorSession } from "../src/index";
import { parseScript as parse } from "shift-parser";
import Shift from 'shift-ast';

import chai from "chai";

describe("rename", function() {
  it("rename function declarations", () => {
    let ast = parse(`function foo(){}\nfoo();`);
    const refactor = new RefactorSession(ast);
    refactor.rename(
      `FunctionDeclaration > BindingIdentifier[name="foo"]`,
      "bar"
    );
    chai.expect(ast).to.deep.equal(parse("function bar(){}\nbar();"));
  });
  it("rename function calls", () => {
    let ast = parse(`function foo(){}\nfoo();`);
    const refactor = new RefactorSession(ast);
    refactor.rename(`IdentifierExpression[name="foo"]`, "bar");
    chai.expect(ast).to.deep.equal(parse("function bar(){}\nbar();"));
  });
  it("rename BindingIdentifiers", () => {
    let ast = parse(`const a=2,b=3;a++;b++`);
    const refactor = new RefactorSession(ast);
    refactor.rename(`BindingIdentifier[name="a"]`, "renamed");
    chai.expect(ast).to.deep.equal(parse("const renamed=2,b=3;renamed++;b++"));
  });
  it("should be able to consume VariableDeclarators", () => {
    let ast = parse(`const a=2,b=3;a++;b++`);
    const refactor = new RefactorSession(ast);
    refactor.rename(`[binding.name="a"][init.value=2]`, "renamed");
    chai.expect(ast).to.deep.equal(parse("const renamed=2,b=3;renamed++;b++"));
  });
  it("should be able to consume nodes directly", () => {
    let ast = parse(`const a=2,b=3;a++;b++`);
    const refactor = new RefactorSession(ast);
    const declarator = refactor.query('VariableDeclarator[binding.name="a"]');
    refactor.rename(declarator[0].binding, "renamed");
    chai.expect(ast).to.deep.equal(parse("const renamed=2,b=3;renamed++;b++"));
  });
});
