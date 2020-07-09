// Read 'example.js' as text
const fs = require('fs');
const src = fs.readFileSync('example.js', 'utf-8');

const { refactor } = require('.');

// Create a refactor query object
const $script = refactor(src);

// Select all `LiteralStringExpression`s
const $stringNodes = $script('LiteralStringExpression')

// Turn the string AST nodes into real JS strings
const strings = $stringNodes.codegen();

// Output the strings to the console
strings.forEach(string => console.log(string));
