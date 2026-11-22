// A small file to try the obfuscator on.
// Run:  node bin/t3-obfuscator.js examples/sample.js -o examples/sample.obf.js
//       node examples/sample.obf.js

function createInvoice(customerName, items) {
  const taxRate = 0.08;
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.price * item.qty;
  }
  const total = subtotal * (1 + taxRate);
  return {
    customer: customerName,
    subtotal,
    total,
    summary: `Invoice for ${customerName}: $${total.toFixed(2)}`
  };
}

const invoice = createInvoice("Ada Lovelace", [
  { price: 12.5, qty: 2 },
  { price: 7, qty: 1 }
]);

console.log(invoice.summary);
