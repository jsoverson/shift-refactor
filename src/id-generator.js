exports.IdGenerator = class IdGenerator {
  constructor(
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
  ) {
    this.alphabet = alphabet;
    this.current = [-1];
    this.reservedJSKeywords = new Set([
      'break',
      'do',
      'in',
      'typeof',
      'case',
      'else',
      'instanceof',
      'var',
      'catch',
      'export',
      'new',
      'void',
      'class',
      'extends',
      'return',
      'while',
      'const',
      'finally',
      'super',
      'with',
      'continue',
      'for',
      'switch',
      'yield',
      'debugger',
      'function',
      'this',
      'default',
      'if',
      'throw',
      'delete',
      'import',
      'try'
    ]);
  }

  next() {
    this._increment();
    const nextId = this.current.reduce((acc, code) => acc + this.alphabet[code], "");
    if (!this.reservedJSKeywords.has(nextId)) {
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
