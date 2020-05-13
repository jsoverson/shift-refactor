import { BasicIdGenerator } from "../src/id-generator";

const chai = require("chai");

describe("BasicIdGenerator", function() {
  it("generate sequential identifiers", () => {
    const gen = new BasicIdGenerator("abAB");
    chai.expect(gen.next()).to.equal("a");
    chai.expect(gen.next()).to.equal("b");
    chai.expect(gen.next()).to.equal("A");
    chai.expect(gen.next()).to.equal("B");
    chai.expect(gen.next()).to.equal("aa");
    chai.expect(gen.next()).to.equal("ab");
    chai.expect(gen.next()).to.equal("aA");
    chai.expect(gen.next()).to.equal("aB");
    chai.expect(gen.next()).to.equal("ba");
  });
  it("should skip keywords", () => {
    const gen = new BasicIdGenerator("doD");
    chai.expect(gen.next()).to.equal("d");
    chai.expect(gen.next()).to.equal("o");
    chai.expect(gen.next()).to.equal("D");
    chai.expect(gen.next()).to.equal("dd");
    // skips "do"
    chai.expect(gen.next()).to.equal("dD");
    chai.expect(gen.next()).to.equal("od");
  });
});
