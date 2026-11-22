'use strict';

const PUNCTUATORS = [
  '>>>=', '...', '=>', '**=', '<<=', '>>=', '>>>', '===', '!==',
  '&&=', '||=', '??=',
  '++', '--', '**', '==', '!=', '<=', '>=', '&&', '||', '??', '?.',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>',
  '{', '}', '(', ')', '[', ']', '.', ';', ',', '<', '>', '+', '-',
  '*', '%', '&', '|', '^', '!', '~', '?', ':', '=', '/', '@'
].sort((a, b) => b.length - a.length);

const KEYWORDS = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'function', 'if',
  'import', 'in', 'instanceof', 'new', 'return', 'super', 'switch', 'this', 'throw',
  'try', 'typeof', 'var', 'void', 'while', 'with', 'yield', 'let', 'static', 'async',
  'await', 'of', 'get', 'set', 'null', 'true', 'false', 'undefined'
]);

// keywords after which a following `/` starts a regex, not a division
const REGEX_ALLOWED_KEYWORDS = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'do', 'else', 'yield', 'case', 'await'
]);

function isIdStart(ch) {
  return ch === '$' || ch === '_' || /[A-Za-z]/.test(ch) || ch.charCodeAt(0) > 127;
}
function isIdPart(ch) {
  return ch === '$' || ch === '_' || /[A-Za-z0-9]/.test(ch) || ch.charCodeAt(0) > 127;
}
function isTrivia(t) {
  return t.type === 'Whitespace' || t.type === 'Newline' ||
    t.type === 'LineComment' || t.type === 'BlockComment';
}

function tokenize(src) {
  const tokens = [];
  let i = 0;
  const n = src.length;

  function prevSignificant() {
    for (let k = tokens.length - 1; k >= 0; k--) {
      if (!isTrivia(tokens[k])) return tokens[k];
    }
    return null;
  }

  function regexAllowed() {
    const p = prevSignificant();
    if (!p) return true;
    if (p.type === 'Number' || p.type === 'String' || p.type === 'Template' || p.type === 'Regex') return false;
    if (p.type === 'Identifier') {
      if (KEYWORDS.has(p.value)) return REGEX_ALLOWED_KEYWORDS.has(p.value);
      return false; // plain identifier -> division
    }
    if (p.type === 'Punctuator') {
      if (p.value === ')' || p.value === ']') return false;
      if (p.value === '++' || p.value === '--') return false;
      return true;
    }
    return true;
  }

  while (i < n) {
    const ch = src[i];
    const start = i;

    if (ch === '\n') { tokens.push({ type: 'Newline', value: '\n', start, end: i + 1 }); i++; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\f' || ch === '\v') {
      let j = i; while (j < n && ' \t\r\f\v'.includes(src[j])) j++;
      tokens.push({ type: 'Whitespace', value: src.slice(i, j), start, end: j }); i = j; continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      let j = i + 2; while (j < n && src[j] !== '\n') j++;
      tokens.push({ type: 'LineComment', value: src.slice(i, j), start, end: j }); i = j; continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      let j = i + 2; while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(j + 2, n);
      tokens.push({ type: 'BlockComment', value: src.slice(i, j), start, end: j }); i = j; continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch; let j = i + 1; let esc = false; let closed = false;
      while (j < n) {
        const c = src[j];
        if (esc) { esc = false; j++; continue; }
        if (c === '\\') { esc = true; j++; continue; }
        if (c === quote) { j++; closed = true; break; }
        if (c === '\n') break;
        j++;
      }
      tokens.push({ type: 'String', value: src.slice(i, j), start, end: j, quote, closed });
      i = j; continue;
    }
    if (ch === '`') {
      let j = i + 1; let depth = 0; let esc = false;
      while (j < n) {
        const c = src[j];
        if (esc) { esc = false; j++; continue; }
        if (c === '\\') { esc = true; j++; continue; }
        if (c === '`' && depth === 0) { j++; break; }
        if (c === '$' && src[j + 1] === '{') { depth++; j += 2; continue; }
        if (c === '{' && depth > 0) { depth++; j++; continue; }
        if (c === '}' && depth > 0) { depth--; j++; continue; }
        j++;
      }
      tokens.push({ type: 'Template', value: src.slice(i, j), start, end: j });
      i = j; continue;
    }
    if (ch === '/' && regexAllowed()) {
      let j = i + 1; let inClass = false; let esc = false; let ok = true;
      while (j < n) {
        const c = src[j];
        if (esc) { esc = false; j++; continue; }
        if (c === '\\') { esc = true; j++; continue; }
        if (c === '[') { inClass = true; j++; continue; }
        if (c === ']') { inClass = false; j++; continue; }
        if (c === '/' && !inClass) { j++; break; }
        if (c === '\n') { ok = false; break; }
        j++;
      }
      if (ok && j <= n && src[j - 1] === '/' ) {
        let k = j; while (k < n && /[a-zA-Z]/.test(src[k])) k++;
        tokens.push({ type: 'Regex', value: src.slice(i, k), start, end: k });
        i = k; continue;
      }
      // not a valid regex - fall through to punctuator handling for '/'
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      if (src[j] === '0' && (src[j + 1] === 'x' || src[j + 1] === 'X')) {
        j += 2; while (j < n && /[0-9a-fA-F_]/.test(src[j])) j++;
      } else if (src[j] === '0' && (src[j + 1] === 'o' || src[j + 1] === 'O')) {
        j += 2; while (j < n && /[0-7_]/.test(src[j])) j++;
      } else if (src[j] === '0' && (src[j + 1] === 'b' || src[j + 1] === 'B')) {
        j += 2; while (j < n && /[01_]/.test(src[j])) j++;
      } else {
        while (j < n && /[0-9_]/.test(src[j])) j++;
        if (src[j] === '.') { j++; while (j < n && /[0-9_]/.test(src[j])) j++; }
        if (src[j] === 'e' || src[j] === 'E') {
          let k = j + 1; if (src[k] === '+' || src[k] === '-') k++;
          if (/[0-9]/.test(src[k] || '')) { j = k; while (j < n && /[0-9_]/.test(src[j])) j++; }
        }
      }
      if (src[j] === 'n') j++; // BigInt suffix
      tokens.push({ type: 'Number', value: src.slice(i, j), start, end: j });
      i = j; continue;
    }
    if (isIdStart(ch)) {
      let j = i + 1; while (j < n && isIdPart(src[j])) j++;
      tokens.push({ type: 'Identifier', value: src.slice(i, j), start, end: j });
      i = j; continue;
    }
    {
      let matched = null;
      for (const p of PUNCTUATORS) {
        if (src.startsWith(p, i)) { matched = p; break; } // list pre-sorted longest-first
      }
      if (matched) {
        tokens.push({ type: 'Punctuator', value: matched, start, end: i + matched.length });
        i += matched.length; continue;
      }
    }
    tokens.push({ type: 'Unknown', value: ch, start, end: i + 1 });
    i++;
  }
  return tokens;
}

module.exports = { tokenize, KEYWORDS, isTrivia };
