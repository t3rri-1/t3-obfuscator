'use strict';
const { prevSigIdx, nextSigIdx } = require('./core.js');

const PLAIN_INT = /^[0-9]+$/;
const MAX_SAFE_FOR_XOR = 2 ** 31 - 1;

function isUnsafePosition(tokens, idx) {
  const p = prevSigIdx(tokens, idx);
  const n = nextSigIdx(tokens, idx);
  const precededByBraceOrComma = p !== -1 && tokens[p].type === 'Punctuator' && (tokens[p].value === '{' || tokens[p].value === ',');
  const followedByColon = n !== -1 && tokens[n].type === 'Punctuator' && tokens[n].value === ':';
  const followedByParen = n !== -1 && tokens[n].type === 'Punctuator' && tokens[n].value === '(';
  if (precededByBraceOrComma && followedByColon) return true; // numeric object/class key
  if (followedByParen) return true; // numeric computed method name shorthand, e.g. {5(){}}
  if (p !== -1 && tokens[p].type === 'Punctuator' && tokens[p].value === '.') return true; // defensive
  return false;
}

function transformNumbers(tokens, opts) {
  const rand = opts.rand;
  let changed = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'Number') continue;
    if (!PLAIN_INT.test(t.value)) continue; // skip hex/octal/binary/float/exponent/BigInt/separators
    const num = Number(t.value);
    if (!Number.isSafeInteger(num) || num > MAX_SAFE_FOR_XOR || num < 0) continue;
    if (isUnsafePosition(tokens, i)) continue;

    const a = Math.floor(rand() * MAX_SAFE_FOR_XOR);
    const b = (a ^ num) >>> 0;
    t.value = `(${a}^${b})`;
    t.type = 'Punctuator';
    changed = true;
  }
  return changed;
}

module.exports = { transformNumbers };
