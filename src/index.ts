import { Node } from 'shift-ast';
import { RefactorSession } from './refactor-session';
import { RefactorSessionChainable } from './refactor-session-chainable';
import pluginUnsafe from './refactor-plugin-unsafe';
import pluginCommon from './refactor-plugin-common';

export { RefactorSession } from './refactor-session';

const API = RefactorSessionChainable.with(pluginUnsafe).with(pluginCommon);

/**
 * Initialization of a RefactorSession via the chainable API
 *
 * @alpha
 */
export function refactor(input: string | Node, { autoCleanup = true } = {}) {
  const globalSession = new RefactorSession(input, { autoCleanup });
  const globalChainable = new API(globalSession);

  function generateQueryFunction(session: RefactorSession) {
    return function $query(selector: string | string[]) {
      const subSession = session.subSession(selector);
      const subChainable = new API(subSession);
      const prototype = Object.getPrototypeOf(subChainable);
      const hybridObject = Object.assign(generateQueryFunction(subSession), subChainable);
      Object.setPrototypeOf(hybridObject, prototype);
      Object.defineProperty(hybridObject, 'length', {
        get() { return subSession.length }
      });
      return hybridObject;
    }
  }
  const prototype = Object.getPrototypeOf(globalChainable);
  const hybridObject = Object.assign(generateQueryFunction(globalSession), globalChainable);
  Object.setPrototypeOf(hybridObject, prototype);
  return hybridObject;
}

