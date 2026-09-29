/* Verify that every class name used in js/ (and the HTML) exists in the CSS.
   Run: node tools/check-classes.js                                     */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const css = ['style.css', 'responsive.css', 'admin.css']
  .map((f) => fs.readFileSync(path.join(root, 'css', f), 'utf8'))
  .join('\n');

const definedClasses = new Set();
for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) definedClasses.add(m[1]);

/* The printable invoice opened by admin.js / profile.js ships its own inline
   <style> block, so those classes are defined even though they are not in the
   stylesheets. */
let inlineStyleCount = 0;
for (const f of ['app.js', 'admin.js', 'profile.js', 'checkout.js']) {
  const src = fs.readFileSync(path.join(root, 'js', f), 'utf8');
  for (const block of src.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
    for (const m of block[1].matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      definedClasses.add(m[1]);
      inlineStyleCount += 1;
    }
  }
}

// Candidate class names: every quoted string in js/ and html/ that looks like
// "one two three" of class tokens, plus class="..." attributes in HTML.
const sources = [];
const jsDir = path.join(root, 'js');
fs.readdirSync(jsDir).filter((f) => f.endsWith('.js')).forEach((f) => {
  sources.push([path.join('js', f), fs.readFileSync(path.join(jsDir, f), 'utf8')]);
});
const htmlDir = path.join(root);
['index.html', 'shop.html', 'product.html', 'cart.html', 'checkout.html', 'wishlist.html', 'login.html', 'signup.html', 'profile.html', 'orders.html']
  .forEach((f) => {
    const p = path.join(htmlDir, f);
    if (fs.existsSync(p)) sources.push([f, fs.readFileSync(p, 'utf8')]);
  });
fs.readdirSync(path.join(root, 'admin')).filter((f) => f.endsWith('.html')).forEach((f) => {
  sources.push([path.join('admin', f), fs.readFileSync(path.join(root, 'admin', f), 'utf8')]);
});

const missing = new Map();
// BEM-ish tokens: letters, digits, single/double underscores, dashes.
// Leading dash is kept for utility classes like .mt-4 / -webkit-x.
const VALID = /^-?[a-zA-Z][a-zA-Z0-9_-]*$/;
const note = (file, cls) => {
  if (!VALID.test(cls)) return;               // skip ${...} interpolation and operators
  if (!missing.has(cls)) missing.set(cls, new Set());
  missing.get(cls).add(file);
};

// 1. class="..." attributes (HTML and JS)
sources.forEach(([file, src]) => {
  for (const m of src.matchAll(/\sclass="([^"]*)"/g)) {
    if (m[1].includes('${')) continue;
    m[1].split(/\s+/).filter(Boolean).forEach((c) => {
      if (!definedClasses.has(c)) note(file, c);
    });
  }
});

// 2. class="..." inside JS template literals. Attributes that contain a ${...}
//    interpolation are skipped here — whitespace-splitting a JS expression
//    yields bogus tokens like "i" or "cls" — and are covered by the explicit
//    VARIANTS table below instead. Plus classList.add/toggle/remove.
sources.forEach(([file, src]) => {
  for (const m of src.matchAll(/class="([^"]*)"/g)) {
    if (m[1].includes('${')) continue;
    m[1].split(/\s+/).filter(Boolean).forEach((c) => {
      if (!definedClasses.has(c)) note(file, c);
    });
  }
  for (const m of src.matchAll(/classList\.(?:add|remove|toggle)\('([^']+)'/g)) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => {
      if (!definedClasses.has(c)) note(file, c);
    });
  }
});

console.log('classes defined in CSS: ' + definedClasses.size + ' (incl. ' + inlineStyleCount + ' from inline <style> blocks)');

/* Classes that only ever appear behind a ${...} interpolation are invisible to
   the scan above. Expand the known variant sets explicitly so they get checked
   too. */
const VARIANTS = {
  'js/app.js': [
    'toast--success', 'toast--error', 'toast--warn', 'toast--info',
    'modal--sm', 'modal--md', 'modal--lg',
    'btn--primary', 'btn--danger',
    'nav__link', 'mobile-nav__item', 'is-active',
    'status-pill', 'status-pill--success', 'status-pill--warn', 'status-pill--danger',
    'status-pill--info', 'status-pill--muted',
    'timeline__step', 'is-done', 'is-current',
    'product-card', 'product-card--sold', 'product-card--compact'
  ],
  'js/checkout.js': ['panel', 'checkout-steps__item', 'is-selected', 'is-error'],
  'js/profile.js': ['panel', 'avatar--sm', 'avatar--lg', 'avatar--xl', 'address-tile', 'is-default', 'tab', 'is-active'],
  'js/admin.js': ['side__link', 'is-active', 'delta', 'delta--up', 'delta--down'],
  'js/storefront.js': [
    'filter-item', 'is-active', 'pdp__thumb', 'swatch', 'text-success', 'text-danger',
    'badge--sale', 'badge--new', 'price--lg'
  ]
};

sources.forEach(([file]) => {
  (VARIANTS[file.replace(/\\/g, '/')] || []).forEach((c) => {
    if (!definedClasses.has(c)) note(file, c);
  });
});

if (!missing.size) {
  console.log('PASS - every class referenced in JS/HTML exists in the CSS.');
} else {
  const names = [...missing.keys()].sort();
  console.log('MISSING CLASSES (' + names.length + '):');
  names.forEach((c) => console.log('  .' + c + '   used in: ' + [...missing.get(c)].join(', ')));
}
