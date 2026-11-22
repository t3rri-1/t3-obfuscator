'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { obfuscate } = require('../lib/index.js');

const realistic = `
"use strict";
function formatCurrency(amount, currencySymbol) {
  const rounded = Math.round(amount * 100) / 100;
  return currencySymbol + rounded.toFixed(2);
}

class ShoppingCart {
  constructor(taxRate) {
    this.items = [];
    this.taxRate = taxRate;
  }
  addItem(name, price, qty) {
    this.items.push({ name, price, qty });
    return this;
  }
  get subtotal() {
    let total = 0;
    for (const item of this.items) {
      total += item.price * item.qty;
    }
    return total;
  }
  get total() {
    return this.subtotal * (1 + this.taxRate);
  }
  describe() {
    const lines = this.items.map(({ name, price, qty }) => \`\${qty}x \${name} @ \${price}\`);
    return lines.join(", ") + " | total: " + formatCurrency(this.total, "$");
  }
}

const cart = new ShoppingCart(0.08);
cart.addItem("Widget", 9.99, 3).addItem("Gadget", 19.5, 1);
console.log(cart.describe());

const config = { "api-key": "sk-fake-12345", retries: 3, "x": 1, y: 2 };
function retryCount() { return config.retries; }
console.log(retryCount(), config["api-key"].length);

for (let i = 0; i < 3; i++) {
  const label = i % 2 === 0 ? "even" : "odd";
  console.log(i, label);
}
`;

const optionSets = [
  { name: 'all-on-1-layer', opts: { layers: 1, seed: 1 } },
  { name: 'all-on-2-layers', opts: { layers: 2, seed: 2 } },
  { name: 'no-rename', opts: { rename: false, layers: 1, seed: 3 } },
  { name: 'no-strings', opts: { strings: false, layers: 1, seed: 4 } },
  { name: 'no-numbers', opts: { numbers: false, layers: 1, seed: 5 } },
  { name: 'no-deadcode', opts: { deadcode: false, layers: 1, seed: 6 } },
  { name: 'no-wrap', opts: { layers: 0, seed: 7 } },
  { name: 'minimal (all off)', opts: { rename: false, strings: false, numbers: false, deadcode: false, layers: 0, seed: 8 } }
];

function run(code) {
  const tmp = path.join('/tmp', 'e2e_' + Math.random().toString(36).slice(2) + '.js');
  fs.writeFileSync(tmp, code);
  try {
    const out = execFileSync('node', [tmp], { encoding: 'utf8' });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: (e.stdout || '') + (e.stderr || e.message) };
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

const expected = run(realistic);
console.log('Expected output:\n' + expected.out);
if (!expected.ok) { console.log('ORIGINAL CODE ITSELF FAILED - test is broken'); process.exit(1); }

let allPass = true;
for (const set of optionSets) {
  const obf = obfuscate(realistic, set.opts);
  const result = run(obf);
  const pass = result.ok && result.out === expected.out;
  if (!pass) allPass = false;
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${set.name} (output size: ${obf.length} bytes)`);
  if (!pass) {
    console.log('  --- got ---\n' + result.out);
    fs.writeFileSync('/tmp/failed_' + set.name.replace(/[^a-z0-9]/gi, '_') + '.js', obf);
    console.log('  saved to /tmp for inspection');
  }
}
console.log(allPass ? '\nALL PASS' : '\nSOME FAILED');
process.exit(allPass ? 0 : 1);
