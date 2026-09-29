/* ==========================================================================
   LUMEN — Core Application
   js/app.js
   --------------------------------------------------------------------------
   Responsibilities:
     · localStorage helpers (saveData / getData / removeData)
     · money, date and string formatting
     · inline icon set
     · DOM helpers and event delegation
     · theme (light / dark) with persistence
     · toast notifications
     · modal system (focus trap, ESC, backdrop click)
     · drawer system
     · header + footer injection and behaviour
     · search overlay with live suggestions
     · scroll-reveal via IntersectionObserver
     · first-run seeding of demo data
   Every other module registers itself on window.LUMEN.
   ========================================================================== */

(function (global) {
  'use strict';

  const LUMEN = (global.LUMEN = global.LUMEN || {});

  /* =====================================================================
     1. STORAGE
     ===================================================================== */

  const NS = 'lumen:';
  const memoryFallback = new Map();

  function safeParse(raw, fallback) {
    if (raw === null || raw === undefined) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return parsed === null || parsed === undefined ? fallback : parsed;
    } catch (err) {
      return fallback;
    }
  }

  /**
   * Persist a value as JSON under a namespaced key.
   * Falls back to an in-memory map if localStorage is unavailable
   * (private browsing, disabled storage) so the UI keeps working.
   */
  function saveData(key, value) {
    const raw = JSON.stringify(value);
    try {
      localStorage.setItem(NS + key, raw);
    } catch (err) {
      memoryFallback.set(key, raw);
    }
    return value;
  }

  /** Read and parse a namespaced key, returning `fallback` when absent. */
  function getData(key, fallback) {
    const def = fallback === undefined ? null : fallback;
    let raw;
    try {
      raw = localStorage.getItem(NS + key);
    } catch (err) {
      raw = memoryFallback.get(key);
    }
    if (raw === null || raw === undefined) {
      raw = memoryFallback.get(key);
    }
    return safeParse(raw, def);
  }

  /** Delete a namespaced key. */
  function removeData(key) {
    try {
      localStorage.removeItem(NS + key);
    } catch (err) {
      /* ignore */
    }
    memoryFallback.delete(key);
  }

  /** Namespaced sessionStorage helper (used for the auth session). */
  const session = {
    save(key, value) {
      try {
        sessionStorage.setItem(NS + key, JSON.stringify(value));
      } catch (err) {
        /* ignore */
      }
    },
    get(key, fallback) {
      try {
        return safeParse(sessionStorage.getItem(NS + key), fallback === undefined ? null : fallback);
      } catch (err) {
        return fallback === undefined ? null : fallback;
      }
    },
    remove(key) {
      try {
        sessionStorage.removeItem(NS + key);
      } catch (err) {
        /* ignore */
      }
    }
  };

  LUMEN.store = { saveData, getData, removeData, session, NS };

  /* =====================================================================
     2. FORMATTING
     ===================================================================== */

  const inr = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  });

  const inrCompact = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: 'compact',
    maximumFractionDigits: 1
  });

  const plain = new Intl.NumberFormat('en-IN');

  /** ₹ formatted with no decimals, e.g. ₹79,999 */
  function money(value) {
    const num = Number(value) || 0;
    return inr.format(Math.round(num));
  }

  /** Compact currency for dashboard tiles, e.g. ₹1.2L */
  function moneyCompact(value) {
    const num = Number(value) || 0;
    if (num >= 10000000) return '₹' + (num / 10000000).toFixed(2) + ' Cr';
    if (num >= 100000) return '₹' + (num / 100000).toFixed(2) + ' L';
    if (num >= 1000) return '₹' + (num / 1000).toFixed(1) + 'K';
    return inr.format(Math.round(num));
  }

  /** Plain grouped number, e.g. 12,480 */
  function num(value) {
    return plain.format(Math.round(Number(value) || 0));
  }

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  /** 24 Sep 2026 */
  function formatDate(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '—';
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  /** 24 Sep, 4:12 pm */
  function formatDateTime(value) {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '—';
    let hours = d.getHours();
    const suffix = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hours}:${String(d.getMinutes()).padStart(2, '0')} ${suffix}`;
  }

  /** "3 days ago" */
  function timeAgo(value) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    const diff = Date.now() - d.getTime();
    const mins = Math.round(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} day${days > 1 ? 's' : ''} ago`;
    return formatDate(d);
  }

  function slugify(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function titleCase(value) {
    return String(value || '')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function initials(name) {
    const parts = String(name || '?')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function uid(prefix) {
    return `${prefix || 'id'}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }

  /** Clamp a number into a range. */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  /** Debounce a function by `wait` milliseconds. */
  function debounce(fn, wait) {
    let timer;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait || 180);
    };
  }

  LUMEN.fmt = { money, moneyCompact, num, formatDate, formatDateTime, timeAgo, slugify, titleCase, initials, uid, clamp, debounce };

  /* =====================================================================
     3. ICONS
     Inline 24×24 stroke icons — avoids an icon-font dependency and keeps
     every glyph themeable through `currentColor`.
     ===================================================================== */

  const PATHS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    heart: '<path d="M12 20.5s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 8.2a4.4 4.4 0 0 1 7.5 2.7c0 5-7.5 9.6-7.5 9.6Z"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
    bag: '<path d="M5.5 8h13l-1 11.5a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5.5 8Z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    chevronRight: '<path d="m9 5 7 7-7 7"/>',
    chevronLeft: '<path d="m15 5-7 7 7 7"/>',
    chevronDown: '<path d="m5 9 7 7 7-7"/>',
    chevronUp: '<path d="m5 15 7-7 7 7"/>',
    arrowRight: '<path d="M4 12h15"/><path d="m13 6 6 6-6 6"/>',
    arrowLeft: '<path d="M20 12H5"/><path d="m11 6-6 6 6 6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M6.5 7 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7"/><path d="M10.5 11v5M13.5 11v5"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    star: '<path d="m12 3.6 2.6 5.4 5.9.85-4.3 4.1 1.05 5.9L12 17.05 6.75 19.85 7.8 13.95 3.5 9.85l5.9-.85L12 3.6Z"/>',
    alert: '<path d="M12 8.5v5"/><path d="M12 16.8h.01"/><circle cx="12" cy="12" r="8.5"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><path d="M12 7.8h.01"/>',
    truck: '<path d="M2.5 7.5h10.2v9H2.5z"/><path d="M12.7 10.5h4l3.3 3.2v2.8h-7.3z"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="16.5" cy="18" r="1.8"/>',
    shield: '<path d="M12 3.5 19 6v5.4c0 4-2.8 7.5-7 9.1-4.2-1.6-7-5.1-7-9.1V6l7-2.5Z"/><path d="m9 12 2 2 4-4"/>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>',
    card: '<rect x="2.8" y="5.5" width="18.4" height="13" rx="2.4"/><path d="M2.8 10h18.4"/><path d="M6.5 14.5h3.5"/>',
    package: '<path d="M12 3.5 20 8v8l-8 4.5L4 16V8l8-4.5Z"/><path d="m4 8 8 4.5L20 8"/><path d="M12 12.5V21"/>',
    filter: '<path d="M4 6.5h16"/><path d="M7 12h10"/><path d="M10 17.5h4"/>',
    grid: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>',
    list: '<path d="M8 6.5h12M8 12h12M8 17.5h12"/><path d="M4 6.5h.01M4 12h.01M4 17.5h.01"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"/>',
    moon: '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z"/>',
    home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z"/><path d="M9.5 20.5v-6h5v6"/>',
    share: '<circle cx="17.5" cy="6" r="2.6"/><circle cx="6.5" cy="12" r="2.6"/><circle cx="17.5" cy="18" r="2.6"/><path d="m8.9 10.7 6.3-3.4M8.9 13.3l6.3 3.4"/>',
    edit: '<path d="M4.5 19.5h4L19 9a2.1 2.1 0 0 0-3-3L5.5 16.5l-1 3Z"/><path d="M14.5 7 17 9.5"/>',
    copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9"/>',
    sparkle: '<path d="m12 3.5 1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5Z"/><path d="m18.5 16 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
    headset: '<path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2"/><rect x="2.8" y="13.5" width="4" height="6" rx="1.6"/><rect x="17.2" y="13.5" width="4" height="6" rx="1.6"/><path d="M19.5 19.5v.5a2 2 0 0 1-2 2H13"/>',
    pin: '<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    mail: '<rect x="2.8" y="5" width="18.4" height="14" rx="2.2"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2Z"/>',
    lock: '<rect x="4.8" y="10" width="14.4" height="10" rx="2.2"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M4 4l16 16"/><path d="M9.5 9.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2"/><path d="M6.3 6.7C3.9 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/><path d="M17.8 15.3C20.1 13.8 21.5 12 21.5 12S18 5.5 12 5.5c-.7 0-1.4.1-2 .3"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>',
    settings: '<circle cx="12" cy="12" r="2.8"/><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a1.9 1.9 0 1 1-3.8 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a1.9 1.9 0 1 1 0-3.8h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 1.8.3h.1a1.6 1.6 0 0 0 1-1.5v-.3a1.9 1.9 0 1 1 3.8 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0-.3 1.8v.1a1.6 1.6 0 0 0 1.5 1h.3a1.9 1.9 0 1 1 0 3.8h-.2a1.6 1.6 0 0 0-1.5 1Z"/>',
    bell: '<path d="M18 8.8a6 6 0 1 0-12 0c0 6-2 7.2-2 7.2h16s-2-1.2-2-7.2Z"/><path d="M13.7 20a2 2 0 0 1-3.4 0"/>',
    users: '<circle cx="9" cy="8" r="3.4"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6"/><path d="M17.5 14.2A6.5 6.5 0 0 1 21.5 20"/>',
    tag: '<path d="M20 13 13 20l-9-9V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1.4"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16.5v-4M12.5 16.5V8M17 16.5v-6.5"/>',
    layers: '<path d="m12 3.5 8.5 4.3L12 12 3.5 7.8 12 3.5Z"/><path d="m3.5 12.2 8.5 4.3 8.5-4.3"/><path d="m3.5 16.4 8.5 4.3 8.5-4.3"/>',
    logout: '<path d="M14.5 7.5V5.5a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 4.5 5.5v13A1.5 1.5 0 0 0 6 20h7a1.5 1.5 0 0 0 1.5-1.5v-2"/><path d="M10 12h10"/><path d="m17 8.5 3.5 3.5L17 15.5"/>',
    zap: '<path d="M13.5 3 5.5 13.5H11l-.5 7.5 8-10.5H13l.5-7.5Z"/>',
    gift: '<rect x="3.5" y="8.5" width="17" height="4" rx="1.2"/><path d="M5 12.5v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-6.5"/><path d="M12 8.5v12"/><path d="M12 8.5H8.2a2.2 2.2 0 1 1 2.2-2.2c0 1.4 1.6 2.2 1.6 2.2Z"/><path d="M12 8.5h3.8a2.2 2.2 0 1 0-2.2-2.2c0 1.4-1.6 2.2-1.6 2.2Z"/>',
    mapPin: '<path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/>',
    download: '<path d="M12 4v11"/><path d="m7.5 11 4.5 4.5L16.5 11"/><path d="M4.5 19.5h15"/>',
    refresh2: '<path d="M4 12a8 8 0 1 1 2.4 5.7"/><path d="M4 4v4.5h4.5"/>',
    camera: '<path d="M3.5 8.5h3.2l1.4-2.2h7.8l1.4 2.2h3.2v10a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-10Z"/><circle cx="12" cy="13" r="3.4"/>',
    laptop: '<rect x="4" y="5" width="16" height="10.5" rx="1.6"/><path d="M2 15.5h20"/>',
    dot: '<circle cx="12" cy="12" r="4"/>'
  };

  /**
   * Return an inline SVG string for a named icon.
   * @param {string} name  key in PATHS
   * @param {number} size  pixel size (default 20)
   * @param {string} cls   extra class names
   */
  function icon(name, size, cls) {
    const d = PATHS[name] || PATHS.dot;
    const s = size || 20;
    return `<svg class="icon${cls ? ' ' + cls : ''}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
  }

  LUMEN.icon = icon;
  LUMEN.iconNames = Object.keys(PATHS);

  /* =====================================================================
     4. DOM HELPERS
     ===================================================================== */

  const $ = (sel, scope) => (scope || document).querySelector(sel);
  const $$ = (sel, scope) => Array.from((scope || document).querySelectorAll(sel));

  /** Create an element from an HTML string. */
  function fromHTML(html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = String(html).trim();
    return tpl.content.firstElementChild;
  }

  /**
   * Event delegation. `handler` receives (event, matchedElement).
   */
  function delegate(root, selector, type, handler) {
    const node = typeof root === 'string' ? document.querySelector(root) : root;
    if (!node) return () => {};
    const listener = (event) => {
      const target = event.target.closest(selector);
      if (target && node.contains(target)) handler(event, target);
    };
    node.addEventListener(type, listener);
    return () => node.removeEventListener(type, listener);
  }

  /** Escape a string for safe interpolation into HTML. */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Focusable selector used by the modal focus trap. */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  LUMEN.dom = { $, $$, fromHTML, delegate, escapeHtml, FOCUSABLE };

  /* =====================================================================
     5. THEME
     ===================================================================== */

  const THEME_KEY = 'theme';

  function prefersDark() {
    return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function getTheme() {
    return getData(THEME_KEY, null) || (prefersDark() ? 'dark' : 'light');
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#FFFFFF');
    document.dispatchEvent(new CustomEvent('lumen:theme', { detail: { theme } }));
  }

  function setTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    saveData(THEME_KEY, next);
    applyTheme(next);
    return next;
  }

  function toggleTheme() {
    return setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  function initTheme() {
    applyTheme(getTheme());
  }

  LUMEN.theme = { get: getTheme, set: setTheme, toggle: toggleTheme, init: initTheme };

  /* =====================================================================
     6. TOASTS
     ===================================================================== */

  const TOAST_ICONS = { success: 'check', error: 'alert', info: 'info', warn: 'alert' };

  function toastHost() {
    let host = $('.toast-host');
    if (!host) {
      host = fromHTML('<div class="toast-host" role="status" aria-live="polite" aria-atomic="false"></div>');
      document.body.appendChild(host);
    }
    return host;
  }

  /**
   * Show a transient notification.
   * @param {string} message
   * @param {'success'|'error'|'info'|'warn'} type
   * @param {string} [sub] optional secondary line
   */
  function toast(message, type, sub) {
    const kind = TOAST_ICONS[type] ? type : 'info';
    const node = fromHTML(`
      <div class="toast toast--${kind}" role="alert">
        <span class="toast__icon">${icon(TOAST_ICONS[kind], 16)}</span>
        <div class="toast__text">${escapeHtml(message)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</div>
        <button class="toast__close" type="button" aria-label="Dismiss notification">${icon('close', 14)}</button>
      </div>
    `);

    const dismiss = () => {
      if (!node.isConnected) return;
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 240);
    };

    node.querySelector('.toast__close').addEventListener('click', dismiss);
    toastHost().appendChild(node);

    const life = window.setTimeout(dismiss, 3400);
    node.addEventListener('mouseenter', () => window.clearTimeout(life));
    return dismiss;
  }

  LUMEN.toast = toast;

  /* =====================================================================
     7. MODALS
     ===================================================================== */

  const FOCUS_STACK = [];

  function lockScroll(lock) {
    document.body.classList.toggle('is-locked', lock);
  }

  /**
   * Open a modal.
   * @param {object} opts
   *   title, subtitle, body (HTML string), footer (HTML string),
   *   size: 'sm' | '' | 'lg', onMount(el, api), closeLabel
   * @returns {{el:HTMLElement, close:Function}}
   */
  function openModal(opts) {
    const o = opts || {};
    const backdrop = fromHTML(`
      <div class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="modal-title-${Date.now()}">
        <div class="modal${o.size ? ' modal--' + o.size : ''}">
          <header class="modal__head">
            <div>
              <h2 class="modal__title" id="modal-title"></h2>
              <p class="modal__sub" hidden></p>
            </div>
            <button class="modal__close" type="button" aria-label="Close dialog">${icon('close', 18)}</button>
          </header>
          <div class="modal__body"></div>
          <footer class="modal__foot" hidden></footer>
        </div>
      </div>
    `);

    backdrop.querySelector('.modal__title').textContent = o.title || '';
    if (o.subtitle) {
      const sub = backdrop.querySelector('.modal__sub');
      sub.textContent = o.subtitle;
      sub.hidden = false;
    }
    const body = backdrop.querySelector('.modal__body');
    if (typeof o.body === 'string') body.innerHTML = o.body;
    else if (o.body) body.appendChild(o.body);

    const foot = backdrop.querySelector('.modal__foot');
    if (o.footer) {
      foot.innerHTML = o.footer;
      foot.hidden = false;
    }

    const api = { el: backdrop, body, close: () => closeModal(backdrop) };

    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        api.close();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = $$(FOCUSABLE, backdrop).filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    backdrop.addEventListener('keydown', onKeydown);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) api.close();
    });
    backdrop.querySelector('.modal__close').addEventListener('click', api.close);
    backdrop._onKeydown = onKeydown;

    document.body.appendChild(backdrop);
    lockScroll(true);
    FOCUS_STACK.push(backdrop);
    requestAnimationFrame(() => backdrop.classList.add('is-open'));

    const initial = backdrop.querySelector('[data-autofocus]') || $$(FOCUSABLE, backdrop)[0];
    if (initial) setTimeout(() => initial.focus(), 60);

    if (typeof o.onMount === 'function') o.onMount(backdrop, api);
    return api;
  }

  function closeModal(backdrop) {
    if (!backdrop || !backdrop.isConnected) return;
    backdrop.classList.remove('is-open');
    if (backdrop._onKeydown) backdrop.removeEventListener('keydown', backdrop._onKeydown);
    const idx = FOCUS_STACK.indexOf(backdrop);
    if (idx > -1) FOCUS_STACK.splice(idx, 1);
    setTimeout(() => backdrop.remove(), 320);
    if (!FOCUS_STACK.length) lockScroll(false);
  }

  function closeTopModal() {
    const top = FOCUS_STACK[FOCUS_STACK.length - 1];
    if (top) closeModal(top);
  }

  /** Promise-based confirmation dialog. Resolves true on confirm. */
  function confirmDialog(opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        api.close();
        resolve(value);
      };
      const api = openModal({
        title: o.title || 'Are you sure?',
        size: 'sm',
        body: `<p>${escapeHtml(o.message || 'This action cannot be undone.')}</p>`,
        footer: `
          <button class="btn btn--secondary" type="button" data-act="cancel">${escapeHtml(o.cancelLabel || 'Cancel')}</button>
          <button class="btn ${o.danger ? 'btn--danger' : 'btn--primary'}" type="button" data-act="confirm" data-autofocus>${escapeHtml(o.confirmLabel || 'Confirm')}</button>
        `,
        onMount(el, modal) {
          el.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(false));
          el.querySelector('[data-act="confirm"]').addEventListener('click', () => finish(true));
          el.addEventListener('modal:dismiss', () => finish(false));
        }
      });
      // ESC / backdrop close resolves false
      api.el.addEventListener('transitionend', function once() {
        api.el.removeEventListener('transitionend', once);
      });
      const origClose = api.close;
      api.close = function patched() {
        if (!settled) {
          settled = true;
          resolve(false);
        }
        origClose();
      };
    });
  }

  LUMEN.modal = { open: openModal, close: closeModal, closeTop: closeTopModal, confirm: confirmDialog, lockScroll: lockScroll };

  /* =====================================================================
     8. DRAWERS
     ===================================================================== */

  const OPEN_DRAWERS = [];

  function openDrawer(drawer) {
    const backdrop = $('.drawer-backdrop');
    drawer.classList.add('is-open');
    if (backdrop) backdrop.classList.add('is-open');
    lockScroll(true);
    OPEN_DRAWERS.push(drawer);
    const focusable = $$(FOCUSABLE, drawer)[0];
    if (focusable) setTimeout(() => focusable.focus(), 60);
    drawer.dispatchEvent(new CustomEvent('drawer:open'));
  }

  function closeDrawer(drawer) {
    const target = drawer || OPEN_DRAWERS[OPEN_DRAWERS.length - 1];
    if (!target) return;
    target.classList.remove('is-open');
    const stillOpen = OPEN_DRAWERS.some((d) => d.classList.contains('is-open'));
    const backdrop = $('.drawer-backdrop');
    if (backdrop && !stillOpen) backdrop.classList.remove('is-open');
    if (!stillOpen) lockScroll(false);
    const idx = OPEN_DRAWERS.indexOf(target);
    if (idx > -1) OPEN_DRAWERS.splice(idx, 1);
    target.dispatchEvent(new CustomEvent('drawer:close'));
  }

  function closeAllDrawers() {
    OPEN_DRAWERS.slice().forEach((d) => closeDrawer(d));
  }

  LUMEN.drawer = { open: openDrawer, close: closeDrawer, closeAll: closeAllDrawers };

  /* =====================================================================
     9. HEADER & FOOTER
     Built in JS so navigation stays a single source of truth across the
     ten storefront pages.
     ===================================================================== */

  const NAV_ITEMS = [
    { label: 'Home', href: 'index.html', key: 'home' },
    { label: 'Shop', href: 'shop.html', key: 'shop' },
    { label: 'Categories', href: 'shop.html#categories', key: 'categories' },
    { label: 'New Arrivals', href: 'shop.html?sort=newest', key: 'new' },
    { label: 'Deals', href: 'shop.html?deals=1', key: 'deals' }
  ];

  const FOOTER_COLUMNS = [
    {
      title: 'Shop',
      links: [
        { label: 'All products', href: 'shop.html' },
        { label: 'New arrivals', href: 'shop.html?sort=newest' },
        { label: 'Best sellers', href: 'shop.html?sort=rating' },
        { label: 'Deals', href: 'shop.html?deals=1' },
        { label: 'Smartphones', href: 'shop.html?category=smartphones' }
      ]
    },
    {
      title: 'Support',
      links: [
        { label: 'Contact us', href: 'index.html#support' },
        { label: 'FAQ', href: 'index.html#faq' },
        { label: 'Shipping', href: 'index.html#shipping' },
        { label: 'Returns & refunds', href: 'index.html#returns' },
        { label: 'Track an order', href: 'orders.html' }
      ]
    },
    {
      title: 'Company',
      links: [
        { label: 'About Lumen', href: 'index.html#about' },
        { label: 'Sustainability', href: 'index.html#sustainability' },
        { label: 'Careers', href: 'index.html#careers' },
        { label: 'Press', href: 'index.html#press' },
        { label: 'Admin portal', href: 'admin/login.html' }
      ]
    },
    {
      title: 'Account',
      links: [
        { label: 'Sign in', href: 'login.html' },
        { label: 'Create account', href: 'signup.html' },
        { label: 'Your orders', href: 'orders.html' },
        { label: 'Wishlist', href: 'wishlist.html' },
        { label: 'Your profile', href: 'profile.html' }
      ]
    }
  ];

  const SOCIAL = [
    { name: 'Instagram', path: 'M7.5 3.5h9A4 4 0 0 1 20.5 7.5v9a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4v-9a4 4 0 0 1 4-4Z|M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Z|M16.9 7.1h.01' },
    { name: 'Twitter', path: 'M4 4l7.2 9.4L4.4 20h2.2l5.5-5.3L16.6 20H20l-7.4-9.7L18.9 4h-2.2l-5 4.9L7.8 4H4Z' },
    { name: 'YouTube', path: 'M20.5 8.2a2.4 2.4 0 0 0-1.7-1.7C17.3 6 12 6 12 6s-5.3 0-6.8.5A2.4 2.4 0 0 0 3.5 8.2 25 25 0 0 0 3 12a25 25 0 0 0 .5 3.8 2.4 2.4 0 0 0 1.7 1.7c1.5.5 6.8.5 6.8.5s5.3 0 6.8-.5a2.4 2.4 0 0 0 1.7-1.7A25 25 0 0 0 21 12a25 25 0 0 0-.5-3.8Z|M10.4 14.6V9.4L14.8 12l-4.4 2.6Z' },
    { name: 'LinkedIn', path: 'M6.9 8.9H4V20h2.9V8.9Z|M5.4 7.4a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z|M20 20h-2.9v-5.4c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V20H10.3V8.9h2.8v1.3h.1a3.1 3.1 0 0 1 2.8-1.5c3 0 3.5 1.9 3.5 4.5V20Z' }
  ];

  function socialIcon(idx, size) {
    const raw = SOCIAL[idx].path;
    const paths = raw.split('|').map((d) => `<path d="${d}"/>`).join('');
    return `<svg width="${size || 18}" height="${size || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  function buildHeader() {
    const root = document.body.dataset.root || '';
    const page = document.body.dataset.page || '';

    const navLinks = NAV_ITEMS.map((item) => {
      const active = item.key === page ? ' is-active' : '';
      const accent = item.key === 'deals' ? ' nav__link--accent' : '';
      return `<li><a class="nav__link${active}${accent}" href="${root}${item.href}">${item.label}</a></li>`;
    }).join('');

    return `
      <header class="header" id="siteHeader">
        <div class="header__inner">
          <a class="brand" href="${root}index.html" aria-label="Lumen home">
            <img class="brand__mark" src="${root}assets/icons/logo.svg" alt="" width="26" height="26">
            <span class="brand__name">Lumen</span>
            <span class="brand__tag">India</span>
          </a>

          <nav class="nav" aria-label="Primary">
            <ul>${navLinks}</ul>
          </nav>

          <div class="header__actions">
            <div class="header__search">
              <button class="search-trigger" type="button" data-open-search aria-label="Search products">
                ${icon('search', 16)}
                <span>Search</span>
                <kbd>Ctrl K</kbd>
              </button>
            </div>

            <button class="icon-btn" type="button" data-open-wishlist aria-label="Wishlist" data-optional>
              ${icon('heart', 20)}
              <span class="icon-btn__count" data-wishlist-count hidden>0</span>
            </button>

            <button class="icon-btn" type="button" data-open-account data-account-trigger aria-label="Sign in to your account">
              ${icon('user', 20)}
            </button>

            <button class="icon-btn" type="button" data-open-cart aria-label="Shopping bag">
              ${icon('bag', 20)}
              <span class="icon-btn__count" data-cart-count hidden>0</span>
            </button>

            <button class="icon-btn theme-toggle" type="button" data-toggle-theme aria-label="Switch to dark mode">
              ${icon('sun', 20, 'icon--sun')}
              ${icon('moon', 20, 'icon--moon')}
            </button>

            <button class="icon-btn hamburger" type="button" data-open-nav aria-expanded="false" aria-controls="mobileNav" aria-label="Open menu">
              <span class="hamburger__box"><span></span><span></span><span></span></span>
            </button>
          </div>
        </div>
      </header>
    `;
  }

  function buildMobileNav() {
    const root = document.body.dataset.root || '';
    const page = document.body.dataset.page || '';
    const links = NAV_ITEMS.map((item) => {
      const active = item.key === page ? ' is-active' : '';
      return `<a class="drawer-line" href="${root}${item.href}">${item.label}
        <span class="drawer-line__chev">${icon('chevronRight', 16)}</span></a>`;
    }).join('');

    const cats = (LUMEN.data ? LUMEN.data.CATEGORIES : []).map(
      (c) => `<a class="drawer-line" href="${root}shop.html?category=${c.slug}">${escapeHtml(c.name)}
        <span class="drawer-line__chev">${icon('chevronRight', 16)}</span></a>`
    ).join('');

    return `
      <aside class="drawer drawer--left" id="mobileNav" aria-label="Mobile navigation" aria-hidden="true">
        <div class="drawer__head">
          <span class="drawer__title">Menu</span>
          <button class="icon-btn" type="button" data-close-drawer aria-label="Close menu">${icon('close', 20)}</button>
        </div>
        <div class="drawer__body">
          <ul class="mb-4">${links}</ul>
          <p class="field__label mb-2">Shop by category</p>
          <ul>${cats}</ul>
          <p class="field__label mb-2 mt-5">Your account</p>
          <ul class="mb-3">
            <li><a class="drawer-line" href="${root}wishlist.html">Wishlist <span class="side-link__count" data-wishlist-count-inline>0</span></a></li>
          </ul>
          <div data-mobile-account></div>
        </div>
        <div class="drawer__foot">
          <a class="btn btn--dark btn--block" href="${root}admin/login.html">${icon('lock', 16)} Admin portal</a>
        </div>
      </aside>
    `;
  }

  function buildFooter() {
    const root = document.body.dataset.root || '';
    const year = new Date().getFullYear();

    const columns = FOOTER_COLUMNS.map(
      (col) => `
        <div>
          <h4>${col.title}</h4>
          <nav class="footer__links" aria-label="${col.title}">
            ${col.links.map((l) => `<a href="${root}${l.href}">${l.label}</a>`).join('')}
          </nav>
        </div>`
    ).join('');

    const socials = SOCIAL.map(
      (s, i) => `<a class="icon-btn" href="${root}index.html" aria-label="${s.name}">${socialIcon(i, 17)}</a>`
    ).join('');

    return `
      <footer class="footer">
        <div class="container">
          <div class="footer__top">
            <div class="footer__brand">
              <a class="brand" href="${root}index.html">
                <img class="brand__mark" src="${root}assets/icons/logo.svg" alt="" width="26" height="26">
                <span class="brand__name">Lumen</span>
              </a>
              <p>Premium technology, chosen carefully and priced honestly. Free delivery across India on orders above ₹999.</p>
              <div class="footer__social">${socials}</div>
            </div>
            ${columns}
          </div>

          <div class="footer__bottom">
            <p>© ${year} Lumen Retail India Pvt. Ltd. All rights reserved.</p>
            <nav class="footer__legal" aria-label="Legal">
              <a href="${root}index.html#privacy">Privacy policy</a>
              <a href="${root}index.html#terms">Terms of service</a>
              <a href="${root}index.html#cookies">Cookie policy</a>
            </nav>
            <div class="footer__pay" aria-label="Accepted payment methods">
              <span>UPI</span><span>VISA</span><span>MASTERCARD</span><span>RUPAY</span><span>COD</span>
            </div>
          </div>
        </div>
      </footer>
    `;
  }

  /** Shopper-facing bottom tab bar (mobile). */
  function buildMobileTabbar() {
    const root = document.body.dataset.root || '';
    const page = document.body.dataset.page || '';
    const items = [
      { key: 'home', label: 'Home', href: 'index.html', ico: 'home' },
      { key: 'shop', label: 'Shop', href: 'shop.html', ico: 'grid' },
      { key: 'wishlist', label: 'Wishlist', href: 'wishlist.html', ico: 'heart', badge: true },
      { key: 'cart', label: 'Cart', href: 'cart.html', ico: 'bag', badge: true },
      { key: 'account', label: 'Account', href: 'profile.html', ico: 'user' }
    ];

    return `
      <nav class="mobile-nav" aria-label="Primary mobile">
        ${items
          .map(
            (it) => `
          <a class="mobile-nav__item${it.key === page ? ' is-active' : ''}" href="${root}${it.href}">
            ${icon(it.ico, 21)}
            <span>${it.label}</span>
            ${it.badge ? `<span class="mobile-nav__badge" data-mobile-count="${it.key}" hidden>0</span>` : ''}
          </a>`
          )
          .join('')}
      </nav>
    `;
  }

  /* =====================================================================
     10. SEARCH
     ===================================================================== */

  /** Products from storage, falling back to the seed catalogue. */
  function catalog() {
    const stored = getData('products', null);
    if (Array.isArray(stored) && stored.length) return stored;
    return LUMEN.data ? LUMEN.data.SEED_PRODUCTS : [];
  }

  function searchableText(product) {
    return [
      product.name,
      product.brand,
      product.category,
      product.tagline,
      product.description,
      LUMEN.data ? LUMEN.data.categoryName(product.category) : ''
    ]
      .join(' ')
      .toLowerCase();
  }

  /** Rank matches: name prefix, then name, then brand/category/description. */
  function searchProducts(query, limit) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const max = limit || 8;
    const terms = q.split(/\s+/).filter(Boolean);
    const scored = [];

    catalog().forEach((product) => {
      const name = product.name.toLowerCase();
      const haystack = searchableText(product);
      let score = 0;
      let matchedAll = true;

      for (let i = 0; i < terms.length; i += 1) {
        const term = terms[i];
        if (haystack.indexOf(term) === -1) {
          matchedAll = false;
          break;
        }
        if (i === 0) {
          if (name.indexOf(term) === 0) score += 120;
          else if (name.indexOf(term) > -1) score += 70;
          else if (product.brand.toLowerCase().indexOf(term) === 0) score += 50;
          else if ((LUMEN.data ? LUMEN.data.categoryName(product.category) : '').toLowerCase().indexOf(term) === 0) score += 40;
          else score += 20;
        } else {
          score += 15;
        }
      }

      if (matchedAll) scored.push({ product, score: score + (product.rating || 0) });
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, max).map((s) => s.product);
  }

  function buildSearchOverlay() {
    if ($('#searchOverlay')) return;
    const root = document.body.dataset.root || '';
    const node = fromHTML(`
      <div class="search-overlay" id="searchOverlay" role="dialog" aria-modal="true" aria-label="Search products">
        <div class="search-panel">
          <div class="search-panel__head">
            <div class="search-panel__field">
              ${icon('search', 20)}
              <input class="input" type="search" id="searchInput" placeholder="Search for headphones, laptops, brands…"
                     autocomplete="off" spellcheck="false" aria-label="Search products" aria-controls="searchResults">
            </div>
          </div>
          <div class="search-results" id="searchResults" role="listbox" aria-label="Search results"></div>
          <div class="search-foot">
            <span><kbd>↑</kbd> <kbd>↓</kbd> to navigate · <kbd>Enter</kbd> to open</span>
            <a class="fw-6" href="${root}shop.html">Browse everything</a>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(node);
    initSearchOverlay(node);
  }

  function initSearchOverlay(overlay) {
    const input = overlay.querySelector('#searchInput');
    const results = overlay.querySelector('#searchResults');
    const root = document.body.dataset.root || '';
    let activeIndex = -1;
    let current = [];

    function render() {
      const q = input.value.trim();
      activeIndex = -1;

      if (!q) {
        const trending = catalog().slice().sort((a, b) => b.rating - a.rating).slice(0, 6);
        results.innerHTML = `
          <p class="search-group__label">Popular right now</p>
          ${trending
            .map(
              (p) => `
            <a class="search-row" href="${root}product.html?id=${p.id}" role="option">
              <img src="${LUMEN.data.imageUrl(p.image)}" alt="" width="46" height="46" loading="lazy">
              <span>
                <span class="search-row__name">${escapeHtml(p.name)}</span>
                <span class="search-row__meta">${escapeHtml(LUMEN.data.categoryName(p.category))} · ${escapeHtml(p.brand)}</span>
              </span>
              <span class="search-row__price">${money(LUMEN.data.salePrice(p))}</span>
            </a>`
            )
            .join('')}
        `;
        return;
      }

      current = searchProducts(q, 8);

      if (!current.length) {
        results.innerHTML = `
          <div class="search-empty">
            <h4>No products found.</h4>
            <p>We could not find anything matching “${escapeHtml(q)}”. Try a brand, a category, or a shorter word.</p>
            <a class="btn btn--secondary btn--sm mt-3" href="${root}shop.html?q=${encodeURIComponent(q)}">Search all products</a>
          </div>
        `;
        return;
      }

      results.innerHTML = `
        <p class="search-group__label">${current.length} result${current.length === 1 ? '' : 's'}</p>
        ${current
          .map(
            (p, i) => `
          <a class="search-row" href="${root}product.html?id=${p.id}" role="option" data-index="${i}">
            <img src="${LUMEN.data.imageUrl(p.image)}" alt="" width="46" height="46" loading="lazy">
            <span>
              <span class="search-row__name">${escapeHtml(p.name)}</span>
              <span class="search-row__meta">${escapeHtml(LUMEN.data.categoryName(p.category))} · ${escapeHtml(p.brand)} · ${p.rating}★</span>
            </span>
            <span class="search-row__price">${money(LUMEN.data.salePrice(p))}</span>
          </a>`
          )
          .join('')}
        <a class="search-row" href="${root}shop.html?q=${encodeURIComponent(q)}">
          <span class="search-row__icon">${icon('search', 18)}</span>
          <span><span class="search-row__name">See all results for “${escapeHtml(q)}”</span></span>
        </a>
      `;
    }

    function open() {
      overlay.classList.add('is-open');
      render();
      setTimeout(() => input.focus(), 80);
    }

    function close() {
      overlay.classList.remove('is-open');
      input.value = '';
      render();
    }

    function move(delta) {
      const rows = $$('.search-row', results);
      if (!rows.length) return;
      activeIndex = (activeIndex + delta + rows.length) % rows.length;
      rows.forEach((r, i) => r.classList.toggle('is-active', i === activeIndex));
      rows[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    input.addEventListener('input', LUMEN.fmt.debounce(render, 130));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        move(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        move(-1);
      } else if (event.key === 'Enter' && activeIndex > -1) {
        event.preventDefault();
        const row = $$('.search-row', results)[activeIndex];
        if (row) window.location.href = row.getAttribute('href');
      } else if (event.key === 'Escape') {
        close();
      }
    });

    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) close();
    });

    LUMEN.search = { open, close, query: searchProducts, overlay };
  }

  LUMEN.search = Object.assign(LUMEN.search || {}, { query: searchProducts });

  /* =====================================================================
     11. SCROLL REVEAL
     ===================================================================== */

  let revealObserver = null;

  function initReveal(scope) {
    const nodes = $$('[data-reveal]:not(.is-in)', scope || document);
    if (!nodes.length) return;

    if (!('IntersectionObserver' in window)) {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }

    if (!revealObserver) {
      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const delay = Number(entry.target.dataset.revealDelay || 0);
            setTimeout(() => entry.target.classList.add('is-in'), delay);
            revealObserver.unobserve(entry.target);
          });
        },
        { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
      );
    }

    nodes.forEach((n) => revealObserver.observe(n));
  }

  /** Re-scan a container for newly added reveal targets. */
  function refreshReveal(scope) {
    initReveal(scope);
  }

  LUMEN.reveal = { init: initReveal, refresh: refreshReveal };

  /* =====================================================================
     12. BADGES
     ===================================================================== */

  function cartCount() {
    const items = getData('cart', []);
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  }

  function wishlistCount() {
    const items = getData('wishlist', []);
    return Array.isArray(items) ? items.length : 0;
  }

  /** Push the current cart / wishlist counts into every badge on the page. */
  function syncBadges(bump) {
    const cc = cartCount();
    const wc = wishlistCount();

    $$('[data-cart-count]').forEach((node) => {
      node.textContent = cc > 99 ? '99+' : String(cc);
      node.hidden = cc === 0;
      if (bump === 'cart' && cc > 0) {
        node.classList.remove('is-bump');
        void node.offsetWidth;
        node.classList.add('is-bump');
      }
    });

    $$('[data-wishlist-count]').forEach((node) => {
      node.textContent = wc > 99 ? '99+' : String(wc);
      node.hidden = wc === 0;
      if (bump === 'wish' && wc > 0) {
        node.classList.remove('is-bump');
        void node.offsetWidth;
        node.classList.add('is-bump');
      }
    });

    $$('[data-wishlist-count-inline]').forEach((node) => {
      node.textContent = String(wc);
    });

    $$('[data-mobile-count="cart"]').forEach((node) => {
      node.textContent = cc > 99 ? '99+' : String(cc);
      node.hidden = cc === 0;
    });

    $$('[data-mobile-count="wishlist"]').forEach((node) => {
      node.textContent = wc > 99 ? '99+' : String(wc);
      node.hidden = wc === 0;
    });
  }

  /** Mark every wishlist heart that matches a saved product. */
  function syncWishStates() {
    const list = getData('wishlist', []);
    const ids = new Set((list || []).map((p) => p.id));
    $$('[data-wish-id]').forEach((btn) => {
      const on = ids.has(btn.dataset.wishId);
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      const label = btn.dataset.label || btn.dataset.wishLabel;
      if (label) btn.setAttribute('aria-label', on ? `Remove ${label} from wishlist` : `Add ${label} to wishlist`);
    });
  }

  LUMEN.badges = { cartCount, wishlistCount, sync: syncBadges, syncWishStates };

  /* =====================================================================
     13. SEEDING
     Demo-only accounts. These are intentionally plain fixtures for a
     front-end prototype — they are NOT credentials for any real system.
     ===================================================================== */

  const DEMO_ACCOUNTS = [
    {
      id: 'USR-ADMIN-1',
      name: 'Aarav Mehta',
      email: 'admin@lumen.in',
      password: 'Admin@2026',
      role: 'admin',
      phone: '+91 98450 11223',
      createdAt: '2025-03-12T09:00:00.000Z'
    },
    {
      id: 'USR-DEMO-1',
      name: 'Riya Sharma',
      email: 'demo@lumen.in',
      password: 'Demo@2026',
      role: 'customer',
      phone: '+91 90000 12345',
      createdAt: '2025-09-04T11:30:00.000Z'
    }
  ];

  const now = Date.now();
  const daysAgo = (n) => new Date(now - n * 86400000).toISOString();

  const SEED_ORDERS = [
    {
      id: 'LUM-48210',
      userId: 'USR-DEMO-1',
      userName: 'Riya Sharma',
      userEmail: 'demo@lumen.in',
      date: daysAgo(3),
      status: 'Shipped',
      payment: { method: 'UPI', status: 'Paid', ref: 'UPI238471' },
      address: { name: 'Riya Sharma', line1: '402, Fern Residency, 14th Cross', city: 'Bengaluru', state: 'Karnataka', postal: '560034', country: 'India', phone: '+91 90000 12345' },
      items: [
        { id: 'LUM-1001', name: 'Aurora X1 Pro', price: 79999, qty: 1, image: 'smartphone-titanium.svg', variant: 'Titanium Natural · 256 GB' },
        { id: 'LUM-6001', name: 'ChargeCore 20K Power Bank', price: 3499, qty: 1, image: 'powerbank.svg', variant: 'Deep Graphite' }
      ],
      subtotal: 65999,
      discount: 9899,
      shipping: 0,
      tax: 0,
      total: 56099
    },
    {
      id: 'LUM-47903',
      userId: 'USR-DEMO-1',
      userName: 'Riya Sharma',
      userEmail: 'demo@lumen.in',
      date: daysAgo(16),
      status: 'Delivered',
      payment: { method: 'Card', status: 'Paid', ref: 'CRD772190' },
      address: { name: 'Riya Sharma', line1: '402, Fern Residency, 14th Cross', city: 'Bengaluru', state: 'Karnataka', postal: '560034', country: 'India', phone: '+91 90000 12345' },
      items: [{ id: 'LUM-3001', name: 'Halo Pro Studio', price: 34999, qty: 1, image: 'headphone-champagne.svg', variant: 'Champagne Gold' }],
      subtotal: 34999,
      discount: 6999,
      shipping: 0,
      tax: 0,
      total: 27999
    },
    {
      id: 'LUM-47155',
      userId: 'USR-DEMO-1',
      userName: 'Riya Sharma',
      userEmail: 'demo@lumen.in',
      date: daysAgo(41),
      status: 'Delivered',
      payment: { method: 'COD', status: 'Paid', ref: 'COD114502' },
      address: { name: 'Riya Sharma', line1: '402, Fern Residency, 14th Cross', city: 'Bengaluru', state: 'Karnataka', postal: '560034', country: 'India', phone: '+91 90000 12345' },
      items: [{ id: 'LUM-4002', name: 'Orbit Watch Series 6', price: 39999, qty: 1, image: 'watch-titanium.svg', variant: '45 mm · Titanium Natural' }],
      subtotal: 39999,
      discount: 6000,
      shipping: 0,
      tax: 0,
      total: 33999
    }
  ];

  const SEED_CUSTOMERS = [
    { id: 'USR-DEMO-1', name: 'Riya Sharma', email: 'demo@lumen.in', phone: '+91 90000 12345', role: 'customer', joined: daysAgo(385), status: 'active', orders: 3, spent: 118097, city: 'Bengaluru' },
    { id: 'USR-2002', name: 'Arjun Nair', email: 'arjun.nair@fastmail.com', phone: '+91 98200 55432', role: 'customer', joined: daysAgo(310), status: 'active', orders: 7, spent: 342190, city: 'Kochi' },
    { id: 'USR-2003', name: 'Meera Iyer', email: 'meera.iyer@gmail.com', phone: '+91 99801 22009', role: 'customer', joined: daysAgo(268), status: 'active', orders: 2, spent: 54998, city: 'Chennai' },
    { id: 'USR-2004', name: 'Kabir Singh', email: 'kabir.singh@protonmail.com', phone: '+91 98111 40022', role: 'customer', joined: daysAgo(221), status: 'active', orders: 5, spent: 218449, city: 'New Delhi' },
    { id: 'USR-2005', name: 'Ananya Rao', email: 'ananya.rao@gmail.com', phone: '+91 97300 88120', role: 'customer', joined: daysAgo(196), status: 'active', orders: 3, spent: 132757, city: 'Hyderabad' },
    { id: 'USR-2006', name: 'Vikram Desai', email: 'vikram.d@outlook.com', phone: '+91 90999 72110', role: 'customer', joined: daysAgo(174), status: 'blocked', orders: 1, spent: 12999, city: 'Ahmedabad' },
    { id: 'USR-2007', name: 'Fatima Sheikh', email: 'fatima.sheikh@gmail.com', phone: '+91 98690 33112', role: 'customer', joined: daysAgo(142), status: 'active', orders: 4, spent: 197498, city: 'Mumbai' },
    { id: 'USR-2008', name: 'Siddharth Menon', email: 'sid.menon@gmail.com', phone: '+91 94470 66533', role: 'customer', joined: daysAgo(118), status: 'active', orders: 2, spent: 174998, city: 'Thiruvananthapuram' },
    { id: 'USR-2009', name: 'Pooja Bhatt', email: 'pooja.bhatt@gmail.com', phone: '+91 98920 77415', role: 'customer', joined: daysAgo(96), status: 'active', orders: 6, spent: 289751, city: 'Pune' },
    { id: 'USR-2010', name: 'Nikhil Joshi', email: 'nikhil.joshi@gmail.com', phone: '+91 98222 90041', role: 'customer', joined: daysAgo(64), status: 'active', orders: 1, spent: 89999, city: 'Jaipur' }
  ];

  /** Populate localStorage on first run so every page has data to render. */
  function ensureSeed() {
    if (!getData('products', null)) saveData('products', LUMEN.data.SEED_PRODUCTS);
    if (!getData('coupons', null)) saveData('coupons', LUMEN.data.COUPON_SEED);
    if (!getData('settings', null)) saveData('settings', LUMEN.data.SETTINGS_SEED);
    if (!getData('customers', null)) saveData('customers', SEED_CUSTOMERS);
    if (!getData('orders', null)) saveData('orders', SEED_ORDERS);
    if (!getData('users', null)) saveData('users', DEMO_ACCOUNTS.map((u) => ({ ...u })));
    if (!getData('cart', null)) saveData('cart', []);
    if (!getData('wishlist', null)) saveData('wishlist', []);
    if (!getData('reviews', null)) saveData('reviews', []);
  }

  LUMEN.seed = { ensure: ensureSeed, DEMO_ACCOUNTS, SEED_CUSTOMERS, SEED_ORDERS };

  /* =====================================================================
     14. ORDERS (shared by the storefront profile pages and the admin area)
     ===================================================================== */

  const ORDER_STATUS_FLOW = ['Processing', 'Confirmed', 'Packed', 'Shipped', 'Out for delivery', 'Delivered'];

  const ORDER_STATUS_TONE = {
    Processing: 'info',
    Confirmed: 'info',
    Packed: 'warn',
    Shipped: 'info',
    'Out for delivery': 'warn',
    Delivered: 'success',
    Cancelled: 'danger',
    Returned: 'muted'
  };

  function allOrders() {
    const list = getData('orders', []);
    return Array.isArray(list) ? list : [];
  }

  function orderById(id) {
    return allOrders().find((o) => o.id === id) || null;
  }

  function orderItemCount(order) {
    return (order.items || []).reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
  }

  function orderStatusPill(status) {
    const tone = ORDER_STATUS_TONE[status] || 'muted';
    return `<span class="status-pill status-pill--${tone}"><span class="status-pill__dot"></span>${escapeHtml(status)}</span>`;
  }

  /** Horizontal delivery tracker, shared by the customer and admin views. */
  function orderTimeline(order) {
    if (order.status === 'Cancelled' || order.status === 'Returned') {
      return `
        <div class="timeline timeline--stopped">
          <span class="timeline__step is-done is-cancelled">${icon('close', 14)}</span>
          <p>This order was ${escapeHtml(order.status.toLowerCase())}.</p>
        </div>`;
    }
    const index = Math.max(0, ORDER_STATUS_FLOW.indexOf(order.status));
    return `
      <ol class="timeline">
        ${ORDER_STATUS_FLOW.map(
          (label, i) => `
          <li class="timeline__step ${i < index ? 'is-done' : i === index ? 'is-current' : ''}">
            <span class="timeline__marker">${i < index ? icon('check', 12) : num(i + 1)}</span>
            <span class="timeline__label">${escapeHtml(label)}</span>
          </li>`
        ).join('')}
      </ol>`;
  }

  function setOrderStatus(id, status) {
    const list = allOrders();
    const idx = list.findIndex((o) => o.id === id);
    if (idx === -1) return null;
    list[idx].status = status;
    if (status === 'Cancelled') list[idx].cancelledAt = new Date().toISOString();
    if (status === 'Delivered') list[idx].deliveredAt = new Date().toISOString();
    saveData('orders', list);
    return list[idx];
  }

  /** Render a standalone invoice file and hand it to the browser. */
  function downloadOrderInvoice(order) {
    if (!order) return;
    const rows = (order.items || [])
      .map(
        (line) =>
          `<tr><td>${escapeHtml(line.name)}<br><small>${escapeHtml(line.variant || '')}</small></td>` +
          `<td>${line.qty}</td><td>${money(line.price)}</td><td>${money(line.price * line.qty)}</td></tr>`
      )
      .join('');

    const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${escapeHtml(order.id)}</title>
<style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1d1f;margin:40px}
h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:24px}
th,td{text-align:left;padding:10px;border-bottom:1px solid #d2d2d7;font-size:13px}
.tot{margin-top:20px;font-size:18px;font-weight:700}</style></head><body>
<h1>Lumen Retail India Pvt. Ltd.</h1>
<p>Tax invoice · ${escapeHtml(order.id)} · ${formatDate(order.date)}</p>
<p>${escapeHtml(order.address.name)}, ${escapeHtml(order.address.city)}, ${escapeHtml(order.address.state)} ${escapeHtml(order.address.postal)}</p>
<table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
<p class="tot">Total ${money(order.total)} (${escapeHtml(order.payment.method)} · ${escapeHtml(order.payment.status)})</p>
<p><small>Demo invoice generated in the browser. Not a valid tax document.</small></p>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lumen-invoice-${order.id}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Invoice downloaded', 'success', `Invoice-${order.id}.html`);
  }

  LUMEN.orders = {
    STATUS_FLOW: ORDER_STATUS_FLOW,
    all: allOrders,
    byId: orderById,
    itemCount: orderItemCount,
    statusPill: orderStatusPill,
    timeline: orderTimeline,
    setStatus: setOrderStatus,
    downloadInvoice: downloadOrderInvoice
  };

  /* =====================================================================
     15. HEADER BEHAVIOUR
     ===================================================================== */

  function initHeader() {
    const header = $('#siteHeader');
    if (!header) return;

    let ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        header.classList.toggle('is-stuck', window.scrollY > 8);
        ticking = false;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    const burger = $('[data-open-nav]');
    const mobileNav = $('#mobileNav');
    if (burger && mobileNav) {
      burger.addEventListener('click', () => {
        const open = !mobileNav.classList.contains('is-open');
        if (open) LUMEN.drawer.open(mobileNav);
        else LUMEN.drawer.close(mobileNav);
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        mobileNav.setAttribute('aria-hidden', open ? 'false' : 'true');
      });
      mobileNav.addEventListener('drawer:close', () => {
        burger.setAttribute('aria-expanded', 'false');
        mobileNav.setAttribute('aria-hidden', 'true');
      });
    }

    const themeBtn = $('[data-toggle-theme]');
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        const next = LUMEN.theme.toggle();
        themeBtn.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        toast(next === 'dark' ? 'Dark mode on' : 'Light mode on', 'info');
      });
    }

    const searchBtn = $('[data-open-search]');
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        buildSearchOverlay();
        LUMEN.search.open();
      });
    }

    const wishBtn = $('[data-open-wishlist]');
    if (wishBtn) {
      wishBtn.addEventListener('click', () => {
        if (window.location.pathname.endsWith('wishlist.html')) return;
        window.location.href = 'wishlist.html';
      });
    }

    const accountBtn = $('[data-open-account]');
    if (accountBtn) {
      accountBtn.addEventListener('click', () => {
        // Signed out, send them to sign in. Signed in, open the quick panel,
        // which is where the sign-out control lives.
        if (!session.get('session', null)) {
          window.location.href = 'login.html';
          return;
        }
        LUMEN.auth.openAccountPanel();
      });
    }

    document.addEventListener('keydown', (event) => {
      const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      const isSlash = event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (isShortcut || isSlash) {
        event.preventDefault();
        buildSearchOverlay();
        LUMEN.search.open();
      }
    });
  }

  /* =====================================================================
     16. SHARED UI RENDERERS
     ===================================================================== */

  const STAR_PATH = 'm12 3.2 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6L3.2 9.6l6.1-.9L12 3.2Z';

  function starsMarkup(rating) {
    const pct = ((Number(rating) || 0) / 5) * 100;
    return `
      <span class="rating">
        <span class="rating__stars">
          <svg class="base" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${STAR_PATH}"/></svg>
          <span class="fill" style="width:${pct}%">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${STAR_PATH}"/></svg>
          </span>
        </span>
        <span class="rating__count">${(Number(rating) || 0).toFixed(1)}</span>
      </span>`;
  }

  function productCardMarkup(product, options) {
    const o = options || {};
    const D = LUMEN.data;
    const root = document.body.dataset.root || '';
    const price = D.salePrice(product);
    const out = Number(product.stock) <= 0;

    const flags = [];
    if (out) flags.push('<span class="badge badge--out">Sold out</span>');
    else if (product.discount) flags.push(`<span class="badge badge--sale">${product.discount}% off</span>`);
    if (product.isNew) flags.push('<span class="badge badge--new">New</span>');
    if (product.badge === 'bestseller' && !product.discount && !out) flags.push('<span class="badge">Bestseller</span>');

    return `
      <article class="product-card${out ? ' product-card--sold' : ''}${o.compact ? ' product-card--compact' : ''}" data-product-id="${product.id}">
        <div class="product-card__media">
          <img class="product-card__img" src="${D.imageUrl(product.image)}" alt="${escapeHtml(product.name)}"
               width="600" height="600" loading="lazy" decoding="async">
          ${flags.length ? `<div class="product-card__flags">${flags.join('')}</div>` : ''}
          <button class="wish-btn" type="button" data-wish-id="${product.id}" data-wish-label="${escapeHtml(product.name)}"
                  aria-pressed="false" aria-label="Add ${escapeHtml(product.name)} to wishlist">
            ${icon('heart', 17)}
          </button>
          <div class="product-card__quick">
            <a class="btn btn--light btn--sm" href="${root}product.html?id=${product.id}" aria-label="View ${escapeHtml(product.name)} details">
              View
            </a>
            <button class="btn btn--dark btn--sm" type="button" data-add-to-cart="${product.id}" ${out ? 'disabled' : ''}>
              ${icon('bag', 15)} Add
            </button>
          </div>
        </div>

        <div class="product-card__body">
          <p class="product-card__cat">${escapeHtml(D.categoryName(product.category))}</p>
          <h3 class="product-card__title"><a href="${root}product.html?id=${product.id}">${escapeHtml(product.name)}</a></h3>
          ${o.hideDesc ? '' : `<p class="product-card__desc">${escapeHtml(product.tagline || product.description)}</p>`}
          <div class="row gap-2">${starsMarkup(product.rating)}<span class="rating__count">(${num(product.reviews)})</span></div>
          <div class="product-card__foot">
            <div class="price">
              <span class="price__now">${money(price)}</span>
              ${product.discount ? `<span class="price__was">${money(product.price)}</span>` : ''}
            </div>
            <button class="btn btn--primary btn--sm" type="button" data-add-to-cart="${product.id}" ${out ? 'disabled' : ''}>
              ${out ? 'Sold out' : 'Add to cart'}
            </button>
          </div>
        </div>
      </article>`;
  }

  function skeletonCards(count) {
    const items = Array.from({ length: count || 8 })
      .map(
        () => `
      <div class="skeleton skeleton--card">
        <div class="skeleton skeleton--media"></div>
        <div class="product-card__body">
          <div class="skeleton skeleton--line w40" style="height:10px"></div>
          <div class="skeleton skeleton--line w80" style="height:16px"></div>
          <div class="skeleton skeleton--line w60" style="height:12px"></div>
          <div class="skeleton skeleton--line w30" style="height:20px;margin-top:8px"></div>
        </div>
      </div>`
      )
      .join('');
    return `<div class="product-grid" aria-hidden="true">${items}</div>`;
  }

  function emptyState(opts) {
    const o = opts || {};
    return `
      <div class="empty">
        <span class="empty__icon">${icon(o.icon || 'package', 34)}</span>
        <h3>${escapeHtml(o.title || 'Nothing here yet')}</h3>
        <p>${escapeHtml(o.message || 'There is nothing to show at the moment.')}</p>
        ${o.actionLabel ? `<div class="empty__actions">
          <a class="btn btn--primary" href="${o.actionHref || 'shop.html'}">${escapeHtml(o.actionLabel)}</a>
          ${o.secondaryLabel ? `<a class="btn btn--outline" href="${o.secondaryHref || 'shop.html'}">${escapeHtml(o.secondaryLabel)}</a>` : ''}
        </div>` : ''}
      </div>`;
  }

  LUMEN.ui = {
    starsMarkup,
    productCardMarkup,
    skeletonCards,
    emptyState,
    catalog
  };

  /* =====================================================================
     17. GLOBAL LISTENERS
     ===================================================================== */

  function initGlobalEvents() {
    // ESC closes the topmost overlay
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (LUMEN.search && LUMEN.search.overlay && LUMEN.search.overlay.classList.contains('is-open')) {
        LUMEN.search.close();
        return;
      }
      if (OPEN_DRAWERS.length) closeAllDrawers();
    });

    // Shared drawer close buttons
    delegate(document, '[data-close-drawer]', 'click', (event, el) => {
      const drawer = el.closest('.drawer');
      if (drawer) closeDrawer(drawer);
      else closeAllDrawers();
    });

    // Shared modal close buttons
    delegate(document, '[data-close-modal]', 'click', (event, el) => {
      const backdrop = el.closest('.modal-backdrop');
      if (backdrop) closeModal(backdrop);
    });

    // Cart badge
    delegate(document, '[data-open-cart]', 'click', (event) => {
      event.preventDefault();
      if (typeof LUMEN.openCartDrawer === 'function') LUMEN.openCartDrawer();
    });

    // Sign-out from anywhere in the storefront shell (mobile drawer, header
    // quick panel, profile head). The account panel binds its own copy, so
    // ignore modals that already handle the event themselves. Redirect at once
    // so we never idle on a route that the session guard would bounce anyway.
    delegate(document, '[data-signout]', 'click', (event, el) => {
      if (el.closest('.modal')) return;
      event.preventDefault();
      const root = document.body.dataset.root || '';
      closeAllDrawers();
      LUMEN.auth.signOut();
      window.location.href = root + 'index.html';
    });

    // Count updates bubbling up from cart.js / wishlist.js
    document.addEventListener('lumen:cart', (e) => syncBadges('cart'));
    document.addEventListener('lumen:wishlist', (e) => syncBadges('wish'));
    document.addEventListener('lumen:auth', () => {
      syncBadges();
      updateAccountUI();
    });
  }

  /** Swap the account icon for a signed-in identity chip.
   *  The chip carries the name and an explicit role badge so it is always
   *  obvious whether a customer or an admin is signed in. */
  function updateAccountUI() {
    const btn = $('[data-open-account]');
    if (!btn) return;
    const user = session.get('session', null);

    if (user && user.name) {
      const isAdmin = String(user.role || '').toLowerCase() === 'admin';
      const first = String(user.name).trim().split(/\s+/)[0];
      btn.classList.add('is-signed-in', isAdmin ? 'is-admin' : 'is-customer');
      btn.innerHTML = `
        <span class="avatar avatar--sm">${escapeHtml(initials(user.name))}</span>
        <span class="account-chip">
          <span class="account-chip__name">${escapeHtml(first)}</span>
          <span class="badge ${isAdmin ? 'badge--warning' : 'badge--accent'} account-chip__role">${isAdmin ? 'Admin' : 'Customer'}</span>
        </span>`;
      btn.setAttribute('aria-label', `${isAdmin ? 'Admin' : 'Customer'} account — ${user.name}. Open account menu.`);
    } else {
      btn.classList.remove('is-signed-in', 'is-admin', 'is-customer');
      btn.innerHTML = `${icon('user', 20)}<span class="account-chip__signin">Sign in</span>`;
      btn.setAttribute('aria-label', 'Sign in to your account');
    }

    // The mobile drawer carries its own copy of the same state.
    const mobile = $('[data-mobile-account]');
    if (mobile) {
      if (user && user.name) {
        const isAdmin = String(user.role || '').toLowerCase() === 'admin';
        mobile.innerHTML = `
          <div class="account-panel__head">
            <span class="avatar avatar--sm">${escapeHtml(initials(user.name))}</span>
            <div>
              <p class="fw-6">${escapeHtml(user.name)}</p>
              <p class="muted" style="font-size:var(--fs-sm)">${escapeHtml(user.email || '')}</p>
            </div>
          </div>
          <div class="account-panel__role">
            <span class="badge ${isAdmin ? 'badge--warning' : 'badge--accent'}">${isAdmin ? 'Admin' : 'Customer'}</span>
            <span class="muted" style="font-size:var(--fs-xs)">Signed in</span>
          </div>
          <div class="account-panel__links">
            <a class="drawer-line" href="${document.body.dataset.root || ''}profile.html">Profile &amp; settings<span class="drawer-line__chev">${icon('chevronRight', 16)}</span></a>
            <a class="drawer-line" href="${document.body.dataset.root || ''}orders.html">Order history<span class="drawer-line__chev">${icon('chevronRight', 16)}</span></a>
            ${isAdmin ? `<a class="drawer-line" href="${document.body.dataset.root || ''}admin/index.html">Admin dashboard<span class="drawer-line__chev">${icon('chevronRight', 16)}</span></a>` : ''}
          </div>
          <button class="btn btn--outline btn--block" type="button" data-signout>${icon('logout', 16)} Sign out</button>`;
      } else {
        mobile.innerHTML = `
          <p class="muted" style="font-size:var(--fs-sm)">You are browsing as a guest.</p>
          <a class="btn btn--dark btn--block" href="${document.body.dataset.root || ''}login.html">${icon('user', 16)} Sign in</a>
          <a class="btn btn--outline btn--block" href="${document.body.dataset.root || ''}signup.html">Create an account</a>`;
      }
    }
  }

  LUMEN.session = {
    current() {
      return session.get('session', null);
    },
    set(user) {
      session.save('session', user);
      document.dispatchEvent(new CustomEvent('lumen:auth', { detail: { user } }));
    },
    clear() {
      session.remove('session');
      document.dispatchEvent(new CustomEvent('lumen:auth', { detail: { user: null } }));
    }
  };

  /* =====================================================================
     18. BOOT
     ===================================================================== */

  function boot() {
    initTheme();
    ensureSeed();

    const root = document.body.dataset.root || '';
    const page = document.body.dataset.page || '';

    // Static pages mark icons with data-icon instead of hard-coding SVG.
    $$('[data-icon]').forEach((el) => {
      const name = el.dataset.icon;
      const size = Number(el.dataset.iconSize || 20);
      el.innerHTML = icon(name, size, el.dataset.iconClass || '');
    });

    const headerSlot = $('[data-slot="header"]');
    if (headerSlot) {
      headerSlot.outerHTML =
        buildHeader() +
        '<div class="drawer-backdrop" data-drawer-backdrop></div>' +
        buildMobileNav() +
        buildMobileTabbar();
    }

    const footerSlot = $('[data-slot="footer"]');
    if (footerSlot) footerSlot.outerHTML = buildFooter();

    const backdrop = $('[data-drawer-backdrop]');
    if (backdrop) backdrop.addEventListener('click', () => closeAllDrawers());

    initHeader();
    initGlobalEvents();
    syncBadges();
    syncWishStates();
    updateAccountUI();
    initReveal();

    if (root) document.body.dataset.rootReady = root;
    document.body.classList.add('is-booted');
    document.dispatchEvent(new CustomEvent('lumen:ready', { detail: { page, root } }));
  }

  LUMEN.boot = boot;
  LUMEN.onReady = function (fn) {
    if (document.body.classList.contains('is-booted')) fn();
    else document.addEventListener('lumen:ready', fn, { once: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
