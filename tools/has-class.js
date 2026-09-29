/* One-off helper: report whether each of the given class names exists in the CSS.
   Run: node tools/has-class.js hero container section ...                */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

const css = ['style.css', 'responsive.css', 'admin.css']
  .map((f) => fs.readFileSync(path.join(root, 'css', f), 'utf8'))
  .join('\n');

const missing = [];
process.argv.slice(2).forEach((c) => {
  if (new RegExp('\\.' + c.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '(?![\\w-])').test(css)) {
    console.log('  ok   .' + c);
  } else {
    console.log('MISS   .' + c);
    missing.push(c);
  }
});
if (missing.length) console.log('\nmissing: ' + missing.join(', '));
