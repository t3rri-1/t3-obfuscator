#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { obfuscate } = require('../lib/index.js');

const HELP = `
t3-obfuscator <input.js> [options]

Options:
  -o, --out <file>     Output file (default: <input>.obf.js)
  --no-rename          Skip identifier renaming
  --no-strings         Skip string literal encoding
  --no-numbers         Skip numeric literal obfuscation
  --no-deadcode        Skip decoy dead-code injection
  --layers <n>         Self-decoding wrapper layers, 0-5 (default: 1)
  --seed <n>           Use a numeric seed for reproducible output
  -h, --help           Show this help

Example:
  t3-obfuscator src/app.js -o dist/app.min.js --layers 2
`;

function parseArgs(argv) {
  const opts = { rename: true, strings: true, numbers: true, deadcode: true, layers: 1, seed: null };
  let input = null;
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    else if (a === '-o' || a === '--out') { out = argv[++i]; }
    else if (a === '--no-rename') opts.rename = false;
    else if (a === '--no-strings') opts.strings = false;
    else if (a === '--no-numbers') opts.numbers = false;
    else if (a === '--no-deadcode') opts.deadcode = false;
    else if (a === '--layers') { opts.layers = parseInt(argv[++i], 10); }
    else if (a === '--seed') { opts.seed = parseInt(argv[++i], 10); }
    else if (!a.startsWith('-')) { input = a; }
    else { console.error('Unknown option: ' + a); process.exit(1); }
  }
  return { input, out, opts };
}

function main() {
  const { input, out, opts } = parseArgs(process.argv.slice(2));
  if (!input) { console.log(HELP); process.exit(1); }
  if (!fs.existsSync(input)) { console.error('Input file not found: ' + input); process.exit(1); }
  if (opts.layers < 0 || opts.layers > 5 || Number.isNaN(opts.layers)) {
    console.error('--layers must be between 0 and 5'); process.exit(1);
  }

  const source = fs.readFileSync(input, 'utf8');
  const outPath = out || input.replace(/(\.js)?$/, '.obf.js');

  let result;
  try {
    result = obfuscate(source, opts);
  } catch (err) {
    console.error('Obfuscation failed: ' + err.message);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, result);

  const inSize = Buffer.byteLength(source, 'utf8');
  const outSize = Buffer.byteLength(result, 'utf8');
  console.log(`Wrote ${outPath} (${inSize} -> ${outSize} bytes)`);
  console.log('Test the output before shipping it - see README "Testing your output".');
}

main();
