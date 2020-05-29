import seedrandom from 'seedrandom';
export interface IdGenerator extends Iterator<string> {
    next(): IteratorResult<string>;
}
export declare class MemorableIdGenerator implements IdGenerator {
    rng: seedrandom.prng;
    constructor(seed?: number);
    randomNoun(): any;
    randomAdjective(): any;
    next(): {
        done: boolean;
        value: string;
    };
    [Symbol.iterator](): Generator<{
        done: boolean;
        value: string;
    }, void, unknown>;
}
export declare class BasicIdGenerator implements IdGenerator {
    alphabet: string;
    reservedWords: Set<string>;
    current: number[];
    constructor(alphabet: string, reservedWords?: string[]);
    next(): {
        done: boolean;
        value: string;
    };
    _increment(): void;
    [Symbol.iterator](): Generator<{
        done: boolean;
        value: string;
    }, void, unknown>;
}
