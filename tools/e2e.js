/* End-to-end suite driving headless Chrome over CDP against a real http
   origin, so localStorage persistence, auth guards and the admin shell are
   exercised for real.
   Run: node tools/e2e.js                                                  */
const path = require('path');
const { launch, sleep } = require('./cdp.js');

let passed = 0;
let failed = 0;
const failures = [];
let group = '';

function describe(name) { group = name; console.log('\n' + name); }

function check(label, ok, detail) {
  if (ok) { passed += 1; console.log('  ok    ' + label); }
  else {
    failed += 1;
    failures.push(group + ' > ' + label + (detail ? ' -- ' + detail : ''));
    console.log('  FAIL  ' + label + (detail ? '  << ' + detail : ''));
  }
}

function eq(label, actual, expected) {
  check(label, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

(async () => {
  const ctx = await launch(path.join(__dirname, '..'));
  const { session, base } = ctx;
  const page = (rel) => session.navigate(base + '/' + rel);
  const storage = () => session.eval('return Object.keys(localStorage).filter((k) => k.indexOf("lumen:") === 0);');

  /* ---------------------------------------------------------------- boot */
  describe('Shell + seeds');
  await page('index.html');
  session.clearErrors();

  let r = await session.eval(`
    return {
      title: document.title,
      booted: document.body.classList.contains('is-booted'),
      header: !!document.querySelector('header.header'),
      footer: !!document.querySelector('footer.footer'),
      navLinks: document.querySelectorAll('.nav__link').length,
      cards: document.querySelectorAll('.product-card').length,
      catTiles: document.querySelectorAll('.category-tile').length,
      trustTiles: document.querySelectorAll('.trust-item').length,
      faq: document.querySelectorAll('.faq').length,
      emptyHosts: Array.from(document.querySelectorAll('[data-home-hero-stats],[data-home-categories],[data-home-featured],[data-home-deals],[data-home-best],[data-home-testimonials],[data-home-faq],[data-home-new],[data-home-dealband],[data-home-trust]')).filter((el) => !el.children.length).map((el) => el.getAttributeNames().find((a) => a.indexOf('data-home') === 0))
    };
  `);
  eq('title', r.title, 'Lumen — Premium technology, priced honestly');
  check('body.is-booted set', r.booted);
  check('header injected by app.js', r.header);
  check('footer injected by app.js', r.footer);
  check('nav has links', r.navLinks >= 5, 'got ' + r.navLinks);
  check('home renders product cards', r.cards >= 12, 'got ' + r.cards);
  check('home renders category tiles', r.catTiles === 6, 'got ' + r.catTiles);
  check('home renders trust items', r.trustTiles === 4, 'got ' + r.trustTiles);
  check('home renders FAQ', r.faq === 5, 'got ' + r.faq);
  eq('no home host left empty', r.emptyHosts.length, 0);

  const keys = await storage();
  check('seeds written to localStorage', keys.length >= 8, keys.join(', '));
  check('no console errors on home', session.errors().length === 0, session.errors().join(' | '));

  /* ------------------------------------------------- product artwork */
  describe('Product artwork');
  const art = await session.eval(`
    // Every seeded product must point at artwork that decodes and reads as a
    // lit render rather than a flat placeholder mark.
    const seen = new Map();
    for (const p of LUMEN.data.SEED_PRODUCTS) {
      const src = LUMEN.data.imageUrl(p.image);
      if (!src) continue;
      if (!seen.has(src)) seen.set(src, p.name);
    }
    const load = (src) => new Promise((res) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = 120; c.height = 120;
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, 120, 120);
        const d = g.getImageData(0, 0, 120, 120).data;
        const tones = new Set();
        let sum = 0;
        for (let i = 0; i < d.length; i += 4) {
          tones.add((d[i] >> 3) + ',' + (d[i+1] >> 3) + ',' + (d[i+2] >> 3));
          sum += 0.2126 * d[i] + 0.7152 * d[i+1] + 0.0722 * d[i+2];
        }
        res({ ok: true, w: img.naturalWidth, tones: tones.size, mean: Math.round(sum / (d.length / 4)) });
      };
      img.onerror = () => res({ ok: false });
      img.src = src;
    });
    return Promise.all([...seen.entries()].map(async ([src, name]) => {
      const r = await load(src);
      return { src, name, ...r };
    }));
  `);
  check('every product has artwork assigned', art.length >= 20, 'products with art: ' + art.length);
  const broken = art.filter((a) => !a.ok || a.w < 100);
  check('all product artwork decodes', broken.length === 0,
        broken.map((b) => b.src + ' (' + b.name + ')').join(', '));
  const flat = art.filter((a) => a.ok && a.tones < 40);
  check('no product artwork is a flat placeholder', flat.length === 0,
        flat.map((f) => f.src + ' tones=' + f.tones).join(', '));
  const means = art.filter((a) => a.ok).map((a) => a.mean);
  const spread = Math.max(...means) - Math.min(...means);
  check('the artwork set shares one lighting setup', spread <= 45, 'mean luminance spread: ' + spread);
  const noImage = await session.eval(`
    // Card images are lazy, so walk the page first to let them settle.
    const step = 400;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    const imgs = Array.from(document.querySelectorAll('.product-card img'));
    await Promise.all(imgs.map((i) => i.complete && i.naturalWidth
      ? null
      : new Promise((r) => { i.addEventListener('load', r, { once: true }); i.addEventListener('error', r, { once: true }); })));
    await new Promise((r) => setTimeout(r, 120));
    return {
      total: imgs.length,
      broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).length,
      sources: imgs.slice(0, 3).map((i) => i.getAttribute('src'))
    };
  `);
  check('home product cards all show an image', noImage.total > 0 && noImage.broken === 0,
        noImage.broken + ' of ' + noImage.total + ' failed');
  check('card images point at the catalogue artwork',
        noImage.sources.every((s) => typeof s === 'string' && s.startsWith('assets/images/') && s.endsWith('.svg')),
        JSON.stringify(noImage.sources));

  /* ----------------------------------------------------------------- shop */
  describe('Shop filtering + sorting');
  await page('shop.html');
  session.clearErrors();
  r = await session.eval(`
    const q = (s) => document.querySelector(s);
    return {
      resultCount: q('[data-shop-count]') ? q('[data-shop-count]').textContent.trim() : null,
      cards: document.querySelectorAll('.product-card').length,
      sortOptions: document.querySelectorAll('[data-shop-sort] option').length,
      catFilters: document.querySelectorAll('[data-shop-categories] button').length,
      brandFilters: document.querySelectorAll('[data-shop-brands] input').length,
      priceInputs: document.querySelectorAll('[data-shop-price] input').length,
      ratingFilters: document.querySelectorAll('[data-shop-rating] button').length,
      chipsHost: !!q('[data-shop-chips]')
    };
  `);
  const total = Number(String(r.resultCount).replace(/[^0-9]/g, ''));
  check('all 25 products listed', r.cards === 25, 'got ' + r.cards);
  eq('sort options present', r.sortOptions, 6);
  check('category filters built', r.catFilters >= 6, 'got ' + r.catFilters);
  check('brand filters built', r.brandFilters >= 5, 'got ' + r.brandFilters);
  eq('price min/max inputs', r.priceInputs, 2);
  check('rating filters built', r.ratingFilters === 4, 'got ' + r.ratingFilters);
  check('result count text present', total === 25, 'raw: ' + r.resultCount);

  const filtered = await session.eval(`
    document.querySelector('[data-shop-categories] button[data-set-category="smartphones"]').click();
    await new Promise((s) => setTimeout(s, 120));
    return {
      cards: document.querySelectorAll('.product-card').length,
      chip: document.querySelector('[data-shop-chips] .chip') ? document.querySelector('[data-shop-chips] .chip').textContent.trim() : null,
      // Re-query: the filter host is re-rendered, so the original node is gone.
      active: document.querySelector('[data-shop-categories] button[data-set-category="smartphones"]').classList.contains('is-active'),
      url: location.search
    };
  `);
  check('category filter narrows results', filtered.cards > 0 && filtered.cards < 25, 'got ' + filtered.cards);
  check('category filter marked active', filtered.active);
  check('active filter shown as chip', !!filtered.chip, 'chip: ' + filtered.chip);
  check('filter synced to URL query', /category=smartphones/.test(filtered.url), filtered.url);

  const sorted = await session.eval(`
    const sel = document.querySelector('[data-shop-sort]');
    sel.value = 'price-asc';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((s) => setTimeout(s, 60));
    const prices = Array.from(document.querySelectorAll('.product-card')).map((c) => {
      const m = (c.textContent.match(/[\\u20b9][\\d,]+/g) || []).map((t) => Number(t.replace(/[^0-9]/g, '')));
      return Math.min.apply(null, m);
    });
    const asc = prices.every((v, i) => i === 0 || prices[i - 1] <= v);
    return { asc, first: prices[0], last: prices[prices.length - 1] };
  `);
  check('price-asc sort is monotonic', sorted.asc, JSON.stringify(sorted));

  await page('shop.html?q=aurora');
  const searched = await session.eval(`
    return {
      cards: document.querySelectorAll('.product-card').length,
      title: document.querySelector('[data-shop-title]') ? document.querySelector('[data-shop-title]').textContent.trim() : null,
      count: document.querySelector('[data-shop-count]').textContent.trim(),
      names: Array.from(document.querySelectorAll('.product-card__name')).map((n) => n.textContent.trim())
    };
  `);
  check('search query filters to matches', searched.cards > 0 && searched.cards < 25,
        searched.cards + ' cards: ' + searched.names.join(' / '));
  check('every result matches the query', searched.names.every((n) => /aurora/i.test(n)),
        searched.names.join(' / '));
  check('search updates the results heading', /aurora/i.test(String(searched.title)), String(searched.title));
  check('no console errors on shop', session.errors().length === 0, session.errors().join(' | '));

  /* ------------------------------------------------------------------ pdp */
  describe('Product detail page');
  await page('product.html?id=LUM-1001');
  session.clearErrors();
  r = await session.eval(`
    const t = (s) => { const el = document.querySelector(s); return el ? el.textContent.trim() : null; };
    return {
      booted: document.body.classList.contains('is-booted'),
      notFound: /could not find/i.test(document.body.textContent),
      name: t('.pdp__title'),
      price: t('.price--lg .price__now'),
      mrp: t('.price--lg .price__was'),
      thumbs: document.querySelectorAll('.pdp__thumb').length,
      specRows: document.querySelectorAll('.spec-table tr, .specs__row').length,
      swatches: document.querySelectorAll('.swatch').length,
      variant: document.querySelector('[data-variant-label]') ? document.querySelector('[data-variant-label]').textContent.trim() : null,
      variantLabel: (document.querySelector('.pdp__variants .field__label') ? document.querySelector('.pdp__variants .field__label').textContent.trim() : '').split(':')[0].trim(),
      qty: t('[data-pdp-qty]'),
      crumbs: document.querySelectorAll('.crumbs a').length,
      img: t('[data-pdp-image]') || (document.querySelector('[data-pdp-image]') ? document.querySelector('[data-pdp-image]').getAttribute('src') : null),
      cartBadge: t('[data-cart-count]'),
      reviewCount: document.querySelectorAll('.review').length,
      addBtn: !!document.querySelector('[data-pdp-add]')
    };
  `);
  check('pdp booted', r.booted);
  check('pdp did not fall back to not-found', !r.notFound);
  eq('pdp shows product name', r.name, 'Aurora X1 Pro');
  // 18% off 79,999 -> 65,599 (catalogue prices are GST-inclusive).
  check('pdp shows the discounted price', /65,599/.test(String(r.price)), String(r.price));
  check('pdp shows struck-through MRP', /79,999/.test(String(r.mrp)), String(r.mrp));
  check('pdp shows the full gallery', r.thumbs >= 4, 'got ' + r.thumbs);
  check('pdp shows spec rows', r.specRows >= 5, 'got ' + r.specRows);
  eq('pdp offers one swatch per storage option', r.swatches, 3);
  eq('pdp labels the option group', r.variantLabel, 'Storage');
  eq('pdp preselects the first option', r.variant, '256 GB');
  eq('pdp quantity starts at 1', r.qty, '1');
  check('pdp breadcrumb has 3 links', r.crumbs === 3, 'got ' + r.crumbs);
  check('pdp main image resolved', /\.svg$/.test(String(r.img)), String(r.img));
  check('pdp shows reviews', r.reviewCount >= 1, 'got ' + r.reviewCount);
  check('pdp has add-to-cart button', r.addBtn);

  await page('product.html?id=NOPE-404');
  const fallback = await session.eval(`
    return {
      empty: !!document.querySelector('.empty'),
      text: /could not find/i.test(document.body.textContent),
      cta: document.querySelector('.empty a') ? document.querySelector('.empty a').getAttribute('href') : null
    };
  `);
  check('unknown product id shows a not-found state', fallback.empty && fallback.text,
        'empty=' + fallback.empty + ' text=' + fallback.text);
  check('not-found state links back to the shop', fallback.cta === 'shop.html', String(fallback.cta));

  // Return to a real product for the add-to-cart assertions.
  await page('product.html?id=LUM-1001');
  session.clearErrors();

  const added = await session.eval(`
    const before = Number(document.querySelector('[data-cart-count]').textContent) || 0;
    document.querySelector('[data-pdp-inc]').click();
    await new Promise((s) => setTimeout(s, 60));
    const qty = document.querySelector('[data-pdp-qty]').textContent.trim();
    // Pick the second storage option so the cart line records a variant.
    document.querySelectorAll('.swatch')[1].click();
    await new Promise((s) => setTimeout(s, 60));
    const variant = document.querySelector('[data-variant-label]').textContent.trim();
    document.querySelector('[data-pdp-add]').click();
    await new Promise((s) => setTimeout(s, 150));
    return {
      before,
      qty,
      variant,
      after: Number(document.querySelector('[data-cart-count]').textContent) || 0,
      toast: document.querySelector('.toast') ? document.querySelector('.toast').textContent.replace(/\\s+/g,' ').trim() : null,
      stored: JSON.parse(localStorage.getItem('lumen:cart') || '[]')
    };
  `);
  eq('quantity stepper increments', added.qty, '2');
  eq('variant selection updates the label', added.variant, '512 GB');
  eq('add to cart adds the chosen quantity', added.after, added.before + 2);
  check('add to cart persists to storage', added.stored.length === 1 && added.stored[0].qty === 2,
        JSON.stringify(added.stored[0] || {}));
  check('the chosen variant is stored on the line', added.stored[0] && added.stored[0].variant === '512 GB',
        JSON.stringify(added.stored[0] || {}));
  check('add to cart shows a toast', !!added.toast, String(added.toast));
  check('no console errors on pdp', session.errors().length === 0, session.errors().join(' | '));

  /* ----------------------------------------------------------------- cart */
  describe('Cart page + coupon');
  await page('cart.html');
  session.clearErrors();
  r = await session.eval(`
    const t = (s) => { const el = document.querySelector(s); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null; };
    const rows = () => document.querySelectorAll('.totals__row');
    const labels = () => Array.from(rows()).map((r) => r.querySelector('span').textContent.trim());
    return {
      lines: document.querySelectorAll('.cart-row').length,
      lineName: t('.cart-row__name'),
      lineMeta: t('.cart-row__meta'),
      label: t('[data-cart-count-label]'),
      rowLabels: labels(),
      total: t('.totals__row--grand strong'),
      checkout: !!document.querySelector('a[href*="checkout"]'),
      couponInput: !!document.querySelector('[data-coupon-form] input'),
      clearBtn: !!document.querySelector('[data-clear-cart]'),
      shipMeter: !!document.querySelector('.ship-meter__bar')
    };
  `);
  eq('cart renders the added line', r.lines, 1);
  eq('cart line shows the product', r.lineName, 'Aurora X1 Pro');
  check('cart line shows the chosen variant', /512 GB/.test(String(r.lineMeta)), String(r.lineMeta));
  eq('cart header count reflects quantity', r.label, '2 items');
  check('totals list subtotal/shipping/GST/total', r.rowLabels.length === 4, r.rowLabels.join(' | '));
  check('totals show an INR grand total', /[\u20b9]/.test(String(r.total)), String(r.total));
  check('cart has checkout link', r.checkout);
  check('cart has coupon form', r.couponInput);
  check('cart has clear-bag control', r.clearBtn);
  check('cart shows free-shipping meter', r.shipMeter);

  const qty = await session.eval(`
    const total = () => document.querySelector('.totals__row--grand strong').textContent.trim();
    const t0 = total();
    document.querySelector('[data-inc]').click();
    await new Promise((s) => setTimeout(s, 100));
    const t1 = total();
    const stored = JSON.parse(localStorage.getItem('lumen:cart'))[0].qty;
    document.querySelector('[data-dec]').click();
    await new Promise((s) => setTimeout(s, 100));
    return { t0, t1, stored, t2: total(), qtyAfterDec: JSON.parse(localStorage.getItem('lumen:cart'))[0].qty };
  `);
  eq('quantity increment persists', qty.stored, 3);
  check('total recalculates with quantity', qty.t0 !== qty.t1, qty.t0 + ' -> ' + qty.t1);
  eq('quantity decrement persists', qty.qtyAfterDec, 2);

  const badCoupon = await session.eval(`
    const input = document.querySelector('[data-coupon-form] input');
    input.value = 'NOTAREALCODE';
    document.querySelector('[data-coupon-form] button[type=submit]').click();
    await new Promise((s) => setTimeout(s, 140));
    return { toast: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent.replace(/\\s+/g,' ').trim()), stored: localStorage.getItem('lumen:appliedCoupon') };
  `);
  check('invalid coupon is rejected with feedback', badCoupon.toast.some((t) => /not valid|no longer active|expired|spend/i.test(t)),
        JSON.stringify(badCoupon.toast));
  eq('invalid coupon is not stored', badCoupon.stored, null);

  const coupon = await session.eval(`
    const input = document.querySelector('[data-coupon-form] input');
    input.value = 'WELCOME10';
    document.querySelector('[data-coupon-form] button[type=submit]').click();
    await new Promise((s) => setTimeout(s, 160));
    return {
      labels: Array.from(document.querySelectorAll('.totals__row')).map((r) => r.querySelector('span').textContent.trim()),
      discount: document.querySelector('.totals__row--discount strong') ? document.querySelector('.totals__row--discount strong').textContent.trim() : null,
      chip: document.querySelector('[data-remove-coupon]') ? document.querySelector('[data-remove-coupon]').parentElement.textContent.replace(/\\s+/g,' ').trim() : null,
      total: document.querySelector('.totals__row--grand strong').textContent.trim(),
      stored: localStorage.getItem('lumen:appliedCoupon')
    };
  `);
  check('valid coupon adds a discount row', coupon.labels.some((l) => /^Discount/.test(l)), coupon.labels.join(' | '));
  check('discount row names the coupon', /WELCOME10/.test(coupon.labels.join('|')), coupon.labels.join(' | '));
  check('discount amount is shown', /[\u20b9]/.test(String(coupon.discount)), String(coupon.discount));
  check('applied coupon shown as a chip', /WELCOME10/.test(String(coupon.chip)), String(coupon.chip));
  check('discount lowers the grand total', coupon.total !== qty.t2, qty.t2 + ' -> ' + coupon.total);
  check('coupon persisted', /WELCOME10/.test(String(coupon.stored)), String(coupon.stored));

  const removed = await session.eval(`
    document.querySelector('[data-remove-coupon]').click();
    await new Promise((s) => setTimeout(s, 160));
    return {
      labels: Array.from(document.querySelectorAll('.totals__row')).map((r) => r.querySelector('span').textContent.trim()),
      stored: localStorage.getItem('lumen:appliedCoupon'),
      total: document.querySelector('.totals__row--grand strong').textContent.trim()
    };
  `);
  check('coupon can be removed', !removed.labels.some((l) => /^Discount/.test(l)), removed.labels.join(' | '));
  eq('total restored after coupon removal', removed.total, qty.t2);

  const emptied = await session.eval(`
    document.querySelector('[data-remove]').click();
    // Removal is animated before the line is dropped from storage.
    await new Promise((s) => setTimeout(s, 450));
    return {
      lines: document.querySelectorAll('.cart-row').length,
      empty: !!document.querySelector('.empty'),
      stored: JSON.parse(localStorage.getItem('lumen:cart') || '[]').length
    };
  `);
  eq('removing the line empties the cart', emptied.stored, 0);
  check('empty cart shows an empty state', emptied.empty, 'lines: ' + emptied.lines);
  check('no console errors on cart', session.errors().length === 0, session.errors().join(' | '));

  /* repopulate for the checkout tests */
  await page('product.html?id=LUM-1001');
  await session.eval(`
    document.querySelector('[data-pdp-add]').click();
    await new Promise((s) => setTimeout(s, 120));
    return true;
  `);
  session.clearErrors();

  /* ----------------------------------------------------------------- auth */
  describe('Auth guards + sign in');
  await page('profile.html');
  session.clearErrors();
  r = await session.eval(`return { path: location.pathname.split('/').pop(), title: document.title, hasProfile: !!document.querySelector('[data-profile-root]') };`);
  check('guest is redirected away from profile', /login\.html/.test(r.path) || /sign/i.test(r.title),
        r.path + ' | ' + r.title);

  await page('orders.html');
  r = await session.eval(`return { path: location.pathname.split('/').pop() };`);
  check('guest is redirected away from orders', /login\.html/.test(r.path), r.path);

  await page('admin/index.html');
  r = await session.eval(`return { path: location.pathname.split('/').pop() };`);
  check('guest is redirected away from admin', /login\.html/.test(r.path), r.path);

  const badPassword = await (async () => {
    await page('login.html');
    await session.waitForSelector('#loginForm');
    return session.eval(`
      const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      set('[name=email]', 'demo@lumen.in');
      set('[name=password]', 'WrongPassword1');
      (document.querySelector('[data-login-form]') || document.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await new Promise((s) => setTimeout(s, 320));
      return {
        session: !!sessionStorage.getItem('lumen:session'),
        toasts: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent.replace(/\\s+/g, ' ').trim()),
        formError: document.querySelector('#loginForm') ? document.querySelector('#loginForm').classList.contains('is-error') : null,
        path: location.pathname.split('/').pop()
      };
    `);
  })();
  check('wrong password does not create a session', badPassword.session === false);
  check('wrong password is reported to the shopper',
        badPassword.toasts.some((t) => /does not match|could not find|blocked/i.test(t)),
        JSON.stringify(badPassword.toasts));
  check('the login form is flagged as errored', badPassword.formError === true, String(badPassword.formError));
  check('wrong password keeps the shopper on login', /login\.html/.test(badPassword.path), badPassword.path);

  const signedIn = await (async () => {
    await page('login.html');
    await session.waitForSelector('#loginForm');
    // Submitting redirects, which destroys the evaluating context.
    await session.eval(`
      const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      set('[name=email]', 'demo@lumen.in');
      set('[name=password]', 'Demo@2026');
      (document.querySelector('[data-login-form]') || document.querySelector('form')).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return true;
    `, { tolerateNavigation: true });
    // Wait for the redirect to land before reading the session back.
    for (let i = 0; i < 60; i += 1) {
      if (/profile\.html/.test(await session.eval('return location.pathname'))) break;
      await sleep(60);
    }
    return session.eval(`
      return {
        path: location.pathname.split('/').pop(),
        session: !!sessionStorage.getItem('lumen:session'),
        user: JSON.parse(sessionStorage.getItem('lumen:session') || 'null')
      };
    `);
  })();
  check('sign-in writes a session', signedIn.session === true);
  check('signed in as the demo customer', signedIn.user && signedIn.user.email === 'demo@lumen.in',
        signedIn.user ? signedIn.user.email : 'no session');
  check('sign-in leaves the login page', !/login\.html/.test(signedIn.path), signedIn.path);

  /* ------------------------------------------------------------- checkout */
  describe('Checkout flow');
  // The sign-in redirect may still be loading, so settle before touching LUMEN.
  for (let i = 0; i < 80; i += 1) {
    if (await session.eval('return document.readyState === "complete" && !!window.LUMEN && !!LUMEN.auth')) break;
    await sleep(60);
  }
  // The catalogue ships demo orders and a saved address, and both collections
  // seed lazily on first read, so force the seed before snapshotting counts and
  // compare deltas rather than absolutes.
  const seedState = await session.eval(`
    LUMEN.auth.ordersFor(LUMEN.auth.currentUser());
    LUMEN.auth.addresses();
    return {
      orders: JSON.parse(localStorage.getItem('lumen:orders') || '[]').length,
      addresses: JSON.parse(localStorage.getItem('lumen:addresses') || '[]').length
    };
  `);
  await page('checkout.html');
  session.clearErrors();
  r = await session.eval(`
    const t = (s) => { const el = document.querySelector(s); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null; };
    return {
      steps: document.querySelectorAll('[data-checkout-steps] li').length,
      stepLabels: Array.from(document.querySelectorAll('.checkout-steps__label')).map((e) => e.textContent.trim()),
      panel: document.querySelector('[data-checkout-panel]').children.length,
      panelIndex: document.querySelector('[data-step-panel]') ? document.querySelector('[data-step-panel]').getAttribute('data-step-panel') : null,
      summary: !!document.querySelector('[data-checkout-summary]'),
      summaryLines: document.querySelectorAll('[data-checkout-summary] .summary__row, [data-checkout-summary] .totals__row').length,
      next: t('[data-checkout-next]'),
      prevHidden: document.querySelector('[data-checkout-prev]') ? document.querySelector('[data-checkout-prev]').hidden : null
    };
  `);
  eq('four checkout steps listed', r.steps, 4);
  eq('steps are Contact/Shipping/Payment/Review', r.stepLabels.join('/'), 'Contact/Shipping/Payment/Review');
  check('active step panel rendered', r.panel > 0, 'children: ' + r.panel);
  eq('first step is active', r.panelIndex, '0');
  check('order summary present', r.summary);
  check('summary lists cart lines', r.summaryLines >= 2, 'rows: ' + r.summaryLines);
  check('continue button invites the next step', /continue/i.test(String(r.next)), String(r.next));
  check('back button hidden on the first step', r.prevHidden === true, String(r.prevHidden));

  const validation = await session.eval(`
    // Step 1 with blank contact details must not advance.
    document.querySelector('[data-checkout-next]').click();
    await new Promise((s) => setTimeout(s, 120));
    return {
      step: document.querySelector('[data-step-panel]').getAttribute('data-step-panel'),
      errors: Array.from(document.querySelectorAll('.field__error')).map((e) => e.textContent.trim()).filter(Boolean)
    };
  `);
  eq('blank contact details block the step', validation.step, '0');
  check('contact fields show validation errors', validation.errors.length >= 1, JSON.stringify(validation.errors));

  const contact = await session.eval(`
    const set = (name, v) => {
      const el = document.querySelector('[data-field="' + name + '"]');
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('contactEmail', 'demo@lumen.in');
    set('contactPhone', '9876543210');
    await new Promise((s) => setTimeout(s, 60));
    document.querySelector('[data-checkout-next]').click();
    await new Promise((s) => setTimeout(s, 160));
    return {
      step: document.querySelector('[data-step-panel]').getAttribute('data-step-panel'),
      title: document.querySelector('.checkout-step__title').textContent.trim(),
      addresses: document.querySelectorAll('[data-address-radio]').length,
      hasAdd: !!document.querySelector('[data-add-address]')
    };
  `);
  eq('valid contact advances to Shipping', contact.step, '1');
  check('shipping step titled correctly', /address/i.test(contact.title), contact.title);
  check('shipping step can add an address', contact.hasAdd);

  const address = await session.eval(`
    document.querySelector('[data-add-address]').click();
    await new Promise((s) => setTimeout(s, 260));
    const form = document.querySelector('#addressForm');
    const set = (name, v) => {
      const el = form.querySelector('[data-field="' + name + '"]');
      if (!el) return false;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    const filled = {
      name: set('addressName', 'Aarav Sharma'),
      line: set('addressLine', '42 Brigade Road'),
      city: set('addressCity', 'Bengaluru'),
      state: set('addressState', 'Karnataka'),
      postal: set('addressPostal', '560001')
    };
    // Invalid PIN first, to prove the modal validates.
    form.querySelector('[data-field="addressPostal"]').value = '12';
    form.querySelector('[data-field="addressPostal"]').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-save-address]').click();
    await new Promise((s) => setTimeout(s, 160));
    const invalid = Array.from(document.querySelectorAll('.field__error')).map((e) => e.textContent.trim()).filter(Boolean);
    form.querySelector('[data-field="addressPostal"]').value = '560001';
    form.querySelector('[data-field="addressPostal"]').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-save-address]').click();
    // The modal removes its node after a 320ms fade.
    await new Promise((s) => setTimeout(s, 520));
    return {
      filled,
      invalid,
      modalClosed: !document.querySelector('#addressForm'),
      shipMethods: document.querySelectorAll('[data-ship-method]').length,
      stored: JSON.parse(localStorage.getItem('lumen:addresses') || '[]').length,
      selected: !!document.querySelector('.address-card.is-selected')
    };
  `);
  check('address form exposes all required fields', Object.values(address.filled).every(Boolean), JSON.stringify(address.filled));
  check('address modal rejects a bad PIN code', address.invalid.some((m) => /6-digit|PIN/i.test(m)), JSON.stringify(address.invalid));
  check('address modal closes after saving', address.modalClosed);
  eq('exactly one address was added', address.stored - seedState.addresses, 1);
  check('new address is selected by default', address.selected);
  eq('three shipping methods offered', address.shipMethods, 3);

  const payment = await session.eval(`
    document.querySelector('[data-checkout-next]').click();
    await new Promise((s) => setTimeout(s, 190));
    const methods = Array.from(document.querySelectorAll('[data-pay-method]'));
    const upi = methods.find((m) => m.value === 'UPI');
    upi.checked = true;
    upi.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((s) => setTimeout(s, 110));
    const upiId = document.querySelector('[data-field="upiId"]');
    if (upiId) { upiId.value = 'demo@okhdfcbank'; upiId.dispatchEvent(new Event('input', { bubbles: true })); }
    return {
      step: document.querySelector('[data-step-panel]').getAttribute('data-step-panel'),
      title: document.querySelector('.checkout-step__title').textContent.trim(),
      methodCount: methods.length,
      upiPanel: !!document.querySelector('[data-pay-panel="UPI"]'),
      upiIdBound: !!upiId
    };
  `);
  eq('valid address advances to Payment', payment.step, '2');
  check('payment step titled correctly', /payment/i.test(payment.title), payment.title);
  eq('four payment methods offered', payment.methodCount, 4);
  check('UPI reveals its own panel', payment.upiPanel);
  check('UPI panel asks for a UPI id', payment.upiIdBound);

  const review = await session.eval(`
    document.querySelector('[data-checkout-next]').click();
    await new Promise((s) => setTimeout(s, 170));
    const next = document.querySelector('[data-checkout-next]');
    // The control is only useful if the shopper can actually see and tick it.
    const box = document.querySelector('#placeConfirm');
    const label = box ? box.closest('.check') : null;
    const rect = box ? box.getBoundingClientRect() : null;
    const cs = box ? getComputedStyle(box) : null;
    return {
      step: document.querySelector('[data-step-panel]').getAttribute('data-step-panel'),
      title: document.querySelector('.checkout-step__title').textContent.trim(),
      cards: document.querySelectorAll('.review-card').length,
      confirm: !!box,
      hasLabel: !!label,
      labelText: label ? label.textContent.replace(/\\s+/g, ' ').trim() : null,
      boxW: rect ? Math.round(rect.width) : 0,
      boxH: rect ? Math.round(rect.height) : 0,
      onScreen: rect ? rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 : false,
      appearance: cs ? (cs.appearance || cs.webkitAppearance) : null,
      opacity: cs ? cs.opacity : null,
      bg: cs ? cs.backgroundColor : null,
      border: cs ? cs.borderTopColor : null,
      nextText: next.textContent.replace(/\\s+/g, ' ').trim()
    };
  `);
  eq('payment advances to Review', review.step, '3');
  check('review step titled correctly', /review/i.test(review.title), review.title);
  check('review summarises each section', review.cards >= 3, 'cards: ' + review.cards);
  check('review requires a confirmation checkbox', review.confirm);
  check('the confirmation has a clickable label', review.hasLabel);
  check('the confirmation reads as an acknowledgement',
        /confirm.*(address|payment).*correct/i.test(String(review.labelText)), String(review.labelText));
  check('the confirmation box is actually rendered', review.boxW >= 16 && review.boxH >= 16,
        review.boxW + 'x' + review.boxH);
  check('the confirmation box is on screen', review.onScreen);
  check('the confirmation box is not hidden', review.opacity === '1' && review.appearance === 'none',
        'opacity=' + review.opacity + ' appearance=' + review.appearance);
  check('the confirmation box is visibly styled', !!review.bg && !!review.border, review.bg + ' / ' + review.border);

  // Clicking the label text must tick the box.
  const ticked = await session.eval(`
    const box = document.querySelector('#placeConfirm');
    const label = box.closest('.check');
    const before = box.checked;
    label.querySelector('span').click();
    await new Promise((s) => setTimeout(s, 140));
    const cs = getComputedStyle(box);
    return {
      before,
      after: box.checked,
      toggled: box.checked !== before,
      tick: cs.backgroundImage !== 'none',
      accent: cs.backgroundColor
    };
  `);
  check('clicking the label ticks the box', ticked.toggled, JSON.stringify(ticked));
  check('the ticked box shows a tick and fills with the accent', ticked.tick, JSON.stringify(ticked));
  check('final button becomes Place order', /place order/i.test(review.nextText), review.nextText);

  const blocked = await session.eval(`
    // Untick it again through the label, the way a shopper would.
    const box = document.querySelector('#placeConfirm');
    box.closest('.check').querySelector('span').click();
    await new Promise((s) => setTimeout(s, 120));
    const unticked = !box.checked;
    const label = box.closest('.check');
    document.querySelector('[data-checkout-next]').click();
    await new Promise((s) => setTimeout(s, 200));
    return {
      unticked,
      orders: JSON.parse(localStorage.getItem('lumen:orders') || '[]').length,
      flagged: label.classList.contains('is-invalid'),
      stillReview: document.querySelector('[data-step-panel]') ? document.querySelector('[data-step-panel]').getAttribute('data-step-panel') : null,
      toast: Array.from(document.querySelectorAll('.toast')).map((t) => t.textContent.replace(/\\s+/g,' ').trim())
    };
  `);
  check('clicking the label unticks it again', blocked.unticked);
  eq('unticking the confirmation blocks the order', blocked.orders, seedState.orders);
  check('a blocked order is flagged in the markup', blocked.flagged);
  check('blocked attempt explains why', blocked.toast.length > 0, JSON.stringify(blocked.toast));

  const placed = await session.eval(`
    const box = document.querySelector('#placeConfirm');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector('[data-checkout-next]').click();
    // placeOrder simulates a 1400ms authorisation delay before confirming.
    await new Promise((s) => setTimeout(s, 2200));
    const orders = JSON.parse(localStorage.getItem('lumen:orders') || '[]');
    return {
      total: orders.length,
      order: orders[0] || null,
      cart: JSON.parse(localStorage.getItem('lumen:cart') || '[]').length,
      lastOrderId: localStorage.getItem('lumen:lastOrderId'),
      text: (document.querySelector('[data-checkout-root]') || document.body).textContent.replace(/\\s+/g, ' ').trim()
    };
  `);
  eq('exactly one order was created', placed.total - seedState.orders, 1);
  const placedId = placed.order && placed.order.id;
  check('the new order is first in the list', /^LUM-\d+$/.test(String(placedId)), String(placedId));
  check('the new id is stored for later lookup', JSON.parse(placed.lastOrderId || 'null') === placedId,
        'lastOrderId: ' + placed.lastOrderId + ' vs ' + placedId);
  eq('order status starts at Processing', placed.order && placed.order.status, 'Processing');
  check('order records the payment method', !!(placed.order && placed.order.payment && placed.order.payment.ref),
        JSON.stringify(placed.order && placed.order.payment));
  check('order total is a positive number', placed.order && typeof placed.order.total === 'number' && placed.order.total > 0,
        String(placed.order && placed.order.total));
  check('order total is a number of rupees', Number.isInteger(placed.order && placed.order.total),
        String(placed.order && placed.order.total));
  check('order stores the address just added', !!(placed.order && placed.order.address && placed.order.address.postal === '560001'),
        JSON.stringify(placed.order && placed.order.address));
  check('order belongs to the signed-in account', placed.order && placed.order.userEmail === 'demo@lumen.in',
        String(placed.order && placed.order.userEmail));
  check('order records the chosen shipping method', !!(placed.order && placed.order.shippingMethod && placed.order.shippingMethod.id),
        JSON.stringify(placed.order && placed.order.shippingMethod));
  check('order stores its line items', !!(placed.order && placed.order.items && placed.order.items.length >= 1),
        JSON.stringify(placed.order && placed.order.items));
  eq('cart is emptied after ordering', placed.cart, 0);
  check('a confirmation is shown', /thank|order (is )?(placed|confirmed)|successfully/i.test(placed.text), placed.text.slice(0, 160));
  check('the confirmation shows the order id', placed.text.indexOf(String(placedId)) > -1, 'no ' + placedId + ' in the panel');
  check('no console errors during checkout', session.errors().length === 0, session.errors().join(' | '));

  /* -------------------------------------------------------------- profile */
  describe('Profile + orders after sign in');
  await page('profile.html');
  session.clearErrors();
  r = await session.eval(`
    const t = (s) => { const el = document.querySelector(s); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null; };
    return {
      name: t('.profile-head__info h2'),
      email: t('.profile-head__info p.muted'),
      tabs: document.querySelectorAll('[data-profile-tab]').length,
      activeTab: t('[data-profile-tab].is-active'),
      statStrip: document.querySelectorAll('.stat-strip__item').length,
      rootChildren: document.querySelector('[data-profile-root]') ? document.querySelector('[data-profile-root]').children.length : -1
    };
  `);
  check('profile renders its root', r.rootChildren > 0, 'children: ' + r.rootChildren);
  check('profile shows the signed-in name', !!r.name && !/null/.test(r.name), String(r.name));
  check('profile shows the signed-in email', /demo@lumen\.in/.test(String(r.email)), String(r.email));
  eq('profile exposes 4 tabs', r.tabs, 4);
  check('a tab is active by default', /details/i.test(String(r.activeTab)), String(r.activeTab));
  eq('profile stat strip has 4 figures', r.statStrip, 4);

  const tabSwitch = await session.eval(`
    Array.from(document.querySelectorAll('[data-profile-tab]')).find((t) => /security/i.test(t.textContent)).click();
    await new Promise((s) => setTimeout(s, 160));
    return {
      active: (document.querySelector('[data-profile-tab].is-active') || {}).textContent.trim(),
      panelText: document.querySelector('[data-profile-root]').textContent.replace(/\\s+/g, ' ').trim().slice(0, 120),
      signout: !!document.querySelector('[data-signout-all]')
    };
  `);
  check('switching tabs updates the active state', /security/i.test(tabSwitch.active), tabSwitch.active);
  check('security tab renders content', tabSwitch.panelText.length > 20, tabSwitch.panelText);
  check('security tab offers sign-out', tabSwitch.signout);

  /* --------------------------------------------------------------- orders */
  await page('orders.html');
  session.clearErrors();
  r = await session.eval(`
    const t = (s) => { const el = document.querySelector(s); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null; };
    return {
      rootChildren: document.querySelector('[data-orders-root]') ? document.querySelector('[data-orders-root]').children.length : -1,
      count: t('[data-orders-count-label]'),
      ids: Array.from(document.querySelectorAll('[data-order-id]')).map((e) => e.getAttribute('data-order-id')),
      search: !!document.querySelector('[data-order-search]'),
      filters: document.querySelectorAll('[data-order-filter]').length,
      clear: !!document.querySelector('[data-orders-clear]'),
      empty: !!document.querySelector('.empty')
    };
  `);
  check('orders page renders its root', r.rootChildren > 0, 'children: ' + r.rootChildren);
  check('the account has orders listed', !r.empty && r.ids.length >= 1,
        'ids=' + r.ids.join(',') + ' empty=' + r.empty);
  check('order ids follow LUM-#####', r.ids.every((id) => /^LUM-\d+$/.test(id)), r.ids.join(','));
  check('the order just placed is listed', r.ids.indexOf(placedId) > -1,
        'wanted ' + placedId + ', got ' + r.ids.join(','));
  check('orders has a search box', r.search);
  check('orders has 5 status filters', r.filters, 'got ' + r.filters);
  check('orders has a clear-filters control', r.clear);
  check('orders count label is populated', !!r.count && /order/i.test(r.count), String(r.count));

  const orderSearch = await session.eval(`
    const s = document.querySelector('[data-order-search]');
    s.value = 'ZZZ-NO-SUCH-ORDER';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    // The search handler is debounced, so let it fire.
    await new Promise((x) => setTimeout(x, 600));
    const none = { empty: !!document.querySelector('.empty'), text: document.querySelector('[data-orders-root]').textContent.replace(/\\s+/g,' ').trim().slice(0,80) };
    s.value = '';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((x) => setTimeout(x, 600));
    return { none, back: document.querySelectorAll('[data-order-id]').length };
  `);
  check('a non-matching search shows an empty state', orderSearch.none.empty, orderSearch.none.text);
  check('clearing the search restores orders', orderSearch.back >= 1, 'got ' + orderSearch.back);

  const orderFilter = await session.eval(`
    const radios = Array.from(document.querySelectorAll('[data-order-filter]'));
    const cancelled = radios.find((r) => r.value === 'cancelled');
    if (!cancelled) return { found: false };
    cancelled.checked = true;
    cancelled.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((s) => setTimeout(s, 500));
    const filtered = document.querySelectorAll('[data-order-id]').length;
    const all = radios.find((r) => r.value === 'all');
    all.checked = true;
    all.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((s) => setTimeout(s, 500));
    return { found: true, filtered, restored: document.querySelectorAll('[data-order-id]').length };
  `);
  check('status filter changes the visible orders', orderFilter.found && orderFilter.filtered !== orderFilter.restored,
        JSON.stringify(orderFilter));
  check('all filter restores the full list', orderFilter.restored >= 1, String(orderFilter.restored));

  const signOut = await (async () => {
    await page('profile.html');
    await session.waitForSelector('[data-profile-tab]');
    await session.eval(`
      Array.from(document.querySelectorAll('[data-profile-tab]')).find((t) => /security/i.test(t.textContent)).click();
      await new Promise((s) => setTimeout(s, 170));
      document.querySelector('[data-signout-all]').click();
      return true;
    `, { tolerateNavigation: true });
    for (let i = 0; i < 60; i += 1) {
      const at = await session.eval('return location.pathname');
      if (!/profile\.html/.test(at)) break;
      await sleep(60);
    }
    return session.eval(`
      return {
        session: !!sessionStorage.getItem('lumen:session'),
        path: location.pathname.split('/').pop()
      };
    `);
  })();
  check('sign-out clears the session', signOut.session === false, 'path: ' + signOut.path);
  check('sign-out returns to the homepage', signOut.path === 'index.html', 'path: ' + signOut.path);
  check('no console errors in profile/orders', session.errors().length === 0, session.errors().join(' | '));

  /* -------------------------------------------------------------- wishlist */
  describe('Wishlist');
  await page('wishlist.html');
  session.clearErrors();
  const w0 = await session.eval(`
    return {
      badge: document.querySelector('[data-wishlist-count]') ? document.querySelector('[data-wishlist-count]').textContent.trim() : '0',
      empty: !!document.querySelector('.empty')
    };
  `);
  check('wishlist starts empty', w0.empty, 'badge: ' + w0.badge);

  await page('product.html?id=LUM-2001');
  const w1 = await session.eval(`
    const b = document.querySelector('.pdp .wish-btn, [data-wish-id]');
    if (!b) return { found: false };
    b.click();
    await new Promise((s) => setTimeout(s, 140));
    // Re-query: the button may be re-rendered by the badge sync.
    const after = document.querySelector('[data-wish-id]');
    return {
      found: true,
      pressed: after.getAttribute('aria-pressed'),
      active: after.classList.contains('is-active'),
      stored: JSON.parse(localStorage.getItem('lumen:wishlist') || '[]').length,
      badge: document.querySelector('[data-wishlist-count]') ? document.querySelector('[data-wishlist-count]').textContent.trim() : null
    };
  `);
  check('wishlist heart exists on the pdp', w1.found);
  eq('wishlist toggle stores the item', w1.stored, 1);
  eq('wishlist toggle reports pressed state', w1.pressed, 'true');
  check('wishlist toggle shows active styling', w1.active === true, String(w1.active));
  eq('header wishlist badge updates', w1.badge, '1');

  await page('wishlist.html');
  const w2 = await session.eval(`
    return {
      cards: document.querySelectorAll('.product-card').length,
      name: document.querySelector('.product-card__name') ? document.querySelector('.product-card__name').textContent.trim() : null,
      remove: !!document.querySelector('[data-wish-id]'),
      badge: document.querySelector('[data-wishlist-count]') ? document.querySelector('[data-wishlist-count]').textContent.trim() : '0'
    };
  `);
  eq('wishlist page lists the saved product', w2.cards, 1);
  check('wishlist shows the right product', /[A-Za-z]/.test(String(w2.name)), String(w2.name));
  check('wishlist page offers removal', w2.remove);

  const w3 = await session.eval(`
    const heart = document.querySelector('[data-wish-id]');
    heart.click();
    await new Promise((s) => setTimeout(s, 160));
    return {
      stored: JSON.parse(localStorage.getItem('lumen:wishlist') || '[]').length,
      empty: !!document.querySelector('.empty')
    };
  `);
  eq('un-hearting removes the item', w3.stored, 0);
  check('empty wishlist shows an empty state', w3.empty);
  check('no console errors on wishlist', session.errors().length === 0, session.errors().join(' | '));

  /* ---------------------------------------------------------------- admin */
  describe('Admin console');
  await page('admin/login.html');
  session.clearErrors();
  const adminIn = await (async () => {
    await page('admin/login.html');
    await session.waitForSelector('#adminLoginForm');
    return session.eval(`
      const set = (sel, v) => { const el = document.querySelector(sel); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
      set('#adminEmail', 'admin@lumen.in');
      set('#adminPassword', 'Admin@2026');
      set('#adminCode', 'LUMEN-2026');
      document.querySelector('#adminLoginForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      return true;
    `, { tolerateNavigation: true }).then(async () => {
      for (let i = 0; i < 60; i += 1) {
        const at = await session.eval('return location.pathname');
        if (!/login\.html/.test(at)) break;
        await sleep(60);
      }
      return session.eval(`
        return { path: location.pathname.split('/').pop(), session: JSON.parse(sessionStorage.getItem('lumen:session') || 'null') };
      `);
    });
  })();
  check('admin sign-in works', adminIn.path === 'index.html', 'path: ' + adminIn.path);
  check('admin session is an admin role', adminIn.session && /admin/i.test(adminIn.session.role || ''),
        adminIn.session ? String(adminIn.session.role) : 'none');

  await page('admin/index.html');
  session.clearErrors();
  r = await session.eval(`
    const painted = (c) => { const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < x.length; i += 4) if (x[i] !== 0) return true; return false; };
    return {
      shell: !!document.querySelector('[data-admin-shell]'),
      nav: document.querySelectorAll('.side__link').length,
      statTiles: document.querySelectorAll('.stat-tile').length,
      canvases: document.querySelectorAll('canvas').length,
      chartsPainted: Array.from(document.querySelectorAll('canvas')).map(painted),
      recentOrders: document.querySelectorAll('[data-admin-recent] tr').length,
      lowStock: document.querySelectorAll('[data-admin-lowstock] tr').length,
      badge: document.querySelector('[data-admin-order-count]') ? document.querySelector('[data-admin-order-count]').textContent.trim() : null
    };
  `);
  check('admin shell present', r.shell);
  check('admin nav has 9 links', r.nav === 9, 'got ' + r.nav);
  check('admin stat tiles render', r.statTiles >= 4, 'got ' + r.statTiles);
  eq('dashboard has 2 charts', r.canvases, 2);
  check('dashboard charts are painted', r.chartsPainted.every(Boolean), JSON.stringify(r.chartsPainted));
  check('dashboard recent orders table filled', r.recentOrders >= 1, 'got ' + r.recentOrders);

  const productCrud = await (async () => {
    await page('admin/products.html');
    await session.waitForSelector('[data-admin-products-tbody] tr');
    return session.eval(`
      const before = document.querySelectorAll('[data-admin-products-tbody] tr').length;
      const set = (name, v) => {
        const el = document.querySelector('#adminProductForm [name="' + name + '"]');
        if (!el) return false;
        el.value = v;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      };
      document.querySelector('[data-admin-add-product]').click();
      await new Promise((s) => setTimeout(s, 240));
      const bound = {
        name: set('name', 'E2E Test Widget'),
        brand: set('brand', 'Lumen Lab'),
        price: set('price', '4999'),
        stock: set('stock', '7')
      };
      // A name that is too short must be rejected with a field error.
      set('name', 'ab');
      document.querySelector('[data-save-product]').click();
      await new Promise((s) => setTimeout(s, 160));
      const rejected = {
        error: (document.querySelector('#adminProductForm [data-error="name"]') || {}).textContent || '',
        stored: JSON.parse(localStorage.getItem('lumen:products') || '[]').filter((p) => p.name === 'ab').length
      };
      set('name', 'E2E Test Widget');
      document.querySelector('[data-save-product]').click();
      // The modal fades out before the table repaints.
      await new Promise((s) => setTimeout(s, 520));
      const rows = Array.from(document.querySelectorAll('[data-admin-products-tbody] tr'));
      const created = JSON.parse(localStorage.getItem('lumen:products') || '[]').find((p) => p.name === 'E2E Test Widget');
      return {
        before,
        bound,
        rejected,
        after: rows.length,
        created,
        found: !!rows.find((tr) => /E2E Test Widget/.test(tr.textContent)),
        id: created ? created.id : null
      };
    `);
  })();
  check('admin products table lists seeds', productCrud.before >= 25, 'got ' + productCrud.before);
  check('create form binds name, brand, price and stock',
        productCrud.bound.name && productCrud.bound.brand && productCrud.bound.price && productCrud.bound.stock,
        JSON.stringify(productCrud.bound));
  check('a too-short name is rejected', /product name/i.test(productCrud.rejected.error), productCrud.rejected.error);
  eq('a rejected product is not stored', productCrud.rejected.stored, 0);
  check('the created product is stored with a unique id', /^LUM-[a-z0-9]{6,}$/.test(String(productCrud.id)), String(productCrud.id));
  eq('created product appears in the table', productCrud.after, productCrud.before + 1);
  check('new product row shows its name', productCrud.found);

  const toggled = await session.eval(`
    const row = Array.from(document.querySelectorAll('[data-admin-products-tbody] tr'))
      .find((tr) => /E2E Test Widget/.test(tr.textContent));
    const btn = row ? row.querySelector('[data-edit-product]') : null;
    if (!btn) return { found: false };
    btn.click();
    await new Promise((s) => setTimeout(s, 260));
    const price = document.querySelector('#adminProductForm [name="price"]');
    const set = (name, v) => {
      const el = document.querySelector('#adminProductForm [name="' + name + '"]');
      if (!el) return false;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    };
    const openedWith = { name: document.querySelector('#adminProductForm [name="name"]').value, price: price ? price.value : null };
    set('price', '6499');
    document.querySelector('[data-save-product]').click();
    await new Promise((s) => setTimeout(s, 520));
    const rowAfter = Array.from(document.querySelectorAll('[data-admin-products-tbody] tr'))
      .find((tr) => /E2E Test Widget/.test(tr.textContent));
    return {
      found: true,
      openedWith,
      storedPrice: (JSON.parse(localStorage.getItem('lumen:products') || '[]').find((p) => p.name === 'E2E Test Widget') || {}).price,
      rowText: rowAfter ? rowAfter.textContent.replace(/\\s+/g, ' ').trim() : null
    };
  `);
  check('the edit action reopens the product with its data', toggled.found && toggled.openedWith.name === 'E2E Test Widget',
        JSON.stringify(toggled.openedWith));
  eq('editing a product persists the new price', toggled.storedPrice, 6499);
  check('the table shows the updated price', /6,499/.test(String(toggled.rowText)), String(toggled.rowText));

  const deleted = await session.eval(`
    const row = Array.from(document.querySelectorAll('[data-admin-products-tbody] tr'))
      .find((tr) => /E2E Test Widget/.test(tr.textContent));
    const before = document.querySelectorAll('[data-admin-products-tbody] tr').length;
    const btn = row ? row.querySelector('[data-delete-product]') : null;
    if (!btn) return { found: false, before };
    btn.click();
    // Deleting is destructive, so a confirm dialog gates it. Cancelling first
    // proves the guard, then the real confirmation goes through.
    await new Promise((s) => setTimeout(s, 300));
    const dialogTitle = (document.querySelector('.modal__title') || {}).textContent || '';
    const cancel = document.querySelector('[data-close-modal]');
    if (cancel) cancel.click();
    await new Promise((s) => setTimeout(s, 420));
    const survived = JSON.parse(localStorage.getItem('lumen:products') || '[]').filter((p) => p.name === 'E2E Test Widget').length;
    const row2 = Array.from(document.querySelectorAll('[data-admin-products-tbody] tr'))
      .find((tr) => /E2E Test Widget/.test(tr.textContent));
    const btn2 = row2 ? row2.querySelector('[data-delete-product]') : null;
    if (btn2) btn2.click();
    await new Promise((s) => setTimeout(s, 320));
    const confirmBtn = document.querySelector('.modal__foot .btn--danger, .modal__foot .btn--primary');
    if (confirmBtn) confirmBtn.click();
    await new Promise((s) => setTimeout(s, 520));
    return {
      found: true,
      before,
      dialogTitle,
      survived,
      after: document.querySelectorAll('[data-admin-products-tbody] tr').length,
      stored: JSON.parse(localStorage.getItem('lumen:products') || '[]').filter((p) => p.name === 'E2E Test Widget').length
    };
  `);
  check('deleting a product asks for confirmation', /delete/i.test(deleted.dialogTitle), deleted.dialogTitle);
  eq('cancelling the confirmation keeps the product', deleted.survived, 1);
  check('confirming delete removes the row', deleted.found && deleted.after === deleted.before - 1, JSON.stringify(deleted));
  eq('confirming delete removes it from storage', deleted.stored, 0);
  check('no console errors in the admin console', session.errors().length === 0, session.errors().join(' | '));

  await page('admin/analytics.html');
  session.clearErrors();
  r = await session.eval(`
    const painted = (c) => { const x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < x.length; i += 4) if (x[i] !== 0) return true; return false; };
    const before = document.querySelector('canvas').getAttribute('data-range') || document.body.dataset.range;
    const sel = document.querySelector('[data-analytics-range]');
    sel.value = '90';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((s) => setTimeout(s, 220));
    return {
      range: sel.value,
      canvases: document.querySelectorAll('canvas').length,
      painted: Array.from(document.querySelectorAll('canvas')).map(painted),
      stats: document.querySelectorAll('.stat-tile').length,
      before
    };
  `);
  eq('analytics renders 3 charts', r.canvases, 3);
  check('all analytics charts painted', r.painted.every(Boolean), JSON.stringify(r.painted));
  check('analytics stat tiles render', r.stats >= 4, 'got ' + r.stats);

  /* -------------------------------------------------------------- settings */
  describe('Admin settings + maintenance mode');
  await page('admin/settings.html');
  session.clearErrors();
  r = await session.eval(`
    const form = document.querySelector('#settingsForm');
    const fields = form.querySelectorAll('input, select, textarea').length;
    return {
      form: !!form,
      fields,
      preview: document.querySelector('[data-settings-preview]') ? document.querySelector('[data-settings-preview]').children.length : 0,
      hasFreeShip: !!document.querySelector('[name=freeShippingOver]'),
      hasFlat: !!document.querySelector('[name=shippingFlat]'),
      hasTax: !!document.querySelector('[name=taxRate]'),
      hasMaintenance: !!document.querySelector('[name=maintenanceMode]'),
      supportEmail: document.querySelector('[name=supportEmail]') ? document.querySelector('[name=supportEmail]').value : null
    };
  `);
  check('settings form is present', r.form);
  check('settings form has many fields', r.fields >= 12, 'got ' + r.fields);
  check('shipping settings bound', r.hasFreeShip && r.hasFlat && r.hasTax);
  check('maintenance mode toggle bound', r.hasMaintenance);
  eq('support email prefilled from seed', r.supportEmail, 'care@lumen.in');
  check('delivery preview computed', r.preview > 0, 'children: ' + r.preview);

  const saved = await session.eval(`
    const el = document.querySelector('[name=freeShippingOver]');
    el.value = '99999';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    // The preview recomputes live from the form.
    const previewText = document.querySelector('[data-settings-preview]').textContent.replace(/\\s+/g, ' ').trim();
    document.querySelector('[data-save-settings]').click();
    await new Promise((s) => setTimeout(s, 220));
    return {
      stored: JSON.parse(localStorage.getItem('lumen:settings') || '{}').freeShippingOver,
      previewText,
      toast: document.querySelector('.toast') ? document.querySelector('.toast').textContent.trim() : null
    };
  `);
  eq('free-shipping threshold saved', saved.stored, 99999);
  check('the preview recomputes live', /99,999/.test(saved.previewText), saved.previewText.slice(0, 120));
  check('settings save confirms', !!saved.toast, String(saved.toast));

  // A malformed support email must be rejected rather than saved.
  const badEmail = await session.eval(`
    const el = document.querySelector('[name=supportEmail]');
    el.value = 'not-an-email';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-save-settings]').click();
    await new Promise((s) => setTimeout(s, 200));
    return {
      stored: JSON.parse(localStorage.getItem('lumen:settings') || '{}').supportEmail,
      error: (document.querySelector('[data-error="supportEmail"]') || {}).textContent || ''
    };
  `);
  eq('a malformed support email is not saved', badEmail.stored, 'care@lumen.in');
  check('a malformed support email is reported', /valid/i.test(badEmail.error), badEmail.error);

  /* --------------------------------------------------------- theme + misc */
  describe('Theme toggle + cross-page consistency');
  const themed = await session.eval(`
    // The admin topbar owns its own toggle hook.
    const btn = document.querySelector('[data-admin-theme]');
    const before = document.documentElement.getAttribute('data-theme');
    if (btn) btn.click();
    await new Promise((s) => setTimeout(s, 90));
    const after = document.documentElement.getAttribute('data-theme');
    return {
      hasToggle: !!btn,
      before,
      attr: after,
      flipped: after !== before,
      stored: LUMEN.theme.get()
    };
  `);
  check('admin theme toggle exists', themed.hasToggle);
  check('theme toggle flips the attribute', themed.flipped, JSON.stringify(themed));
  check('theme toggle persists the choice', themed.stored === themed.attr, JSON.stringify(themed));

  await page('index.html');
  const themeKept = await session.eval(`return { attr: document.documentElement.getAttribute('data-theme'), stored: LUMEN.theme.get() };`);
  check('theme survives navigation to the storefront', themeKept.attr === themed.attr,
        'attr: ' + themeKept.attr + ' vs ' + themed.attr);
  const themeRoundTrip = await session.eval(`
    const btn = document.querySelector('[data-toggle-theme]');
    if (!btn) return { hasToggle: false };
    const before = LUMEN.theme.get();
    btn.click();
    await new Promise((s) => setTimeout(s, 90));
    return { hasToggle: true, before, after: LUMEN.theme.get(), attr: document.documentElement.getAttribute('data-theme') };
  `);
  check('storefront theme toggle exists', themeRoundTrip.hasToggle);
  check('storefront toggle flips and stores', themeRoundTrip.after !== themeRoundTrip.before
        && themeRoundTrip.attr === themeRoundTrip.after, JSON.stringify(themeRoundTrip));

  /* ------------------------------------------------- mobile + admin mobile */
  describe('Responsive layout');
  const responsive = await session.eval(`
    return {
      burger: !!document.querySelector('[data-open-nav]'),
      width: document.documentElement.clientWidth
    };
  `);
  check('desktop width used for this pass', responsive.width > 1000, 'width: ' + responsive.width);

  /* The nav must stay a single horizontal row wherever it is shown, and a
     burger must be reachable wherever the nav is hidden. A gap between those
     two breakpoints leaves the whole site unnavigable, which is what this
     used to do between 768px and 1023px. */
  describe('Navbar reachability + horizontal nav');
  await session.eval(`sessionStorage.removeItem('lumen:session'); return true;`);
  await page('index.html');
  for (const vw of [1440, 1280, 1200, 1100, 1024, 1000, 960, 900, 860, 820, 800, 768]) {
    await session.send('Emulation.setDeviceMetricsOverride', { width: vw, height: 900, deviceScaleFactor: 1, mobile: false });
    await sleep(220);
    const nav = await session.eval(`
      const h = document.querySelector('#siteHeader');
      const navEl = h.querySelector('.nav');
      const ul = navEl.querySelector('ul');
      const burger = h.querySelector('.hamburger');
      const shown = getComputedStyle(navEl).display !== 'none';
      const burgerShown = getComputedStyle(burger).display !== 'none';
      const links = Array.from(ul.querySelectorAll('.nav__link'));
      const rows = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top))).size;
      const clipped = navEl.scrollWidth - navEl.clientWidth;
      return {
        shown, burgerShown, rows, clipped,
        links: links.length,
        navW: Math.round(navEl.getBoundingClientRect().width)
      };
    `);
    check(vw + 'px: the nav links stay on one horizontal row', nav.shown && nav.rows === 1,
          'shown=' + nav.shown + ' rows=' + nav.rows);
    check(vw + 'px: the nav is not clipped', nav.clipped <= 0, 'clipped by ' + nav.clipped + 'px');
  }
  // Below the collapse point the nav is gone, so the burger must be there.
  for (const vw of [767, 700, 480, 390]) {
    await session.send('Emulation.setDeviceMetricsOverride', { width: vw, height: 844, deviceScaleFactor: 1, mobile: true });
    await page('index.html');
    const nav = await session.eval(`
      const h = document.querySelector('#siteHeader');
      return {
        shown: getComputedStyle(h.querySelector('.nav')).display !== 'none',
        burger: getComputedStyle(h.querySelector('.hamburger')).display !== 'none'
      };
    `);
    check(vw + 'px: primary nav is reachable via the burger', !nav.shown && nav.burger,
          'nav=' + nav.shown + ' burger=' + nav.burger);
  }
  check('no console errors while resizing the navbar', session.errors().length === 0, session.errors().join(' | '));

  // The pass above signs out to measure the bare header; restore the admin
  // session the following checks rely on.
  await page('index.html');
  session.eval(`return LUMEN.auth.signIn('admin@lumen.in', 'Admin@2026', { quiet: true }).ok;`);
  await session.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page('index.html');
  session.clearErrors();
  r = await session.eval(`
    const vis = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    // Ask the question a shopper would: can the page be panned sideways?
    // Fixed layers are sized to innerWidth (which includes the emulated
    // scrollbar), so scrollWidth alone over-reports; scroll the page instead.
    window.scrollTo(600, window.scrollY);
    const panned = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return {
      width: document.documentElement.clientWidth,
      panned,
      overflow: panned,
      burgerVisible: vis('[data-open-nav]'),
      tabbar: vis('.mobile-nav'),
      twoUp: (() => {
        const el = document.querySelector('.trust-grid') || document.querySelector('.trust-tiles');
        if (!el) return null;
        return getComputedStyle(el).gridTemplateColumns.split(' ').length;
      })()
    };
  `);
  eq('viewport switched to 390px', r.width, 390);
  check('no horizontal overflow on mobile', r.overflow === 0, 'panned: ' + r.overflow);
  check('mobile menu button is visible', r.burgerVisible === true, String(r.burgerVisible));
  check('mobile tab bar is visible', r.tabbar === true, String(r.tabbar));
  check('trust grid collapses to one column', r.twoUp === 1, 'columns: ' + r.twoUp);
  check('no console errors on mobile', session.errors().length === 0, session.errors().join(' | '));

  await page('admin/index.html');
  session.clearErrors();
  r = await session.eval(`
    const vis = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
    window.scrollTo(600, window.scrollY);
    const panned = window.scrollX;
    window.scrollTo(0, window.scrollY);
    return {
      width: document.documentElement.clientWidth,
      overflow: panned,
      sidebar: vis('.side'),
      burger: vis('[data-admin-nav-toggle], [data-open-nav]')
    };
  `);
  eq('admin at 390px', r.width, 390);
  check('no horizontal overflow in admin on mobile', r.overflow === 0, 'panned: ' + r.overflow);
  check('admin sidebar is present on mobile', r.sidebar !== null, String(r.sidebar));
  check('no console errors in admin mobile', session.errors().length === 0, session.errors().join(' | '));

  /* ------------------------------------------- identity + sign out paths */
  describe('Identity visibility + sign out');
  await page('index.html');
  session.clearErrors();

  // --- guest: the header must offer a way in, and say who is absent -----
  await session.eval(`sessionStorage.removeItem('lumen:session'); return true;`);
  await page('index.html');
  let identity = await session.eval(`
    const chip = document.querySelector('[data-open-account]');
    return {
      signedIn: chip.classList.contains('is-signed-in'),
      name: chip.querySelector('.account-chip__name'),
      role: chip.querySelector('.account-chip__role'),
      aria: chip.getAttribute('aria-label'),
      mobileSignout: !!document.querySelector('[data-mobile-account] [data-signout]')
    };
  `);
  check('guest header is not marked as signed in', identity.signedIn === false);
  check('guest header has no name or role chip', !identity.name && !identity.role);
  check('guest header offers a sign-in label', /sign in/i.test(identity.aria), identity.aria);
  check('guest drawer has no sign-out control', identity.mobileSignout === false);

  // --- customer: name + role are spelled out ----------------------------
  await session.eval(`return LUMEN.auth.signIn('demo@lumen.in', 'Demo@2026', { quiet: true }).ok;`);
  await page('index.html');
  identity = await session.eval(`
    const chip = document.querySelector('[data-open-account]');
    const mobile = document.querySelector('[data-mobile-account]');
    return {
      signedIn: chip.classList.contains('is-signed-in'),
      name: chip.querySelector('.account-chip__name').textContent.trim(),
      role: chip.querySelector('.account-chip__role').textContent.trim(),
      aria: chip.getAttribute('aria-label'),
      mobileRole: mobile.querySelector('.badge').textContent.trim(),
      mobileSignout: !!mobile.querySelector('[data-signout]')
    };
  `);
  check('customer header is marked as signed in', identity.signedIn === true);
  check('customer header shows the first name', identity.name === 'Riya', identity.name);
  check('customer header shows the Customer role', identity.role === 'Customer', identity.role);
  check('customer header aria announces the identity', /Customer account/i.test(identity.aria), identity.aria);
  check('mobile drawer shows the Customer role', identity.mobileRole === 'Customer', identity.mobileRole);
  check('mobile drawer offers sign out', identity.mobileSignout === true);

  // --- the quick panel is reachable and carries sign out ----------------
  await session.eval(`document.querySelector('[data-open-account]').click(); return true;`);
  const panel = await session.eval(`
    const m = document.querySelector('.modal');
    if (!m) return { open: false };
    return {
      open: true,
      role: m.querySelector('.account-panel__role .badge').textContent.trim(),
      signout: !!m.querySelector('[data-signout]'),
      links: Array.from(m.querySelectorAll('.account-panel__links a')).map((a) => a.getAttribute('href'))
    };
  `);
  check('the header account button opens the quick panel', panel.open === true);
  check('the quick panel shows the Customer role', panel.role === 'Customer', panel.role);
  check('the quick panel exposes sign out', panel.signout === true);
  check('the quick panel links to the profile and orders',
        panel.links.some((h) => /profile\.html$/.test(h)) && panel.links.some((h) => /orders\.html$/.test(h)),
        JSON.stringify(panel.links));
  check('a customer is not offered the admin dashboard',
        !panel.links.some((h) => /admin\//.test(h)), JSON.stringify(panel.links));
  await session.eval(`document.querySelector('.modal__close').click(); return true;`);
  await sleep(200);

  // --- admin: the role is obvious in the header and the admin shell -----
  await session.eval(`return LUMEN.auth.signIn('admin@lumen.in', 'Admin@2026', { quiet: true }).ok;`);
  await page('index.html');
  identity = await session.eval(`
    const chip = document.querySelector('[data-open-account]');
    const mobile = document.querySelector('[data-mobile-account]');
    return {
      name: chip.querySelector('.account-chip__name').textContent.trim(),
      role: chip.querySelector('.account-chip__role').textContent.trim(),
      mobileRole: mobile.querySelector('.badge').textContent.trim()
    };
  `);
  check('admin header shows the first name', identity.name === 'Aarav', identity.name);
  check('admin header shows the Admin role, not Customer', identity.role === 'Admin', identity.role);
  check('mobile drawer shows the Admin role', identity.mobileRole === 'Admin', identity.mobileRole);

  await session.eval(`document.querySelector('[data-open-account]').click(); return true;`);
  const adminPanel = await session.eval(`
    const m = document.querySelector('.modal');
    return {
      role: m.querySelector('.account-panel__role .badge').textContent.trim(),
      links: Array.from(m.querySelectorAll('.account-panel__links a')).map((a) => a.getAttribute('href'))
    };
  `);
  check('admin quick panel shows the Admin role', adminPanel.role === 'Admin', adminPanel.role);
  check('admin quick panel links to the admin dashboard',
        adminPanel.links.some((h) => /admin\/index\.html$/.test(h)), JSON.stringify(adminPanel.links));
  await session.eval(`document.querySelector('.modal__close').click(); return true;`);
  await sleep(200);

  await page('admin/index.html');
  for (let i = 0; i < 60; i += 1) {
    if (await session.eval('return !!document.querySelector("[data-admin-user]");')) break;
    await sleep(60);
  }
  const adminBar = await session.eval(`
    const u = document.querySelector('[data-admin-user]');
    if (!u) return { found: false };
    return {
      found: true,
      email: u.querySelector('small').textContent.trim(),
      role: u.querySelector('.topbar__role') ? u.querySelector('.topbar__role').textContent.trim() : null
    };
  `);
  check('the admin topbar shows the admin email', adminBar.email === 'admin@lumen.in', adminBar.email);
  check('the admin topbar states the Admin role', adminBar.role === 'Admin', adminBar.role);

  // --- profile: identity badge + a visible sign out ---------------------
  await session.eval(`return LUMEN.auth.signIn('demo@lumen.in', 'Demo@2026', { quiet: true }).ok;`);
  await page('profile.html');
  const profileHead = await session.eval(`
    const heads = Array.from(document.querySelectorAll('.profile-head'));
    return {
      signoutButtons: document.querySelectorAll('.profile-head [data-signout]').length,
      badges: Array.from(document.querySelectorAll('.profile-head__badges .badge')).map((b) => b.textContent.trim())
    };
  `);
  check('profile exposes a sign-out control in the page head', profileHead.signoutButtons >= 1,
        'found: ' + profileHead.signoutButtons);
  check('profile states the Customer role', profileHead.badges.includes('Customer'), JSON.stringify(profileHead.badges));

  await session.eval(`document.querySelector('.profile-head [data-signout]').click(); return true;`,
                     { tolerateNavigation: true });
  for (let i = 0; i < 80; i += 1) {
    if (!/profile\.html/.test(await session.eval('return location.pathname'))) break;
    await sleep(60);
  }
  for (let i = 0; i < 80; i += 1) {
    if (await session.eval('return document.readyState === "complete" && document.body.classList.contains("is-booted");')) break;
    await sleep(60);
  }
  const afterProfileOut = await session.eval(`
    return {
      session: !!sessionStorage.getItem('lumen:session'),
      path: location.pathname.split('/').pop(),
      signedIn: document.querySelector('[data-open-account]').classList.contains('is-signed-in')
    };
  `);
  check('profile sign out clears the session', afterProfileOut.session === false);
  check('profile sign out lands on a public page', afterProfileOut.path === 'index.html', afterProfileOut.path);
  check('the header reverts to a signed-out state', afterProfileOut.signedIn === false);

  // --- mobile drawer sign out ------------------------------------------
  await session.eval(`return LUMEN.auth.signIn('demo@lumen.in', 'Demo@2026', { quiet: true }).ok;`);
  await page('index.html');
  await session.eval(`
    const b = document.querySelector('[data-open-nav]');
    b.click();
    return true;
  `);
  await sleep(400);
  const drawerOut = await session.eval(`
    const b = document.querySelector('#mobileNav [data-signout]');
    if (!b) return { found: false };
    b.click();
    return { found: true };
  `, { tolerateNavigation: true });
  check('the mobile drawer exposes sign out', drawerOut.found === true);
  for (let i = 0; i < 80; i += 1) {
    if (await session.eval('return !sessionStorage.getItem("lumen:session");')) break;
    await sleep(60);
  }
  for (let i = 0; i < 80; i += 1) {
    if (await session.eval('return document.readyState === "complete" && document.body.classList.contains("is-booted");')) break;
    await sleep(60);
  }
  const afterDrawerOut = await session.eval(`
    return {
      session: !!sessionStorage.getItem('lumen:session'),
      path: location.pathname.split('/').pop()
    };
  `);
  check('mobile sign out clears the session', afterDrawerOut.session === false);
  check('mobile sign out lands on a public page', afterDrawerOut.path === 'index.html', afterDrawerOut.path);

  // --- admin sign out returns to the admin login -------------------------
  await session.eval(`return LUMEN.auth.signIn('admin@lumen.in', 'Admin@2026', { quiet: true }).ok;`);
  await page('admin/index.html');
  for (let i = 0; i < 60; i += 1) {
    if (await session.eval('return !!document.querySelector("[data-admin-signout], [data-signout-all]");')) break;
    await sleep(60);
  }
  await session.eval(`
    const b = document.querySelector('[data-admin-signout], [data-signout-all]');
    if (!b) return false;
    b.click();
    return true;
  `, { tolerateNavigation: true });
  for (let i = 0; i < 80; i += 1) {
    if (await session.eval('return !sessionStorage.getItem("lumen:session");')) break;
    await sleep(60);
  }
  const afterAdminOut = await session.eval(`
    return { session: !!sessionStorage.getItem('lumen:session'), path: location.pathname };
  `);
  check('admin sign out clears the session', afterAdminOut.session === false);
  check('admin sign out returns to the admin login', /admin\/login\.html$/.test(afterAdminOut.path), afterAdminOut.path);
  check('no console errors across the identity flows', session.errors().length === 0, session.errors().join(' | '));

  /* ------------------------------------------------------------- teardown */
  describe('Data reset');
  const reset = await session.eval(`
    const keys = Object.keys(localStorage);
    localStorage.clear();
    return { cleared: keys.length };
  `);
  await page('index.html');
  const reseeded = await session.eval(`
    return {
      seeds: Object.keys(localStorage).filter((k) => k.indexOf('lumen:') === 0).length,
      cards: document.querySelectorAll('.product-card').length,
      cart: localStorage.getItem('lumen:cart')
    };
  `);
  check('clearing storage restores seed data', reseeded.seeds >= 8, 'keys: ' + reseeded.seeds);
  check('home renders again after reset', reseeded.cards >= 12, 'cards: ' + reseeded.cards);
  eq('cart resets to empty', JSON.parse(reseeded.cart || '[]').length, 0);

  await ctx.close();

  /* ------------------------------------------------------------- summary */
  console.log('\n' + '='.repeat(58));
  console.log('passed: ' + passed + '   failed: ' + failed);
  if (failures.length) {
    console.log('\nfailures:');
    failures.forEach((f) => console.log('  - ' + f));
  }
  console.log('='.repeat(58));
  process.exit(failed ? 1 : 0);
})().catch(async (err) => {
  console.error('\nE2E ABORTED:', err && err.stack ? err.stack : err);
  process.exit(1);
});
