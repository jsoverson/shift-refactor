import { Node } from 'shift-ast';
export declare class RefactorError extends Error {
}
export declare type SelectorOrNode = string | Node | Node[];
export declare type Replacer = Function | Node | string;
