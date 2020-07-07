const { TokenType } = require('shift-parser');

const jsKeywords = Object.values(TokenType)
  .filter((_: any) => _.name && _.klass.name === 'Keyword')
  .map((_: any) => _.name);

import nouns from './nouns';
import adjectives from './adjectives';

import seedrandom from 'seedrandom';

export class BaseIdGenerator implements Iterator<string> {
  next() {
    return {
      done: false,
      value: ``,
    };
  }

  *[Symbol.iterator]() {
    while (true) {
      yield this.next();
    }
  }
}

export class MemorableIdGenerator extends BaseIdGenerator {
  rng: seedrandom.prng;

  constructor(seed = 0) {
    super();
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
