'use strict';

function makeNameGenerator(reservedWords) {
  const used = new Set(reservedWords || []);
  const hex = '0123456789abcdef';

  function raw() {
    let s = '_0x';
    for (let i = 0; i < 6; i++) s += hex[Math.floor(Math.random() * 16)];
    return s;
  }

  return function next() {
    let name = raw();
    while (used.has(name)) name = raw();
    used.add(name);
    return name;
  };
}

// xorshift32 seeded PRNG so a --seed run is reproducible; falls back to Math.random via seed=null
function makeRng(seed) {
  if (seed === null || seed === undefined) return Math.random;
  let state = (seed >>> 0) || 1;
  return function rng() {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return (state >>> 0) / 4294967296;
  };
}

module.exports = { makeNameGenerator, makeRng };
