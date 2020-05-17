import { RefactorSession } from ".";
import { RefactorCommonPlugin } from "./refactor-plugin-common";

export abstract class RefactorPlugin {
  abstract name: string;
  session: RefactorSession;

  abstract register(): void;

  constructor(session: RefactorSession) {
    this.session = session;
  };
}