/* Guards against destructuring helpers from the wrong LUMEN namespace.
   e.g. `const { money, num, icon } = LUMEN.dom;` silently yields undefined and
   only blows up at render time, so the map below is the verified public API
   (captured with tools/probe4.js) and every module must match it.

   Run: node tools/check-namespaces.js                                      */
const fs = require('fs');
const path = require('path');

const jsDir = path.join(__dirname, '..', 'js');

/* Verified public API. Only namespaces modules may destructure are listed. */
const API = {
  'LUMEN.store': ['getData', 'saveData', 'removeData', 'NS', 'session'],
  'LUMEN.dom': ['$', '$$', 'escapeHtml', 'delegate', 'fromHTML', 'FOCUSABLE'],
  'LUMEN.fmt': [
    'money', 'moneyCompact', 'num', 'formatDate', 'formatDateTime', 'timeAgo',
    'initials', 'slugify', 'clamp', 'debounce', 'titleCase', 'uid'
  ],
  'LUMEN.ui': ['catalog', 'emptyState', 'productCardMarkup', 'skeletonCards', 'starsMarkup'],
  'LUMEN.data': [
    'ALL_BRANDS', 'CATEGORIES', 'COUPON_SEED', 'IMG_DIR', 'SEED_PRODUCTS',
    'SETTINGS_SEED', 'SHARED_SHOTS', 'STORAGE', 'SWATCHES', 'SWATCH_LIST',
    'categoryBySlug', 'categoryName', 'galleryFor', 'imageUrl', 'salePrice', 'swatchColor'
  ]
};

/* Modules that legitimately read a whole namespace rather than destructuring. */
const WHOLE = {
  'LUMEN.icon': 'a function, assigned via `const icon = LUMEN.icon;`',
  'LUMEN.cart': 'a public module object',
  'LUMEN.wishlist': 'a public module object',
  'LUMEN.auth': 'a public module object',
  'LUMEN.orders': 'a public module object',
  'LUMEN.toast': 'a function',
  'LUMEN.modal': 'a module object',
  'LUMEN.drawer': 'a module object',
  'LUMEN.badges': 'a module object',
  'LUMEN.theme': 'a module object',
  'LUMEN.search': 'a module object',
  'LUMEN.reveal': 'a module object',
  'LUMEN.session': 'a module object',
  'LUMEN.seed': 'a module object',
  'LUMEN.onReady': 'a function',
  'LUMEN.boot': 'a function'
};

/* `const { a, b } = LUMEN.ns;` */
const DESTRUCTURE = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*(LUMEN\.[A-Za-z_$][\w$]*)\s*;/g;

let bad = 0;
const problems = [];

fs.readdirSync(jsDir)
  .filter((f) => f.endsWith('.js'))
  .forEach((file) => {
    const src = fs.readFileSync(path.join(jsDir, file), 'utf8');
    let m;
    DESTRUCTURE.lastIndex = 0;
    while ((m = DESTRUCTURE.exec(src))) {
      const names = m[1].split(',').map((s) => s.trim().split(/[:=]/)[0].trim()).filter(Boolean);
      const ns = m[2];
      const allowed = API[ns];
      const line = src.slice(0, m.index).split('\n').length;

      if (!allowed) {
        if (WHOLE[ns]) continue;
        problems.push(`${file}:${line}  destructures from unknown namespace ${ns}`);
        bad += 1;
        continue;
      }
      names.forEach((n) => {
        if (!allowed.includes(n)) {
          problems.push(`${file}:${line}  ${ns} has no "${n}"  (allowed: ${allowed.join(', ')})`);
          bad += 1;
        }
      });
    }
  });

/* Also flag helpers that modules use but never bind. */
['storefront', 'cart', 'wishlist', 'auth', 'checkout', 'profile', 'admin'].forEach((m) => {
  const p = path.join(jsDir, m + '.js');
  if (!fs.existsSync(p)) return;
  const src = fs.readFileSync(p, 'utf8');
  const used = {
    money: /\bmoney\s*\(/, num: /\bnum\s*\(/, icon: /\bicon\s*\(/,
    escapeHtml: /\bescapeHtml\s*\(/, formatDate: /\bformatDate\s*\(/
  };
  const bound = {
    money: /money\s*[,}]|= LUMEN\.fmt|\bmoney\b\s*[,}]/.test(src) && /LUMEN\.fmt/.test(src),
    num: /LUMEN\.fmt/.test(src),
    icon: /const icon = LUMEN\.icon/.test(src),
    escapeHtml: /LUMEN\.dom/.test(src),
    formatDate: /LUMEN\.fmt/.test(src)
  };
  Object.keys(used).forEach((k) => {
    if (used[k].test(src) && !bound[k]) {
      problems.push(`${m}.js  uses ${k}(...) but never binds it from a LUMEN namespace`);
      bad += 1;
    }
  });
});

if (bad) {
  console.log(problems.join('\n'));
  console.log(`\nFAIL - ${bad} namespace problem(s)`);
  process.exit(1);
}
console.log('PASS - every destructured LUMEN member exists on its namespace.');
