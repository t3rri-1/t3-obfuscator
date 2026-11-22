'use strict';

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

function wrapLayer(code, opts) {
  const rand = opts.rand;
  const key = randomKey(16, rand);
  const encoded = xorBytes(Buffer.from(code, 'utf8'), key).toString('base64');

  const keyName = opts.nextName();
  const dataName = opts.nextName();
  const b64FnName = opts.nextName();
  const u8FnName = opts.nextName();
  const bytesName = opts.nextName();
  const sourceName = opts.nextName();
  const iName = opts.nextName();

  return `(function(){` +
    `var ${keyName}=[${key.join(',')}];` +
    `var ${dataName}=${JSON.stringify(encoded)};` +
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
    `var ${bytesName}=${b64FnName}(${dataName});` +
    `for(var ${iName}=0;${iName}<${bytesName}.length;${iName}++){${bytesName}[${iName}]=${bytesName}[${iName}]^${keyName}[${iName}%${keyName}.length];}` +
    `var ${sourceName}=${u8FnName}(${bytesName});` +
    `Function(${sourceName})();` +
    `})();`;
}

function wrap(code, opts, layers) {
  let out = code;
  const n = Math.max(0, layers | 0);
  for (let i = 0; i < n; i++) out = wrapLayer(out, opts);
  return out;
}

module.exports = { wrap };
