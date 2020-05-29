import { RefactorSession } from ".";
export declare abstract class RefactorPlugin {
    session: RefactorSession;
    abstract register(): void;
    constructor(session: RefactorSession);
}
