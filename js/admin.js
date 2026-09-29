/* ==========================================================================
   LUMEN — Admin Dashboard
   js/admin.js
   --------------------------------------------------------------------------
   One module driving every page in /admin via <body data-admin-page="…">.
     · sidebar + topbar shell injection
     · admin route guard (redirects to admin/login.html)
     · dashboard: stat tiles, Canvas charts, recent orders, low stock
     · products / categories / orders / customers / reviews / coupons: full CRUD
     · analytics: revenue, category mix, top products, order status split
     · settings: store configuration, shipping, tax, coupons
   Charts are hand-rolled on <canvas> — no charting library is used.
   ========================================================================== */

(function (global) {
  'use strict';

  const LUMEN = global.LUMEN;
  const { getData, saveData } = LUMEN.store;
  const { escapeHtml, $, $$ } = LUMEN.dom;
  const { money, moneyCompact, num, formatDate, formatDateTime, timeAgo, initials, slugify, debounce, uid } = LUMEN.fmt;
  const icon = LUMEN.icon;
  const D = () => LUMEN.data;

  const ROOT = '../';

  /* =====================================================================
     1. DATA ACCESS
     ===================================================================== */

  function products() {
    const list = getData('products', null);
    return Array.isArray(list) && list.length ? list : D().SEED_PRODUCTS.slice();
  }

  function setProducts(next) {
    saveData('products', next);
  }

  function orders() {
    return LUMEN.orders.all();
  }

  function setOrders(next) {
    saveData('orders', next);
  }

  function customers() {
    const list = getData('customers', []);
    return Array.isArray(list) ? list : [];
  }

  function setCustomers(next) {
    saveData('customers', next);
  }

  function categories() {
    const stored = getData('categories', null);
    return Array.isArray(stored) && stored.length ? stored : D().CATEGORIES.slice();
  }

  function setCategories(next) {
    saveData('categories', next);
  }

  function coupons() {
    const list = getData('coupons', null);
    return Array.isArray(list) && list.length ? list : D().COUPON_SEED.slice();
  }

  function setCoupons(next) {
    saveData('coupons', next);
  }

  function reviews() {
    const list = getData('reviews', []);
    return Array.isArray(list) ? list : [];
  }

  function setReviews(next) {
    saveData('reviews', next);
  }

  function settings() {
    return Object.assign({}, D().SETTINGS_SEED, getData('settings', {}));
  }

  function setSettings(patch) {
    saveData('settings', Object.assign({}, settings(), patch));
  }

  function productById(id) {
    return products().find((p) => p.id === id) || null;
  }

  /* =====================================================================
     2. DERIVED METRICS
     ===================================================================== */

  function isRevenueOrder(order) {
    return order.status !== 'Cancelled' && order.status !== 'Returned';
  }

  function revenueIn(days) {
    const cutoff = Date.now() - days * 86400000;
    return orders()
      .filter((o) => isRevenueOrder(o) && new Date(o.date).getTime() >= cutoff)
      .reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  }

  function ordersIn(days) {
    const cutoff = Date.now() - days * 86400000;
    return orders().filter((o) => new Date(o.date).getTime() >= cutoff);
  }

  function delta(current, previous) {
    if (!previous) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  function kpis() {
    const rev30 = revenueIn(30);
    const rev60 = revenueIn(60) - rev30;
    const ord30 = ordersIn(30);
    const ord60 = ordersIn(60).length - ord30.length;
    const list = products();
    const aov = ord30.length ? rev30 / ord30.length : 0;
    const lowStock = list.filter((p) => Number(p.stock) <= 5).length;
    const activeCustomers = customers().filter((c) => c.status !== 'blocked').length;

    return {
      revenue: rev30,
      revenueDelta: delta(rev30, rev60),
      orders: ord30.length,
      ordersDelta: delta(ord30.length, ord60),
      aov,
      aovDelta: delta(aov, ord60.length ? rev60 / ord60.length : 0),
      customers: activeCustomers,
      products: list.length,
      lowStock,
      pending: orders().filter((o) => o.status === 'Processing' || o.status === 'Confirmed').length
    };
  }

  /** Revenue for the last `n` days, one bucket per day. */
  function revenueSeries(n) {
    const buckets = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i -= 1) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      buckets.push({ key: day.toISOString().slice(0, 10), label: day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: 0 });
    }
    const index = new Map(buckets.map((b, i) => [b.key, i]));
    orders().forEach((order) => {
      if (!isRevenueOrder(order)) return;
      const key = new Date(order.date).toISOString().slice(0, 10);
      if (index.has(key)) buckets[index.get(key)].value += Number(order.total) || 0;
    });
    return buckets;
  }

  function categoryMix() {
    const totals = new Map();
    orders()
      .filter(isRevenueOrder)
      .forEach((order) => {
        (order.items || []).forEach((line) => {
          const product = productById(line.id);
          const cat = product ? product.category : 'accessories';
          totals.set(cat, (totals.get(cat) || 0) + line.price * line.qty);
        });
      });
    const palette = ['#0071E3', '#34C759', '#FF9500', '#AF52DE', '#FF3B30', '#5856D6'];
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([slug, value], i) => ({
        label: D().categoryName(slug),
        slug,
        value,
        color: palette[i % palette.length]
      }));
  }

  function topProducts(n) {
    const totals = new Map();
    orders()
      .filter(isRevenueOrder)
      .forEach((order) => {
        (order.items || []).forEach((line) => {
          const entry = totals.get(line.id) || { id: line.id, name: line.name, image: line.image, units: 0, revenue: 0 };
          entry.units += Number(line.qty) || 0;
          entry.revenue += (Number(line.price) || 0) * (Number(line.qty) || 0);
          totals.set(line.id, entry);
        });
      });
    return Array.from(totals.values()).sort((a, b) => b.revenue - a.revenue).slice(0, n || 5);
  }

  function statusSplit() {
    const counts = new Map();
    orders().forEach((o) => counts.set(o.status, (counts.get(o.status) || 0) + 1));
    const palette = { Processing: '#0071E3', Confirmed: '#5856D6', Packed: '#FF9500', Shipped: '#34C759', 'Out for delivery': '#AF52DE', Delivered: '#1D1D1F', Cancelled: '#FF3B30', Returned: '#8E8E93' };
    return Array.from(counts.entries()).map(([label, value]) => ({ label, value, color: palette[label] || '#8E8E93' }));
  }

  /* =====================================================================
     3. CANVAS CHARTS
     ===================================================================== */

  const CHART_COLORS = {
    grid: 'rgba(110,110,115,0.18)',
    axis: '#8E8E93',
    line: '#0071E3',
    fillTop: 'rgba(0,113,227,0.28)',
    fillBottom: 'rgba(0,113,227,0.02)',
    bar: '#0071E3',
    barAlt: '#5AC8FA'
  };

  function chartTheme() {
    const dark = LUMEN.theme.get() === 'dark';
    return {
      dark,
      text: dark ? '#A1A1A6' : '#6E6E73',
      grid: dark ? 'rgba(174,174,178,0.16)' : 'rgba(0,0,0,0.08)',
      surface: dark ? '#1C1C1E' : '#FFFFFF'
    };
  }

  /** Size a canvas for the device pixel ratio and return its 2D context. */
  function prepareCanvas(canvas) {
    if (!canvas) return null;
    const dpr = global.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.clientWidth || 600;
    const height = rect.height || canvas.clientHeight || 260;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    return { ctx, width, height, theme: chartTheme() };
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /**
   * Smoothed area + line chart.
   * @param {HTMLCanvasElement} canvas
   * @param {{labels:string[], values:number[], format?:Function}} data
   */
  function drawLineChart(canvas, data) {
    const prep = prepareCanvas(canvas);
    if (!prep) return;
    const { ctx, width, height, theme } = prep;
    const values = data.values || [];
    const labels = data.labels || [];
    if (!values.length) return;

    const pad = { top: 18, right: 16, bottom: 26, left: 52 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const max = Math.max.apply(null, values.concat([1]));
    const niceMax = niceCeil(max);
    const x = (i) => pad.left + (values.length === 1 ? plotW / 2 : (plotW * i) / (values.length - 1));
    const y = (v) => pad.top + plotH - (plotH * v) / niceMax;

    // Grid + Y axis
    ctx.strokeStyle = theme.grid;
    ctx.fillStyle = theme.text;
    ctx.lineWidth = 1;
    ctx.font = '11px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i += 1) {
      const value = (niceMax / 4) * i;
      const yy = y(value);
      ctx.beginPath();
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(width - pad.right, yy);
      ctx.stroke();
      ctx.fillText(moneyCompact(value), pad.left - 8, yy);
    }

    // Area fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
    gradient.addColorStop(0, CHART_COLORS.fillTop);
    gradient.addColorStop(1, CHART_COLORS.fillBottom);
    ctx.beginPath();
    ctx.moveTo(x(0), y(values[0]));
    values.slice(1).forEach((v, i) => ctx.lineTo(x(i + 1), y(v)));
    ctx.lineTo(x(values.length - 1), height - pad.bottom);
    ctx.lineTo(x(0), height - pad.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(x(0), y(values[0]));
    values.slice(1).forEach((v, i) => ctx.lineTo(x(i + 1), y(v)));
    ctx.strokeStyle = CHART_COLORS.line;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Points
    ctx.fillStyle = CHART_COLORS.line;
    values.forEach((v, i) => {
      ctx.beginPath();
      ctx.arc(x(i), y(v), 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // X labels (max ~7 to stay readable)
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const stride = Math.max(1, Math.ceil(labels.length / 7));
    labels.forEach((label, i) => {
      if (i % stride) return;
      ctx.fillText(label, x(i), height - pad.bottom + 8);
    });
  }

  function niceCeil(value) {
    if (value <= 0) return 1;
    const exp = Math.floor(Math.log10(value));
    const base = Math.pow(10, exp);
    const n = value / base;
    const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return step * base;
  }

  /** Grouped-friendly vertical bar chart. */
  function drawBarChart(canvas, data) {
    const prep = prepareCanvas(canvas);
    if (!prep) return;
    const { ctx, width, height, theme } = prep;
    const values = data.values || [];
    const labels = data.labels || [];
    if (!values.length) return;

    const pad = { top: 18, right: 12, bottom: 30, left: 44 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const niceMax = niceCeil(Math.max.apply(null, values.concat([1])));
    const slot = plotW / values.length;
    const barW = Math.min(38, slot * 0.62);
    const y = (v) => pad.top + plotH - (plotH * v) / niceMax;

    ctx.strokeStyle = theme.grid;
    ctx.fillStyle = theme.text;
    ctx.lineWidth = 1;
    ctx.font = '11px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i += 1) {
      const value = (niceMax / 4) * i;
      const yy = y(value);
      ctx.beginPath();
      ctx.moveTo(pad.left, yy);
      ctx.lineTo(width - pad.right, yy);
      ctx.stroke();
      ctx.fillText(num(value), pad.left - 8, yy);
    }

    values.forEach((v, i) => {
      const h = Math.max(2, pad.top + plotH - y(v));
      const bx = pad.left + slot * i + (slot - barW) / 2;
      const by = pad.top + plotH - h;
      const grad = ctx.createLinearGradient(0, by, 0, by + h);
      grad.addColorStop(0, CHART_COLORS.barAlt);
      grad.addColorStop(1, CHART_COLORS.bar);
      ctx.fillStyle = grad;
      roundRectPath(ctx, bx, by, barW, h, 6);
      ctx.fill();
    });

    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const stride = Math.max(1, Math.ceil(labels.length / 8));
    labels.forEach((label, i) => {
      if (i % stride) return;
      ctx.fillText(label, pad.left + slot * i + slot / 2, height - pad.bottom + 9);
    });
  }

  /** Doughnut chart with an inline legend. */
  function drawDoughnut(canvas, data) {
    const prep = prepareCanvas(canvas);
    if (!prep) return;
    const { ctx, width, height, theme } = prep;
    const slices = (data.slices || []).filter((s) => s.value > 0);
    if (!slices.length) return;

    const total = slices.reduce((sum, s) => sum + s.value, 0);
    const cx = width / 2;
    const cy = height / 2;
    const outer = Math.min(width, height) / 2 - 14;
    const inner = outer * 0.62;

    let angle = -Math.PI / 2;
    slices.forEach((slice) => {
      const sweep = (slice.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, outer, angle, angle + sweep);
      ctx.arc(cx, cy, inner, angle + sweep, angle, true);
      ctx.closePath();
      ctx.fillStyle = slice.color;
      ctx.fill();
      ctx.strokeStyle = theme.surface;
      ctx.lineWidth = 2;
      ctx.stroke();
      angle += sweep;
    });

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.text;
    ctx.font = '600 15px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(moneyCompact(total), cx, cy - 6);
    ctx.font = '11px -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('total', cx, cy + 11);
  }

  function drawAllCharts(scope) {
    $$('[data-chart]', scope || document).forEach((canvas) => {
      const kind = canvas.dataset.chart;
      if (kind === 'revenue') {
        const days = Number(canvas.dataset.days) || 30;
        const series = revenueSeries(days);
        drawLineChart(canvas, { labels: series.map((s) => s.label), values: series.map((s) => s.value) });
      } else if (kind === 'orders') {
        const days = Number(canvas.dataset.days) || 14;
        const series = revenueSeries(days);
        const counts = series.map((s) => orders().filter((o) => new Date(o.date).toISOString().slice(0, 10) === s.key).length);
        drawBarChart(canvas, { labels: series.map((s) => s.label), values: counts });
      } else if (kind === 'category') {
        drawDoughnut(canvas, { slices: categoryMix() });
      } else if (kind === 'status') {
        drawDoughnut(canvas, { slices: statusSplit() });
      }
    });
  }

  /* =====================================================================
     4. SHELL
     ===================================================================== */

  const ADMIN_NAV = [
    { section: 'Overview' },
    { key: 'dashboard', label: 'Dashboard', href: 'index.html', ico: 'chart' },
    { key: 'analytics', label: 'Analytics', href: 'analytics.html', ico: 'layers' },
    { section: 'Catalogue' },
    { key: 'products', label: 'Products', href: 'products.html', ico: 'package' },
    { key: 'categories', label: 'Categories', href: 'categories.html', ico: 'grid' },
    { key: 'reviews', label: 'Reviews', href: 'reviews.html', ico: 'star' },
    { key: 'coupons', label: 'Coupons', href: 'coupons.html', ico: 'tag' },
    { section: 'People & orders' },
    { key: 'orders', label: 'Orders', href: 'orders.html', ico: 'truck' },
    { key: 'customers', label: 'Customers', href: 'customers.html', ico: 'users' },
    { section: 'Configuration' },
    { key: 'settings', label: 'Settings', href: 'settings.html', ico: 'settings' }
  ];

  function buildShell(page) {
    const user = LUMEN.auth.currentUser();

    const nav = ADMIN_NAV.map((item) => {
      if (item.section) return `<li class="side__section">${escapeHtml(item.section)}</li>`;
      const active = item.key === page ? ' is-active' : '';
      return `<li><a class="side__link${active}" href="${item.href}">${icon(item.ico, 18)}<span>${escapeHtml(item.label)}</span></a></li>`;
    }).join('');

    return `
      <aside class="side" id="adminSide" aria-label="Admin navigation">
        <div class="side__brand">
          <img src="${ROOT}assets/icons/logo.svg" alt="" width="24" height="24">
          <div>
            <strong>Lumen</strong>
            <small>Admin console</small>
          </div>
        </div>
        <nav class="side__nav"><ul>${nav}</ul></nav>
        <div class="side__foot">
          <a class="btn btn--dark btn--block btn--sm" href="${ROOT}index.html">${icon('home', 15)} View storefront</a>
          <button class="btn btn--outline btn--block btn--sm mt-2" type="button" data-admin-signout>${icon('logout', 15)} Sign out</button>
        </div>
      </aside>

      <div class="side-backdrop" data-admin-side-backdrop></div>

      <header class="topbar">
        <button class="icon-btn topbar__burger" type="button" data-admin-menu aria-label="Toggle menu" aria-expanded="false">${icon('menu', 20)}</button>
        <div class="topbar__titles">
          <h1 class="topbar__title" data-admin-page-title>Dashboard</h1>
          <p class="topbar__crumb">Lumen / Admin</p>
        </div>
        <div class="topbar__actions">
          <button class="icon-btn" type="button" data-admin-theme aria-label="Toggle colour theme">${icon('sun', 19, 'icon--sun')}${icon('moon', 19, 'icon--moon')}</button>
          <a class="icon-btn" href="${ROOT}shop.html" aria-label="Open shop">${icon('search', 19)}</a>
          <span class="topbar__divider"></span>
          <div class="topbar__user" data-admin-user>
            <span class="avatar avatar--sm">${escapeHtml(initials(user ? user.name : 'A'))}</span>
            <div>
              <strong>${escapeHtml(user ? user.name : 'Admin')}</strong>
              <small>${escapeHtml(user ? user.email : '')}</small>
            </div>
            <span class="badge badge--warning topbar__role">Admin</span>
          </div>
        </div>
      </header>`;
  }

  function buildShellPageTitles() {
    return {
      dashboard: 'Dashboard',
      analytics: 'Analytics',
      products: 'Products',
      categories: 'Categories',
      reviews: 'Reviews',
      coupons: 'Coupons',
      orders: 'Orders',
      customers: 'Customers',
      settings: 'Settings'
    };
  }

  function mountShell(page) {
    const host = $('[data-admin-shell]');
    if (host) {
      host.innerHTML = buildShell(page);
    }

    const burger = $('[data-admin-menu]');
    const side = $('#adminSide');
    if (burger && side) {
      burger.addEventListener('click', () => {
        const open = side.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    }
    const backdrop = $('[data-admin-side-backdrop]');
    if (backdrop) {
      backdrop.addEventListener('click', () => {
        side.classList.remove('is-open');
        burger && burger.setAttribute('aria-expanded', 'false');
      });
    }

    const themeBtn = $('[data-admin-theme]');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const next = LUMEN.theme.toggle();
        themeBtn.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        drawAllCharts();
      });
    }

    const signout = $('[data-admin-signout]');
    if (signout) {
      signout.addEventListener('click', () => {
        LUMEN.auth.signOut();
        global.location.href = 'login.html';
      });
    }

    const title = $('[data-admin-page-title]');
    const titles = buildShellPageTitles();
    if (title && titles[page]) title.textContent = titles[page];

    // Redraw charts once fonts/layout settle, and on resize.
    global.requestAnimationFrame(() => drawAllCharts());
    let resizeTimer;
    global.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => drawAllCharts(), 140);
    });
  }

  /* =====================================================================
     5. SHARED ADMIN UI
     ===================================================================== */

  function statTile(opts) {
    const dir = opts.delta === undefined ? '' : opts.delta >= 0 ? 'up' : 'down';
    const arrow = dir === 'up' ? '↑' : dir === 'down' ? '↓' : '';
    return `
      <article class="stat-tile">
        <div class="stat-tile__head">
          <span class="stat-tile__label">${escapeHtml(opts.label)}</span>
          <span class="stat-tile__icon">${icon(opts.ico || 'chart', 18)}</span>
        </div>
        <p class="stat-tile__value">${opts.value}</p>
        <p class="stat-tile__foot">
          ${
            dir
              ? `<span class="delta delta--${dir}">${arrow} ${Math.abs(opts.delta).toFixed(1)}%</span><span class="muted">vs previous period</span>`
              : `<span class="muted">${escapeHtml(opts.hint || '')}</span>`
          }
        </p>
      </article>`;
  }

  function stockPill(stock) {
    const n = Number(stock) || 0;
    if (n <= 0) return '<span class="status-pill status-pill--danger"><span class="status-pill__dot"></span>Out of stock</span>';
    if (n <= 5) return `<span class="status-pill status-pill--warn"><span class="status-pill__dot"></span>Low · ${n}</span>`;
    return `<span class="status-pill status-pill--success"><span class="status-pill__dot"></span>In stock</span>`;
  }

  function orderStatusPill(status) {
    return LUMEN.orders.statusPill(status);
  }

  function emptyRow(colspan, message) {
    return `<tr class="table-empty"><td colspan="${colspan}">${escapeHtml(message)}</td></tr>`;
  }

  /** Generic client-side table filter across a few columns. */
  function attachTableFilter(inputSel, tableSel, columns) {
    const input = $(inputSel);
    const table = $(tableSel);
    if (!input || !table) return;
    input.addEventListener(
      'input',
      debounce(() => {
        const q = input.value.trim().toLowerCase();
        let visible = 0;
        $$('tbody tr', table).forEach((row) => {
          if (row.classList.contains('table-empty')) return;
          const haystack = columns.map((c) => (row.children[c] ? row.children[c].textContent : '')).join(' ').toLowerCase();
          const match = !q || haystack.indexOf(q) > -1;
          row.hidden = !match;
          if (match) visible += 1;
        });
        const label = $('[data-admin-filter-count]');
        if (label) label.textContent = `${num(visible)} shown`;
      }, 160)
    );
  }

  function attachSelectFilter(selectSel, tableSel) {
    const select = $(selectSel);
    const table = $(tableSel);
    if (!select || !table) return;
    select.addEventListener('change', () => {
      const value = select.value;
      let visible = 0;
      $$('tbody tr', table).forEach((row) => {
        if (row.classList.contains('table-empty')) return;
        const match = value === 'all' || row.dataset.filter === value;
        row.hidden = !match;
        if (match) visible += 1;
      });
      const label = $('[data-admin-filter-count]');
      if (label) label.textContent = `${num(visible)} shown`;
    });
  }

  /* =====================================================================
     6. DASHBOARD
     ===================================================================== */

  function renderDashboard() {
    const k = kpis();
    const host = $('[data-admin-stats]');
    if (host) {
      host.innerHTML = [
        statTile({ label: 'Revenue · 30 days', value: money(k.revenue), delta: k.revenueDelta, ico: 'chart' }),
        statTile({ label: 'Orders · 30 days', value: num(k.orders), delta: k.ordersDelta, ico: 'package' }),
        statTile({ label: 'Average order value', value: money(k.aov), delta: k.aovDelta, ico: 'card' }),
        statTile({ label: 'Active customers', value: num(k.customers), hint: `${num(customers().length)} total records`, ico: 'users' })
      ].join('');
    }

    const ops = $('[data-admin-ops]');
    if (ops) {
      ops.innerHTML = [
        statTile({ label: 'Live products', value: num(k.products), hint: `${num(k.lowStock)} low on stock`, ico: 'grid' }),
        statTile({ label: 'Orders to fulfil', value: num(k.pending), hint: 'Processing or confirmed', ico: 'truck' }),
        statTile({ label: 'Low stock alerts', value: num(k.lowStock), hint: '5 units or fewer', ico: 'alert' }),
        statTile({ label: 'Coupons live', value: num(coupons().filter((c) => c.status === 'active').length), hint: `${num(coupons().length)} total`, ico: 'tag' })
      ].join('');
    }

    const mixHost = $('[data-admin-legend]');
    if (mixHost) {
      const mix = categoryMix();
      mixHost.innerHTML = mix.length
        ? mix
            .map(
              (m) => `
        <li><span class="legend__dot" style="background:${m.color}"></span>
          <span class="legend__label">${escapeHtml(m.label)}</span>
          <span class="legend__value">${moneyCompact(m.value)}</span>
          <span class="legend__pct">${((m.value / mix.reduce((s, x) => s + x.value, 0)) * 100).toFixed(0)}%</span>
        </li>`
            )
            .join('')
        : '<li class="muted">No sales recorded yet.</li>';
    }

    const recent = $('[data-admin-recent]');
    if (recent) {
      const list = orders().slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
      recent.innerHTML = list.length
        ? list
            .map(
              (o) => `
          <tr>
            <td><a class="fw-6" href="orders.html">${escapeHtml(o.id)}</a></td>
            <td>${escapeHtml(o.userName || o.userEmail)}</td>
            <td>${num((o.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0))}</td>
            <td>${orderStatusPill(o.status)}</td>
            <td class="ta-r fw-6">${money(o.total)}</td>
            <td class="muted">${formatDate(o.date)}</td>
          </tr>`
            )
            .join('')
        : emptyRow(6, 'No orders yet.');
    }

    const low = $('[data-admin-lowstock]');
    if (low) {
      const list = products().filter((p) => Number(p.stock) <= 5).slice(0, 6);
      low.innerHTML = list.length
        ? list
            .map(
              (p) => `
          <tr>
            <td>
              <div class="cell-product">
                <img src="${D().imageUrl(p.image)}" alt="" width="36" height="36" loading="lazy">
                <div><p class="fw-6" style="font-size:var(--fs-sm)">${escapeHtml(p.name)}</p><p class="muted" style="font-size:var(--fs-xs)">${escapeHtml(p.id)}</p></div>
              </div>
            </td>
            <td>${escapeHtml(D().categoryName(p.category))}</td>
            <td>${stockPill(p.stock)}</td>
            <td class="ta-r fw-6">${money(D().salePrice(p))}</td>
          </tr>`
            )
            .join('')
        : emptyRow(4, 'Everything is comfortably in stock.');
    }
  }

  /* =====================================================================
     7. PRODUCTS CRUD
     ===================================================================== */

  const ALL_IMAGE_FILES = [
    'smartphone-titanium.svg', 'smartphone-silver.svg', 'smartphone-midnight.svg', 'smartphone-graphite.svg',
    'laptop-silver.svg', 'laptop-graphite.svg', 'laptop-champagne.svg', 'laptop-blue.svg',
    'headphone-champagne.svg', 'headphone-graphite.svg',
    'earbuds-white.svg', 'earbuds-sand.svg', 'earbuds-coral.svg',
    'watch-black.svg', 'watch-titanium.svg', 'watch-graphite.svg',
    'band-pink.svg', 'camera-black.svg', 'camera-silver.svg', 'camera-charcoal.svg', 'camera-blue.svg',
    'powerbank.svg', 'charger.svg', 'keyboard.svg', 'speaker.svg',
    'hero.svg', 'detail-macro.svg', 'detail-inuse.svg', 'detail-angles.svg', 'detail-packaging.svg'
  ];

  function productFormMarkup(p) {
    const item = p || {};
    const list = products();
    return `
      <form id="adminProductForm" novalidate>
        <div class="grid grid--2">
          <div class="field field--span">
            <label class="field__label" for="apName">Product name</label>
            <input class="input" type="text" id="apName" name="name" value="${escapeHtml(item.name || '')}" required>
            <p class="field__error" data-error="name" role="alert"></p>
          </div>

          <div class="field field--span">
            <label class="field__label" for="apTagline">Tagline</label>
            <input class="input" type="text" id="apTagline" name="tagline" value="${escapeHtml(item.tagline || '')}" placeholder="One line that sells it">
          </div>

          <div class="field">
            <label class="field__label" for="apBrand">Brand</label>
            <input class="input" type="text" id="apBrand" name="brand" list="brandList" value="${escapeHtml(item.brand || '')}" required>
            <datalist id="brandList">${D().ALL_BRANDS.map((b) => `<option value="${escapeHtml(b)}">`).join('')}</datalist>
            <p class="field__error" data-error="brand" role="alert"></p>
          </div>

          <div class="field">
            <label class="field__label" for="apCategory">Category</label>
            <select class="select" id="apCategory" name="category">
              ${categories().map((c) => `<option value="${c.slug}" ${item.category === c.slug ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>

          <div class="field">
            <label class="field__label" for="apPrice">Price (₹)</label>
            <input class="input" type="number" id="apPrice" name="price" min="1" step="1" value="${item.price || ''}" required>
            <p class="field__error" data-error="price" role="alert"></p>
          </div>

          <div class="field">
            <label class="field__label" for="apDiscount">Discount %</label>
            <input class="input" type="number" id="apDiscount" name="discount" min="0" max="90" step="1" value="${item.discount || 0}">
            <p class="field__hint" data-price-preview></p>
          </div>

          <div class="field">
            <label class="field__label" for="apStock">Stock on hand</label>
            <input class="input" type="number" id="apStock" name="stock" min="0" step="1" value="${item.stock === undefined ? 20 : item.stock}" required>
            <p class="field__error" data-error="stock" role="alert"></p>
          </div>

          <div class="field">
            <label class="field__label" for="apRating">Rating (0–5)</label>
            <input class="input" type="number" id="apRating" name="rating" min="0" max="5" step="0.1" value="${item.rating || 4.5}">
          </div>

          <div class="field field--span">
            <label class="field__label" for="apImage">Image</label>
            <div class="media-picker">
              <img src="${D().imageUrl(item.image || ALL_IMAGE_FILES[0])}" alt="" data-image-preview width="120" height="120">
              <div>
                <select class="select" id="apImage" name="image" data-image-select>
                  ${ALL_IMAGE_FILES.map((f) => `<option value="${f}" ${item.image === f ? 'selected' : ''}>${f}</option>`).join('')}
                </select>
                <p class="field__hint">Pick one of the bundled SVG renders. The same file works in both themes.</p>
              </div>
            </div>
          </div>

          <div class="field field--span">
            <label class="field__label" for="apDescription">Description</label>
            <textarea class="input" id="apDescription" name="description" rows="4">${escapeHtml(item.description || '')}</textarea>
          </div>
        </div>

        <div class="row row--wrap gap-4 mt-4">
          <label class="check"><input type="checkbox" name="isNew" ${item.isNew ? 'checked' : ''}><span>Mark as new arrival</span></label>
          <label class="check"><input type="checkbox" name="isFeatured" ${item.featured ? 'checked' : ''}><span>Feature on the homepage</span></label>
          <label class="check"><input type="checkbox" name="isBestseller" ${item.badge === 'bestseller' ? 'checked' : ''}><span>Show bestseller badge</span></label>
        </div>

        <p class="field__error mt-3" data-error="form" role="alert"></p>
      </form>`;
  }

  function readProductForm(scope) {
    const get = (name) => {
      const node = scope.querySelector(`[name="${name}"]`);
      return node ? node.value : '';
    };
    const check = (name) => Boolean(scope.querySelector(`[name="${name}"]`) && scope.querySelector(`[name="${name}"]`).checked);

    return {
      name: get('name').trim(),
      tagline: get('tagline').trim(),
      brand: get('brand').trim(),
      category: get('category'),
      price: Number(get('price')) || 0,
      discount: Number(get('discount')) || 0,
      stock: Number(get('stock')) || 0,
      rating: Number(get('rating')) || 0,
      image: get('image'),
      description: get('description').trim(),
      isNew: check('isNew'),
      featured: check('isFeatured'),
      isBestseller: check('isBestseller')
    };
  }

  function openProductModal(id) {
    const existing = id ? productById(id) : null;
    let draft = existing ? Object.assign({}, existing) : { category: categories()[0] ? categories()[0].slug : 'smartphones' };

    LUMEN.modal.open({
      title: existing ? `Edit ${existing.name}` : 'Add a product',
      subtitle: existing ? existing.id : 'It goes live in the storefront immediately.',
      size: 'lg',
      body: productFormMarkup(draft),
      footer: `
        <button class="btn btn--secondary" type="button" data-close-modal>Cancel</button>
        <button class="btn btn--primary" type="button" data-save-product>${existing ? 'Save changes' : 'Create product'}</button>`,
      onMount(el, api) {
        const form = el.querySelector('#adminProductForm');
        const preview = form.querySelector('[data-price-preview]');
        const previewImg = form.querySelector('[data-image-preview]');
        const select = form.querySelector('[data-image-select]');

        const refreshPrice = () => {
          const price = Number(form.querySelector('#apPrice').value) || 0;
          const discount = Number(form.querySelector('#apDiscount').value) || 0;
          const final = Math.round((price * (100 - discount)) / 100);
          preview.textContent = discount > 0 ? `Sells at ${money(final)} — you keep ${money(price - final)} off` : `Sells at ${money(price)}`;
        };
        refreshPrice();
        form.querySelector('#apPrice').addEventListener('input', refreshPrice);
        form.querySelector('#apDiscount').addEventListener('input', refreshPrice);

        select.addEventListener('change', () => {
          previewImg.src = D().imageUrl(select.value);
        });

        el.querySelector('[data-save-product]').addEventListener('click', () => {
          const data = readProductForm(form);
          const errors = {};
          if (data.name.length < 3) errors.name = 'Enter a product name.';
          if (!data.brand) errors.brand = 'Brand is required.';
          if (!data.price || data.price <= 0) errors.price = 'Enter a price above zero.';
          if (data.stock < 0) errors.stock = 'Stock cannot be negative.';
          if (data.discount < 0 || data.discount > 90) errors.form = 'Discount must be between 0 and 90%.';

          form.querySelectorAll('.field__error').forEach((n) => { n.textContent = ''; });
          form.querySelectorAll('.is-invalid').forEach((n) => n.classList.remove('is-invalid'));

          if (Object.keys(errors).length) {
            Object.keys(errors).forEach((field) => {
              const err = form.querySelector(`[data-error="${field}"]`);
              if (err) err.textContent = errors[field];
            });
            LUMEN.toast('Could not save the product', 'error', 'Check the highlighted fields');
            return;
          }

          const list = products();
          if (existing) {
            const idx = list.findIndex((p) => p.id === existing.id);
            list[idx] = Object.assign({}, list[idx], data, {
              badge: data.isBestseller ? 'bestseller' : list[idx].badge
            });
            setProducts(list);
            LUMEN.toast('Product updated', 'success', data.name);
          } else {
            const record = Object.assign({}, data, {
              id: uid('LUM'),
              reviews: 0,
              badge: data.isBestseller ? 'bestseller' : null,
              createdAt: new Date().toISOString()
            });
            setProducts(list.concat([record]));
            LUMEN.toast('Product created', 'success', `${record.name} · ${record.id}`);
          }
          api.close();
          renderProducts();
        });
      }
    });
  }

  function renderProducts() {
    const tbody = $('[data-admin-products-tbody]');
    if (!tbody) return;
    const list = products().slice().sort((a, b) => String(a.name).localeCompare(String(b.name)));

    const label = $('[data-admin-filter-count]');
    if (label) label.textContent = `${num(list.length)} products`;

    tbody.innerHTML = list.length
      ? list
          .map(
            (p) => `
        <tr data-filter="${escapeHtml(p.category)}">
          <td>
            <div class="cell-product">
              <img src="${D().imageUrl(p.image)}" alt="" width="40" height="40" loading="lazy">
              <div>
                <p class="fw-6" style="font-size:var(--fs-sm)">${escapeHtml(p.name)}</p>
                <p class="muted" style="font-size:var(--fs-xs)">${escapeHtml(p.id)}</p>
              </div>
            </div>
          </td>
          <td>${escapeHtml(p.brand)}</td>
          <td>${escapeHtml(D().categoryName(p.category))}</td>
          <td class="ta-r">${money(D().salePrice(p))}${p.discount ? `<br><span class="muted" style="font-size:var(--fs-xs)">${money(p.price)} · ${p.discount}% off</span>` : ''}</td>
          <td>${stockPill(p.stock)}</td>
          <td>${p.rating}★<span class="muted" style="font-size:var(--fs-xs)"> (${p.reviews || 0})</span></td>
          <td class="ta-r">
            <button class="icon-btn" type="button" data-edit-product="${p.id}" aria-label="Edit ${escapeHtml(p.name)}">${icon('edit', 16)}</button>
            <button class="icon-btn" type="button" data-delete-product="${p.id}" aria-label="Delete ${escapeHtml(p.name)}">${icon('trash', 16)}</button>
          </td>
        </tr>`
          )
          .join('')
      : emptyRow(7, 'No products match your filters.');

    attachTableFilter('[data-admin-product-search]', '#adminProductsTable', [0, 1, 2]);
    attachSelectFilter('[data-admin-product-category]', '#adminProductsTable');
  }

  function deleteProduct(id) {
    const product = productById(id);
    if (!product) return;
    setProducts(products().filter((p) => p.id !== id));
    LUMEN.toast('Product deleted', 'info', product.name);
    renderProducts();
    const stats = $('[data-admin-stats]');
    if (stats && document.body.dataset.adminPage === 'dashboard') renderDashboard();
  }

  /* =====================================================================
     8. CATEGORIES CRUD
     ===================================================================== */

  function openCategoryModal(id) {
    const existing = id ? categories().find((c) => c.slug === id) : null;
    const draft = existing ? Object.assign({}, existing) : { name: '', blurb: '', image: ALL_IMAGE_FILES[0] };

    LUMEN.modal.open({
      title: existing ? `Edit ${existing.name}` : 'Add a category',
      size: 'md',
      body: `
        <form id="adminCategoryForm" novalidate>
          <div class="field">
            <label class="field__label" for="acName">Name</label>
            <input class="input" type="text" id="acName" name="name" value="${escapeHtml(draft.name)}" required>
            <p class="field__error" data-error="name" role="alert"></p>
          </div>
          <div class="field mt-4">
            <label class="field__label" for="acSlug">Slug</label>
            <input class="input" type="text" id="acSlug" name="slug" value="${escapeHtml(draft.slug || '')}" ${existing ? 'readonly' : ''} placeholder="auto-generated">
            <p class="field__hint">Used in URLs: shop.html?category=…</p>
          </div>
          <div class="field mt-4">
            <label class="field__label" for="acBlurb">Blurb</label>
            <textarea class="input" id="acBlurb" name="blurb" rows="3">${escapeHtml(draft.blurb || '')}</textarea>
          </div>
          <div class="field mt-4">
            <label class="field__label" for="acImage">Cover image</label>
            <select class="select" id="acImage" name="image">
              ${ALL_IMAGE_FILES.map((f) => `<option value="${f}" ${draft.image === f ? 'selected' : ''}>${f}</option>`).join('')}
            </select>
          </div>
        </form>`,
      footer: `
        <button class="btn btn--secondary" type="button" data-close-modal>Cancel</button>
        <button class="btn btn--primary" type="button" data-save-category>Save category</button>`,
      onMount(el, api) {
        const form = el.querySelector('#adminCategoryForm');
        const nameInput = form.querySelector('#acName');
        const slugInput = form.querySelector('#acSlug');
        if (!existing) {
          nameInput.addEventListener('input', () => {
            slugInput.value = slugify(nameInput.value);
          });
        }

        el.querySelector('[data-save-category]').addEventListener('click', () => {
          const name = nameInput.value.trim();
          const slug = (slugInput.value.trim() || slugify(name)).toLowerCase();
          const blurb = form.querySelector('#acBlurb').value.trim();
          const image = form.querySelector('#acImage').value;
          const err = form.querySelector('[data-error="name"]');

          if (name.length < 2) {
            err.textContent = 'Enter a category name.';
            return;
          }
          if (!existing && categories().some((c) => c.slug === slug)) {
            err.textContent = 'That slug is already in use.';
            return;
          }

          const list = categories();
          if (existing) {
            const idx = list.findIndex((c) => c.slug === existing.slug);
            list[idx] = Object.assign({}, list[idx], { name, blurb, image });
            LUMEN.toast('Category updated', 'success', name);
          } else {
            list.push({ slug, name, blurb, image });
            LUMEN.toast('Category created', 'success', name);
          }
          setCategories(list);
          api.close();
          renderCategories();
        });
      }
    });
  }

  function renderCategories() {
    const tbody = $('[data-admin-categories-tbody]');
    if (!tbody) return;
    const list = categories();
    const counts = new Map();
    products().forEach((p) => counts.set(p.category, (counts.get(p.category) || 0) + 1));

    const label = $('[data-admin-filter-count]');
    if (label) label.textContent = `${num(list.length)} categories`;

    tbody.innerHTML = list.length
      ? list
          .map(
            (c) => `
        <tr data-filter="${escapeHtml(c.slug)}">
          <td>
            <div class="cell-product">
              <img src="${D().imageUrl(c.image)}" alt="" width="40" height="40" loading="lazy">
              <div>
                <p class="fw-6" style="font-size:var(--fs-sm)">${escapeHtml(c.name)}</p>
                <p class="muted" style="font-size:var(--fs-xs)">${escapeHtml(c.slug)}</p>
              </div>
            </div>
          </td>
          <td class="muted">${escapeHtml(c.blurb || '—')}</td>
          <td class="ta-r fw-6">${num(counts.get(c.slug) || 0)}</td>
          <td class="ta-r">
            <button class="icon-btn" type="button" data-edit-category="${escapeHtml(c.slug)}" aria-label="Edit ${escapeHtml(c.name)}">${icon('edit', 16)}</button>
            <button class="icon-btn" type="button" data-delete-category="${escapeHtml(c.slug)}" aria-label="Delete ${escapeHtml(c.name)}">${icon('trash', 16)}</button>
          </td>
        </tr>`
          )
          .join('')
      : emptyRow(4, 'No categories yet.');
  }

  function deleteCategory(slug) {
    const inUse = products().filter((p) => p.category === slug);
    if (inUse.length) {
      LUMEN.toast('Cannot delete this category', 'error', `${inUse.length} product${inUse.length === 1 ? '' : 's'} still use it. Reassign them first.`);
      return;
    }
    setCategories(categories().filter((c) => c.slug !== slug));
    LUMEN.toast('Category deleted', 'info');
    renderCategories();
  }

  /* =====================================================================
     9. ORDS
     ===================================================================== */

  function renderAdminOrders() {
    const tbody = $('[data-admin-orders-tbody]');
    if (!tbody) return;
    const list = orders().slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    const label = $('[data-admin-filter-count]');
    if (label) label.textContent = `${num(list.length)} orders`;

    tbody.innerHTML = list.length
      ? list
          .map(
            (o) => `
        <tr data-filter="${escapeHtml(o.status)}">
          <td><a class="fw-6" href="#" data-view-order="${escapeHtml(o.id)}">${escapeHtml(o.id)}</a><br><span class="muted" style="font-size:var(--fs-xs)">${formatDateTime(o.date)}</span></td>
          <td>${escapeHtml(o.userName || 'Guest')}<br><span class="muted" style="font-size:var(--fs-xs)">${escapeHtml(o.userEmail || '')}</span></td>
          <td>${num((o.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0))}</td>
          <td>${escapeHtml(o.payment.method)}<br><span class="muted" style="font-size:var(--fs-xs)">${escapeHtml(o.payment.status)}</span></td>
          <td class="ta-r fw-6">${money(o.total)}</td>
          <td>
            <select class="select select--sm" data-order-status="${escapeHtml(o.id)}" aria-label="Status for ${escapeHtml(o.id)}">
              ${LUMEN.orders.STATUS_FLOW.concat(['Cancelled', 'Returned'])
                .map((s) => `<option ${o.status === s ? 'selected' : ''}>${s}</option>`)
                .join('')}
            </select>
          </td>
          <td class="ta-r">
            <button class="icon-btn" type="button" data-view-order="${escapeHtml(o.id)}" aria-label="View ${escapeHtml(o.id)}">${icon('eye', 16)}</button>
            <button class="icon-btn" type="button" data-invoice-order="${escapeHtml(o.id)}" aria-label="Invoice for ${escapeHtml(o.id)}">${icon('download', 16)}</button>
          </td>
        </tr>`
          )
          .join('')
      : emptyRow(7, 'No orders yet.');

    attachTableFilter('[data-admin-order-search]', '#adminOrdersTable', [0, 1, 5]);
    attachSelectFilter('[data-admin-order-status]', '#adminOrdersTable');
  }

  function openAdminOrderModal(id) {
    const order = orders().find((o) => o.id === id);
    if (!order) {
      LUMEN.toast('Order not found', 'error');
      return;
    }
    LUMEN.modal.open({
      title: `Order ${order.id}`,
      subtitle: `${formatDateTime(order.date)} · ${escapeHtml(order.userName || 'Guest')}`,
      size: 'lg',
      body: `
        <div class="row row--between row--wrap gap-3 mb-4">${orderStatusPill(order.status)}
          <span class="muted" style="font-size:var(--fs-sm)">${escapeHtml(order.payment.method)} · ${escapeHtml(order.payment.status)} · Ref ${escapeHtml(order.payment.ref || '—')}</span>
        </div>
        ${LUMEN.orders.timeline(order)}        <h3 class="mt-6 mb-3">Items</h3>
        <ul class="checkout-items">
          ${(order.items || [])
            .map(
              (line) => `
            <li>
              <img src="${D().imageUrl(line.image)}" alt="" width="46" height="46" loading="lazy">
              <div>
                <p class="checkout-items__name">${escapeHtml(line.name)}</p>
                <p class="checkout-items__meta">${line.variant ? escapeHtml(line.variant) + ' · ' : ''}Qty ${line.qty}</p>
              </div>
              <span>${money(line.price * line.qty)}</span>
            </li>`
            )
            .join('')}
        </ul>
        <div class="grid grid--2 mt-6">
          <div>
            <h3 class="mb-3">Ship to</h3>
            <p class="muted">${escapeHtml(order.address.name)}<br>${escapeHtml(order.address.line1)}${order.address.line2 ? '<br>' + escapeHtml(order.address.line2) : ''}<br>${escapeHtml(order.address.city)}, ${escapeHtml(order.address.state)} ${escapeHtml(order.address.postal)}<br>${escapeHtml(order.address.phone || '')}</p>
          </div>
          <div>
            <h3 class="mb-3">Totals</h3>
            <div class="totals">
              <div class="totals__row"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div>
              ${order.discount ? `<div class="totals__row totals__row--discount"><span>Discount</span><strong>− ${money(order.discount)}</strong></div>` : ''}
              <div class="totals__row"><span>Shipping</span><strong>${order.shipping === 0 ? 'Free' : money(order.shipping)}</strong></div>
              <div class="totals__row"><span>GST (included)</span><strong>${money(order.tax || 0)}</strong></div>
              <div class="totals__row totals__row--grand"><span>Total</span><strong>${money(order.total)}</strong></div>
            </div>
          </div>
        </div>`,
      footer: `<button class="btn btn--secondary" type="button" data-close-modal>Close</button>`
    });
  }

  /* =====================================================================
     10. CUSTOMERS
     ===================================================================== */

  function renderCustomers() {
    const tbody = $('[data-admin-customers-tbody]');
    if (!tbody) return;
    const list = customers().slice().sort((a, b) => new Date(b.joined) - new Date(a.joined));
    const label = $('[data-admin-filter-count]');
    if (label) label.textContent = `${num(list.length)} customers`;

    tbody.innerHTML = list.length
      ? list
          .map(
            (c) => `
        <tr data-filter="${escapeHtml(c.status || 'active')}">
          <td>
            <div class="cell-user">
              <span class="avatar avatar--sm">${escapeHtml(initials(c.name))}</span>
              <div>
                <p class="fw-6" style="font-size:var(--fs-sm)">${escapeHtml(c.name)}</p>
                <p class="muted" style="font-size:var(--fs-xs)">${escapeHtml(c.email)}</p>
              </div>
            </div>
          </td>
          <td>${escapeHtml(c.city || '—')}</td>
          <td class="ta-r">${num(c.orders || 0)}</td>
          <td class="ta-r fw-6">${money(c.spent || 0)}</td>
          <td>${c.status === 'blocked' ? '<span class="status-pill status-pill--danger"><span class="status-pill__dot"></span>Blocked</span>' : '<span class="status-pill status-pill--success"><span class="status-pill__dot"></span>Active</span>'}</td>
          <td class="ta-r">
            <button class="icon-btn" type="button" data-toggle-block="${escapeHtml(c.id)}" aria-label="${c.status === 'blocked' ? 'Unblock' : 'Block'} ${escapeHtml(c.name)}">
              ${icon(c.status === 'blocked' ? 'check' : 'close', 16)}
            </button>
            <button class="icon-btn" type="button" data-reset-password="${escapeHtml(c.id)}" aria-label="Reset password for ${escapeHtml(c.name)}">${icon('refresh', 16)}</button>
          </td>
        </tr>`
          )
          .join('')
      : emptyRow(6, 'No customers found.');

    attachTableFilter('[data-admin-customer-search]', '#adminCustomersTable', [0, 1]);
    attachSelectFilter('[data-admin-customer-status]', '#adminCustomersTable');
  }

  function toggleBlock(id) {
    const list = customers();
    const idx = list.findIndex((c) => c.id === id);
    if (idx === -1) return;
    list[idx].status = list[idx].status === 'blocked' ? 'active' : 'blocked';
    setCustomers(list);

    // Keep the login account in step so a blocked user cannot sign in.
    const authList = LUMEN.auth.users();
    const ai = authList.findIndex((u) => u.id === id);
    if (ai > -1) {
      authList[ai].status = list[idx].status;
      saveData('users', authList);
    }

    LUMEN.toast(list[idx].status === 'blocked' ? 'Customer blocked' : 'Customer unblocked', 'info', list[idx].name);
    renderCustomers();
  }

  /* =====================================================================
     11. REVIEWS
     ===================================================================== */

  function renderReviews() {
    const tbody = $('[data-admin-reviews-tbody]');
    if (!tbody) return;
    const list = reviews();
    const label = $('[data-admin-filter-count]');
    if (label) label.textContent = `${num(list.length)} reviews`;

    tbody.innerHTML = list.length
      ? list
          .map(
            (r) => `
        <tr data-filter="${r.status}">
          <td>
            <p class="fw-6" style="font-size:var(--fs-sm)">${escapeHtml(r.productName || r.productId)}</p>
            <p class="muted" style="font-size:var(--fs-xs)">${escapeHtml(r.author)} · ${formatDate(r.date)}</p>
          </td>
          <td>${r.rating}★</td>
          <td>${escapeHtml(r.title || '')}<br><span class="muted" style="font-size:var(--fs-xs)">${escapeHtml(r.body || '')}</span></td>
          <td>${r.status === 'approved' ? '<span class="status-pill status-pill--success"><span class="status-pill__dot"></span>Approved</span>' : '<span class="status-pill status-pill--warn"><span class="status-pill__dot"></span>Pending</span>'}</td>
          <td class="ta-r">
            ${r.status === 'pending' ? `<button class="btn btn--outline btn--sm" type="button" data-approve-review="${escapeHtml(r.id)}">Approve</button>` : ''}
            <button class="icon-btn" type="button" data-delete-review="${escapeHtml(r.id)}" aria-label="Delete review">${icon('trash', 16)}</button>
          </td>
        </tr>`
          )
          .join('')
      : emptyRow(5, 'No reviews submitted yet.');
  }

  /* =====================================================================
     12. COUPONS
     ===================================================================== */

  function couponFormMarkup(c) {
    const item = c || {};
    return `
      <form id="adminCouponForm" novalidate>
        <div class="grid grid--2">
          <div class="field">
            <label class="field__label" for="acCode">Code</label>
            <input class="input" type="text" id="acCode" name="code" value="${escapeHtml(item.code || '')}" placeholder="SUMMER25" style="text-transform:uppercase">
            <p class="field__error" data-error="code" role="alert"></p>
          </div>
          <div class="field">
            <label class="field__label" for="acType">Type</label>
            <select class="select" id="acType" name="type">
              <option value="percent" ${item.type === 'percent' ? 'selected' : ''}>Percentage off</option>
              <option value="flat" ${item.type === 'flat' ? 'selected' : ''}>Flat amount off</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="acValue">Value</label>
            <input class="input" type="number" id="acValue" name="value" min="1" value="${item.value || 10}">
            <p class="field__hint" data-value-hint></p>
          </div>
          <div class="field">
            <label class="field__label" for="acMax">Maximum discount (₹)</label>
            <input class="input" type="number" id="acMax" name="maxDiscount" min="0" value="${item.maxDiscount || 0}">
          </div>
          <div class="field">
            <label class="field__label" for="acMin">Minimum order (₹)</label>
            <input class="input" type="number" id="acMin" name="minOrder" min="0" value="${item.minOrder || 0}">
          </div>
          <div class="field">
            <label class="field__label" for="acExpiry">Expires</label>
            <input class="input" type="date" id="acExpiry" name="expiry" value="${escapeHtml(item.expiry || '')}">
          </div>
        </div>
        <label class="check mt-4"><input type="checkbox" name="status" ${item.status !== 'inactive' ? 'checked' : ''}><span>Coupon is active</span></label>
      </form>`;
  }

  function openCouponModal(id) {
    const existing = id ? coupons().find((c) => c.id === id) : null;
    const draft = existing ? Object.assign({}, existing) : { type: 'percent', value: 10, minOrder: 999, maxDiscount: 500, status: 'active' };

    LUMEN.modal.open({
      title: existing ? `Edit ${existing.code}` : 'Create a coupon',
      size: 'md',
      body: couponFormMarkup(draft),
      footer: `
        <button class="btn btn--secondary" type="button" data-close-modal>Cancel</button>
        <button class="btn btn--primary" type="button" data-save-coupon>Save coupon</button>`,
      onMount(el, api) {
        const form = el.querySelector('#adminCouponForm');
        const typeSel = form.querySelector('#acType');
        const valueInput = form.querySelector('#acValue');
        const hint = form.querySelector('[data-value-hint]');

        const refreshHint = () => {
          hint.textContent = typeSel.value === 'percent' ? 'Percentage off, e.g. 20 for 20%' : 'Flat rupees off';
          valueInput.max = typeSel.value === 'percent' ? 90 : 100000;
        };
        refreshHint();
        typeSel.addEventListener('change', refreshHint);

        el.querySelector('[data-save-coupon]').addEventListener('click', () => {
          const code = form.querySelector('#acCode').value.trim().toUpperCase();
          const value = Number(valueInput.value) || 0;
          const type = typeSel.value;
          const err = form.querySelector('[data-error="code"]');

          if (!/^[A-Z0-9]{4,16}$/.test(code)) {
            err.textContent = 'Use 4–16 letters or digits.';
            return;
          }
          if (!existing && coupons().some((c) => c.code.toUpperCase() === code)) {
            err.textContent = 'That code already exists.';
            return;
          }
          if (type === 'percent' && (value < 1 || value > 90)) {
            err.textContent = 'Percentage must be between 1 and 90.';
            return;
          }

          const record = {
            id: existing ? existing.id : uid('CPN'),
            code,
            type,
            value,
            minOrder: Number(form.querySelector('#acMin').value) || 0,
            maxDiscount: Number(form.querySelector('#acMax').value) || 0,
            expiry: form.querySelector('#acExpiry').value || null,
            status: form.querySelector('[name="status"]').checked ? 'active' : 'inactive',
            usageCount: existing ? existing.usageCount || 0 : 0
          };

          const list = coupons();
          if (existing) {
            const idx = list.findIndex((c) => c.id === existing.id);
            list[idx] = record;
            LUMEN.toast('Coupon updated', 'success', record.code);
          } else {
            list.push(record);
            LUMEN.toast('Coupon created', 'success', record.code);
          }
          setCoupons(list);
          api.close();
          renderCoupons();
        });
      }
    });
  }

  function renderCoupons() {
    const tbody = $('[data-admin-coupons-tbody]');
    if (!tbody) return;
    const list = coupons();
    const label = $('[data-admin-filter-count]');
    if (label) label.textContent = `${num(list.length)} coupons`;

    tbody.innerHTML = list.length
      ? list
          .map(
            (c) => {
              const expired = c.expiry && new Date(c.expiry) < new Date();
              const live = c.status === 'active' && !expired;
              return `
        <tr data-filter="${live ? 'active' : 'inactive'}">
          <td><span class="code-pill">${escapeHtml(c.code)}</span></td>
          <td>${c.type === 'percent' ? `${c.value}% off` : `${money(c.value)} off`}${c.maxDiscount ? `<br><span class="muted" style="font-size:var(--fs-xs)">capped at ${money(c.maxDiscount)}</span>` : ''}</td>
          <td class="ta-r">${c.minOrder ? money(c.minOrder) : '—'}</td>
          <td class="ta-r">${num(c.usageCount || 0)}</td>
          <td>${c.expiry ? formatDate(c.expiry) : '—'}${expired ? '<br><span class="status-pill status-pill--danger"><span class="status-pill__dot"></span>Expired</span>' : ''}</td>
          <td>${live ? '<span class="status-pill status-pill--success"><span class="status-pill__dot"></span>Active</span>' : '<span class="status-pill status-pill--muted"><span class="status-pill__dot"></span>Inactive</span>'}</td>
          <td class="ta-r">
            <button class="icon-btn" type="button" data-edit-coupon="${escapeHtml(c.id)}" aria-label="Edit ${escapeHtml(c.code)}">${icon('edit', 16)}</button>
            <button class="icon-btn" type="button" data-delete-coupon="${escapeHtml(c.id)}" aria-label="Delete ${escapeHtml(c.code)}">${icon('trash', 16)}</button>
          </td>
        </tr>`;
            }
          )
          .join('')
      : emptyRow(7, 'No coupons yet.');

    attachTableFilter('[data-admin-coupon-search]', '#adminCouponsTable', [0, 1]);
    attachSelectFilter('[data-admin-coupon-status]', '#adminCouponsTable');
  }

  /* =====================================================================
     13. ANALYTICS
     ===================================================================== */

  function renderAnalytics() {
    const range = $('[data-analytics-range]');
    const days = range ? Number(range.value) : 30;
    const series = revenueSeries(days);

    const tiles = $('[data-analytics-stats]');
    if (tiles) {
      const rev = series.reduce((s, b) => s + b.value, 0);
      const ordCount = ordersIn(days).length;
      const best = series.slice().sort((a, b) => b.value - a.value)[0];
      tiles.innerHTML = [
        statTile({ label: `Revenue · ${days} days`, value: money(rev), ico: 'chart' }),
        statTile({ label: 'Orders', value: num(ordCount), hint: `${(ordCount / days).toFixed(1)} per day`, ico: 'package' }),
        statTile({ label: 'Best day', value: best ? money(best.value) : '—', hint: best ? best.label : '', ico: 'sparkle' }),
        statTile({ label: 'Average order', value: money(ordCount ? rev / ordCount : 0), ico: 'card' })
      ].join('');
    }

    const legend = $('[data-analytics-legend]');
    if (legend) {
      const mix = categoryMix();
      legend.innerHTML = mix
        .map(
          (m) => `
        <li><span class="legend__dot" style="background:${m.color}"></span>
          <span class="legend__label">${escapeHtml(m.label)}</span>
          <span class="legend__value">${moneyCompact(m.value)}</span></li>`
        )
        .join('');
    }

    const top = $('[data-analytics-top]');
    if (top) {
      const list = topProducts(6);
      top.innerHTML = list.length
        ? list
            .map(
              (p, i) => `
        <tr>
          <td class="ta-r muted">${i + 1}</td>
          <td>
            <div class="cell-product">
              <img src="${D().imageUrl(p.image)}" alt="" width="34" height="34" loading="lazy">
              <p class="fw-6" style="font-size:var(--fs-sm)">${escapeHtml(p.name)}</p>
            </div>
          </td>
          <td class="ta-r">${num(p.units)}</td>
          <td class="ta-r fw-6">${money(p.revenue)}</td>
        </tr>`
            )
            .join('')
        : emptyRow(4, 'No sales in this period.');
    }

    // Point the canvases at the selected range, then redraw.
    $$('[data-chart="revenue"]').forEach((c) => { c.dataset.days = days; });
    $$('[data-chart="orders"]').forEach((c) => { c.dataset.days = days; });
    drawAllCharts();
  }

  /* =====================================================================
     14. SETTINGS
     ===================================================================== */

  function renderSettings() {
    const s = settings();
    const form = $('#settingsForm');
    if (!form) return;

    const set = (name, value) => {
      const node = form.querySelector(`[name="${name}"]`);
      if (!node) return;
      if (node.type === 'checkbox') node.checked = Boolean(value);
      else node.value = value;
    };

    ['storeName', 'tagline', 'supportEmail', 'supportPhone', 'address', 'gstin', 'freeShippingOver', 'shippingFlat', 'taxRate', 'lowStockAlert', 'orderEmails', 'maintenanceMode', 'allowSignup'].forEach((k) => set(k, s[k]));

    const preview = $('[data-settings-preview]');
    const updatePreview = () => {
      if (!preview) return;
      const over = Number(form.querySelector('[name="freeShippingOver"]').value) || 0;
      const flat = Number(form.querySelector('[name="shippingFlat"]').value) || 0;
      const tax = Number(form.querySelector('[name="taxRate"]').value) || 0;
      preview.innerHTML = `
        <p class="muted mb-3" style="font-size:var(--fs-sm)">A shopper sees this on the cart and checkout pages:</p>
        <div class="totals">
          <div class="totals__row"><span>Example 1,200 order</span><strong>${money(1200 >= over ? 0 : flat)} shipping</strong></div>
          <div class="totals__row"><span>GST shown as included</span><strong>${tax}%</strong></div>
          <div class="totals__row totals__row--grand"><span>Free shipping over</span><strong>${money(over)}</strong></div>
        </div>`;
    };
    updatePreview();
    form.addEventListener('input', updatePreview);
  }

  function saveSettings(form) {
    const patch = {};
    ['storeName', 'tagline', 'supportEmail', 'supportPhone', 'address', 'gstin', 'freeShippingOver', 'shippingFlat', 'taxRate', 'lowStockAlert', 'orderEmails', 'maintenanceMode', 'allowSignup'].forEach((k) => {
      const node = form.querySelector(`[name="${k}"]`);
      if (!node) return;
      patch[k] = node.type === 'checkbox' ? node.checked : node.type === 'number' ? Number(node.value) || 0 : node.value.trim();
    });

    const emailError = $('[data-error="supportEmail"]');
    if (emailError) emailError.textContent = '';
    if (patch.supportEmail && !LUMEN.auth.EMAIL_RE.test(patch.supportEmail)) {
      if (emailError) emailError.textContent = 'Enter a valid support email address.';
      return;
    }

    setSettings(patch);
    LUMEN.toast('Settings saved', 'success', 'The storefront picks these up immediately');
  }

  /* =====================================================================
     15. EVENTS
     ===================================================================== */

  function initAdminEvents(page) {
    const body = document.body;

    // Product row actions
    body.addEventListener('click', (event) => {
      const add = event.target.closest('[data-admin-add-product]');
      if (add) { openProductModal(); return; }

      const edit = event.target.closest('[data-edit-product]');
      if (edit) { openProductModal(edit.dataset.editProduct); return; }

      const del = event.target.closest('[data-delete-product]');
      if (del) {
        const product = productById(del.dataset.deleteProduct);
        LUMEN.modal.confirm({
          title: `Delete ${product ? product.name : 'this product'}?`,
          message: 'It disappears from the storefront immediately. Past orders keep their record of it.',
          confirmLabel: 'Delete product',
          danger: true
        }).then((ok) => {
          if (ok) deleteProduct(del.dataset.deleteProduct);
        });
        return;
      }

      const addCat = event.target.closest('[data-admin-add-category]');
      if (addCat) { openCategoryModal(); return; }

      const editCat = event.target.closest('[data-edit-category]');
      if (editCat) { openCategoryModal(editCat.dataset.editCategory); return; }

      const delCat = event.target.closest('[data-delete-category]');
      if (delCat) {
        const slug = delCat.dataset.deleteCategory;
        const name = (categories().find((c) => c.slug === slug) || {}).name || slug;
        LUMEN.modal.confirm({
          title: `Delete ${name}?`,
          message: 'Only categories with no products can be removed.',
          confirmLabel: 'Delete category',
          danger: true
        }).then((ok) => {
          if (ok) deleteCategory(slug);
        });
        return;
      }

      const viewOrder = event.target.closest('[data-view-order]');
      if (viewOrder) {
        event.preventDefault();
        openAdminOrderModal(viewOrder.dataset.viewOrder);
        return;
      }

      const invoice = event.target.closest('[data-invoice-order]');
      if (invoice) {
        LUMEN.orders.downloadInvoice(orders().find((o) => o.id === invoice.dataset.invoiceOrder));
        return;
      }

      const block = event.target.closest('[data-toggle-block]');
      if (block) { toggleBlock(block.dataset.toggleBlock); return; }

      const resetPw = event.target.closest('[data-reset-password]');
      if (resetPw) {
        LUMEN.toast('Password reset link sent', 'success', 'In this demo nothing is actually emailed');
        return;
      }

      const approve = event.target.closest('[data-approve-review]');
      if (approve) {
        const list = reviews();
        const idx = list.findIndex((r) => r.id === approve.dataset.approveReview);
        if (idx > -1) {
          list[idx].status = 'approved';
          setReviews(list);
          LUMEN.toast('Review approved', 'success');
          renderReviews();
        }
        return;
      }

      const delReview = event.target.closest('[data-delete-review]');
      if (delReview) {
        setReviews(reviews().filter((r) => r.id !== delReview.dataset.deleteReview));
        LUMEN.toast('Review deleted', 'info');
        renderReviews();
        return;
      }

      const addCoupon = event.target.closest('[data-admin-add-coupon]');
      if (addCoupon) { openCouponModal(); return; }

      const editCoupon = event.target.closest('[data-edit-coupon]');
      if (editCoupon) { openCouponModal(editCoupon.dataset.editCoupon); return; }

      const delCoupon = event.target.closest('[data-delete-coupon]');
      if (delCoupon) {
        LUMEN.modal.confirm({
          title: 'Delete this coupon?',
          message: 'Customers who try to apply it will be told the code is invalid.',
          confirmLabel: 'Delete coupon',
          danger: true
        }).then((ok) => {
          if (!ok) return;
          setCoupons(coupons().filter((c) => c.id !== delCoupon.dataset.deleteCoupon));
          LUMEN.toast('Coupon deleted', 'info');
          renderCoupons();
        });
      }
    });

    // Order status selects
    body.addEventListener('change', (event) => {
      const statusSelect = event.target.closest('[data-order-status]');
      if (statusSelect) {
        const id = statusSelect.dataset.orderStatus;
        const next = statusSelect.value;
        LUMEN.orders.setStatus(id, next);
        LUMEN.toast('Order updated', 'success', `${id} → ${next}`);
        drawAllCharts();
        return;
      }

      const range = event.target.closest('[data-analytics-range]');
      if (range) renderAnalytics();

      const saveBtn = event.target.closest('[data-save-settings]');
      if (saveBtn) saveSettings($('#settingsForm'));

      const resetBtn = event.target.closest('[data-reset-settings]');
      if (resetBtn) {
        saveData('settings', D().SETTINGS_SEED);
        renderSettings();
        LUMEN.toast('Settings reset', 'info', 'Back to the seeded defaults');
      }
    });

    const saveBtn = $('[data-save-settings]');
    if (saveBtn) saveBtn.addEventListener('click', () => saveSettings($('#settingsForm')));

    // A <select> reports a new value on change, not reliably on click.
    const rangeSelect = $('[data-analytics-range]');
    if (rangeSelect) rangeSelect.addEventListener('change', renderAnalytics);

    const resetBtn = $('[data-reset-settings]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        saveData('settings', D().SETTINGS_SEED);
        renderSettings();
        LUMEN.toast('Settings reset', 'info', 'Back to the seeded defaults');
      });
    }
  }

  /* =====================================================================
     16. ROUTER
     ===================================================================== */

  const RENDERERS = {
    dashboard: renderDashboard,
    analytics: renderAnalytics,
    products: renderProducts,
    categories: renderCategories,
    orders: renderAdminOrders,
    customers: renderCustomers,
    reviews: renderReviews,
    coupons: renderCoupons,
    settings: renderSettings
  };

  /* =====================================================================
     17. BOOT
     ===================================================================== */

  LUMEN.admin = {
    products,
    orders,
    customers,
    categories,
    coupons,
    reviews,
    settings,
    setProducts,
    setOrders,
    setCustomers,
    setCategories,
    setCoupons,
    setReviews,
    setSettings,
    kpis,
    revenueSeries,
    categoryMix,
    topProducts,
    statusSplit,
    charts: { drawAll: drawAllCharts, line: drawLineChart, bar: drawBarChart, doughnut: drawDoughnut },
    ALL_IMAGE_FILES
  };

  LUMEN.onReady(() => {
    const page = document.body.dataset.adminPage;
    if (!page) return;

    if (!LUMEN.auth.requireAdmin()) return;

    mountShell(page);
    initAdminEvents(page);

    const renderer = RENDERERS[page];
    if (renderer) renderer();
  });
})(window);
