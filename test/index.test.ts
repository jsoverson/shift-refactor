import {expect} from 'chai';
import {describe} from 'mocha';
import {refactor} from '../src/index';

describe('shift-refactor', function() {
  it('should export refactor', () => {
    const $script = refactor(`function foo(){}\nfoo();`);
    expect($script(`FunctionDeclaration[name.name="foo"]`).length).to.equal(1);
  });
});
