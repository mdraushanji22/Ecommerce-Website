// Structural check for generated SVGs: well-formedness, viewBox, a11y label,
// and that every url(#id) / href="#id" reference resolves inside the file.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'assets', 'images');
// The 25 files tools/make-images.js owns. hero.svg and detail-*.svg are
// hand-authored decorative art, so they are only checked for broken refs.
const GENERATED = new Set(fs.readFileSync(__filename, 'utf8') && [
  'smartphone-titanium.svg', 'smartphone-midnight.svg', 'smartphone-silver.svg', 'smartphone-graphite.svg',
  'laptop-silver.svg', 'laptop-graphite.svg', 'laptop-champagne.svg', 'laptop-blue.svg',
  'headphone-champagne.svg', 'headphone-graphite.svg',
  'earbuds-white.svg', 'earbuds-sand.svg', 'earbuds-coral.svg',
  'watch-black.svg', 'watch-titanium.svg', 'watch-graphite.svg',
  'band-pink.svg',
  'camera-black.svg', 'camera-silver.svg', 'camera-charcoal.svg', 'camera-blue.svg',
  'powerbank.svg', 'charger.svg', 'keyboard.svg', 'speaker.svg'
]);
let bad = 0;
let seen = 0;

for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.svg'))) {
  const src = fs.readFileSync(path.join(DIR, f), 'utf8');
  const owned = GENERATED.has(f);
  const issues = [];

  if (owned) {
    seen += 1;
    if (!src.trimStart().startsWith('<?xml')) issues.push('missing xml declaration');
    if (!/<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(src)) issues.push('missing svg xmlns');
    if (!/viewBox="0 0 800 800"/.test(src)) issues.push('unexpected viewBox');
    if (!/role="img"/.test(src)) issues.push('missing role=img');
    if (!/aria-label="[^"]+"/.test(src)) issues.push('missing aria-label');
  }

  // balanced tags (rough but catches truncation)
  const opens = (src.match(/<(?!\/|\?|!)[a-zA-Z]/g) || []).length;
  const selfClose = (src.match(/\/>/g) || []).length;
  const closes = (src.match(/<\/[a-zA-Z]/g) || []).length;
  if (opens !== selfClose + closes) issues.push(`unbalanced tags open=${opens} self=${selfClose} close=${closes}`);

  // defined ids
  const ids = new Set([...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

  // referenced ids
  const refs = new Set();
  for (const m of src.matchAll(/url\(#([^)]+)\)/g)) refs.add(m[1]);
  for (const m of src.matchAll(/href="#([^"]+)"/g)) refs.add(m[1]);
  for (const m of src.matchAll(/(?:mask|filter|clip-path)="[^"]*#([^")\s]+)"/g)) refs.add(m[1]);

  const missing = [...refs].filter((r) => !ids.has(r));
  if (missing.length) issues.push('unresolved references: ' + missing.join(', '));

  // the reflection <use> must point at a group that exists
  const useRefs = [...src.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]);
  for (const u of useRefs) {
    if (!new RegExp('<g id="' + u + '"').test(src)) issues.push('use -> missing group #' + u);
  }

  const unused = [...ids].filter((i) => !refs.has(i) && !useRefs.includes(i));
  if (unused.length) issues.push('unused defs: ' + unused.join(', '));

  if (issues.length) { bad += 1; console.log('FAIL ' + f + '\n      ' + issues.join('\n      ')); }
  else console.log('ok   ' + f.padEnd(26) + (fs.statSync(path.join(DIR, f)).size / 1024).toFixed(1) + ' KB' + (owned ? '' : '  (hand-authored)'));
}
if (seen !== GENERATED.size) {
  console.log('expected ' + GENERATED.size + ' generated renders, found ' + seen);
  bad += 1;
}
console.log('\n' + (bad ? bad + ' file(s) with issues' : `all ${seen} product renders structurally valid`));
process.exit(bad ? 1 : 0);
