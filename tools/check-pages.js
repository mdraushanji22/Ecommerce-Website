/* Static contract check for the 20 HTML pages.
   For each page it verifies:
     1. required data-* hooks referenced by the page's own scripts exist
     2. required element ids referenced by those scripts exist
     3. stylesheet + script tags are present, in the documented order
     4. header/footer slots exist on storefront pages
     5. local asset references (src/href) resolve to real files
   Run: node tools/check-pages.js                                            */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const STOREFRONT_SCRIPTS = [
  'js/products.js',
  'js/app.js',
  'js/cart.js',
  'js/wishlist.js',
  'js/auth.js'
];

const PAGES = [
  { file: 'index.html', page: 'home', root: '', extra: ['js/storefront.js'], hooks: ['data-slot', 'data-home-hero-stats', 'data-home-trust', 'data-home-categories', 'data-home-featured', 'data-home-dealband', 'data-home-new', 'data-home-deals', 'data-home-best', 'data-home-testimonials', 'data-home-faq', 'data-newsletter-form'] },
  { file: 'shop.html', page: 'shop', root: '', extra: ['js/storefront.js'], hooks: ['data-slot', 'data-shop-root', 'data-shop-count', 'data-shop-title', 'data-shop-search', 'data-shop-categories', 'data-shop-brands', 'data-shop-price', 'data-shop-rating', 'data-shop-sort', 'data-shop-chips', 'data-shop-categories', 'data-clear-filters', 'data-close-filters', 'data-open-filters', 'data-set-view', 'data-toggle-deals', 'data-toggle-stock'] },
  { file: 'product.html', page: 'product', root: '', extra: ['js/storefront.js'], hooks: ['data-slot', 'data-pdp-root', 'data-pdp-crumbs'] },
  { file: 'cart.html', page: 'cart', root: '', extra: [], hooks: ['data-slot', 'data-cart-root', 'data-cart-summary', 'data-cart-count-label'] },
  { file: 'checkout.html', page: 'checkout', root: '', extra: ['js/checkout.js'], hooks: ['data-slot', 'data-checkout-root', 'data-checkout-steps', 'data-checkout-panel', 'data-checkout-summary', 'data-checkout-nav'] },
  { file: 'wishlist.html', page: 'wishlist', root: '', extra: [], hooks: ['data-slot', 'data-wishlist-root', 'data-wishlist-count-label', 'data-wishlist-toolbar'] },
  { file: 'login.html', page: 'login', root: '', extra: [], hooks: ['data-slot'], ids: ['loginForm', 'loginEmail', 'loginPassword', 'loginRemember', 'loginAsAdmin'] },
  { file: 'signup.html', page: 'signup', root: '', extra: [], hooks: ['data-slot', 'data-strength-meter', 'data-strength-label'], ids: ['signupForm', 'signupName', 'signupEmail', 'signupPhone', 'signupPassword', 'signupConfirm', 'signupTerms'] },
  { file: 'profile.html', page: 'profile', root: '', extra: ['js/profile.js'], hooks: ['data-slot', 'data-profile-root', 'data-profile-tabs'] },
  { file: 'orders.html', page: 'orders', root: '', extra: ['js/profile.js'], hooks: ['data-slot', 'data-orders-root', 'data-orders-count-label', 'data-order-filters', 'data-order-search', 'data-order-filter', 'data-orders-clear'] },

  { file: 'admin/index.html', admin: 'dashboard', hooks: ['data-admin-shell', 'data-admin-stats', 'data-admin-ops', 'data-admin-legend', 'data-admin-recent', 'data-admin-lowstock'] },
  { file: 'admin/analytics.html', admin: 'analytics', hooks: ['data-admin-shell', 'data-analytics-range', 'data-analytics-stats', 'data-analytics-legend', 'data-analytics-top', 'data-chart'] },
  { file: 'admin/products.html', admin: 'products', hooks: ['data-admin-shell', 'data-admin-products-tbody', 'data-admin-product-search', 'data-admin-product-category', 'data-admin-filter-count', 'data-admin-add-product'], ids: ['adminProductsTable'] },
  { file: 'admin/categories.html', admin: 'categories', hooks: ['data-admin-shell', 'data-admin-categories-tbody', 'data-admin-filter-count', 'data-admin-add-category'] },
  { file: 'admin/reviews.html', admin: 'reviews', hooks: ['data-admin-shell', 'data-admin-reviews-tbody', 'data-admin-filter-count'] },
  { file: 'admin/coupons.html', admin: 'coupons', hooks: ['data-admin-shell', 'data-admin-coupons-tbody', 'data-admin-coupon-search', 'data-admin-coupon-status', 'data-admin-filter-count', 'data-admin-add-coupon'], ids: ['adminCouponsTable'] },
  { file: 'admin/orders.html', admin: 'orders', hooks: ['data-admin-shell', 'data-admin-orders-tbody', 'data-admin-order-search', 'data-admin-order-status', 'data-admin-filter-count'], ids: ['adminOrdersTable'] },
  { file: 'admin/customers.html', admin: 'customers', hooks: ['data-admin-shell', 'data-admin-customers-tbody', 'data-admin-customer-search', 'data-admin-customer-status', 'data-admin-filter-count'], ids: ['adminCustomersTable'] },
  { file: 'admin/settings.html', admin: 'settings', hooks: ['data-admin-shell', 'data-settings-preview', 'data-save-settings', 'data-reset-settings'], ids: ['settingsForm'] },
  { file: 'admin/login.html', admin: null, scripts: ['js/products.js', 'js/app.js', 'js/auth.js'], hooks: ['data-fill-admin'], ids: ['adminLoginForm', 'adminEmail', 'adminPassword', 'adminCode'] }
];

