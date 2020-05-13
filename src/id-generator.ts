
const { TokenType } = require("shift-parser");

const jsKeywords = Object
  .values(TokenType)
  .filter((_:any) => _.name && _.klass.name === 'Keyword')
  .map((_:any) => _.name);

const nouns = require('./nouns');
const adjectives = require('./adjectives');
const seedrandom = require('seedrandom');

export class IdGenerator {
  rng: seedrandom.prng;

  constructor(seed = 0) {
    this.rng = seedrandom(0);
  
  }

  randomNoun() {
    const index = Math.floor(this.rng() * nouns.length);
    return nouns[index];
  }

  randomAdjective() {
    const index = Math.floor(this.rng() * adjectives.length);
    return adjectives[index];
  }

  next() {
    const noun = this.randomNoun();

    return `${this.randomAdjective()}${noun[0].toUpperCase()}${noun.slice(1)}`;
  }

  *[Symbol.iterator]() {
    while (true) {
      yield this.next();
    }
  }
}

export class BasicIdGenerator {
  alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  reservedWords: Set<string> = new Set(jsKeywords);
  current: number[];
  
  constructor(alphabet: string, reservedWords?: string[]) {
    if (alphabet) this.alphabet = alphabet;
    if (reservedWords) this.reservedWords = new Set(reservedWords);
    this.current = [-1];
  }

  next() {
    this._increment();
    const nextId = this.current.reduce((acc, code) => acc + this.alphabet[code], "");
    if (!this.reservedWords.has(nextId)) {
      return nextId;
    } else {
      this._increment();
      return this.current.reduce((acc, code) => acc + this.alphabet[code], "");
    }
  }

  _increment() {
    for (let i = this.current.length - 1; i >= 0; i--) {
      this.current[i]++;
      if (this.current[i] >= this.alphabet.length) {
        this.current[i] = 0;
      } else {
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
};
