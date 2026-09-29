/* One-off helper: list every id= and data-* hook that js/admin.js expects in
   the admin HTML pages, so the markup can be checked against the code.
   Run: node tools/admin-hooks.js                                     */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'admin.js'), 'utf8');

const ids = new Set();
const attrs = new Set();
const tables = new Set();

let m;
const idRe = /id="([A-Za-z0-9_-]+)"/g;
while ((m = idRe.exec(src))) ids.add(m[1]);

const attrRe = /\[(data-admin-[a-z-]+)\]/g;
while ((m = attrRe.exec(src))) attrs.add(m[1]);

const tableRe = /attachTableFilter\('\[([a-z-]+)\]',\s*'(#[A-Za-z0-9_-]+)'/g;
while ((m = tableRe.exec(src))) tables.add(`${m[1]}  ->  ${m[2]}`);

const chartRe = /draw(Line|Bar|Doughnut)Chart\(\s*'?#?([A-Za-z0-9_-]+)'?/g;
while ((m = chartRe.exec(src))) tables.add(`chart(${m[1]})  ->  #${m[2]}`);

const canvasRe = /<canvas id="([A-Za-z0-9_-]+)"/g;
while ((m = canvasRe.exec(src))) tables.add(`canvas  ->  #${m[1]}`);

console.log('--- data-admin-* hooks (${attrs.size}) ---');
console.log([...attrs].sort().join('\n'));
console.log('\n--- ids referenced (${ids.size}) ---');
console.log([...ids].sort().join('\n'));
console.log('\n--- bound tables / charts ---');
console.log([...tables].sort().join('\n'));
