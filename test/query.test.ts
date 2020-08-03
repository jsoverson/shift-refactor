import {expect} from 'chai';
import {Node} from 'shift-ast';
import {parseScript} from 'shift-parser';
import {query} from '../src/misc/query';

const trees: Node[] = [parseScript('a = 1;'), parseScript('b = 2;'), parseScript('c(a);'), parseScript('d(b);')];

describe('query', function() {
  it('should take in 1 node and 1 query', () => {
    const nodes = query(trees[0], 'ExpressionStatement');
    expect(nodes.length).to.equal(1);
  });
  it('should take in * nodes and 1 query', () => {
    const nodes = query(trees, 'ExpressionStatement');
    expect(nodes.length).to.equal(4);
  });
  it('should take in 1 node and * queries', () => {
    const nodes = query(trees[0], ['ExpressionStatement', 'LiteralNumericExpression']);
    expect(nodes.length).to.equal(2);
  });
  it('should take in * nodes and * queries', () => {
    const nodes = query(trees, [':statement', ':expression']);
    expect(nodes.length).to.equal(4 + 10);
  });
});
