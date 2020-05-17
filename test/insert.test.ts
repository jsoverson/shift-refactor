import chai from "chai";
import { DebuggerStatement, IdentifierExpression } from "shift-ast";
import { parseScript as parse } from "shift-parser";
import { RefactorSession } from "../src/index";
import { RefactorError } from "../src/types";


describe("insert", function() {
  describe("insertBefore", () => {
    it("should insert statement before", () => {
      let ast = parse(`function foo(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      refactor.insertBefore(`[expression.callee.name="foo"]`, `console.log(0)`);
      chai
        .expect(refactor.ast)
        .to.deep.equal(parse("function foo(){}\nconsole.log(0);\nfoo();"));
    });
    it("should accept a function that has access to the nodes queried", () => {
      let ast = parse(`function foo(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      refactor.insertBefore(
        `ExpressionStatement[expression.type="CallExpression"]`,
        (node: { expression: { callee: { name: any; }; }; }) => `console.log("Calling ${node.expression.callee.name}()")`
      );
      chai
        .expect(refactor.ast)
        .to.deep.equal(
          parse('function foo(){}\nconsole.log("Calling foo()");\nfoo();')
        );
    });
    it("should accept a function that returns a shift type", () => {
      let ast = parse(`function foo(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      refactor.insertBefore(
        `ExpressionStatement[expression.type="CallExpression"]`,
        () => new DebuggerStatement()
      );
      chai
        .expect(refactor.ast)
        .to.deep.equal(parse("function foo(){}\ndebugger;\nfoo();"));
    });
    it("should fail with an error if you try to insert an expression", () => {
      let ast = parse(`function foo(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      const shouldThrow = () => {
        refactor.insertBefore(
          `ExpressionStatement[expression.type="CallExpression"]`,
          () => new IdentifierExpression({ name: "breaks" })
        );
      };
      chai.expect(shouldThrow).to.throw(RefactorError);
    });
    it("should fail with an error if you query anything other than a statement or declaration", () => {
      let ast = parse(`function foo(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      const shouldThrow = () => {
        refactor.insertBefore(`IdentifierExpression`, `shouldNotMatter()`);
      };
      chai.expect(shouldThrow).to.throw(RefactorError);
    });
  });
  describe("insertAfter", () => {
    it("should insert statements after", () => {
      let ast = parse(`function foo(){}\nfunction bar(){}\nfoo();`);
      const refactor = new RefactorSession(ast);
      refactor.insertAfter(`FunctionDeclaration`, `console.log(0)`);
      chai
        .expect(refactor.ast)
        .to.deep.equal(
          parse(
            "function foo(){}\nconsole.log(0)\nfunction bar(){}\nconsole.log(0)\nfoo();"
          )
        );
    });
  });
});
