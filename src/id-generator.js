
const { TokenType } = require("shift-parser");

const jsKeywords = Object
  .values(TokenType)
  .filter(_ => _.name && _.klass.name === 'Keyword')
  .map(_ => _.name);

exports.IdGenerator = class IdGenerator {
  constructor(
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    reservedWords = jsKeywords
  ) {
    this.alphabet = alphabet;
    this.current = [-1];
    this.reservedWords = new Set(reservedWords);
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
