/* ==========================================================================
   LUMEN — Authentication
   js/auth.js
   --------------------------------------------------------------------------
   · Sign in / sign up / sign out against the `lumen:users` collection
   · Session stored in sessionStorage via LUMEN.session
   · Route guards for profile.html, orders.html and the admin area
   · Shared "account" panel used by the header on auth-gated pages
   --------------------------------------------------------------------------
   ⚠ DEMO ONLY. Credentials live in the browser and passwords are compared in
     plain text. This is a front-end prototype, not an authentication system.
   ========================================================================== */

(function (global) {
  'use strict';

  const LUMEN = global.LUMEN;
  const { getData, saveData } = LUMEN.store;
  const { escapeHtml, $ } = LUMEN.dom;
  const { initials, money } = LUMEN.fmt;
  const icon = LUMEN.icon;

  /* =====================================================================
     1. USER DIRECTORY
     ===================================================================== */

  function users() {
    const list = getData('users', []);
    return Array.isArray(list) ? list : [];
  }

  function setUsers(next) {
    saveData('users', next);
  }

  const normalise = (value) => String(value || '').trim().toLowerCase();

  function findByEmail(email) {
    const key = normalise(email);
    return users().find((u) => normalise(u.email) === key) || null;
  }

  function findById(id) {
    return users().find((u) => u.id === id) || null;
  }

  function emailTaken(email) {
    return Boolean(findByEmail(email));
  }

  /* =====================================================================
     2. VALIDATION
     ===================================================================== */

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
  const PHONE_RE = /^[6-9]\d{9}$/;

  /** Strip spaces and the +91 prefix so `+91 90000 12345` passes. */
  function normalisePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return '+91 ' + digits.slice(2, 4) + ' ' + digits.slice(4, 9) + ' ' + digits.slice(9);
    if (digits.length === 10) return '+91 ' + digits.slice(0, 5) + ' ' + digits.slice(5);
    return String(value || '').trim();
  }

  function passwordScore(value) {
    const pass = String(value || '');
    let score = 0;
    if (pass.length >= 8) score += 1;
    if (pass.length >= 12) score += 1;
    if (/[a-z]/.test(pass) && /[A-Z]/.test(pass)) score += 1;
    if (/\d/.test(pass)) score += 1;
    if (/[^\w\s]/.test(pass)) score += 1;
    return Math.min(score, 4);
  }

  const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Strong', 'Excellent'];

  function passwordHint(value) {
    const score = passwordScore(value);
    return { score, label: STRENGTH_LABELS[score], percent: (score / 4) * 100 };
  }

  /* =====================================================================
     3. SESSION
     ===================================================================== */

  function currentUser() {
    return LUMEN.session.current();
  }

  function isSignedIn() {
    return Boolean(currentUser());
  }

  function isAdmin() {
    const user = currentUser();
    return Boolean(user && user.role === 'admin');
  }

  /**
   * Sign a user in.
   * @returns {{ok:boolean, user?:object, message?:string, blocked?:boolean}}
   */
  function signIn(email, password, opts) {
    const o = opts || {};
    const user = findByEmail(email);

    if (!user) {
      return { ok: false, message: 'We could not find an account with that email address.' };
    }
    if (user.password !== String(password || '')) {
      return { ok: false, message: 'That password does not match our records.' };
    }
    if (user.status === 'blocked') {
      return { ok: false, blocked: true, message: 'This account has been blocked. Contact support@lumen.in for help.' };
    }

    if (!o.quiet) LUMEN.toast('Signed in', 'success', `Welcome back, ${user.name.split(' ')[0]}`);
    LUMEN.session.set({ id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone || '' });

    // Remember the shopper's last session for the rest of the tab.
    saveData('lastEmail', user.email);
    return { ok: true, user };
  }

  /**
   * Create an account and sign in immediately.
   * @returns {{ok:boolean, user?:object, errors?:object, message?:string}}
   */
  function signUp(details) {
    const d = details || {};
    const name = String(d.name || '').trim();
    const email = normalise(d.email);
    const phone = normalisePhone(d.phone);
    const password = String(d.password || '');
    const confirm = String(d.confirm || '');
    const acceptTerms = Boolean(d.acceptTerms);

    const errors = {};

    if (name.length < 2) errors.name = 'Please enter your full name.';
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
    else if (emailTaken(email)) errors.email = 'An account already exists with that email. Try signing in.';
    if (d.phone && !PHONE_RE.test(String(d.phone).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, ''))) {
      errors.phone = 'Enter a valid 10-digit Indian mobile number.';
    }
    if (password.length < 8) errors.password = 'Use at least 8 characters.';
    else if (passwordScore(password) < 2) errors.password = 'Mix upper and lower case letters, or add a number.';
    if (confirm !== password) errors.confirm = 'Passwords do not match.';
    if (!acceptTerms) errors.acceptTerms = 'Please accept the terms to continue.';

    if (Object.keys(errors).length) {
      return { ok: false, errors, message: 'Please fix the highlighted fields.' };
    }

    const user = {
      id: LUMEN.fmt.uid('USR'),
      name,
      email,
      password,
      role: 'customer',
      phone,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    setUsers(users().concat([user]));

    // Keep the admin customer table in step with the accounts collection.
    const customers = getData('customers', []);
    if (Array.isArray(customers)) {
      saveData(
        'customers',
        customers.concat([
          {
            id: user.id,
            name: user.name,
            email: user.email,
            phone: user.phone,
            role: 'customer',
            joined: user.createdAt,
            status: 'active',
            orders: 0,
            spent: 0,
            city: '—'
          }
        ])
      );
    }

    LUMEN.session.set({ id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone });
    saveData('lastEmail', user.email);
    LUMEN.toast('Welcome to Lumen', 'success', `Your account is ready, ${name.split(' ')[0]}`);
    return { ok: true, user };
  }

  function signOut(opts) {
    const o = opts || {};
    const name = currentUser() ? currentUser().name : '';
    LUMEN.session.clear();
    if (!o.silent) LUMEN.toast('Signed out', 'info', name ? `See you soon, ${name.split(' ')[0]}` : '');
  }

  function updateProfile(patch) {
    const session = currentUser();
    if (!session) return { ok: false, message: 'You are not signed in.' };
    const list = users();
    const idx = list.findIndex((u) => u.id === session.id);
    if (idx === -1) return { ok: false, message: 'Account not found.' };

    const next = Object.assign({}, list[idx], patch);
    list[idx] = next;
    setUsers(list);

    LUMEN.session.set({ id: next.id, name: next.name, email: next.email, role: next.role, phone: next.phone || '' });

    const customers = getData('customers', []);
    if (Array.isArray(customers)) {
      const ci = customers.findIndex((c) => c.id === next.id);
      if (ci > -1) {
        customers[ci] = Object.assign({}, customers[ci], { name: next.name, email: next.email, phone: next.phone });
        saveData('customers', customers);
      }
    }
    return { ok: true, user: next };
  }

  function changePassword(current, next) {
    const session = currentUser();
    if (!session) return { ok: false, message: 'You are not signed in.' };
    const user = findById(session.id);
    if (!user) return { ok: false, message: 'Account not found.' };
    if (user.password !== String(current || '')) return { ok: false, field: 'current', message: 'Your current password is incorrect.' };
    if (String(next || '').length < 8) return { ok: false, field: 'next', message: 'Use at least 8 characters.' };

    const list = users();
    list[list.findIndex((u) => u.id === user.id)].password = next;
    setUsers(list);
    return { ok: true };
  }

  /* =====================================================================
     4. ORDERS FOR A USER
     ===================================================================== */

  function ordersFor(user) {
    const who = user || currentUser();
    if (!who) return [];
    const all = getData('orders', []);
    if (!Array.isArray(all)) return [];
    return all.filter((o) => o.userId === who.id || normalise(o.userEmail) === normalise(who.email));
  }

  function orderById(id) {
    return (getData('orders', []) || []).find((o) => o.id === id) || null;
  }

  /* =====================================================================
     5. ADDRESS BOOK
     ===================================================================== */

  function addresses() {
    const list = getData('addresses', null);
    if (Array.isArray(list)) return list;
    const seed = [
      {
        id: LUMEN.fmt.uid('ADR'),
        label: 'Home',
        name: 'Riya Sharma',
        line1: '402, Fern Residency, 14th Cross, Koramangala',
        line2: '',
        city: 'Bengaluru',
        state: 'Karnataka',
        postal: '560034',
        country: 'India',
        phone: '+91 90000 12345',
        default: true
      }
    ];
    saveData('addresses', seed);
    return seed;
  }

  function saveAddress(address) {
    const list = addresses().slice();
    if (address.default) list.forEach((a) => { a.default = false; });
    let saved;
    if (address.id) {
      const idx = list.findIndex((a) => a.id === address.id);
      if (idx > -1) {
        list[idx] = Object.assign({}, list[idx], address);
        saved = list[idx];
      } else {
        saved = Object.assign({ id: LUMEN.fmt.uid('ADR') }, address);
        list.push(saved);
      }
    } else {
      saved = Object.assign({ id: LUMEN.fmt.uid('ADR') }, address);
      if (!list.length) saved.default = true;
      list.push(saved);
    }
    saveData('addresses', list);
    return saved;
  }

  function deleteAddress(id) {
    const list = addresses().filter((a) => a.id !== id);
    if (list.length && !list.some((a) => a.default)) list[0].default = true;
    saveData('addresses', list);
    return list;
  }

  function defaultAddress() {
    const list = addresses();
    return list.find((a) => a.default) || list[0] || null;
  }

  /* =====================================================================
     6. ROUTE GUARDS
     ===================================================================== */

  /** Where to send the shopper after a successful sign-in. */
  function nextUrl(fallback) {
    const params = new URLSearchParams(global.location.search);
    const next = params.get('next') || params.get('redirect');
    if (!next) return fallback || 'profile.html';
    // Only allow same-site relative paths.
    if (/^https?:|^\/\//i.test(next)) return fallback || 'profile.html';
    return next.replace(/^\.?\//, '');
  }

  function requireAuth(o) {
    const opts = o || {};
    const user = currentUser();
    if (user) return true;
    if (opts.redirect === false) return false;

    const target = global.location.pathname.split('/').pop() || 'profile.html';
    const next = `login.html?next=${encodeURIComponent(target + global.location.search)}`;
    LUMEN.toast('Please sign in to continue', 'info');
    global.location.replace(next);
    return false;
  }

  function requireAdmin() {
    const user = currentUser();
    if (user && user.role === 'admin') return true;

    if (user) {
      LUMEN.toast('Admin access only', 'error', 'Your account does not have dashboard permissions');
      global.location.replace('login.html');
      return false;
    }

    const target = global.location.pathname.split('/').pop() || 'index.html';
    LUMEN.toast('Sign in to the admin portal', 'info');
    global.location.replace(`login.html?next=${encodeURIComponent(target)}`);
    return false;
  }

  /* =====================================================================
     7. ACCOUNT PANEL
     ===================================================================== */

  /** Signed-in quick menu shown when the account button is pressed. */
  function openAccountPanel() {
    const user = currentUser();
    if (!user) {
      global.location.href = 'login.html';
      return;
    }

    const list = ordersFor(user);
    const spent = list.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const root = document.body.dataset.root || '';
    const isAdmin = String(user.role || '').toLowerCase() === 'admin';

    LUMEN.modal.open({
      title: 'Your account',
      size: 'sm',
      body: `
        <div class="account-panel">
          <div class="account-panel__head">
            <span class="avatar avatar--lg">${escapeHtml(initials(user.name))}</span>
            <div>
              <p class="fw-6">${escapeHtml(user.name)}</p>
              <p class="muted" style="font-size:var(--fs-sm)">${escapeHtml(user.email)}</p>
            </div>
          </div>

          <div class="account-panel__role">
            <span class="badge ${isAdmin ? 'badge--warning' : 'badge--accent'}">${isAdmin ? 'Admin' : 'Customer'}</span>
            <span class="muted" style="font-size:var(--fs-xs)">Signed in</span>
          </div>

          <div class="account-panel__stats">
            <div><span>${list.length}</span><small>Orders</small></div>
            <div><span>${money(spent)}</span><small>Spent</small></div>
            <div><span>${LUMEN.wishlist ? LUMEN.wishlist.items().length : 0}</span><small>Saved</small></div>
          </div>

          <nav class="account-panel__links">
            <a class="drawer-line" href="${root}profile.html">Profile &amp; settings ${icon('chevronRight', 16)}</a>
            <a class="drawer-line" href="${root}orders.html">Order history ${icon('chevronRight', 16)}</a>
            <a class="drawer-line" href="${root}wishlist.html">Wishlist ${icon('chevronRight', 16)}</a>
            ${isAdmin ? `<a class="drawer-line" href="${root}admin/index.html">Admin dashboard ${icon('chevronRight', 16)}</a>` : ''}
          </nav>

          <button class="btn btn--outline btn--block mt-4" type="button" data-signout>${icon('logout', 16)} Sign out</button>
        </div>`,
      onMount(el, api) {
        el.querySelector('[data-signout]').addEventListener('click', () => {
          api.close();
          const back = document.body.dataset.page === 'profile' ? 'profile.html' : 'index.html';
          signOut();
          setTimeout(() => { global.location.href = back; }, 400);
        });
      }
    });
  }

  /* =====================================================================
     8. FORM WIRING — login.html
     ===================================================================== */

  function initLoginPage() {
    const form = $('#loginForm');
    if (!form) return;
    const root = document.body.dataset.root || '';
    const lastEmail = getData('lastEmail', '');
    const emailInput = form.querySelector('#loginEmail');

    if (lastEmail && emailInput && !emailInput.value) emailInput.value = lastEmail;

    const pwInput = form.querySelector('#loginPassword');
    if (pwInput) {
      pwInput.addEventListener('input', () => form.classList.toggle('is-valid', pwInput.value.length > 0));
    }

    LUMEN.dom.delegate(document, '[data-forgot]', 'click', (event) => {
      event.preventDefault();
      LUMEN.toast('Password reset is not available', 'info', 'This demo stores accounts locally, so there is no password to reset.');
    });

    LUMEN.dom.delegate(form, '[data-fill]', 'click', (event, el) => {
      event.preventDefault();
      const target = form.querySelector(`#${el.dataset.fill}`);
      if (target) {
        target.value = el.dataset.value;
        target.dispatchEvent(new Event('input'));
        target.focus();
      }
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = form.querySelector('#loginEmail').value.trim();
      const password = form.querySelector('#loginPassword').value;
      const asAdmin = form.querySelector('#loginAsAdmin');
      const remember = form.querySelector('#loginRemember');

      if (remember && remember.checked) saveData('lastEmail', email);
      else if (remember) removeDataSafe('lastEmail');

      const result = signIn(email, password, { quiet: true });

      if (!result.ok) {
        LUMEN.toast('Sign in failed', 'error', result.message);
        form.classList.add('is-error');
        setTimeout(() => form.classList.remove('is-error'), 900);
        return;
      }

      if (asAdmin && asAdmin.checked && result.user.role !== 'admin') {
        signOut({ silent: true });
        LUMEN.toast('Not an admin account', 'error', 'Use admin@lumen.in for the dashboard');
        return;
      }

      if (remember && remember.checked) LUMEN.toast('Signed in', 'success', `Welcome back, ${result.user.name.split(' ')[0]}`);

      const dest = asAdmin && asAdmin.checked ? 'index.html' : nextUrl('profile.html');
      global.location.href = root + dest;
    });
  }

  function removeDataSafe(key) {
    LUMEN.store.removeData(key);
  }

  /* =====================================================================
     9. FORM WIRING — signup.html
     ===================================================================== */

  function initSignupPage() {
    const form = $('#signupForm');
    if (!form) return;
    const root = document.body.dataset.root || '';

    const password = form.querySelector('#signupPassword');
    const meter = form.querySelector('[data-strength-meter]');
    const meterLabel = form.querySelector('[data-strength-label]');

    if (password && meter) {
      password.addEventListener('input', () => {
        const hint = passwordHint(password.value);
        meter.style.setProperty('--strength', `${hint.percent}%`);
        meter.className = 'pw-meter__bar' + (hint.score >= 3 ? ' is-strong' : hint.score === 2 ? ' is-fair' : ' is-weak');
        if (meterLabel) meterLabel.textContent = password.value ? hint.label : '';
      });
    }

    form.querySelectorAll('[data-toggle-pw]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = form.querySelector(`#${btn.dataset.togglePw}`);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        btn.classList.toggle('is-open', show);
      });
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      form.querySelectorAll('.field__error').forEach((n) => { n.textContent = ''; });
      form.querySelectorAll('.is-invalid').forEach((n) => n.classList.remove('is-invalid'));

      const data = {
        name: value('#signupName'),
        email: value('#signupEmail'),
        phone: value('#signupPhone'),
        password: value('#signupPassword'),
        confirm: value('#signupConfirm'),
        acceptTerms: Boolean(form.querySelector('#signupTerms') && form.querySelector('#signupTerms').checked)
      };

      const result = signUp(data);

      if (!result.ok) {
        Object.keys(result.errors).forEach((field) => {
          const input = form.querySelector(`[name="${field}"]`) || form.querySelector(`#signup${field[0].toUpperCase()}${field.slice(1)}`);
          const error = form.querySelector(`[data-error="${field}"]`);
          if (error) error.textContent = result.errors[field];
          if (input) {
            input.classList.add('is-invalid');
            input.setAttribute('aria-invalid', 'true');
          }
        });
        LUMEN.toast('Could not create your account', 'error', result.message);
        const firstBad = form.querySelector('.is-invalid');
        if (firstBad) firstBad.focus();
        return;
      }

      global.location.href = root + nextUrl('profile.html?welcome=1');
    });

    function value(selector) {
      const node = form.querySelector(selector);
      return node ? node.value : '';
    }
  }

  /* =====================================================================
     10. FORM WIRING — admin/login.html
     ===================================================================== */

  /** Values behind the one-tap fill buttons on the demo credentials list. */
  const DEMO_FILL = {
    adminEmail: 'admin@lumen.in',
    adminPassword: 'Admin@2026',
    adminCode: 'LUMEN-2026'
  };

  function initAdminLoginPage() {
    const form = $('#adminLoginForm');
    if (!form) return;
    const root = document.body.dataset.root || '../';

    LUMEN.dom.delegate(form, '[data-fill-admin]', 'click', (event, el) => {
      event.preventDefault();
      const target = form.querySelector(`#${el.dataset.fillAdmin}`);
      if (!target) return;
      target.value = DEMO_FILL[el.dataset.fillAdmin] || '';
      target.dispatchEvent(new Event('input'));
      target.focus();
    });

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = form.querySelector('#adminEmail').value.trim();
      const password = form.querySelector('#adminPassword').value;
      const code = form.querySelector('#adminCode');
      const expected = getData('adminCode', 'LUMEN-2026');

      if (code && code.value.trim().toUpperCase() !== String(expected).toUpperCase()) {
        LUMEN.toast('Invalid access code', 'error', 'The demo access code is LUMEN-2026');
        code.classList.add('is-invalid');
        return;
      }

      const result = signIn(email, password, { quiet: true });
      if (!result.ok) {
        LUMEN.toast('Admin sign in failed', 'error', result.message);
        form.classList.add('is-error');
        setTimeout(() => form.classList.remove('is-error'), 900);
        return;
      }
      if (result.user.role !== 'admin') {
        signOut({ silent: true });
        LUMEN.toast('Access denied', 'error', 'This account is not an administrator');
        return;
      }

      LUMEN.toast('Signed in as admin', 'success', `Welcome, ${result.user.name.split(' ')[0]}`);
      setTimeout(() => { global.location.href = root + 'index.html'; }, 500);
    });
  }

  /* =====================================================================
     11. EXPORTS + BOOT
     ===================================================================== */

  LUMEN.auth = {
    users,
    findByEmail,
    findById,
    emailTaken,
    currentUser,
    isSignedIn,
    isAdmin,
    signIn,
    signUp,
    signOut,
    updateProfile,
    changePassword,
    passwordHint,
    passwordScore,
    normalisePhone,
    ordersFor,
    orderById,
    addresses,
    saveAddress,
    deleteAddress,
    defaultAddress,
    requireAuth,
    requireAdmin,
    nextUrl,
    openAccountPanel,
    EMAIL_RE
  };

  LUMEN.onReady(() => {
    initLoginPage();
    initSignupPage();
    initAdminLoginPage();
  });
})(window);
