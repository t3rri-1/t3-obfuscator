'use strict';

// Generates a handful of self-contained decoy functions. They never call into
// or reference anything from the real program, so they cannot change its
// behavior - they only add noise for anyone reading the file top to bottom.
function generateDeadCode(opts) {
  const rand = opts.rand;
  const count = 2 + Math.floor(rand() * 3); // 2-4 decoys
  const pieces = [];

  const templates = [
    (fn, a, b, c) => `function ${fn}(${a},${b}){var ${c}=0;for(var i=0;i<${a};i++){${c}+=(${a}^${b})%7;}return ${c};}`,
    (fn, a, b, c) => `function ${fn}(${a}){var ${c}=[];for(var i=0;i<(${a}||0);i++){${c}.push(i*2+1);}return ${c}.length;}`,
    (fn, a, b, c) => `function ${fn}(${a},${b}){return String(${a}).split('').reverse().join('')+String(${b}||0);}`,
    (fn, a, b, c) => `function ${fn}(${a}){var ${c}={};${c}.v=${a}||0;${c}.v=${c}.v*2-1;return ${c}.v;}`
  ];

  for (let i = 0; i < count; i++) {
    const fn = opts.nextName();
    const a = opts.nextName();
    const b = opts.nextName();
    const c = opts.nextName();
    const tpl = templates[Math.floor(rand() * templates.length)];
    pieces.push(tpl(fn, a, b, c));
  }
  return pieces.join('');
}

module.exports = { generateDeadCode };
