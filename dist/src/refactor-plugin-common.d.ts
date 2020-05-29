import { IdGenerator } from "./id-generator";
import { RefactorPlugin } from "./refactor-plugin";
import { SelectorOrNode } from "./types";
declare module "." {
    interface RefactorSession {
        common: RefactorCommonPlugin;
    }
}
export declare class RefactorCommonPlugin extends RefactorPlugin {
    register(): void;
    compressConditonalExpressions(): void;
    compressCommaOperators(): void;
    convertComputedToStatic(): this;
    unshorten(selector: SelectorOrNode): this;
    expandBoolean(): this;
    normalizeIdentifiers(seed?: number, _Generator?: new (seed: number) => IdGenerator): this;
}