let failures = 0;

function fail(file, msg) {
  failures += 1;
  console.log(`FAIL  ${file}\n        ${msg}`);
}

PAGES.forEach((spec) => {
  const abs = path.join(root, spec.file);
  if (!fs.existsSync(abs)) {
    fail(spec.file, 'page does not exist');
    return;
  }
  const html = read(spec.file);

  // --- body attributes -------------------------------------------------
  if (spec.page && !html.includes(`data-page="${spec.page}"`)) {
    fail(spec.file, `expected <body data-page="${spec.page}">`);
  }
  if (spec.admin && !html.includes(`data-admin-page="${spec.admin}"`)) {
    fail(spec.file, `expected <body data-admin-page="${spec.admin}">`);
  }

  // --- scripts, in order ----------------------------------------------
  const isAdmin = spec.admin !== undefined || spec.file.startsWith('admin/');
  const expected = spec.scripts
    ? spec.scripts.map((s) => '../' + s)
    : isAdmin
      ? ['js/products.js', 'js/app.js', 'js/auth.js', 'js/admin.js'].map((s) => '../' + s)
      : STOREFRONT_SCRIPTS.concat(spec.extra || []);

  const found = [];
  const re = /<script src="([^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html))) found.push(m[1]);

  expected.forEach((s) => {
    if (!found.includes(s)) fail(spec.file, `missing <script src="${s}">`);
  });

  // Order must match exactly, and there must be no extra scripts.
  if (found.join('|') !== expected.join('|')) {
    fail(spec.file, `script order/set mismatch\n        expected: ${expected.join(', ')}\n        found:    ${found.join(', ')}`);
  }

  // --- hooks + ids ------------------------------------------------------
  (spec.hooks || []).forEach((h) => {
    if (!html.includes(h)) fail(spec.file, `missing hook [${h}]`);
  });
  (spec.ids || []).forEach((id) => {
    if (!new RegExp(`id="${id}"`).test(html)) fail(spec.file, `missing id="${id}"`);
  });

  // --- slots ------------------------------------------------------------
  if (spec.page) {
    ['data-slot="header"', 'data-slot="footer"'].forEach((slot) => {
      if (!html.includes(slot)) fail(spec.file, `missing ${slot}`);
    });
  }

  // --- stylesheets ------------------------------------------------------
  ['style.css', 'responsive.css'].forEach((f) => {
    if (!html.includes(f)) fail(spec.file, `missing stylesheet ${f}`);
  });
  if (spec.file.startsWith('admin/') && !html.includes('admin.css')) {
    fail(spec.file, 'missing stylesheet admin.css');
  }

  // --- local asset references resolve ----------------------------------
  const refRe = /(?:src|href)="([^"#?][^"]*)"/g;
  while ((m = refRe.exec(html))) {
    const ref = m[1].split(/[?#]/)[0];   // strip query strings and anchors
    if (!ref) continue;
    if (/^(https?:|mailto:|tel:|data:|javascript:)/i.test(ref)) continue;
    const target = path.join(path.dirname(abs), ref);
    if (!fs.existsSync(target)) fail(spec.file, `broken reference: ${ref}`);
  }
});

console.log(`\npages checked: ${PAGES.length}`);
if (failures) {
  console.log(`FAIL - ${failures} problem${failures === 1 ? '' : 's'}`);
  process.exit(1);
}
console.log('PASS - every page satisfies its script contract and all asset references resolve.');
