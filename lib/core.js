'use strict';
const { KEYWORDS, isTrivia } = require('./lexer.js');

function prevSigIdx(tokens, idx) {
  for (let k = idx - 1; k >= 0; k--) if (!isTrivia(tokens[k])) return k;
  return -1;
}
function nextSigIdx(tokens, idx) {
  for (let k = idx + 1; k < tokens.length; k++) if (!isTrivia(tokens[k])) return k;
  return -1;
}
function skipTrivia(tokens, idx) {
  while (idx < tokens.length && isTrivia(tokens[idx])) idx++;
  return idx;
}

function buildMatchMap(tokens) {
  const matchOf = new Map();
  const stack = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'Punctuator') continue;
    if (t.value === '(' || t.value === '[' || t.value === '{') {
      stack.push(i);
    } else if (t.value === ')' || t.value === ']' || t.value === '}') {
      const openIdx = stack.pop();
      if (openIdx !== undefined) { matchOf.set(openIdx, i); matchOf.set(i, openIdx); }
    }
  }
  return matchOf;
}

// Walks backward over an optional class heritage clause ("extends Expr") and
// class name to see whether `class` governs this brace. Handles plain names,
// `extends Base`, and `extends call(Expr)`-style heritage.
function isClassBody(tokens, braceIdx) {
  let k = prevSigIdx(tokens, braceIdx);
  let parenDepth = 0;
  let steps = 0;
  while (k !== -1 && steps < 200) {
    const tok = tokens[k];
    if (tok.type === 'Punctuator') {
      if (tok.value === ')') { parenDepth++; k = prevSigIdx(tokens, k); steps++; continue; }
      if (tok.value === '(') {
        if (parenDepth > 0) { parenDepth--; k = prevSigIdx(tokens, k); steps++; continue; }
        return false;
      }
      if (parenDepth === 0 && (tok.value === '{' || tok.value === '}' || tok.value === ';')) return false;
      k = prevSigIdx(tokens, k); steps++; continue;
    }
    if (tok.type === 'Identifier') {
      if (tok.value === 'class' && parenDepth === 0) return true;
      k = prevSigIdx(tokens, k); steps++; continue;
    }
    k = prevSigIdx(tokens, k); steps++;
  }
  return false;
}

// Classifies a '{' token's role so we know whether identifiers/strings/numbers
// directly inside it are "keys"/"members" (must not be blindly renamed) or
// ordinary code (block / function body).
function classifyBrace(tokens, idx, matchOf) {
  if (isClassBody(tokens, idx)) return 'class-body';
  const p = prevSigIdx(tokens, idx);
  if (p === -1) return 'block';
  const pt = tokens[p];
  if (pt.type === 'Punctuator' && pt.value === ')') {
    const openParen = matchOf.get(p);
    if (openParen !== undefined) {
      const beforeOpen = prevSigIdx(tokens, openParen);
      if (beforeOpen !== -1) {
        const bo = tokens[beforeOpen];
        if (bo.type === 'Identifier' && ['if', 'for', 'while', 'catch', 'switch'].includes(bo.value)) {
          return 'block';
        }
      }
    }
    return 'function-body';
  }
  if (pt.type === 'Punctuator' && pt.value === '=>') return 'function-body';
  if (pt.type === 'Punctuator' && ['=', '(', '[', ',', ':', '?'].includes(pt.value)) return 'object-literal';
  if (pt.type === 'Identifier' && ['return', 'typeof', 'yield', 'await', 'in', 'of'].includes(pt.value)) return 'object-literal';
  return 'block';
}

// --------------------------------------------------------------------------
// Declarations: only the patterns we can rename with full confidence.
// --------------------------------------------------------------------------
function scanDeclaratorList(tokens, startIdx) {
  const names = [];
  let i = skipTrivia(tokens, startIdx);
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'Identifier' && !KEYWORDS.has(t.value)) {
      const name = t.value;
      i = skipTrivia(tokens, i + 1);
      if (i < tokens.length && tokens[i].type === 'Punctuator' && tokens[i].value === '=') {
        names.push(name);
        i = skipTrivia(tokens, i + 1);
        let depth = 0;
        while (i < tokens.length) {
          const tt = tokens[i];
          if (tt.type === 'Punctuator' && ['(', '[', '{'].includes(tt.value)) { depth++; i++; continue; }
          if (tt.type === 'Punctuator' && [')', ']', '}'].includes(tt.value)) {
            if (depth === 0) break;
            depth--; i++; continue;
          }
          if (depth === 0 && tt.type === 'Punctuator' && (tt.value === ',' || tt.value === ';')) break;
          if (depth === 0 && tt.type === 'Identifier' && (tt.value === 'in' || tt.value === 'of')) break;
          i++;
        }
      } else {
        names.push(name);
      }
      if (i < tokens.length && tokens[i].type === 'Punctuator' && tokens[i].value === ',') {
        i = skipTrivia(tokens, i + 1);
        continue;
      }
      break;
    } else if (t.type === 'Punctuator' && (t.value === '[' || t.value === '{')) {
      // destructuring declarator: skip the whole pattern (+ initializer), collect nothing
      let depth = 0;
      while (i < tokens.length) {
        const tt = tokens[i];
        if (tt.type === 'Punctuator' && ['(', '[', '{'].includes(tt.value)) { depth++; i++; continue; }
        if (tt.type === 'Punctuator' && [')', ']', '}'].includes(tt.value)) {
          depth--; i++;
          if (depth === 0) break;
          continue;
        }
        i++;
      }
      i = skipTrivia(tokens, i);
      if (i < tokens.length && tokens[i].type === 'Punctuator' && tokens[i].value === '=') {
        i = skipTrivia(tokens, i + 1);
        let d2 = 0;
        while (i < tokens.length) {
          const tt = tokens[i];
          if (tt.type === 'Punctuator' && ['(', '[', '{'].includes(tt.value)) { d2++; i++; continue; }
          if (tt.type === 'Punctuator' && [')', ']', '}'].includes(tt.value)) {
            if (d2 === 0) break;
            d2--; i++; continue;
          }
          if (d2 === 0 && tt.type === 'Punctuator' && (tt.value === ',' || tt.value === ';')) break;
          if (d2 === 0 && tt.type === 'Identifier' && (tt.value === 'in' || tt.value === 'of')) break;
          i++;
        }
      }
      if (i < tokens.length && tokens[i].type === 'Punctuator' && tokens[i].value === ',') {
        i = skipTrivia(tokens, i + 1);
        continue;
      }
      break;
    } else {
      break;
    }
  }
  return { names, endIdx: i };
}

