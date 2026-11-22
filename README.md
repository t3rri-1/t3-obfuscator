# t3-obfuscator

A dependency-free JavaScript obfuscator. It renames local identifiers, encrypts
string and number literals, injects decoy code, and wraps the result in a
self-decoding layer — all without any npm dependencies, so `npm install` is
instant and there's nothing that can fail to fetch.

## Read this first: what obfuscation can and can't do

No obfuscator — this one, a commercial one, anything — can make JavaScript
**truly impossible to reverse-engineer**, by a human or an AI. The code still
has to run in the reader's own browser or Node process, which means it can
always be executed, stepped through in a debugger, or logged at runtime to
see exactly what it does. Obfuscation doesn't change that; it can't, for the
same reason a locked car with the engine running can't stop someone from
seeing where it goes.

What obfuscation *does* do, and does well:

- Defeats **casual reading** — skimming the file, Ctrl+F for a variable name,
  or pasting it into a tool that just pattern-matches on source text.
- Removes the free information in your original names, string literals, and
  code layout (this is most of what makes code fast to understand).
- Raises the **cost** of static analysis enough that most people — and most
  automated tools, including general-purpose AI assistants asked to "explain
  this file" without running it — will get a much shallower, slower, or
  wrong read of what the code does.

It will not stop a determined analyst (human or AI-assisted) who is willing
to actually run the code, set breakpoints, or log the decoded values at
runtime. Treat this the way you'd treat any client-side protection: it raises
the bar, it doesn't create a wall. Never ship secrets (real API keys,
license-validation logic that must not be bypassed, etc.) to the client and
rely on obfuscation alone to protect them.

## Install

```bash
npm install
```

No external packages are pulled in — everything is implemented from scratch
in `lib/`, so this just links the `t3-obfuscator` command.

## CLI usage

```bash
npx t3-obfuscator src/app.js -o dist/app.min.js
```

Options:

| Flag              | Effect                                                   |
|-------------------|-----------------------------------------------------------|
| `-o, --out <file>`| Output path (default: `<input>.obf.js`)                  |
| `--no-rename`     | Skip identifier renaming                                  |
| `--no-strings`    | Skip string literal encoding                               |
| `--no-numbers`    | Skip numeric literal obfuscation                           |
| `--no-deadcode`   | Skip decoy dead-code injection                              |
| `--layers <n>`    | Self-decoding wrapper layers, 0-5 (default: 1)            |
| `--seed <n>`      | Numeric seed for reproducible output (default: random)    |

## Library usage

```js
const { obfuscate } = require('t3-obfuscator');

const output = obfuscate(sourceCode, {
  rename: true,    // rename local function/var/let/const names
  strings: true,   // extract + XOR/base64-encode string literals
  numbers: true,   // turn integer literals into equivalent XOR expressions
  deadcode: true,  // inject a few inert decoy functions
  layers: 1,       // how many self-decoding wrapper layers (0 = none)
  seed: null        // set a number for reproducible output; null = random
});
```

## What each transform actually does

- **Renaming** — renames `function name(...)` declarations and simple
  `var`/`let`/`const` locals to short `_0x...` identifiers. It deliberately
  leaves alone: destructured declarations and parameters, object/class keys,
  shorthand properties (`{ foo }`), method names, and any named
  `export function` / `export const` (so your module's public API doesn't
  change). This is a token-level transform, not a full parser with scope
  resolution — it's intentionally conservative so it doesn't break your code,
  at the cost of not renaming everything a full AST-based tool would.
- **String encoding** — every eligible string literal is deduplicated,
  shuffled into an array, XOR'd with a random key, base64-encoded, and
  replaced with a call to a decoder function. Directives (`"use strict"`),
  `import`/`export` module specifiers, and plain object/class string keys are
  left alone because rewriting them would change behavior, not just
  appearance.
- **Number obfuscation** — plain decimal integer literals become `(A^B)`
  expressions that evaluate back to the original value. Hex/octal/binary,
  floats, exponents, BigInt, and numeric keys are left untouched.
- **Dead code** — a handful of small, self-contained functions that never
  call into or reference your real code, added purely as reading noise.
- **Wrapper** — the entire file (including the string-decoder and dead code)
  is XOR/base64-encoded and re-assembled at runtime via `Function(...)()`.
  Each extra `--layers` value nests another nearly-identical shell around it.

## Known limitations

- Only `var`/`let`/`const` simple declarators and named function
  declarations are renamed — not function parameters, not destructured
  bindings, not arrow-function parameters. This is a safety choice, not an
  oversight: renaming those correctly requires real scope analysis, and a
  wrong rename breaks code silently.
- Template literals (`` `...` ``) are passed through untouched, including any
  string content inside `${}` interpolations.
- The wrapper uses `Function(...)` to self-execute, which is blocked by a
  strict Content-Security-Policy (`script-src` without `unsafe-eval`). If
  your target environment enforces that, use `--layers 0`.
- This tool has no awareness of your module graph — it obfuscates one file
  at a time, as given.

## Testing your output

**Always run your obfuscated output before shipping it.** Obfuscation is a
code transformation like any other (minification, transpilation) and the
only way to be sure a specific file survived it intact is to run it:

```bash
node dist/app.min.js   # or load it in the target browser/page
```

The included test suite (`npm test`) checks the transforms against a battery
of tricky real-world patterns (classes, getters/setters, destructuring,
optional chaining, async/await, ESM named exports, etc.) by running the
original and obfuscated code and diffing stdout — but your code is still
your code, and "probably fine on general JS" is not the same as "fine on
*your* file." Keep an unobfuscated copy as the source of truth.

## License

MIT
