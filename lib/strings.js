'use strict';
const { prevSigIdx, nextSigIdx } = require('./core.js');

function parseStringLiteral(raw) {
  // raw includes the surrounding quotes, e.g. "\"he said \\\"hi\\\"\""
  const quote = raw[0];
  const body = raw.slice(1, raw.length - 1);
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '\\') {
      const next = body[i + 1];
      i++;
      switch (next) {
        case 'n': out += '\n'; break;
        case 't': out += '\t'; break;
        case 'r': out += '\r'; break;
        case 'b': out += '\b'; break;
        case 'f': out += '\f'; break;
        case 'v': out += '\v'; break;
        case '0': out += '\0'; break;
        case 'x': {
          const hex = body.slice(i + 1, i + 3);
          out += String.fromCharCode(parseInt(hex, 16));
          i += 2;
          break;
        }
        case 'u': {
          if (body[i + 1] === '{') {
            const end = body.indexOf('}', i + 2);
            const hex = body.slice(i + 2, end);
            out += String.fromCodePoint(parseInt(hex, 16));
            i = end;
          } else {
            const hex = body.slice(i + 1, i + 5);
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
          }
          break;
        }
        case '\n': break; // line continuation
        default: out += next;
      }
    } else {
      out += c;
    }
  }
  return out;
}

function isDirectiveLike(tokens, idx) {
  const p = prevSigIdx(tokens, idx);
  const n = nextSigIdx(tokens, idx);
  const prevOk = p === -1 || (tokens[p].type === 'Punctuator' && (tokens[p].value === '{' || tokens[p].value === ';'));
  const nextOk = n === -1 || (tokens[n].type === 'Punctuator' && (tokens[n].value === ';' || tokens[n].value === '}'));
  return prevOk && nextOk;
}

function isImportExportSpecifier(tokens, idx) {
  const p = prevSigIdx(tokens, idx);
  if (p === -1) return false;
  const pt = tokens[p];
  return pt.type === 'Identifier' && (pt.value === 'import' || pt.value === 'from');
}

function isPlainObjectKey(tokens, idx) {
  const p = prevSigIdx(tokens, idx);
  const n = nextSigIdx(tokens, idx);
  const precededByBraceOrComma = p !== -1 && tokens[p].type === 'Punctuator' && (tokens[p].value === '{' || tokens[p].value === ',');
  const followedByColon = n !== -1 && tokens[n].type === 'Punctuator' && tokens[n].value === ':';
  return precededByBraceOrComma && followedByColon;
}

function xorBytes(buf, key) {
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ key[i % key.length];
  return out;
}

function randomKey(len, rand) {
  const key = [];
  for (let i = 0; i < len; i++) key.push(1 + Math.floor(rand() * 254));
  return key;
}

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

// Applies string extraction in place on the token list. Returns a runtime
// header (string) to prepend, or '' if there were no eligible strings.
function transformStrings(tokens, opts) {
  const rand = opts.rand;
  const decodeName = opts.nextName();
  const arrName = opts.nextName();
  const keyName = opts.nextName();
  const cacheName = opts.nextName();
  const b64FnName = opts.nextName();
  const u8FnName = opts.nextName();

  const pool = new Map(); // decoded string value -> physical index (assigned after shuffle)
  const order = []; // decoded string values in first-seen order
  const eligible = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type !== 'String' || !t.closed) continue;
    if (isDirectiveLike(tokens, i)) continue;
    if (isImportExportSpecifier(tokens, i)) continue;
    if (isPlainObjectKey(tokens, i)) continue;
    eligible.push(i);
  }

  if (eligible.length === 0) return '';

  for (const i of eligible) {
    const value = parseStringLiteral(tokens[i].value);
    if (!order.includes(value)) order.push(value);
  }

  const shuffled = shuffle(order.slice(), rand);
  shuffled.forEach((val, idx) => pool.set(val, idx));

  const key = randomKey(12, rand);
  const encoded = shuffled.map(v => xorBytes(Buffer.from(v, 'utf8'), key).toString('base64'));

  for (const i of eligible) {
    const value = parseStringLiteral(tokens[i].value);
    const idx = pool.get(value);
    tokens[i].value = `${decodeName}(${idx})`;
    tokens[i].type = 'Punctuator'; // now a code expression, not a string literal token
  }

  const header = `var ${keyName}=[${key.join(',')}];` +
    `var ${arrName}=[${encoded.map(s => JSON.stringify(s)).join(',')}];` +
    `var ${cacheName}={};` +
    `function ${b64FnName}(s){var c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/',o=[],bf=0,bt=0;` +
    `for(var i=0;i<s.length;i++){var v=c.indexOf(s.charAt(i));if(v===-1)continue;bf=(bf<<6)|v;bt+=6;` +
    `if(bt>=8){bt-=8;o.push((bf>>bt)&255);}}return o;}` +
    `function ${u8FnName}(b){var r='',i=0;while(i<b.length){var b0=b[i++];` +
    `if(b0<128){r+=String.fromCharCode(b0);}` +
    `else if((b0&224)===192){var b1=b[i++];r+=String.fromCharCode(((b0&31)<<6)|(b1&63));}` +
    `else if((b0&240)===224){var b1=b[i++],b2=b[i++];r+=String.fromCharCode(((b0&15)<<12)|((b1&63)<<6)|(b2&63));}` +
    `else if((b0&248)===240){var b1=b[i++],b2=b[i++],b3=b[i++];var cp=((b0&7)<<18)|((b1&63)<<12)|((b2&63)<<6)|(b3&63);cp-=65536;` +
    `r+=String.fromCharCode(55296+(cp>>10),56320+(cp&1023));}` +
    `else{r+=String.fromCharCode(b0);}}return r;}` +
    `function ${decodeName}(idx){if(Object.prototype.hasOwnProperty.call(${cacheName},idx))return ${cacheName}[idx];` +
    `var by=${b64FnName}(${arrName}[idx]);for(var i=0;i<by.length;i++){by[i]=by[i]^${keyName}[i%${keyName}.length];}` +
    `var out=${u8FnName}(by);${cacheName}[idx]=out;return out;}`;

  return header;
}

module.exports = { transformStrings, parseStringLiteral };
