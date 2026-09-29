/* ==========================================================================
   LUMEN — Wishlist
   js/wishlist.js
   --------------------------------------------------------------------------
   · Wishlist persistence in localStorage
   · Toggle / add / remove / clear / move-to-cart
   · Global delegation so hearts on any card or the PDP just work
   · wishlist.html rendering
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
    const list = getData('wishlist', []);
    return Array.isArray(list) ? list : [];
  }

  function setItems(next) {
    saveData('wishlist', next);
    document.dispatchEvent(new CustomEvent('lumen:wishlist', { detail: { items: next } }));
    LUMEN.badges.sync('wish');
    LUMEN.badges.syncWishStates();
    if (typeof LUMEN.renderWishlistPage === 'function' && document.body.dataset.page === 'wishlist') {
      LUMEN.renderWishlistPage();
    }
    if (typeof LUMEN.refreshPdpWishlist === 'function') LUMEN.refreshPdpWishlist();
  }

  function has(id) {
    return items().some((p) => p.id === id);
  }

  function productById(id) {
    return LUMEN.ui.catalog().find((p) => p.id === id) || null;
  }

  function snapshot(product) {
    return {
      id: product.id,
      name: product.name,
      brand: product.brand,
      category: product.category,
      price: D().salePrice(product),
      mrp: product.price,
      rating: product.rating,
      reviews: product.reviews,
      image: product.image,
      stock: product.stock
    };
  }

  /* --------------------------------------------------------------------
     Operations
     ------------------------------------------------------------------ */

  function add(id) {
    if (has(id)) return false;
    const product = productById(id);
    if (!product) return false;
    setItems(items().concat([snapshot(product)]));
    LUMEN.toast('Saved to wishlist', 'success', product.name);
    return true;
  }

  function remove(id) {
    const target = items().find((p) => p.id === id);
    setItems(items().filter((p) => p.id !== id));
    if (target) LUMEN.toast('Removed from wishlist', 'info', target.name);
  }

  /** Flip membership. Returns the new state. */
  function toggle(id) {
    if (has(id)) {
      remove(id);
      return false;
    }
    add(id);
    return true;
  }

  function clear() {
    setItems([]);
    LUMEN.toast('Wishlist cleared', 'info');
  }

  /** Move a single saved item into the bag, then drop it from the list. */
  function moveToCart(id) {
    const product = productById(id);
    if (!product) {
      remove(id);
      return;
    }
    LUMEN.cart.addToCart(id, 1, '', { silent: true });
    setItems(items().filter((p) => p.id !== id));
    LUMEN.toast('Moved to bag', 'success', product.name);
  }

  /** Move everything currently in stock into the bag. */
  function moveAllToCart() {
    const list = items();
    let moved = 0;
    list.forEach((entry) => {
      if (Number(entry.stock) > 0) {
        LUMEN.cart.addToCart(entry.id, 1, '', { silent: true });
        moved += 1;
      }
    });
    setItems([]);
    LUMEN.toast(
      moved ? `${moved} item${moved === 1 ? '' : 's'} moved to bag` : 'Nothing could be moved',
      moved ? 'success' : 'warn',
      moved ? 'Items already in your bag were merged' : 'Those products are currently out of stock'
    );
  }

  /* --------------------------------------------------------------------
     Global delegation
     ------------------------------------------------------------------ */

  function initDelegation() {
    LUMEN.dom.delegate(document, '[data-wish-id]', 'click', (event, el) => {
      event.preventDefault();
      event.stopPropagation();
      const id = el.dataset.wishId;
      el.classList.add('is-bump');
      setTimeout(() => el.classList.remove('is-bump'), 460);
      toggle(id);
    });
  }

  /* --------------------------------------------------------------------
     Wishlist page
     ------------------------------------------------------------------ */

  function renderWishlistPage() {
    const root = $('[data-wishlist-root]');
    if (!root) return;
    const saved = items();
    const countNode = $('[data-wishlist-count-label]');
    const toolbar = $('[data-wishlist-toolbar]');

    if (countNode) {
      countNode.textContent = saved.length
        ? `${num(saved.length)} item${saved.length === 1 ? '' : 's'}`
        : 'Nothing saved yet';
    }

    if (!saved.length) {
      root.innerHTML = LUMEN.ui.emptyState({
        icon: 'heart',
        title: 'Your wishlist is empty.',
        message: 'Tap the heart on any product to save it here for later. Saved items stay on this device.',
        actionLabel: 'Browse products',
        actionHref: 'shop.html',
        secondaryLabel: 'See new arrivals',
        secondaryHref: 'shop.html?sort=newest'
      });
      if (toolbar) toolbar.hidden = true;
      return;
    }

    if (toolbar) toolbar.hidden = false;

    // Match saved snapshots back to live catalogue entries so admin edits show.
    const cards = saved
      .map((entry) => {
        const live = productById(entry.id);
        return live || entry;
      })
      .map((product) => {
        const price = D().salePrice(product);
        const out = Number(product.stock) <= 0;
        return `
          <article class="product-card" data-product-id="${product.id}">
            <div class="product-card__media">
              <img class="product-card__img" src="${D().imageUrl(product.image)}" alt="${escapeHtml(product.name)}"
                   width="600" height="600" loading="lazy" decoding="async">
              ${out ? '<div class="product-card__flags"><span class="badge badge--out">Sold out</span></div>' : ''}
              ${!out && product.discount ? `<div class="product-card__flags"><span class="badge badge--sale">${product.discount}% off</span></div>` : ''}
              <button class="wish-btn is-active" type="button" data-wish-id="${product.id}" data-wish-label="${escapeHtml(product.name)}"
                      aria-pressed="true" aria-label="Remove ${escapeHtml(product.name)} from wishlist">${icon('heart', 17)}</button>
            </div>
            <div class="product-card__body">
              <p class="product-card__cat">${escapeHtml(D().categoryName(product.category))}</p>
              <h3 class="product-card__title"><a href="product.html?id=${product.id}">${escapeHtml(product.name)}</a></h3>
              <div class="row gap-2">${LUMEN.ui.starsMarkup(product.rating)}<span class="rating__count">(${num(product.reviews)})</span></div>
              <div class="product-card__foot">
                <div class="price">
                  <span class="price__now">${money(price)}</span>
                  ${product.mrp > price ? `<span class="price__was">${money(product.mrp)}</span>` : ''}
                </div>
                <button class="btn btn--primary btn--sm" type="button" data-move-to-cart="${product.id}" ${out ? 'disabled' : ''}>
                  ${out ? 'Sold out' : 'Move to cart'}
                </button>
              </div>
            </div>
          </article>`;
      })
      .join('');

    root.innerHTML = `<div class="product-grid">${cards}</div>`;

    root.querySelectorAll('[data-move-to-cart]').forEach((btn) => {
      btn.addEventListener('click', () => moveToCart(btn.dataset.moveToCart));
    });
  }

  function initPageActions() {
    const clearBtn = $('[data-wishlist-clear]');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        const ok = await LUMEN.modal.confirm({
          title: 'Clear your wishlist?',
          message: 'Every saved product will be removed. This cannot be undone.',
          confirmLabel: 'Clear wishlist',
          danger: true
        });
        if (ok) {
          clear();
          renderWishlistPage();
        }
      });
    }

    const allBtn = $('[data-wishlist-move-all]');
    if (allBtn) {
      allBtn.addEventListener('click', () => {
        moveAllToCart();
        renderWishlistPage();
      });
    }
  }

  LUMEN.wishlist = { items, setItems, has, add, remove, toggle, clear, moveToCart, moveAllToCart };
  LUMEN.renderWishlistPage = renderWishlistPage;

  /* --------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------ */

  initDelegation();

  LUMEN.onReady(() => {
    if (document.body.dataset.page === 'wishlist') {
      renderWishlistPage();
      initPageActions();
    }
  });
})(window);
