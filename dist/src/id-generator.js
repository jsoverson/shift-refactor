"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasicIdGenerator = exports.MemorableIdGenerator = void 0;
const { TokenType } = require("shift-parser");
const jsKeywords = Object
    .values(TokenType)
    .filter((_) => _.name && _.klass.name === 'Keyword')
    .map((_) => _.name);
const nouns_1 = __importDefault(require("./nouns"));
const adjectives_1 = __importDefault(require("./adjectives"));
const seedrandom_1 = __importDefault(require("seedrandom"));
class MemorableIdGenerator {
    constructor(seed = 0) {
        this.rng = seedrandom_1.default(seed.toString());
    }
    randomNoun() {
        const index = Math.floor(this.rng() * nouns_1.default.length);
        return nouns_1.default[index];
    }
    randomAdjective() {
        const index = Math.floor(this.rng() * adjectives_1.default.length);
        return adjectives_1.default[index];
    }
    next() {
        const noun = this.randomNoun();
        return {
            done: false,
            value: `${this.randomAdjective()}${noun[0].toUpperCase()}${noun.slice(1)}`
        };
    }
    *[Symbol.iterator]() {
        while (true) {
            yield this.next();
        }
    }
}
exports.MemorableIdGenerator = MemorableIdGenerator;
class BasicIdGenerator {
    constructor(alphabet, reservedWords) {
        this.alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        this.reservedWords = new Set(jsKeywords);
        if (alphabet)
            this.alphabet = alphabet;
        if (reservedWords)
            this.reservedWords = new Set(reservedWords);
        this.current = [-1];
    }
    next() {
        this._increment();
        const nextId = this.current.reduce((acc, code) => acc + this.alphabet[code], "");
        if (!this.reservedWords.has(nextId)) {
            return {
                done: false,
                value: nextId
            };
        }
        else {
            this._increment();
            return {
                done: false,
                value: this.current.reduce((acc, code) => acc + this.alphabet[code], "")
            };
        }
    }
    _increment() {
        for (let i = this.current.length - 1; i >= 0; i--) {
            this.current[i]++;
            if (this.current[i] >= this.alphabet.length) {
                this.current[i] = 0;
            }
            else {
                // if we didn't have to roll over, then return
                return;
            }
        }
        // if we rolled over every character, add one more.
        this.current.unshift(0);
    }
    *[Symbol.iterator]() {
        while (true) {
            yield this.next();
        }
    }
}
exports.BasicIdGenerator = BasicIdGenerator;
;
//# sourceMappingURL=id-generator.js.map