/* Static cross-reference check: every LUMEN.x.y used anywhere in js/ must be
   defined somewhere in js/. Run:  node tools/check-api.js           */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'js');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
const source = {};
files.forEach((f) => { source[f] = fs.readFileSync(path.join(dir, f), 'utf8'); });

const defined = new Map(); // namespace -> Set(member)
const nsDefined = new Set();
const addNs = (ns) => { nsDefined.add(ns); if (!defined.has(ns)) defined.set(ns, new Set()); };
const addMember = (ns, m) => { addNs(ns); defined.get(ns).add(m); };

/** Find `LUMEN.<ns> = { ... }` with balanced braces, then read its members. */
function collectObjectLiterals(text, onNamespace) {
  const re = /(?:global\.)?LUMEN\.([A-Za-z_$][\w$]*)\s*=\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const ns = m[1];
    addNs(ns);
    let depth = 1;
    let i = re.lastIndex;
    while (i < text.length && depth > 0) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') depth -= 1;
      i += 1;
    }
    const body = text.slice(re.lastIndex, i - 1);

    // Walk the body, tracking depth so nested bodies are ignored, and read
    // each top-level entry's key (identifier, "quoted key", or method name).
    let d = 0;
    let buf = '';
    const entries = [];
    for (let j = 0; j < body.length; j += 1) {
      const ch = body[j];
      if (ch === '{' || ch === '(' || ch === '[') d += 1;
      if (ch === '}' || ch === ')' || ch === ']') d -= 1;
      if (ch === ',' && d === 0) { entries.push(buf); buf = ''; continue; }
      buf += ch;
    }
    entries.push(buf);

    entries.forEach((entry) => {
      const trimmed = entry.trim();
      if (!trimmed) return;
      let key = null;
      let km = /^([A-Za-z_$][\w$]*)\s*\(/.exec(trimmed); // method shorthand
      if (km) key = km[1];
      if (!key) {
        km = /^([A-Za-z_$][\w$]*)\s*:/.exec(trimmed); // key: value
        if (km) key = km[1];
      }
      if (!key) {
        km = /^([A-Za-z_$][\w$]*)\s*(,|$)/.exec(trimmed); // shorthand
        if (km) key = km[1];
      }
      if (key && !/^LUMEN$/.test(key)) addMember(ns, key);
    });

    re.lastIndex = i;
    onNamespace(ns);
  }
}

const assign = /(?:global\.)?LUMEN\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;
const nsOnly = /(?:global\.)?LUMEN\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;

files.forEach((f) => {
  const src = source[f];
  collectObjectLiterals(src, () => {});
  let m;
  assign.lastIndex = 0;
  while ((m = assign.exec(src))) addMember(m[1], m[2]);
  nsOnly.lastIndex = 0;
  while ((m = nsOnly.exec(src))) addNs(m[1]);
});

const usage = /LUMEN\.([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g;
const problems = [];

files.forEach((f) => {
  source[f].split(/\r?\n/).forEach((line, i) => {
    let m;
    usage.lastIndex = 0;
    while ((m = usage.exec(line))) {
      const [, ns, member] = m;
      if (!nsDefined.has(ns)) {
        problems.push(`${f}:${i + 1}  LUMEN.${ns} is never defined  (used .${member})`);
      } else if (!defined.get(ns).has(member)) {
        problems.push(`${f}:${i + 1}  LUMEN.${ns}.${member} is never defined`);
      }
    }
  });
});

console.log('namespaces: ' + [...nsDefined].sort().join(', '));
console.log('');
if (!problems.length) {
  console.log('PASS - every LUMEN namespace/member used is defined somewhere in js/.');
} else {
  const uniq = [...new Set(problems)];
  console.log('PROBLEMS (' + uniq.length + ' unique):');
  uniq.forEach((p) => console.log('  ' + p));
  process.exitCode = 1;
}
