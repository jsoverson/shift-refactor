import {Node} from 'shift-ast';

export class RefactorError extends Error {}

export type SelectorOrNode = string | Node | Node[];

export type Replacer = Function | Node | string;
