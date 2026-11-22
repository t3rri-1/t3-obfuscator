'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { tokenize } = require('../lib/lexer.js');
const { computeRenameMap, applyRenames } = require('../lib/core.js');
const { makeNameGenerator } = require('../lib/names.js');

const samples = [
  {
    name: 'basic vars + function',
    code: `
      function calcTotal(price, qty) {
        var subtotal = price * qty;
        let tax = subtotal * 0.1;
        const total = subtotal + tax;
        return total;
      }
      console.log(calcTotal(10, 3));
    `
  },
  {
    name: 'object shorthand + destructuring',
    code: `
      function build() {
        const name = "sword";
        const power = 42;
        const obj = { name, power, extra: 1 };
        const { name: n2, power: p2 } = obj;
        console.log(obj.name, n2, p2);
      }
      build();
    `
  },
  {
    name: 'class with method name colliding with var name',
    code: `
      let render = "outer";
      class Widget {
        render() { return "inner-" + this.label; }
        constructor(label) { this.label = label; }
      }
      const w = new Widget("x");
      console.log(w.render(), render);
    `
  },
  {
    name: 'ternary + switch + labeled loop',
    code: `
      function classify(n) {
        let bucket = n > 0 ? "pos" : "nonpos";
        switch (bucket) {
          case "pos": bucket = bucket + "!"; break;
          default: bucket = bucket + "?";
        }
        outer: for (let i = 0; i < 2; i++) {
          if (i === 1) break outer;
        }
        return bucket;
      }
      console.log(classify(5), classify(-1));
    `
  },
  {
    name: 'optional chaining + private-like dot chains',
    code: `
      function safe(obj) {
        let value = obj?.inner?.value;
        return value;
      }
      console.log(safe({ inner: { value: 7 } }), safe(null));
    `
  },
  {
    name: 'for-of / for-in with declarations',
    code: `
      function sumArr(arr) {
        let total = 0;
        for (let item of arr) { total += item; }
        const obj = { a: 1, b: 2 };
        let keys = "";
        for (let key in obj) { keys += key; }
        return total + ":" + keys;
      }
      console.log(sumArr([1,2,3]));
    `
  },
  {
    name: 'array destructuring left alone, object literal with computed key',
    code: `
      function test() {
        const [first, second] = [1, 2];
        const dynKey = "foo";
        const obj = { [dynKey]: 99 };
        return first + second + obj.foo;
      }
      console.log(test());
    `
  },
  {
    name: 'module.exports shorthand should not break',
    code: `
      function helperOne() { return 1; }
      function helperTwo() { return 2; }
      module.exports = { helperOne, helperTwo };
    `,
    isModule: true
  },
  {
    name: 'getters/setters/static/generator methods + class fields + private fields',
    code: `
      let value = "collide";
      class Box {
        static count = 0;
        #secret = 10;
        constructor(v) { this._v = v; Box.count++; }
        get value() { return this._v; }
        set value(v) { this._v = v; }
        static make(v) { return new Box(v); }
        * [Symbol.iterator]() { yield this._v; }
        reveal() { return this.#secret; }
      }
      const b = Box.make(5);
      b.value = 9;
      console.log(b.value, Box.count, b.reveal(), value);
    `
  },
  {
    name: 'declared function name reused as object method shorthand elsewhere',
    code: `
      function process(x) { return x + 1; }
      const handlers = {
        process(x) { return x * 2; },
        other: process
      };
      console.log(process(1), handlers.process(1), handlers.other(1));
    `
  },
  {
    name: 'IIFE and arrow function assigned to const',
    code: `
      const makeCounter = () => {
        let count = 0;
        return function increment() { count += 1; return count; };
      };
      const counter = makeCounter();
      (function iife() {
        console.log(counter(), counter());
      })();
    `
  },
  {
    name: 'nested object literal values that are plain function calls (not methods)',
    code: `
      function helper(x) { return x * 10; }
      function build(x) {
        return { a: helper(x), b: { c: helper(x + 1) } };
      }
      console.log(JSON.stringify(build(2)));
    `
  }
];

let allPass = true;

function run(code) {
  const tmp = path.join('/tmp', 'rc_' + Math.random().toString(36).slice(2) + '.js');
  fs.writeFileSync(tmp, code);
  try {
    const out = execFileSync('node', [tmp], { encoding: 'utf8' });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || e.message) };
  } finally {
    fs.unlinkSync(tmp);
  }
}

for (const sample of samples) {
  const tokens = tokenize(sample.code);
  const nextName = makeNameGenerator([]);
  const renameMap = computeRenameMap(tokens, nextName);
  applyRenames(tokens, renameMap);
  const rebuilt = tokens.map(t => t.value).join('');

  let origResult, newResult;
  if (sample.isModule) {
    origResult = run(sample.code + '\nconsole.log(JSON.stringify(Object.keys(module.exports).sort()));');
    newResult = run(rebuilt + '\nconsole.log(JSON.stringify(Object.keys(module.exports).sort()));');
  } else {
    origResult = run(sample.code);
    newResult = run(rebuilt);
  }

  const pass = origResult.ok && newResult.ok && origResult.out === newResult.out;
  if (!pass) allPass = false;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${sample.name}`);
  if (!pass) {
    console.log('  rename map:', [...renameMap.entries()]);
    console.log('  original out:', JSON.stringify(origResult.out));
    console.log('  new out     :', JSON.stringify(newResult.out));
    console.log('  rebuilt code:\n' + rebuilt.split('\n').map(l => '    ' + l).join('\n'));
  }
}

console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exit(allPass ? 0 : 1);
