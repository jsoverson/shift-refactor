import chai from "chai";
import { StaticMemberExpression } from "shift-ast";
import { parseScript as parse } from "shift-parser";
import { RefactorSession } from "../src/index";

describe("replaceRecursive", function() {
  it("should replace until the query is empty", () => {
    let ast = parse(`a["b"]["c"]`);
    const refactor = new RefactorSession(ast);
    refactor.replaceRecursive(
      `ComputedMemberExpression[expression.type="LiteralStringExpression"]`,
      (      node: { object: any; expression: { value: any; }; }) =>
        new StaticMemberExpression({
          object: node.object,
          property: node.expression.value
        })
    );
    chai.expect(refactor.ast).to.deep.equal(parse("a.b.c"));
  });
});
