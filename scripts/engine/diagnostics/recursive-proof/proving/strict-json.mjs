// Reject duplicate object keys before native JSON.parse constructs the value.
// Used for bounded research evidence; JSON is not the application wire format.
export function parseStrictJSON(text) {
  if (typeof text !== 'string' || text.length > 1024 * 1024) throw new Error('JSON evidence size/type');
  let pos = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(text[pos] ?? '') && pos < text.length) pos++; };
  const string = () => {
    const start = pos++;
    while (pos < text.length) {
      const c = text[pos++];
      if (c === '\\') pos++;
      else if (c === '"') return JSON.parse(text.slice(start, pos));
    }
    throw new Error('Unterminated JSON string');
  };
  const value = depth => {
    if (depth > 128) throw new Error('JSON nesting limit');
    ws();
    if (text[pos] === '"') { string(); return; }
    if (text[pos] === '{') {
      pos++; ws(); const keys = new Set();
      if (text[pos] === '}') { pos++; return; }
      while (true) {
        ws(); if (text[pos] !== '"') throw new Error('Expected JSON key');
        const key = string();
        if (keys.has(key)) throw new Error('Duplicate JSON key: ' + key);
        keys.add(key); ws(); if (text[pos++] !== ':') throw new Error('Expected JSON colon');
        value(depth + 1); ws(); const delimiter = text[pos++];
        if (delimiter === '}') return;
        if (delimiter !== ',') throw new Error('Expected JSON object delimiter');
      }
    }
    if (text[pos] === '[') {
      pos++; ws(); if (text[pos] === ']') { pos++; return; }
      while (true) {
        value(depth + 1); ws(); const delimiter = text[pos++];
        if (delimiter === ']') return;
        if (delimiter !== ',') throw new Error('Expected JSON array delimiter');
      }
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(text.slice(pos));
    if (!token) throw new Error('Expected JSON value');
    pos += token[0].length;
  };
  value(0); ws(); if (pos !== text.length) throw new Error('Trailing JSON data');
  return JSON.parse(text);
}
