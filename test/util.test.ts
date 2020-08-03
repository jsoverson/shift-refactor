import {expect} from 'chai';
import {StaticMemberExpression} from 'shift-ast';
import {parseScript as parse} from 'shift-parser';
import * as util from '../src/misc/util';

describe('util', function() {
  it('isDeepSimilar', () => {
    let generic = parse(`foo.bar()`);
    let specific = parse(`foo.bar(1,2,3)`);
    expect(util.isDeepSimilar(generic, specific)).to.be.true;
    generic = parse(`foo.bar()`);
    specific = parse(`foo.other()`);
    expect(util.isDeepSimilar(generic, specific)).to.be.false;
    generic = parse(`function decl() {}`);
    specific = parse(`function decl(a,b) {return a+b}`);
    expect(util.isDeepSimilar(generic, specific)).to.be.true;
    generic = parse(`function decl(a,b) {}`);
    specific = parse(`function decl(a,b) {return a+b}`);
    expect(util.isDeepSimilar(generic, specific)).to.be.true;
  });
});
