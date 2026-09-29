/* ==========================================================================
   LUMEN — Shopping Cart
   js/cart.js
   --------------------------------------------------------------------------
   · Cart persistence in localStorage
   · Line-item operations (add, set quantity, remove, clear)
   · Order maths: subtotal, discount, shipping, GST, grand total
   · Slide-in cart drawer shared across the whole storefront
   · Full cart page rendering for cart.html
   Prices in the catalogue are GST-inclusive, so tax is reported as an
   informational line rather than added on top.
   ========================================================================== */

(function (global) {
  'use strict';

  const LUMEN = global.LUMEN;
  const { getData, saveData } = LUMEN.store;
  const { escapeHtml, $ } = LUMEN.dom;
  const { money, num } = LUMEN.fmt;
  const icon = LUMEN.icon;
  const D = () => LUMEN.data;

  /* --------------------------------------------------------------------
     State
     ------------------------------------------------------------------ */

  function items() {
    const list = getData('cart', []);
    return Array.isArray(list) ? list : [];
  }

  function setItems(next) {
    saveData('cart', next);
    document.dispatchEvent(new CustomEvent('lumen:cart', { detail: { items: next } }));
    LUMEN.badges.sync('cart');
    if (typeof LUMEN.renderCartDrawer === 'function') LUMEN.renderCartDrawer();
    if (typeof LUMEN.renderCartPage === 'function' && document.body.dataset.page === 'cart') LUMEN.renderCartPage();
  }

  function settings() {
    return Object.assign({}, D().SETTINGS_SEED, getData('settings', {}));
  }

  /** Line key combines product id + variant so different options stay separate. */
  function lineKey(id, variant) {
    return `${id}__${variant || ''}`;
  }

  function findProduct(id) {
    return LUMEN.ui.catalog().find((p) => p.id === id) || null;
  }

  /* --------------------------------------------------------------------
     Line operations
     ------------------------------------------------------------------ */

  /**
   * Add a product to the cart.
   * @param {string} id       product id
   * @param {number} qty      quantity (default 1)
   * @param {string} variant  colour / storage label
   * @param {object} opts     { silent, showDrawer }
   */
  function addToCart(id, qty, variant, opts) {
    const o = opts || {};
    const product = findProduct(id);
    if (!product) {
      if (!o.silent) LUMEN.toast('That product is no longer available', 'error');
      return null;
    }
    if (Number(product.stock) <= 0) {
      if (!o.silent) LUMEN.toast(`${product.name} is sold out`, 'warn', 'We will let you know when it returns');
      return null;
    }

    const amount = Math.max(1, Number(qty) || 1);
    const key = lineKey(id, variant);
    const list = items();
    const existing = list.find((line) => line.key === key);

    if (existing) {
      existing.qty = Math.min(existing.qty + amount, Number(product.stock));
    } else {
      list.push({
        key,
        id: product.id,
        name: product.name,
        brand: product.brand,
        image: product.image,
        price: D().salePrice(product),
        mrp: product.price,
        qty: amount,
        variant: variant || '',
        stock: Number(product.stock)
      });
    }

    setItems(list);
    if (!o.silent) {
      LUMEN.toast('Added to cart', 'success', `${product.name}${variant ? ' · ' + variant : ''}`);
      if (o.showDrawer) openCartDrawer();
    }
    return list;
  }

  function setQuantity(key, qty) {
    const list = items();
    const line = list.find((l) => l.key === key);
    if (!line) return;
    const next = Math.max(0, Math.min(Number(qty) || 0, line.stock));
    if (next === 0) {
      setItems(list.filter((l) => l.key !== key));
      LUMEN.toast('Removed from cart', 'info', line.name);
      return;
    }
    line.qty = next;
    setItems(list);
  }

  function changeQuantity(key, delta) {
    const line = items().find((l) => l.key === key);
    if (!line) return;
    setQuantity(key, line.qty + delta);
  }

  function removeItem(key) {
    const line = items().find((l) => l.key === key);
    setItems(items().filter((l) => l.key !== key));
    if (line) LUMEN.toast('Removed from cart', 'info', line.name);
  }

  function clearCart(opts) {
    setItems([]);
    if (!(opts && opts.silent)) LUMEN.toast('Cart cleared', 'info');
  }

  /* --------------------------------------------------------------------
     Totals
     ------------------------------------------------------------------ */

  /**
   * Compute order maths.
   * @param {object} coupon  optional applied coupon record
   * @returns {{count,subtotal,discount,shipping,tax,total,freeShipping,threshold,remaining,taxIncluded}}
   */
  function totals(coupon) {
    const list = items();
    const cfg = settings();
    const subtotal = list.reduce((sum, line) => sum + line.price * line.qty, 0);
    const count = list.reduce((sum, line) => sum + line.qty, 0);
    const threshold = Number(cfg.freeShippingOver) || 0;

    let discount = 0;
    if (coupon && subtotal >= (Number(coupon.minOrder) || 0)) {
      if (coupon.type === 'percent') {
        discount = Math.round((subtotal * (Number(coupon.value) || 0)) / 100);
        const cap = Number(coupon.maxDiscount) || 0;
        if (cap > 0) discount = Math.min(discount, cap);
      } else {
        discount = Math.min(Number(coupon.value) || 0, subtotal);
      }
    }

    const afterDiscount = Math.max(0, subtotal - discount);
    const shipping = subtotal === 0 || (threshold > 0 && subtotal >= threshold) ? 0 : Number(cfg.shippingFlat) || 0;
    const taxRate = (Number(cfg.taxRate) || 0) / 100;
    const taxIncluded = Math.round(afterDiscount - afterDiscount / (1 + taxRate));
    const total = afterDiscount + shipping;

    return {
      count,
      subtotal,
      discount,
      shipping,
      taxIncluded,
      taxRate: Number(cfg.taxRate) || 0,
      total,
      freeShipping: shipping === 0 && subtotal > 0,
      threshold,
      remaining: Math.max(0, threshold - subtotal)
    };
  }

  /* --------------------------------------------------------------------
     Coupons
     ------------------------------------------------------------------ */

  /** Validate a coupon code against current cart value. */
  function findCoupon(code) {
    const input = String(code || '').trim().toUpperCase();
    if (!input) return null;
    const coupons = getData('coupons', D().COUPON_SEED) || [];
    return coupons.find((c) => c.code.toUpperCase() === input) || null;
  }

  function applyCoupon(code) {
    const coupon = findCoupon(code);
    if (!coupon) return { ok: false, message: 'That coupon code is not valid.' };
    if (coupon.status !== 'active') return { ok: false, message: 'That coupon is no longer active.' };
    if (coupon.expiry && new Date(coupon.expiry) < new Date()) {
      return { ok: false, message: 'That coupon has expired.' };
    }
    const t = totals(coupon);
    if (t.subtotal < (Number(coupon.minOrder) || 0)) {
      return {
        ok: false,
        message: `Spend ${money(coupon.minOrder)} to use ${coupon.code}. Add ${money((Number(coupon.minOrder) || 0) - t.subtotal)} more.`
      };
    }
    saveData('appliedCoupon', coupon);
    document.dispatchEvent(new CustomEvent('lumen:coupon', { detail: { coupon } }));
    return { ok: true, coupon, message: `${coupon.code} applied — you saved ${money(totals(coupon).discount)}.` };
  }

  function appliedCoupon() {
    return getData('appliedCoupon', null);
  }

  function clearCoupon() {
    removeDataSafe('appliedCoupon');
    document.dispatchEvent(new CustomEvent('lumen:coupon', { detail: { coupon: null } }));
  }

  function removeDataSafe(key) {
    LUMEN.store.removeData(key);
  }

  /* --------------------------------------------------------------------
     Drawer
     ------------------------------------------------------------------ */

  function ensureDrawer() {
    let drawer = $('#cartDrawer');
    if (drawer) return drawer;

    const root = document.body.dataset.root || '';
    const node = LUMEN.dom.fromHTML(`
      <aside class="drawer" id="cartDrawer" aria-label="Shopping bag" aria-hidden="true">
        <div class="drawer__head">
          <span class="drawer__title">Your bag <span class="muted fw-5" data-drawer-count></span></span>
          <button class="icon-btn" type="button" data-close-drawer aria-label="Close bag">${icon('close', 20)}</button>
        </div>
        <div class="drawer__body" data-drawer-body></div>
        <div class="drawer__foot" data-drawer-foot hidden>
          <div data-drawer-totals></div>
          <div class="row gap-2 mt-4">
            <a class="btn btn--primary btn--block" href="${root}checkout.html">Checkout</a>
          </div>
          <a class="btn btn--ghost btn--block mt-2" href="${root}cart.html">View full bag</a>
        </div>
      </aside>
    `);
    document.body.appendChild(node);

    node.addEventListener('click', (event) => {
      const dec = event.target.closest('[data-drawer-dec]');
      const inc = event.target.closest('[data-drawer-inc]');
      const del = event.target.closest('[data-drawer-remove]');
      if (dec) changeQuantity(dec.dataset.drawerDec, -1);
      else if (inc) changeQuantity(inc.dataset.drawerInc, 1);
      else if (del) removeItem(del.dataset.drawerRemove);
    });

    return node;
  }

  function renderCartDrawer() {
    const drawer = $('#cartDrawer');
    if (!drawer) return;
    const body = drawer.querySelector('[data-drawer-body]');
    const foot = drawer.querySelector('[data-drawer-foot]');
    const totalsEl = drawer.querySelector('[data-drawer-totals]');
    const countEl = drawer.querySelector('[data-drawer-count]');
    const list = items();

    if (countEl) countEl.textContent = list.length ? `(${num(list.length)})` : '';

    if (!list.length) {
      body.innerHTML = `
        <div class="empty">
          <span class="empty__icon">${icon('bag', 32)}</span>
          <h3>Your bag is empty.</h3>
          <p>Once you add something you love, it will show up here.</p>
          <div class="empty__actions">
            <button class="btn btn--primary" type="button" data-drawer-continue>Continue shopping</button>
          </div>
        </div>`;
      body.querySelector('[data-drawer-continue]').addEventListener('click', () => {
        LUMEN.drawer.close(drawer);
        window.location.href = 'shop.html';
      });
      foot.hidden = true;
      return;
    }

    const t = totals(appliedCoupon());

    body.innerHTML = `
      <div class="ship-meter">
        <div class="ship-meter__bar"><div class="ship-meter__fill" style="width:${t.threshold ? Math.min(100, (t.subtotal / t.threshold) * 100) : 100}%"></div></div>
        <p class="ship-meter__text">${
          t.remaining > 0
            ? `Add <strong>${money(t.remaining)}</strong> more for free shipping.`
            : '<strong>Free shipping</strong> unlocked on this order.'
        }</p>
      </div>
      ${list.map(lineRow).join('')}`;

    foot.hidden = false;
    totalsEl.innerHTML = `
      <div class="totals">
        <div class="totals__row"><span>Subtotal</span><strong>${money(t.subtotal)}</strong></div>
        ${t.discount ? `<div class="totals__row totals__row--discount"><span>Discount</span><strong>− ${money(t.discount)}</strong></div>` : ''}
        <div class="totals__row"><span>Shipping</span><strong>${t.shipping === 0 ? 'Free' : money(t.shipping)}</strong></div>
        <div class="totals__row"><span>GST (${t.taxRate}%, included)</span><strong>${money(t.taxIncluded)}</strong></div>
        <div class="totals__row totals__row--grand"><span>Total</span><strong>${money(t.total)}</strong></div>
      </div>`;
  }

  function lineRow(line) {
    return `
      <div class="cart-line" data-line-key="${escapeHtml(line.key)}">
        <img class="cart-line__img" src="${D().imageUrl(line.image)}" alt="${escapeHtml(line.name)}" width="76" height="76" loading="lazy">
        <div>
          <p class="cart-line__name">${escapeHtml(line.name)}</p>
          ${line.variant ? `<p class="cart-line__meta">${escapeHtml(line.variant)}</p>` : ''}
          <p class="cart-line__meta">${money(line.price)} each</p>
        </div>
        <p class="cart-line__price">${money(line.price * line.qty)}</p>
        <div class="cart-line__foot">
          <div class="qty">
            <button class="qty__btn" type="button" data-drawer-dec="${escapeHtml(line.key)}" aria-label="Decrease quantity">${icon('minus', 15)}</button>
            <span class="qty__val" aria-live="polite">${line.qty}</span>
            <button class="qty__btn" type="button" data-drawer-inc="${escapeHtml(line.key)}" aria-label="Increase quantity">${icon('plus', 15)}</button>
          </div>
          <button class="icon-link" type="button" data-drawer-remove="${escapeHtml(line.key)}" aria-label="Remove ${escapeHtml(line.name)} from bag">
            ${icon('trash', 15)} Remove
          </button>
        </div>
      </div>`;
  }

  function openCartDrawer() {
    const drawer = ensureDrawer();
    renderCartDrawer();
    drawer.setAttribute('aria-hidden', 'false');
    LUMEN.drawer.open(drawer);
  }

  LUMEN.openCartDrawer = openCartDrawer;
  LUMEN.renderCartDrawer = renderCartDrawer;

  /* --------------------------------------------------------------------
     Cart page
     ------------------------------------------------------------------ */

  function renderCartPage() {
    const list = items();
    const root = document.body.dataset.root || '';
    const wrap = $('[data-cart-root]');
    const summary = $('[data-cart-summary]');
    if (!wrap) return;

    if (!list.length) {
      wrap.innerHTML = LUMEN.ui.emptyState({
        icon: 'bag',
        title: 'Your bag is empty.',
        message: 'You have not added anything yet. Browse the collection and come back when you find something you love.',
        actionLabel: 'Continue shopping',
        actionHref: 'shop.html',
        secondaryLabel: 'View deals',
        secondaryHref: 'shop.html?deals=1'
      });
      if (summary) summary.innerHTML = '';
      const countNode = $('[data-cart-count-label]');
      if (countNode) countNode.textContent = '0 items';
      return;
    }

    const t = totals(appliedCoupon());
    const countNode = $('[data-cart-count-label]');
    if (countNode) countNode.textContent = `${num(t.count)} item${t.count === 1 ? '' : 's'}`;

    wrap.innerHTML = `
      <section class="panel panel--flush">
        <div class="panel__head">
          <h2 class="panel__title">Your bag</h2>
          <button class="icon-link" type="button" data-clear-cart>${icon('trash', 15)} Clear bag</button>
        </div>
        ${list.map(cartRow).join('')}
      </section>

      <div class="row row--between row--wrap gap-3 mt-4">
        <a class="link-arrow" href="shop.html">${icon('arrowLeft', 16)} Continue shopping</a>
        <p class="muted" style="font-size:var(--fs-xs)">Prices include GST. Shipping calculated at checkout.</p>
      </div>`;

    renderCartSummary(summary, t);

    wrap.querySelector('[data-clear-cart]').addEventListener('click', async () => {
      const ok = await LUMEN.modal.confirm({
        title: 'Clear your bag?',
        message: 'This removes every item from your shopping bag. You can always add them again.',
        confirmLabel: 'Clear bag',
        danger: true
      });
      if (ok) {
        clearCart();
        renderCartPage();
      }
    });

    // Bound once: renderCartPage re-runs on every cart mutation.
    if (!wrap.dataset.bound) {
      wrap.dataset.bound = '1';
      wrap.addEventListener('click', onCartPageAction);
    }
  }

  function cartRow(line) {
    return `
      <div class="cart-row" data-line-key="${escapeHtml(line.key)}">
        <a class="cart-row__media" href="product.html?id=${line.id}">
          <img src="${D().imageUrl(line.image)}" alt="${escapeHtml(line.name)}" width="112" height="112" loading="lazy">
        </a>
        <div class="cart-row__info">
          <a class="cart-row__name" href="product.html?id=${line.id}">${escapeHtml(line.name)}</a>
          <p class="cart-row__meta">
            <span>${escapeHtml(line.brand)}</span>
            ${line.variant ? `<span>· ${escapeHtml(line.variant)}</span>` : ''}
          </p>
          <p class="cart-row__unit">${money(line.price)}${line.mrp > line.price ? ` <span class="price__was" style="font-size:12px">${money(line.mrp)}</span>` : ''}</p>
          <p class="cart-row__unit muted" style="font-size:var(--fs-xs)">
            ${line.stock <= 5 ? `Only ${line.stock} left in stock` : 'In stock · ships in 24 hours'}
          </p>
        </div>
        <div class="cart-row__right">
          <p class="cart-row__total">${money(line.price * line.qty)}</p>
          <div class="cart-row__actions">
            <div class="qty">
              <button class="qty__btn" type="button" data-dec="${escapeHtml(line.key)}" aria-label="Decrease quantity of ${escapeHtml(line.name)}">${icon('minus', 15)}</button>
              <span class="qty__val">${line.qty}</span>
              <button class="qty__btn" type="button" data-inc="${escapeHtml(line.key)}" aria-label="Increase quantity of ${escapeHtml(line.name)}">${icon('plus', 15)}</button>
            </div>
            <button class="icon-link" type="button" data-remove="${escapeHtml(line.key)}" aria-label="Remove ${escapeHtml(line.name)}">
              ${icon('trash', 15)}
            </button>
          </div>
        </div>
      </div>`;
  }

  function renderCartSummary(node, t) {
    if (!node) return;
    const coupon = appliedCoupon();
    const cfg = settings();
    const root = document.body.dataset.root || '';

    node.innerHTML = `
      <div class="panel summary">
        <h2 class="panel__title mb-4">Order summary</h2>

        <div class="ship-meter">
          <div class="ship-meter__bar"><div class="ship-meter__fill" style="width:${t.threshold ? Math.min(100, (t.subtotal / t.threshold) * 100) : 100}%"></div></div>
          <p class="ship-meter__text">${
            t.remaining > 0
              ? `Add <strong>${money(t.remaining)}</strong> more for free shipping.`
              : '<strong>Free shipping</strong> unlocked on this order.'
          }</p>
        </div>

        ${
          coupon
            ? `<div class="coupon-applied">
                 <span>${icon('tag', 15)} ${escapeHtml(coupon.code)} applied</span>
                 <button class="icon-btn" type="button" data-remove-coupon aria-label="Remove coupon" style="width:26px;height:26px;color:inherit">${icon('close', 14)}</button>
               </div>`
            : `<form class="coupon-form" data-coupon-form novalidate>
                 <label class="sr-only" for="couponInput">Coupon code</label>
                 <input class="input" type="text" id="couponInput" name="coupon" placeholder="Coupon code" autocomplete="off" spellcheck="false">
                 <button class="btn btn--secondary" type="submit">Apply</button>
               </form>`
        }

        <div class="totals mt-4">
          <div class="totals__row"><span>Subtotal</span><strong>${money(t.subtotal)}</strong></div>
          ${t.discount ? `<div class="totals__row totals__row--discount"><span>Discount (${escapeHtml(coupon ? coupon.code : '—')})</span><strong>− ${money(t.discount)}</strong></div>` : ''}
          <div class="totals__row"><span>Shipping</span><strong>${t.shipping === 0 ? 'Free' : money(t.shipping)}</strong></div>
          <div class="totals__row"><span>GST (${t.taxRate}%, included)</span><strong>${money(t.taxIncluded)}</strong></div>
          <div class="totals__row totals__row--grand"><span>Total</span><strong>${money(t.total)}</strong></div>
        </div>

        <a class="btn btn--primary btn--lg btn--block mt-5" href="${root}checkout.html">
          Proceed to checkout ${icon('arrowRight', 17)}
        </a>

        <p class="secure-note">${icon('lock', 14)} Secure demo checkout — no real payment is processed</p>

        <div class="mt-5">
          <p class="field__label mb-2">We accept</p>
          <div class="pay-icons">
            <span>UPI</span><span>VISA</span><span>MASTERCARD</span><span>RUPAY</span><span>NET BANKING</span><span>COD</span>
          </div>
        </div>

        <div class="notice mt-5">
          ${icon('truck', 18)}
          <p>Orders placed before 2 pm ship the same working day. Returns accepted within 7 days of delivery.</p>
        </div>
      </div>`;

    const form = node.querySelector('[data-coupon-form]');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = form.querySelector('#couponInput');
        const result = applyCoupon(input.value);
        if (result.ok) {
          LUMEN.toast('Coupon applied', 'success', result.message);
          renderCartPage();
        } else {
          LUMEN.toast('Coupon not applied', 'error', result.message);
        }
      });
    }

    const remove = node.querySelector('[data-remove-coupon]');
    if (remove) {
      remove.addEventListener('click', () => {
        clearCoupon();
        LUMEN.toast('Coupon removed', 'info');
        renderCartPage();
      });
    }
  }

  function onCartPageAction(event) {
    const dec = event.target.closest('[data-dec]');
    const inc = event.target.closest('[data-inc]');
    const del = event.target.closest('[data-remove]');
    const row = event.target.closest('[data-line-key]');

    if (dec) {
      const key = dec.dataset.dec;
      const line = items().find((l) => l.key === key);
      if (line && line.qty === 1) {
        row.classList.add('is-removing');
        setTimeout(() => removeItem(key), 200);
      } else {
        changeQuantity(key, -1);
      }
    } else if (inc) {
      changeQuantity(inc.dataset.inc, 1);
    } else if (del) {
      row.classList.add('is-removing');
      setTimeout(() => removeItem(del.dataset.remove), 200);
    }
  }

  LUMEN.renderCartPage = renderCartPage;

  /* --------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */

  LUMEN.cart = {
    items,
    setItems,
    addToCart,
    setQuantity,
    changeQuantity,
    removeItem,
    clearCart,
    totals,
    applyCoupon,
    clearCoupon,
    appliedCoupon,
    settings,
    openDrawer: openCartDrawer
  };

  LUMEN.onReady(() => {
    if (document.body.dataset.page === 'cart') {
      renderCartPage();
      LUMEN.reveal.init($('[data-cart-root]'));
    }
  });
})(window);
