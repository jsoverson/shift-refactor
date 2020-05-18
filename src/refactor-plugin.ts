import { RefactorSession } from ".";

export abstract class RefactorPlugin {
  session: RefactorSession;

  abstract register(): void;

  constructor(session: RefactorSession) {
    this.session = session;
  };
}