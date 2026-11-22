'use strict';
const { tokenize, isTrivia } = require('./lexer.js');
const { computeRenameMap, applyRenames } = require('./core.js');
const { transformStrings } = require('./strings.js');
const { transformNumbers } = require('./numbers.js');
const { generateDeadCode } = require('./deadcode.js');
const { wrap } = require('./wrap.js');
const { makeNameGenerator, makeRng } = require('./names.js');

function isWordChar(c) { return /[A-Za-z0-9_$]/.test(c); }
const RISKY_PAIRS = new Set([
  '++', '--', '//', '/*', '**', '&&', '||', '??', '==', '<=', '>=', '=>',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '=='
]);
function needsSeparator(a, b) {
  if (isWordChar(a) && isWordChar(b)) return true;
  if (RISKY_PAIRS.has(a + b)) return true;
  return false;
}

// Strips comments and normalizes whitespace within lines while preserving
// every original newline exactly (newlines are the only thing ASI cares
// about, so we never touch them).
function assemble(tokens) {
  let result = '';
  let lastChar = '';
  for (const t of tokens) {
    let piece;
    if (t.type === 'LineComment' || t.type === 'BlockComment') {
      piece = '';
    } else if (t.type === 'Whitespace') {
      piece = ' ';
    } else {
      piece = t.value;
    }
    if (piece === '') continue;
    const firstChar = piece[0];
    if (lastChar && needsSeparator(lastChar, firstChar)) result += ' ';
    result += piece;
    lastChar = piece[piece.length - 1];
  }
  return result;
}

function collectExistingIdentifiers(tokens) {
  const set = new Set();
  for (const t of tokens) if (t.type === 'Identifier') set.add(t.value);
  return set;
}

function obfuscate(source, options) {
  const opts = Object.assign({
    rename: true,
    strings: true,
    numbers: true,
    deadcode: true,
    layers: 1,
    seed: null
  }, options || {});

  const tokens = tokenize(source);
  const rand = makeRng(opts.seed);
  const nextName = makeNameGenerator(collectExistingIdentifiers(tokens));
  const genOpts = { rand, nextName };

  if (opts.rename) {
    const renameMap = computeRenameMap(tokens, nextName);
    applyRenames(tokens, renameMap);
  }

  let stringHeader = '';
  if (opts.strings) {
    stringHeader = transformStrings(tokens, genOpts);
  }

  if (opts.numbers) {
    transformNumbers(tokens, genOpts);
  }

  let body = assemble(tokens);
  body = stringHeader + body;

  if (opts.deadcode) {
    body = generateDeadCode(genOpts) + body;
  }

  const layers = Math.max(0, Number(opts.layers) || 0);
  if (layers > 0) {
    body = wrap(body, genOpts, layers);
  }

  return body;
}

module.exports = { obfuscate };
