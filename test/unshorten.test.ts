import { RefactorSession } from "../src/index";
import { parseScript as parse } from "shift-parser";
import Shift from 'shift-ast';

import chai from "chai";

describe("unshorten", function() {
  it("should unshorten variable declarations", () => {
    let ast = parse(`let a=2,r=require;r()`);
    const refactor = new RefactorSession(ast);
    refactor.unshorten(`VariableDeclarator[init.name="require"]`);
    chai.expect(refactor.ast).to.deep.equal(parse("let a=2;require()"));
  });
});
