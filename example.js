const fs = require('fs');
const src = fs.readFileSync(__filename, 'utf-8');

const { refactor } = require('.');

const $script = refactor(src);

console.log($script('LiteralStringExpression').codegen());