function isExportedBinding(tokens, keywordIdx) {
  const p = prevSigIdx(tokens, keywordIdx);
  if (p === -1) return false;
  const pt = tokens[p];
  if (pt.type === 'Identifier' && pt.value === 'export') return true;
  return false;
}

function scanDeclarations(tokens) {
  const declared = new Set();
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'Identifier' || KEYWORDS.has(t.value) === false) continue;
    if (t.value === 'function') {
      let j = skipTrivia(tokens, i + 1);
      if (j < tokens.length && tokens[j].type === 'Punctuator' && tokens[j].value === '*') {
        j = skipTrivia(tokens, j + 1);
      }
      if (j < tokens.length && tokens[j].type === 'Identifier' && !KEYWORDS.has(tokens[j].value)) {
        const nameIdx = j;
        const after = skipTrivia(tokens, j + 1);
        if (after < tokens.length && tokens[after].type === 'Punctuator' && tokens[after].value === '(') {
          if (!isExportedBinding(tokens, i)) declared.add(tokens[nameIdx].value);
        }
      }
      continue;
    }
    if (t.value === 'var' || t.value === 'let' || t.value === 'const') {
      const exported = isExportedBinding(tokens, i);
      const { names } = scanDeclaratorList(tokens, i + 1);
      if (!exported) for (const n of names) declared.add(n);
      continue;
    }
  }
  return declared;
}

// --------------------------------------------------------------------------
// Exclusions: names that must NEVER be renamed even if "declared" somewhere,
// because the same token also plays a structural role (shorthand property,
// destructuring binding, object/class key, or a method name).
// --------------------------------------------------------------------------
function scanExclusions(tokens, matchOf) {
  const excluded = new Set();
  const braceStack = []; // of {idx, type}

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    if (t.type === 'Punctuator' && t.value === '{') {
      braceStack.push(classifyBrace(tokens, i, matchOf));
      continue;
    }
    if (t.type === 'Punctuator' && t.value === '}') {
      braceStack.pop();
      continue;
    }
    if (t.type !== 'Identifier' || KEYWORDS.has(t.value)) continue;

    const p = prevSigIdx(tokens, i);
    const nx = nextSigIdx(tokens, i);
    const prevTok = p !== -1 ? tokens[p] : null;
    const nextTok = nx !== -1 ? tokens[nx] : null;

    const precededByBraceOrComma = prevTok && prevTok.type === 'Punctuator' && (prevTok.value === '{' || prevTok.value === ',');
    const followedByColon = nextTok && nextTok.type === 'Punctuator' && nextTok.value === ':';
    const followedByCommaOrBrace = nextTok && nextTok.type === 'Punctuator' && (nextTok.value === ',' || nextTok.value === '}');
    const followedByParen = nextTok && nextTok.type === 'Punctuator' && nextTok.value === '(';

    // plain object/class key: {foo: ...} -- never rename this occurrence's name
    if (precededByBraceOrComma && followedByColon) { excluded.add(t.value); continue; }

    // shorthand property / destructuring binding: {foo} or {foo, bar} or {foo = x}
    if (precededByBraceOrComma && (followedByCommaOrBrace || (nextTok && nextTok.type === 'Punctuator' && nextTok.value === '='))) {
      excluded.add(t.value);
      continue;
    }

    // method / accessor name defined directly inside an object literal or class body
    const top = braceStack.length ? braceStack[braceStack.length - 1] : 'top';
    if (followedByParen && (top === 'object-literal' || top === 'class-body')) {
      excluded.add(t.value);
      continue;
    }
  }
  return excluded;
}

function applyRenames(tokens, renameMap) {
  if (renameMap.size === 0) return;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'Identifier') continue;
    const newName = renameMap.get(t.value);
    if (!newName) continue;
    const p = prevSigIdx(tokens, i);
    if (p !== -1) {
      const pt = tokens[p];
      if (pt.type === 'Punctuator' && (pt.value === '.' || pt.value === '?.')) continue; // property access
      if (pt.type === 'Unknown' && pt.value === '#') continue; // private field
    }
    t.value = newName;
  }
}

function computeRenameMap(tokens, nextName) {
  const matchOf = buildMatchMap(tokens);
  const declared = scanDeclarations(tokens);
  const excluded = scanExclusions(tokens, matchOf);
  const map = new Map();
  for (const name of declared) {
    if (excluded.has(name)) continue;
    map.set(name, nextName());
  }
  return map;
}

module.exports = {
  prevSigIdx, nextSigIdx, skipTrivia, buildMatchMap, classifyBrace,
  scanDeclarations, scanExclusions, applyRenames, computeRenameMap
};
