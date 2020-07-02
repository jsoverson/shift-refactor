const {TokenType} = require('shift-parser');

const jsKeywords = Object.values(TokenType)
  .filter((_: any) => _.name && _.klass.name === 'Keyword')
  .map((_: any) => _.name);

import nouns from './nouns';
import adjectives from './adjectives';

import seedrandom from 'seedrandom';

export interface IdGenerator extends Iterator<string> {
  next(): IteratorResult<string>;
}

export class MemorableIdGenerator implements IdGenerator {
  rng: seedrandom.prng;

  constructor(seed = 0) {
    this.rng = seedrandom(seed.toString());
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

    return {
      done: false,
      value: `${this.randomAdjective()}${noun[0].toUpperCase()}${noun.slice(1)}`,
    };
  }

  *[Symbol.iterator]() {
    while (true) {
      yield this.next();
    }
  }
}

export class BasicIdGenerator implements IdGenerator {
  alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  reservedWords: Set<string> = new Set(jsKeywords);
  current: number[];

  constructor(alphabet: string, reservedWords?: string[]) {
    if (alphabet) this.alphabet = alphabet;
    if (reservedWords) this.reservedWords = new Set(reservedWords);
    this.current = [-1];
  }

  next() {
    this._increment();
    const nextId = this.current.reduce((acc, code) => acc + this.alphabet[code], '');
    if (!this.reservedWords.has(nextId)) {
      return {
        done: false,
        value: nextId,
      };
    } else {
      this._increment();
      return {
        done: false,
        value: this.current.reduce((acc, code) => acc + this.alphabet[code], ''),
      };
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
}
