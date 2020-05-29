import chai from "chai";
import { StaticMemberExpression } from "shift-ast";
import { parseScript as parse } from "shift-parser";
import * as util from "../src/util";

describe("util", function() {
  it("isDeepSimilar", () => {
    let generic = parse(`foo.bar()`);
    let specific = parse(`foo.bar(1,2,3)`);
    chai.expect(util.isDeepSimilar(generic, specific)).to.be.true;
    generic = parse(`foo.bar()`);
    specific = parse(`foo.other()`);
    chai.expect(util.isDeepSimilar(generic, specific)).to.be.false;
  });
});
