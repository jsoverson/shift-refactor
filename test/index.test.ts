import { expect } from 'chai';
import { describe } from 'mocha';
import { refactor, RefactorSession } from '../src/index';

describe('shift-refactor', function () {
  it('should export refactor', () => {
    const $script = refactor(`function foo(){}\nfoo();`);
    expect($script(`FunctionDeclaration[name.name="foo"]`).length).to.equal(1);
  });

  it('should export RefactorSession', () => {
    const session = new RefactorSession(`function foo(){}\nfoo();`);
    const nodes = session.query(`FunctionDeclaration[name.name="foo"]`);
    expect(nodes.length).to.equal(1);
  });

});
