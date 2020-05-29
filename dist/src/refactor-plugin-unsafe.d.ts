import { RefactorPlugin } from "./refactor-plugin";
import { PureFunctionAssessmentOptions } from "./pure-functions";
declare module "." {
    interface RefactorSession {
        unsafe: RefactorUnsafePlugin;
    }
}
export declare class RefactorUnsafePlugin extends RefactorPlugin {
    register(): void;
    findPureFunctionCandidates(options?: PureFunctionAssessmentOptions): Map<unknown, unknown>;
    massRename(namePairs: string[][]): void;
    inlineLiterals(): void;
    removeDeadVariables(): this;
}
