/* ==========================================================================
   LUMEN — Storefront pages
   js/storefront.js
   --------------------------------------------------------------------------
   Renders the three data-driven storefront pages:
     · index.html   — hero, category grid, featured / new / deals / bestsellers
     · shop.html    — filter, sort, search, grid/list view, URL state
     · product.html — gallery, variants, quantity, add to bag, tabs, reviews
   Everything else on those pages is static markup; this file only fills the
   empty containers.
   ========================================================================== */

(function (global) {
  'use strict';

  const LUMEN = global.LUMEN;
  const { getData, saveData } = LUMEN.store;
  const { escapeHtml, $, $$ } = LUMEN.dom;
  const { money, num, formatDate, clamp, debounce } = LUMEN.fmt;
  const icon = LUMEN.icon;
  const D = () => LUMEN.data;

  const catalog = () => LUMEN.ui.catalog();

  /* =====================================================================
     1. HELPERS
     ===================================================================== */

  function card(product, opts) {
    return LUMEN.ui.productCardMarkup(product, opts || {});
  }

  function byCategory(slug) {
    return catalog().filter((p) => p.category === slug);
  }

  function deals(limit) {
    return catalog()
      .filter((p) => Number(p.discount) > 0)
      .sort((a, b) => b.discount - a.discount)
      .slice(0, limit);
  }

  /** Newest first. Takes an explicit list so it can sort filtered results. */
  function byNewest(list) {
    return list.slice().sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (db !== da) return db - da;
      return (b.rating || 0) - (a.rating || 0);
    });
  }

  function newest(limit) {
    return byNewest(catalog()).slice(0, limit);
  }

  function bestsellers(limit) {
    return catalog()
      .filter((p) => p.badge === 'bestseller' || Number(p.discount) >= 10)
      .sort((a, b) => (b.rating || 0) * (b.reviews || 0) - (a.rating || 0) * (a.reviews || 0))
      .slice(0, limit);
  }

  function featured(limit) {
    const flagged = catalog().filter((p) => p.featured);
    return (flagged.length ? flagged : catalog().filter((p) => p.rating >= 4.6)).slice(0, limit);
  }

  function priceBounds() {
    const list = catalog();
    if (!list.length) return { min: 0, max: 100000 };
    const prices = list.map((p) => D().salePrice(p));
    return { min: Math.min.apply(null, prices), max: Math.max.apply(null, prices) };
  }

  function param(name, fallback) {
    const value = new URLSearchParams(global.location.search).get(name);
    return value === null ? fallback : value;
  }

  /** Keep the address bar in step with the active filters. */
  function syncUrl(state) {
    const params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category && state.category !== 'all') params.set('category', state.category);
    if (state.brands && state.brands.length) params.set('brands', state.brands.join(','));
    if (state.minPrice) params.set('min', state.minPrice);
    if (state.maxPrice) params.set('max', state.maxPrice);
    if (state.rating) params.set('rating', state.rating);
    if (state.sort && state.sort !== 'featured') params.set('sort', state.sort);
    if (state.deals) params.set('deals', '1');
    if (state.inStock) params.set('stock', '1');
    const query = params.toString();
    global.history.replaceState({}, '', query ? `shop.html?${query}` : 'shop.html');
  }

  /* =====================================================================
     2. HOME
     ===================================================================== */

  const TESTIMONIALS = [
    { quote: 'The Aurora X1 Pro replaced two devices and a pair of earbuds. Battery life is genuinely as advertised, which never happens.', name: 'Riya Sharma', role: 'Bengaluru · 3 orders', rating: 5, initials: 'RS' },
    { quote: 'Ordered a laptop at 11 am, it was out for delivery the next morning. Packaging felt like something twice the price.', name: 'Arjun Nair', role: 'Kochi · 7 orders', rating: 5, initials: 'AN' },
    { quote: 'Support actually answered on WhatsApp in four minutes and sorted a colour swap I made five minutes after ordering.', name: 'Meera Iyer', role: 'Chennai · 2 orders', rating: 4, initials: 'MI' }
  ];

  const FAQS = [
    { q: 'How long does delivery take?', a: 'Standard delivery is 3–5 business days and is free on orders above ₹999. Express (1–2 days) is ₹199 and priority same-day is ₹349 for orders placed before 2 pm.' },
    { q: 'Can I return a product?', a: 'Yes. Returns are accepted within 7 days of delivery, and our courier collects from your address at no cost. Refunds are issued to the original payment method within 3–5 working days of the item reaching us.' },
    { q: 'Is this a real store?', a: 'Lumen is a demonstration storefront. No payment is processed, no order is shipped, and the accounts are sample data held only in your browser.' },
    { q: 'What warranty comes with my purchase?', a: 'Every product carries a 12-month manufacturer warranty handled through our support desk. Accidental damage is not covered, but we offer optional extended cover at checkout on selected items.' },
    { q: 'Do you accept UPI?', a: 'We list UPI, credit and debit cards, net banking and cash on delivery. Cash on delivery carries a ₹49 handling fee.' }
  ];

  function renderHome() {
    // Category grid
    const catHost = $('[data-home-categories]');
    if (catHost) {
      catHost.innerHTML = D().CATEGORIES.map(
        (c) => `
        <a class="category-tile" href="shop.html?category=${c.slug}" data-reveal>
          <span class="category-tile__media">
            <img src="${D().imageUrl(c.image)}" alt="" width="400" height="300" loading="lazy">
          </span>
          <span class="category-tile__body">
            <strong>${escapeHtml(c.name)}</strong>
            <span class="muted">${escapeHtml(c.blurb)}</span>
            <span class="category-tile__count">${num(byCategory(c.slug).length)} products ${icon('arrowRight', 15)}</span>
          </span>
        </a>`
      ).join('');
    }

    fill('[data-home-featured]', featured(8), { hideDesc: true });
    fill('[data-home-new]', newest(4), { hideDesc: true });
    fill('[data-home-deals]', deals(4), { hideDesc: true });
    fill('[data-home-best]', bestsellers(4), { hideDesc: true });

    // A full-bleed deals band
    const dealHost = $('[data-home-dealband]');
    if (dealHost) {
      const top = deals(1)[0];
      if (top) {
        dealHost.innerHTML = `
          <div class="dealband" data-reveal>
            <div class="dealband__media">
              <img src="${D().imageUrl(top.image)}" alt="${escapeHtml(top.name)}" width="600" height="600" loading="lazy">
            </div>
            <div class="dealband__body">
              <p class="eyebrow">Deal of the week</p>
              <h2>${escapeHtml(top.name)}</h2>
              <p class="muted">${escapeHtml(top.tagline || top.description)}</p>
              <div class="price price--lg mt-3">
                <span class="price__now">${money(D().salePrice(top))}</span>
                <span class="price__was">${money(top.price)}</span>
                <span class="badge badge--sale">${top.discount}% off</span>
              </div>
              <div class="row gap-3 row--wrap mt-5">
                <a class="btn btn--dark btn--lg" href="product.html?id=${top.id}">Shop this deal</a>
                <a class="btn btn--outline btn--lg" href="shop.html?deals=1">See all deals</a>
              </div>
              <p class="dealband__stock">${icon('zap', 15)} ${Number(top.stock) <= 5 ? `Only ${top.stock} left in stock` : 'In stock, ships in 24 hours'}</p>
            </div>
          </div>`;
      }
    }

    // Testimonials
    const tHost = $('[data-home-testimonials]');
    if (tHost) {
      tHost.innerHTML = TESTIMONIALS.map(
        (t) => `
        <figure class="quote-card" data-reveal>
          <div class="row gap-1">${LUMEN.ui.starsMarkup(t.rating)}</div>
          <blockquote>${escapeHtml(t.quote)}</blockquote>
          <figcaption>
            <span class="avatar avatar--sm">${escapeHtml(t.initials)}</span>
            <span><strong>${escapeHtml(t.name)}</strong><small class="muted">${escapeHtml(t.role)}</small></span>
          </figcaption>
        </figure>`
      ).join('');
    }

    // FAQ accordion
    const fHost = $('[data-home-faq]');
    if (fHost) {
      fHost.innerHTML = FAQS.map(
        (f, i) => `
        <details class="faq" ${i === 0 ? 'open' : ''}>
          <summary>${escapeHtml(f.q)}<span class="faq__chev">${icon('chevronDown', 18)}</span></summary>
          <p>${escapeHtml(f.a)}</p>
        </details>`
      ).join('');
    }

    // Trust strip
    const trustHost = $('[data-home-trust]');
    if (trustHost) {
      const items = [
        { ico: 'truck', title: 'Free delivery over ₹999', text: 'Same-day dispatch before 2 pm' },
        { ico: 'refresh', title: '7-day free returns', text: 'Doorstep collection, no fee' },
        { ico: 'shield', title: '12-month warranty', text: 'Handled by our support desk' },
        { ico: 'headset', title: 'Support that answers', text: 'Mon–Sat, 9 am to 8 pm' }
      ];
      trustHost.innerHTML = items
        .map(
          (t) => `
        <div class="trust-item">
          <span class="trust-item__icon">${icon(t.ico, 20)}</span>
          <div><strong>${escapeHtml(t.title)}</strong><span class="muted">${escapeHtml(t.text)}</span></div>
        </div>`
        )
        .join('');
    }

    // Hero figures
    const heroStats = $('[data-home-hero-stats]');
    if (heroStats) {
      const list = catalog();
      heroStats.innerHTML = `
        <li><strong>${num(list.length)}</strong><span>Products</span></li>
        <li><strong>4.7★</strong><span>Average rating</span></li>
        <li><strong>12k+</strong><span>Orders shipped</span></li>`;
    }

    LUMEN.reveal.init();
  }

  function fill(selector, list, opts) {
    const host = $(selector);
    if (!host) return;
    if (!list.length) {
      host.innerHTML = LUMEN.ui.emptyState({ icon: 'package', title: 'Nothing here yet', message: 'Check back soon.', actionLabel: 'Browse the shop', actionHref: 'shop.html' });
      return;
    }
    host.innerHTML = `<div class="product-grid">${list.map((p) => card(p, opts)).join('')}</div>`;
  }

  function initNewsletter() {
    const forms = $$('[data-newsletter-form]');
    forms.forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const input = form.querySelector('input[type="email"]');
        if (!input || !LUMEN.auth.EMAIL_RE.test(input.value.trim())) {
          LUMEN.toast('Enter a valid email', 'error');
          if (input) input.focus();
          return;
        }
        const list = getData('newsletter', []);
        if (!Array.isArray(list)) saveData('newsletter', []);
        const subscribers = getData('newsletter', []);
        if (!subscribers.some((e) => e.toLowerCase() === input.value.trim().toLowerCase())) {
          saveData('newsletter', subscribers.concat([input.value.trim()]));
        }
        form.reset();
        LUMEN.toast('You are on the list', 'success', 'Look out for the next drop');
      });
    });
  }

  /* =====================================================================
     3. SHOP
     ===================================================================== */

  const SORTS = [
    { id: 'featured', label: 'Featured' },
    { id: 'newest', label: 'Newest' },
    { id: 'price-asc', label: 'Price: low to high' },
    { id: 'price-desc', label: 'Price: high to low' },
    { id: 'rating', label: 'Top rated' },
    { id: 'discount', label: 'Biggest discount' }
  ];

  const shopState = {
    q: '',
    category: 'all',
    brands: [],
    minPrice: 0,
    maxPrice: 0,
    rating: 0,
    sort: 'featured',
    deals: false,
    inStock: false,
    view: 'grid'
  };

  function applySort(list) {
    const sorted = list.slice();
    switch (shopState.sort) {
      case 'price-asc':
        return sorted.sort((a, b) => D().salePrice(a) - D().salePrice(b));
      case 'price-desc':
        return sorted.sort((a, b) => D().salePrice(b) - D().salePrice(a));
      case 'rating':
        return sorted.sort((a, b) => (b.rating || 0) * (b.reviews || 0) - (a.rating || 0) * (a.reviews || 0));
      case 'discount':
        return sorted.sort((a, b) => (b.discount || 0) - (a.discount || 0));
      case 'newest':
        return byNewest(sorted);
      default:
        return sorted.sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || (b.rating || 0) - (a.rating || 0));
    }
  }

  function filtered() {
    const bounds = priceBounds();
    const min = shopState.minPrice || 0;
    const max = shopState.maxPrice || bounds.max;

    return catalog().filter((p) => {
      const price = D().salePrice(p);
      if (shopState.category !== 'all' && p.category !== shopState.category) return false;
      if (shopState.brands.length && shopState.brands.indexOf(p.brand) === -1) return false;
      if (price < min || price > max) return false;
      if (shopState.rating && (p.rating || 0) < shopState.rating) return false;
      if (shopState.deals && !(Number(p.discount) > 0)) return false;
      if (shopState.inStock && Number(p.stock) <= 0) return false;
      if (shopState.q) {
        const haystack = `${p.name} ${p.brand} ${p.tagline || ''} ${D().categoryName(p.category)}`.toLowerCase();
        const terms = shopState.q.toLowerCase().split(/\s+/).filter(Boolean);
        if (!terms.every((t) => haystack.indexOf(t) > -1)) return false;
      }
      return true;
    });
  }

  function buildShopFilters() {
    const list = catalog();
    const brands = D().ALL_BRANDS;
    const bounds = priceBounds();

    const catHost = $('[data-shop-categories]');
    if (catHost) {
      const counts = {};
      list.forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
      catHost.innerHTML = `
        <button class="filter-item${shopState.category === 'all' ? ' is-active' : ''}" type="button" data-set-category="all">
          <span>All products</span><span class="filter-item__count">${num(list.length)}</span>
        </button>
        ${D().CATEGORIES.map(
          (c) => `
        <button class="filter-item${shopState.category === c.slug ? ' is-active' : ''}" type="button" data-set-category="${c.slug}">
          <span>${escapeHtml(c.name)}</span><span class="filter-item__count">${num(counts[c.slug] || 0)}</span>
        </button>`
        ).join('')}`;
    }

    const brandHost = $('[data-shop-brands]');
    if (brandHost) {
      const brandCounts = {};
      list.forEach((p) => { brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1; });
      brandHost.innerHTML = brands
        .map(
          (b) => `
        <label class="check check--sm">
          <input type="checkbox" value="${escapeHtml(b)}" ${shopState.brands.indexOf(b) > -1 ? 'checked' : ''}>
          <span>${escapeHtml(b)}</span><span class="filter-item__count">${num(brandCounts[b] || 0)}</span>
        </label>`
        )
        .join('');
    }

    const priceHost = $('[data-shop-price]');
    if (priceHost) {
      priceHost.innerHTML = `
        <div class="range">
          <div class="range__values">
            <span class="field__label" data-price-lo>From ${money(shopState.minPrice || bounds.min)}</span>
            <span class="field__label" data-price-hi>To ${money(shopState.maxPrice || bounds.max)}</span>
          </div>
          <input class="range__static" type="range" id="minPrice" aria-label="Minimum price"
                 min="${bounds.min}" max="${bounds.max}" step="1000" value="${shopState.minPrice || bounds.min}">
          <input class="range__static" type="range" id="maxPrice" aria-label="Maximum price"
                 min="${bounds.min}" max="${bounds.max}" step="1000" value="${shopState.maxPrice || bounds.max}">
          <p class="field__hint" data-price-hint>Everything between ${money(shopState.minPrice || bounds.min)} and ${money(shopState.maxPrice || bounds.max)}</p>
        </div>`;
    }

    const ratingHost = $('[data-shop-rating]');
    if (ratingHost) {
      ratingHost.innerHTML = [4, 3, 2]
        .map(
          (r) => `
        <button class="filter-item${shopState.rating === r ? ' is-active' : ''}" type="button" data-set-rating="${r}">
          <span>${LUMEN.ui.starsMarkup(r)} &amp; up</span>
          <span class="filter-item__count">${num(list.filter((p) => (p.rating || 0) >= r).length)}</span>
        </button>`
        )
        .join('') + `<button class="filter-item${shopState.rating === 0 ? ' is-active' : ''}" type="button" data-set-rating="0"><span>Any rating</span></button>`;
    }

    const sortHost = $('[data-shop-sort]');
    if (sortHost) {
      sortHost.innerHTML = SORTS.map(
        (s) => `<option value="${s.id}" ${shopState.sort === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`
      ).join('');
    }
  }

  function renderChips() {
    const host = $('[data-shop-chips]');
    if (!host) return;
    const chips = [];

    if (shopState.q) chips.push({ key: 'q', label: `“${shopState.q}”` });
    if (shopState.category !== 'all') {
      chips.push({ key: 'category', label: D().categoryName(shopState.category) });
    }
    shopState.brands.forEach((b) => chips.push({ key: 'brand', label: b, value: b }));
    const bounds = priceBounds();
    if (shopState.minPrice > bounds.min || shopState.maxPrice < bounds.max) {
      chips.push({ key: 'price', label: `${money(shopState.minPrice || bounds.min)} – ${money(shopState.maxPrice || bounds.max)}` });
    }
    if (shopState.rating) chips.push({ key: 'rating', label: `${shopState.rating}★ & up` });
    if (shopState.deals) chips.push({ key: 'deals', label: 'On sale' });
    if (shopState.inStock) chips.push({ key: 'stock', label: 'In stock' });

    host.innerHTML = chips.length
      ? chips
          .map(
            (c) => `
        <button class="chip chip--active" type="button" data-remove-filter="${c.key}" data-value="${escapeHtml(c.value || '')}">
          ${escapeHtml(c.label)} ${icon('close', 13)}
        </button>`
          )
          .join('') + `<button class="chip chip--clear" type="button" data-clear-filters>Clear all</button>`
      : '<span class="muted" style="font-size:var(--fs-sm)">No filters applied.</span>';
  }

  function renderShop() {
    const root = $('[data-shop-root]');
    if (!root) return;

    const results = applySort(filtered());
    const countNode = $('[data-shop-count]');
    if (countNode) countNode.textContent = `${num(results.length)} product${results.length === 1 ? '' : 's'}`;

    const titleNode = $('[data-shop-title]');
    if (titleNode) {
      titleNode.textContent = shopState.q
        ? `Results for “${shopState.q}”`
        : shopState.category !== 'all'
        ? D().categoryName(shopState.category)
        : shopState.deals
        ? 'Deals'
        : 'All products';
    }

    if (!results.length) {
      root.innerHTML = LUMEN.ui.emptyState({
        icon: 'search',
        title: 'No products match those filters.',
        message: 'Try widening the price range, clearing a brand, or searching for something else.',
        actionLabel: 'Clear all filters',
        actionHref: 'shop.html'
      });
    } else if (shopState.view === 'list') {
      root.innerHTML = `<div class="product-list">${results
        .map(
          (p) => `
        <article class="product-row">
          <a class="product-row__media" href="product.html?id=${p.id}">
            <img src="${D().imageUrl(p.image)}" alt="${escapeHtml(p.name)}" width="200" height="200" loading="lazy">
          </a>
          <div class="product-row__body">
            <p class="product-card__cat">${escapeHtml(D().categoryName(p.category))}</p>
            <h3><a href="product.html?id=${p.id}">${escapeHtml(p.name)}</a></h3>
            <div class="row gap-2">${LUMEN.ui.starsMarkup(p.rating)}<span class="rating__count">(${num(p.reviews)})</span></div>
            <p class="muted">${escapeHtml(p.tagline || p.description)}</p>
            <div class="product-row__foot">
              <div class="price">
                <span class="price__now">${money(D().salePrice(p))}</span>
                ${p.discount ? `<span class="price__was">${money(p.price)}</span>` : ''}
              </div>
              <button class="btn btn--primary btn--sm" type="button" data-add-to-cart="${p.id}" ${Number(p.stock) <= 0 ? 'disabled' : ''}>
                ${Number(p.stock) <= 0 ? 'Sold out' : 'Add to cart'}
              </button>
              <button class="wish-btn" type="button" data-wish-id="${p.id}" data-wish-label="${escapeHtml(p.name)}" aria-pressed="false" aria-label="Add ${escapeHtml(p.name)} to wishlist">${icon('heart', 17)}</button>
            </div>
          </div>
        </article>`
        )
        .join('')}</div>`;
    } else {
      root.innerHTML = `<div class="product-grid">${results.map((p) => card(p)).join('')}</div>`;
    }

    LUMEN.badges.syncWishStates();
    renderChips();
  }

  function hydrateShopState() {
    const bounds = priceBounds();
    shopState.q = param('q', '');
    shopState.category = param('category', 'all');
    shopState.sort = param('sort', 'featured');
    shopState.deals = param('deals', '') === '1';
    shopState.inStock = param('stock', '') === '1';
    shopState.rating = Number(param('rating', 0)) || 0;
    shopState.minPrice = Number(param('min', 0)) || 0;
    shopState.maxPrice = Number(param('max', 0)) || bounds.max;
    const brands = param('brands', '');
    shopState.brands = brands ? brands.split(',').filter(Boolean) : [];

    const search = $('[data-shop-search]');
    if (search && shopState.q) search.value = shopState.q;
  }

  function initShop() {
    hydrateShopState();
    buildShopFilters();
    renderShop();

    const root = document.body;

    root.addEventListener('click', (event) => {
      const cat = event.target.closest('[data-set-category]');
      if (cat) {
        shopState.category = cat.dataset.setCategory;
        return apply();
      }

      const rating = event.target.closest('[data-set-rating]');
      if (rating) {
        shopState.rating = Number(rating.dataset.setRating) || 0;
        return apply();
      }

      const remove = event.target.closest('[data-remove-filter]');
      if (remove) {
        const key = remove.dataset.removeFilter;
        const bounds = priceBounds();
        if (key === 'q') shopState.q = '';
        if (key === 'category') shopState.category = 'all';
        if (key === 'brand') shopState.brands = shopState.brands.filter((b) => b !== remove.dataset.value);
        if (key === 'price') { shopState.minPrice = 0; shopState.maxPrice = bounds.max; }
        if (key === 'rating') shopState.rating = 0;
        if (key === 'deals') shopState.deals = false;
        if (key === 'stock') shopState.inStock = false;
        if (key === 'q') { const s = $('[data-shop-search]'); if (s) s.value = ''; }
        return apply();
      }

      if (event.target.closest('[data-clear-filters]')) {
        const bounds = priceBounds();
        shopState.q = '';
        shopState.category = 'all';
        shopState.brands = [];
        shopState.minPrice = 0;
        shopState.maxPrice = bounds.max;
        shopState.rating = 0;
        shopState.deals = false;
        shopState.inStock = false;
        const s = $('[data-shop-search]');
        if (s) s.value = '';
        return apply();
      }

      const toggle = event.target.closest('[data-toggle-deals]');
      if (toggle) { shopState.deals = !shopState.deals; return apply(); }

      const stock = event.target.closest('[data-toggle-stock]');
      if (stock) { shopState.inStock = !shopState.inStock; return apply(); }

      const view = event.target.closest('[data-set-view]');
      if (view) {
        shopState.view = view.dataset.setView;
        $$('[data-set-view]').forEach((b) => b.classList.toggle('is-active', b.dataset.setView === shopState.view));
        return renderShop();
      }

      const openFilters = event.target.closest('[data-open-filters]');
      if (openFilters) {
        const panel = $('.shop-filters');
        if (panel) {
          panel.classList.add('is-open');
          LUMEN.modal.lockScroll(true);
        }
      }
      const closeFilters = event.target.closest('[data-close-filters]');
      if (closeFilters) {
        const panel = $('.shop-filters');
        if (panel) {
          panel.classList.remove('is-open');
          LUMEN.modal.lockScroll(false);
        }
      }
    });

    root.addEventListener('change', (event) => {
      const brand = event.target.closest('[data-shop-brands] input');
      if (brand) {
        const value = brand.value;
        if (brand.checked) {
          if (shopState.brands.indexOf(value) === -1) shopState.brands.push(value);
        } else {
          shopState.brands = shopState.brands.filter((b) => b !== value);
        }
        return apply();
      }

      const sort = event.target.closest('[data-shop-sort]');
      if (sort) {
        shopState.sort = sort.value;
        return apply();
      }
    });

    // Price sliders: live label while dragging, filter on release.
    root.addEventListener('input', (event) => {
      const slider = event.target.closest('#minPrice, #maxPrice');
      if (!slider) return;

      const bounds = priceBounds();
      const loNode = $('#minPrice');
      const hiNode = $('#maxPrice');
      let lo = Number((loNode && loNode.value) || bounds.min);
      let hi = Number((hiNode && hiNode.value) || bounds.max);

      // Keep the two handles from crossing over each other.
      if (lo > hi) {
        if (slider.id === 'minPrice') hi = lo;
        else lo = hi;
        if (loNode) loNode.value = lo;
        if (hiNode) hiNode.value = hi;
      }

      const loLabel = $('[data-price-lo]');
      const hiLabel = $('[data-price-hi]');
      const hint = $('[data-price-hint]');
      if (loLabel) loLabel.textContent = `From ${money(lo)}`;
      if (hiLabel) hiLabel.textContent = `To ${money(hi)}`;
      if (hint) hint.textContent = `Everything between ${money(lo)} and ${money(hi)}`;
    });

    root.addEventListener('change', (event) => {
      if (!event.target.closest('#minPrice, #maxPrice')) return;
      const bounds = priceBounds();
      shopState.minPrice = Number(($('#minPrice') || {}).value || 0) || bounds.min;
      shopState.maxPrice = Number(($('#maxPrice') || {}).value || bounds.max) || bounds.max;
      apply();
    });

    const search = $('[data-shop-search]');
    if (search) {
      search.addEventListener(
        'input',
        debounce(() => {
          shopState.q = search.value.trim();
          apply();
        }, 220)
      );
      search.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          shopState.q = search.value.trim();
          apply();
        }
      });
    }

    function apply() {
      buildShopFilters();
      renderShop();
      syncUrl(shopState);
    }
  }

  /* =====================================================================
     4. PRODUCT DETAIL
     ===================================================================== */

  const current = { product: null, variant: '', qty: 1, image: 0, tab: 'description' };

  function specRows(product) {
    const rows = [
      ['Brand', product.brand],
      ['Category', D().categoryName(product.category)],
      ['Model', product.sku || product.id],
      ['Warranty', '12 months manufacturer'],
      ['Availability', Number(product.stock) > 5 ? 'In stock' : Number(product.stock) > 0 ? `Only ${product.stock} left` : 'Out of stock'],
      ['SKU', product.id]
    ];
    if (product.specs) {
      Object.keys(product.specs).forEach((k) => rows.push([k, product.specs[k]]));
    }
    return rows;
  }

  /* Catalogue products express their purchasable options as `sizes`
     (storage / size) and `colors` (finish). Explicit `variants` or
     `swatches` win when a product overrides them. Returns the option list
     plus the label that describes what the options represent. */
  function variantOptions(product) {
    if (!product) return { options: [], label: 'Finish' };
    if (product.variants && product.variants.length) {
      return { options: product.variants.slice(), label: product.variantLabel || 'Options' };
    }
    if (product.swatches && product.swatches.length) {
      return { options: product.swatches.slice(), label: 'Finish' };
    }
    if (product.sizes && product.sizes.length) {
      return { options: product.sizes.slice(), label: 'Storage' };
    }
    if (product.colors && product.colors.length) {
      return { options: product.colors.slice(), label: 'Finish' };
    }
    return { options: [], label: 'Finish' };
  }

  function renderPdp() {
    const host = $('[data-pdp-root]');
    if (!host) return;

    const id = param('id', '');
    const product = catalog().find((p) => p.id === id);

    if (!product) {
      host.innerHTML = LUMEN.ui.emptyState({
        icon: 'search',
        title: 'We could not find that product.',
        message: 'It may have been removed from the catalogue. Browse the full collection instead.',
        actionLabel: 'Browse the shop',
        actionHref: 'shop.html'
      });
      return;
    }

    current.product = product;
    const { options, label: variantLabel } = variantOptions(product);
    current.variant = options[0] || '';
    current.variantLabel = variantLabel;
    current.image = 0;

    const gallery = D().galleryFor(product);
    const price = D().salePrice(product);
    const inStock = Number(product.stock) > 0;

    // Breadcrumb
    const crumbs = $('[data-pdp-crumbs]');
    if (crumbs) {
      crumbs.innerHTML = `
        <nav class="crumbs" aria-label="Breadcrumb">
          <a href="index.html">Home</a>${icon('chevronRight', 13)}
          <a href="shop.html">Shop</a>${icon('chevronRight', 13)}
          <a href="shop.html?category=${product.category}">${escapeHtml(D().categoryName(product.category))}</a>${icon('chevronRight', 13)}
          <span aria-current="page">${escapeHtml(product.name)}</span>
        </nav>`;
    }

    host.innerHTML = `
      <div class="pdp">
        <section class="pdp__gallery">
          <div class="pdp__thumbs" role="tablist" aria-label="Product images">
            ${gallery
              .map(
                (src, i) => `
              <button class="pdp__thumb${i === 0 ? ' is-active' : ''}" type="button" role="tab"
                      aria-selected="${i === 0}" data-thumb="${i}" aria-label="View image ${i + 1}">
                <img src="${src}" alt="" width="88" height="88" loading="lazy">
              </button>`
              )
              .join('')}
          </div>
          <div class="pdp__stage">
            <img src="${gallery[0]}" alt="${escapeHtml(product.name)}" data-pdp-image width="640" height="640">
            ${product.discount ? `<span class="badge badge--sale pdp__flag">${product.discount}% off</span>` : ''}
            ${product.isNew ? '<span class="badge badge--new pdp__flag pdp__flag--2">New</span>' : ''}
          </div>
        </section>

        <section class="pdp__info">
          <p class="product-card__cat">${escapeHtml(product.brand)}</p>
          <h1 class="pdp__title">${escapeHtml(product.name)}</h1>
          <div class="row gap-3 row--wrap">
            <div class="row gap-2">${LUMEN.ui.starsMarkup(product.rating)}<span class="muted">${num(product.reviews)} ratings</span></div>
            <span class="dot-sep"></span>
            <span class="${inStock ? 'text-success' : 'text-danger'}">${inStock ? `${num(product.stock)} in stock` : 'Sold out'}</span>
          </div>

          <div class="price price--lg mt-4">
            <span class="price__now">${money(price)}</span>
            ${product.discount ? `<span class="price__was">${money(product.price)}</span><span class="badge badge--sale">Save ${money(product.price - price)}</span>` : ''}
          </div>
          <p class="muted mt-2" style="font-size:var(--fs-xs)">Inclusive of all taxes${Number(product.stock) > 0 ? ' · Free delivery over ₹999' : ''}</p>

          <p class="pdp__tagline">${escapeHtml(product.tagline || product.description)}</p>

          ${
            options.length
              ? `<div class="pdp__variants">
                   <p class="field__label">${escapeHtml(variantLabel)}: <strong data-variant-label>${escapeHtml(current.variant)}</strong></p>
                   <div class="swatches">
                     ${options
                       .map(
                         (v, i) => `
                       <button class="swatch${i === 0 ? ' is-active' : ''}" type="button" data-variant="${escapeHtml(v)}"
                               aria-pressed="${i === 0}" title="${escapeHtml(v)}">
                         <span class="swatch__chip" style="background:${D().swatchColor(v)}"></span>
                         <span class="swatch__label">${escapeHtml(v)}</span>
                       </button>`
                       )
                       .join('')}
                   </div>
                 </div>`
              : ''
          }

          <div class="pdp__buy">
            <div class="qty qty--lg">
              <button class="qty__btn" type="button" data-pdp-dec aria-label="Decrease quantity">${icon('minus', 16)}</button>
              <span class="qty__val" data-pdp-qty>1</span>
              <button class="qty__btn" type="button" data-pdp-inc aria-label="Increase quantity">${icon('plus', 16)}</button>
            </div>
            <button class="btn btn--primary btn--lg" type="button" data-pdp-add ${inStock ? '' : 'disabled'}>
              ${icon('bag', 17)} ${inStock ? 'Add to bag' : 'Sold out'}
            </button>
            <button class="btn btn--outline btn--lg" type="button" data-pdp-buy ${inStock ? '' : 'disabled'}>Buy now</button>
            <button class="wish-btn wish-btn--lg" type="button" data-wish-id="${product.id}" data-wish-label="${escapeHtml(product.name)}" aria-pressed="false" aria-label="Add ${escapeHtml(product.name)} to wishlist">${icon('heart', 19)}</button>
          </div>

          <ul class="pdp__perks">
            <li>${icon('truck', 17)} <span><strong>Free delivery</strong> on orders above ₹999</span></li>
            <li>${icon('refresh', 17)} <span><strong>7-day returns</strong> with doorstep pickup</span></li>
            <li>${icon('shield', 17)} <span><strong>12-month warranty</strong> handled by support</span></li>
            <li>${icon('card', 17)} <span><strong>UPI, cards, net banking</strong> and cash on delivery</span></li>
          </ul>

          <div class="tabs mt-6">
            <div class="tabs__nav" role="tablist">
              <button class="tab is-active" type="button" role="tab" data-pdp-tab="description" aria-selected="true">Overview</button>
              <button class="tab" type="button" role="tab" data-pdp-tab="specs" aria-selected="false">Specifications</button>
              <button class="tab" type="button" role="tab" data-pdp-tab="shipping" aria-selected="false">Delivery &amp; returns</button>
              <button class="tab" type="button" role="tab" data-pdp-tab="reviews" aria-selected="false">Reviews (${num(product.reviews)})</button>
            </div>
            <div class="tabs__panel" data-pdp-panel="description">
              <p>${escapeHtml(product.description || product.tagline)}</p>
            </div>
            <div class="tabs__panel" data-pdp-panel="specs" hidden>
              <table class="spec-table">
                <tbody>${specRows(product).map((r) => `<tr><th>${escapeHtml(r[0])}</th><td>${escapeHtml(String(r[1]))}</td></tr>`).join('')}</tbody>
              </table>
            </div>
            <div class="tabs__panel" data-pdp-panel="shipping" hidden>
              <h4>Delivery</h4>
              <p>Standard delivery is 3–5 business days and free above ₹999. Express is ₹199 and priority same-day is ₹349 for orders placed before 2 pm. Orders are dispatched from our Bengaluru warehouse.</p>
              <h4 class="mt-4">Returns</h4>
              <p>Return anything within 7 days of delivery. Our courier collects from your address at no cost, and refunds are issued to the original payment method within 3–5 working days of the item reaching us. Products must be in original packaging with all accessories.</p>
              <h4 class="mt-4">Warranty</h4>
              <p>12 months of manufacturer cover, claimable through our support desk. Liquid damage and physical damage are not covered.</p>
            </div>
            <div class="tabs__panel" data-pdp-panel="reviews" hidden>
              <div class="reviews">
                <div class="reviews__summary">
                  <p class="reviews__score">${(product.rating || 0).toFixed(1)}</p>
                  ${LUMEN.ui.starsMarkup(product.rating)}
                  <p class="muted">Based on ${num(product.reviews)} verified purchases</p>
                  <div class="reviews__bars">
                    ${[5, 4, 3, 2, 1]
                      .map((star) => {
                        const pct = star === 5 ? 82 : star === 4 ? 13 : star === 3 ? 3 : star === 2 ? 1 : 1;
                        return `
                      <div class="reviews__bar">
                        <span>${star}★</span>
                        <span class="reviews__track"><span style="width:${pct}%"></span></span>
                        <span class="muted">${pct}%</span>
                      </div>`;
                      })
                      .join('')}
                  </div>
                </div>
                <div class="reviews__list" data-pdp-reviews></div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="section mt-8">
        <div class="section__head">
          <h2>You might also like</h2>
          <a class="link-arrow" href="shop.html?category=${product.category}">More ${escapeHtml(D().categoryName(product.category))} ${icon('arrowRight', 15)}</a>
        </div>
        <div class="product-grid" data-pdp-related></div>
      </section>`;

    renderRelated();
    renderReviews();
    bindPdp();
    LUMEN.reveal.init();
  }

  function renderRelated() {
    const host = $('[data-pdp-related]');
    if (!host || !current.product) return;
    const product = current.product;
    const related = catalog()
      .filter((p) => p.id !== product.id)
      .map((p) => {
        let score = 0;
        if (p.category === product.category) score += 3;
        if (p.brand === product.brand) score += 2;
        score += (p.rating || 0) / 5;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => entry.p);

    host.innerHTML = related.map((p) => card(p, { hideDesc: true })).join('');
    LUMEN.badges.syncWishStates();
  }

  function renderReviews() {
    const host = $('[data-pdp-reviews]');
    if (!host || !current.product) return;
    const product = current.product;

    const stored = getData('reviews', []).filter((r) => r.productId === product.id && r.status === 'approved');
    const seeded = [
      { author: 'Riya Sharma', rating: 5, title: 'Exactly as described', body: 'Build quality feels a tier above what I expected at this price. Two weeks in and no complaints at all.', date: new Date(Date.now() - 9 * 86400000).toISOString() },
      { author: 'Kabir Singh', rating: 4, title: 'Great, with one small note', body: 'Performance is excellent. The stock in the colour I wanted was limited, so I took a slightly different finish.', date: new Date(Date.now() - 21 * 86400000).toISOString() },
      { author: 'Ananya Rao', rating: 5, title: 'Would buy again', body: 'Delivery was next morning and the packaging was genuinely premium. Very happy with the whole experience.', date: new Date(Date.now() - 34 * 86400000).toISOString() }
    ];
    const list = stored.length ? stored : seeded;

    host.innerHTML = list
      .map(
        (r) => `
      <article class="review">
        <header class="review__head">
          <span class="avatar avatar--sm">${escapeHtml(initialsOf(r.author))}</span>
          <div>
            <p class="fw-6" style="font-size:var(--fs-sm)">${escapeHtml(r.author)}</p>
            <p class="muted" style="font-size:var(--fs-xs)">${formatDate(r.date)} · Verified purchase</p>
          </div>
          <div class="review__stars">${LUMEN.ui.starsMarkup(r.rating)}</div>
        </header>
        <h4>${escapeHtml(r.title)}</h4>
        <p class="muted">${escapeHtml(r.body)}</p>
      </article>`
      )
      .join('');

    const form = $('[data-review-form]');
    if (form) return;
  }

  function initialsOf(name) {
    const parts = String(name || '?').trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function bindPdp() {
    const host = $('[data-pdp-root]');
    if (!host) return;
    const product = current.product;
    const gallery = D().galleryFor(product);
    const maxQty = Number(product.stock) || 1;

    host.addEventListener('click', (event) => {
      const thumb = event.target.closest('[data-thumb]');
      if (thumb) {
        const i = Number(thumb.dataset.thumb);
        current.image = i;
        const stage = $('[data-pdp-image]');
        if (stage) stage.src = gallery[i];
        $$('[data-thumb]').forEach((b) => {
          b.classList.toggle('is-active', Number(b.dataset.thumb) === i);
          b.setAttribute('aria-selected', Number(b.dataset.thumb) === i ? 'true' : 'false');
        });
        return;
      }

      const variant = event.target.closest('[data-variant]');
      if (variant) {
        current.variant = variant.dataset.variant;
        $$('[data-variant]').forEach((b) => {
          const on = b.dataset.variant === current.variant;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        const label = $('[data-variant-label]');
        if (label) label.textContent = current.variant;
        return;
      }

      if (event.target.closest('[data-pdp-dec]')) {
        current.qty = clamp(current.qty - 1, 1, maxQty);
        const out = $('[data-pdp-qty]');
        if (out) out.textContent = current.qty;
        return;
      }

      if (event.target.closest('[data-pdp-inc]')) {
        if (current.qty >= maxQty) {
          LUMEN.toast('That is all we have in stock', 'warn', `Only ${maxQty} available`);
          return;
        }
        current.qty += 1;
        const out = $('[data-pdp-qty]');
        if (out) out.textContent = current.qty;
        return;
      }

      if (event.target.closest('[data-pdp-add]')) {
        LUMEN.cart.addToCart(product.id, current.qty, current.variant, { showDrawer: true });
        return;
      }

      if (event.target.closest('[data-pdp-buy]')) {
        LUMEN.cart.addToCart(product.id, current.qty, current.variant, { silent: true });
        global.location.href = 'checkout.html';
        return;
      }

      const tab = event.target.closest('[data-pdp-tab]');
      if (tab) {
        current.tab = tab.dataset.pdpTab;
        $$('[data-pdp-tab]').forEach((b) => {
          const on = b.dataset.pdpTab === current.tab;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        $$('[data-pdp-panel]').forEach((p) => { p.hidden = p.dataset.pdpPanel !== current.tab; });
        return;
      }

      const share = event.target.closest('[data-pdp-share]');
      if (share) {
        const url = global.location.href;
        if (navigator.share) {
          navigator.share({ title: product.name, url }).catch(() => {});
          return;
        }
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url);
          LUMEN.toast('Link copied', 'success', 'Share it with someone who needs it');
        }
      }
    });
  }

  /* Keep the wishlist button on the PDP in sync when toggled elsewhere. */
  LUMEN.refreshPdpWishlist = function refreshPdpWishlist() {
    if (document.body.dataset.page !== 'product') return;
    if (!current.product) return;
    LUMEN.badges.syncWishStates();
  };

  /* =====================================================================
     5. EXPORTS + BOOT
     ===================================================================== */

  LUMEN.storefront = { renderHome, renderShop, renderPdp, SORTS };

  LUMEN.onReady(() => {
    const page = document.body.dataset.page;
    if (page === 'home') {
      renderHome();
      initNewsletter();
    } else if (page === 'shop') {
      initShop();
    } else if (page === 'product') {
      renderPdp();
      initNewsletter();
    }
  });
})(window);
