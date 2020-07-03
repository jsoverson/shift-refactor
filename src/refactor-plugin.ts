import { RefactorSession } from './refactor-session';

export abstract class RefactorPlugin {
  session: RefactorSession;

  abstract register(): void;

  constructor(session: RefactorSession) {
    this.session = session;
  }
}
