/* ==========================================================================
   LUMEN — Profile, Orders & Account Settings
   js/profile.js
   --------------------------------------------------------------------------
   Drives profile.html and orders.html.
     · tabbed account page (details / addresses / security / preferences)
     · order history with a live status timeline and a details modal
     · profile photo via FileReader (kept in localStorage as a data URL)
   ========================================================================== */

(function (global) {
  'use strict';

  const LUMEN = global.LUMEN;
  const { getData, saveData } = LUMEN.store;
  const { escapeHtml, $, $$ } = LUMEN.dom;
  const { money, num, formatDate, formatDateTime, initials } = LUMEN.fmt;
  const icon = LUMEN.icon;
  const D = () => LUMEN.data;

  // Order helpers (status pills, timeline, invoices, status writes) now live
  // in app.js so the admin area can reuse them without loading this file.
  const STATUS_FLOW = LUMEN.orders.STATUS_FLOW;

  /* =====================================================================
     1. PROFILE PHOTO
     ===================================================================== */

  const MAX_AVATAR_BYTES = 180000;

  function avatarData() {
    return getData('avatar', null);
  }

  function avatarMarkup(user, size) {
    const src = avatarData();
    if (src) return `<img class="avatar avatar--${size || 'lg'}" src="${src}" alt="">`;
    return `<span class="avatar avatar--${size || 'lg'}">${escapeHtml(initials(user ? user.name : '?'))}</span>`;
  }

  function pickAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 1024 * 1024) {
        LUMEN.toast('Image too large', 'error', 'Pick a picture under 1 MB');
        return;
      }
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        // Downscale to a small square so localStorage does not overflow.
        const img = new Image();
        img.addEventListener('load', () => {
          const size = 128;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          const min = Math.min(img.width, img.height);
          ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
          let url = canvas.toDataURL('image/jpeg', 0.8);
          // Quality-step down until the data URL fits the storage budget.
          let quality = 0.8;
          while (url.length > MAX_AVATAR_BYTES && quality > 0.3) {
            quality -= 0.1;
            url = canvas.toDataURL('image/jpeg', quality);
          }
          saveData('avatar', url);
          paintAvatars();
          LUMEN.toast('Photo updated', 'success');
        });
        img.src = reader.result;
      });
      reader.readAsDataURL(file);
    });
    input.click();
  }

  function paintAvatars() {
    const src = avatarData();
    $$('[data-avatar-slot]').forEach((slot) => {
      const user = LUMEN.auth.currentUser();
      slot.innerHTML = src
        ? `<img class="avatar avatar--${slot.dataset.avatarSlot || 'lg'}" src="${src}" alt="">`
        : `<span class="avatar avatar--${slot.dataset.avatarSlot || 'lg'}">${escapeHtml(initials(user ? user.name : '?'))}</span>`;
    });
  }

  /* =====================================================================
     2. ORDERS
     ===================================================================== */

  function allOrders() {
    return LUMEN.orders.all();
  }

  function myOrders() {
    return LUMEN.auth.ordersFor().slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  function orderTotals(order) {
    return { itemCount: LUMEN.orders.itemCount(order) };
  }

  const statusPill = (status) => LUMEN.orders.statusPill(status);
  const timelineMarkup = (order) => LUMEN.orders.timeline(order);
  const downloadInvoice = (order) => LUMEN.orders.downloadInvoice(order);
  const setOrderStatus = (id, status) => LUMEN.orders.setStatus(id, status);

  function orderCard(order) {
    const { itemCount } = orderTotals(order);
    return `
      <article class="order-card" data-order-id="${escapeHtml(order.id)}">
        <header class="order-card__head">
          <div>
            <p class="order-card__id">${escapeHtml(order.id)}</p>
            <p class="muted" style="font-size:var(--fs-xs)">Placed ${formatDateTime(order.date)}</p>
          </div>
          ${statusPill(order.status)}
        </header>

        <div class="order-card__body">
          <ul class="order-card__items">
            ${order.items
              .slice(0, 4)
              .map(
                (line) => `
              <li>
                <img src="${D().imageUrl(line.image)}" alt="" width="58" height="58" loading="lazy">
                <div>
                  <p class="fw-6" style="font-size:var(--fs-sm)">${escapeHtml(line.name)}</p>
                  ${line.variant ? `<p class="muted" style="font-size:var(--fs-xs)">${escapeHtml(line.variant)}</p>` : ''}
                  <p class="muted" style="font-size:var(--fs-xs)">Qty ${line.qty}</p>
                </div>
              </li>`
              )
              .join('')}
            ${order.items.length > 4 ? `<li class="muted">+ ${order.items.length - 4} more item${order.items.length - 4 === 1 ? '' : 's'}</li>` : ''}
          </ul>

          <div class="order-card__meta">
            <div><span class="field__label">Items</span><p>${num(itemCount)}</p></div>
            <div><span class="field__label">Payment</span><p>${escapeHtml(order.payment.method)} · ${escapeHtml(order.payment.status)}</p></div>
            <div><span class="field__label">Total</span><p class="fw-6">${money(order.total)}</p></div>
          </div>
        </div>

        <footer class="order-card__foot">
          <button class="btn btn--outline btn--sm" type="button" data-track-order="${escapeHtml(order.id)}">${icon('truck', 15)} Track</button>
          <button class="btn btn--ghost btn--sm" type="button" data-order-details="${escapeHtml(order.id)}">View details</button>
          <button class="btn btn--ghost btn--sm" type="button" data-invoice="${escapeHtml(order.id)}">${icon('download', 15)} Invoice</button>
          ${
            order.status === 'Delivered'
              ? `<button class="btn btn--ghost btn--sm" type="button" data-return-order="${escapeHtml(order.id)}">Return or exchange</button>`
              : `<button class="btn btn--ghost btn--sm" type="button" data-cancel-order="${escapeHtml(order.id)}">Cancel order</button>`
          }
        </footer>
      </article>`;
  }

  function openOrderModal(id) {
    const order = LUMEN.auth.orderById(id);
    if (!order) {
      LUMEN.toast('Order not found', 'error');
      return;
    }
    const { itemCount } = orderTotals(order);

    LUMEN.modal.open({
      title: `Order ${order.id}`,
      subtitle: `Placed ${formatDateTime(order.date)} · ${itemCount} item${itemCount === 1 ? '' : 's'}`,
      size: 'lg',
      body: `
        <div class="row row--between row--wrap gap-3 mb-4">
          ${statusPill(order.status)}
          <span class="muted" style="font-size:var(--fs-sm)">Payment: ${escapeHtml(order.payment.method)} · ${escapeHtml(order.payment.status)}${order.payment.ref ? ' · Ref ' + escapeHtml(order.payment.ref) : ''}</span>
        </div>

        ${timelineMarkup(order)}

        <h3 class="mt-6 mb-3">Items</h3>
        <ul class="checkout-items">
          ${order.items
            .map(
              (line) => `
            <li>
              <img src="${D().imageUrl(line.image)}" alt="" width="52" height="52" loading="lazy">
              <div>
                <p class="checkout-items__name">${escapeHtml(line.name)}</p>
                <p class="checkout-items__meta">${line.variant ? escapeHtml(line.variant) + ' · ' : ''}Qty ${line.qty} · ${money(line.price)} each</p>
              </div>
              <span>${money(line.price * line.qty)}</span>
            </li>`
            )
            .join('')}
        </ul>

        <div class="grid grid--2 mt-6">
          <div>
            <h3 class="mb-3">Delivery address</h3>
            <p class="muted">${escapeHtml(order.address.name)}<br>${escapeHtml(order.address.line1)}${order.address.line2 ? '<br>' + escapeHtml(order.address.line2) : ''}<br>${escapeHtml(order.address.city)}, ${escapeHtml(order.address.state)} ${escapeHtml(order.address.postal)}<br>${escapeHtml(order.address.phone || '')}</p>
          </div>
          <div>
            <h3 class="mb-3">Payment summary</h3>
            <div class="totals">
              <div class="totals__row"><span>Subtotal</span><strong>${money(order.subtotal)}</strong></div>
              ${order.discount ? `<div class="totals__row totals__row--discount"><span>Discount${order.coupon ? ' (' + escapeHtml(order.coupon) + ')' : ''}</span><strong>− ${money(order.discount)}</strong></div>` : ''}
              <div class="totals__row"><span>Shipping</span><strong>${order.shipping === 0 ? 'Free' : money(order.shipping)}</strong></div>
              ${order.codFee ? `<div class="totals__row"><span>COD handling</span><strong>${money(order.codFee)}</strong></div>` : ''}
              <div class="totals__row"><span>GST (included)</span><strong>${money(order.tax || 0)}</strong></div>
              <div class="totals__row totals__row--grand"><span>Total</span><strong>${money(order.total)}</strong></div>
            </div>
          </div>
        </div>`,
      footer: `
        <button class="btn btn--secondary" type="button" data-close-modal>Close</button>
        <a class="btn btn--primary" href="product.html?id=${escapeHtml(order.items[0] ? order.items[0].id : '')}">Buy it again</a>`,
      onMount(el, api) {
        const repeat = el.querySelector('.modal__foot .btn--primary');
        if (repeat && !order.items.length) repeat.remove();
      }
    });
  }

  /* =====================================================================
     3. ORDERS PAGE
     ===================================================================== */

  function renderOrdersPage() {
    const root = $('[data-orders-root]');
    if (!root) return;
    const orders = myOrders();
    const filters = $('[data-order-filters]');
    const search = $('[data-order-search]');
    const query = search ? search.value.trim().toLowerCase() : '';
    const active = filters ? (filters.querySelector('[data-order-filter]:checked') || {}).value : 'all';

    const list = orders.filter((order) => {
      if (active !== 'all' && order.status.toLowerCase() !== active) return false;
      if (!query) return true;
      return (
        order.id.toLowerCase().includes(query) ||
        order.items.some((line) => line.name.toLowerCase().includes(query)) ||
        (order.status || '').toLowerCase().includes(query)
      );
    });

    const label = $('[data-orders-count-label]');
    if (label) label.textContent = list.length ? `${num(list.length)} order${list.length === 1 ? '' : 's'}` : 'No orders match';

    if (!orders.length) {
      root.innerHTML = LUMEN.ui.emptyState({
        icon: 'package',
        title: 'No orders yet.',
        message: 'When you place an order it will appear here, with live tracking and downloadable invoices.',
        actionLabel: 'Start shopping',
        actionHref: 'shop.html'
      });
      return;
    }

    if (!list.length) {
      root.innerHTML = LUMEN.ui.emptyState({
        icon: 'search',
        title: 'No matching orders.',
        message: 'Try a different order number, product name or status filter.',
        actionLabel: 'Clear filters',
        actionHref: 'orders.html'
      });
      return;
    }

    root.innerHTML = list.map(orderCard).join('');
  }

  function initOrdersEvents() {
    const root = $('[data-orders-root]');
    if (!root) return;

    const search = $('[data-order-search]');
    if (search) search.addEventListener('input', LUMEN.fmt.debounce(renderOrdersPage, 180));

    const filters = $('[data-order-filters]');
    if (filters) {
      filters.addEventListener('change', renderOrdersPage);
    }

    const clear = $('[data-orders-clear]');
    if (clear) clear.addEventListener('click', () => { if (search) search.value = ''; renderOrdersPage(); });

    root.addEventListener('click', async (event) => {
      const details = event.target.closest('[data-order-details]');
      if (details) {
        openOrderModal(details.dataset.orderDetails);
        return;
      }

      const track = event.target.closest('[data-track-order]');
      if (track) {
        const order = LUMEN.auth.orderById(track.dataset.trackOrder);
        if (!order) return;
        LUMEN.toast('Tracking ' + order.id, 'info', `Currently ${order.status.toLowerCase()}. Expected soon.`);
        return;
      }

      const invoice = event.target.closest('[data-invoice]');
      if (invoice) {
        downloadInvoice(LUMEN.auth.orderById(invoice.dataset.invoice));
        return;
      }

      const cancel = event.target.closest('[data-cancel-order]');
      if (cancel) {
        const order = LUMEN.auth.orderById(cancel.dataset.cancelOrder);
        const ok = await LUMEN.modal.confirm({
          title: `Cancel order ${order.id}?`,
          message: 'We will release the items back into stock. Any amount paid is refunded to the original payment method in 3–5 working days.',
          confirmLabel: 'Cancel order',
          cancelLabel: 'Keep order',
          danger: true
        });
        if (!ok) return;
        setOrderStatus(order.id, 'Cancelled');
        LUMEN.toast('Order cancelled', 'success', `${order.id} · refund initiated`);
        renderOrdersPage();
        return;
      }

      const ret = event.target.closest('[data-return-order]');
      if (ret) {
        const order = LUMEN.auth.orderById(ret.dataset.returnOrder);
        const ok = await LUMEN.modal.confirm({
          title: `Return ${order.id}?`,
          message: 'Returns are accepted within 7 days of delivery. Our courier will collect the parcel from your address at no cost.',
          confirmLabel: 'Start return',
          cancelLabel: 'Keep item'
        });
        if (!ok) return;
        setOrderStatus(order.id, 'Returned');
        LUMEN.toast('Return started', 'success', 'Pickup scheduled in 2 working days');
        renderOrdersPage();
      }
    });
  }

  /* =====================================================================
     4. PROFILE PAGE — TABS
     ===================================================================== */

  function profileStats(user) {
    const orders = myOrders();
    const spent = orders.filter((o) => o.status !== 'Cancelled').reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const since = user && user.createdAt ? new Date(user.createdAt) : null;
    return {
      orders: orders.length,
      spent,
      saved: LUMEN.wishlist ? LUMEN.wishlist.items().length : 0,
      memberSince: since && !isNaN(since.getTime()) ? formatDate(since) : 'Today'
    };
  }

  function renderDetailsTab(user) {
    const s = profileStats(user);
    const isAdmin = String(user.role || '').toLowerCase() === 'admin';
    return `
      <div class="profile-head">
        <div data-avatar-slot="xl"></div>
        <div class="profile-head__info">
          <h2>${escapeHtml(user.name)}</h2>
          <p class="muted">${escapeHtml(user.email)}}${user.phone ? ' · ' + escapeHtml(user.phone) : ''}</p>
          <p class="profile-head__badges">
            <span class="badge ${isAdmin ? 'badge--warning' : 'badge--accent'}">${isAdmin ? 'Admin' : 'Customer'}</span>
            <span class="badge badge--new">${isAdmin ? 'Administrator' : 'Member since ' + escapeHtml(s.memberSince)}</span>
          </p>
        </div>
        <div class="profile-head__actions">
          <button class="btn btn--outline btn--sm" type="button" data-avatar-pick>${icon('camera', 15)} Change photo</button>
          ${avatarData() ? `<button class="btn btn--ghost btn--sm" type="button" data-avatar-remove>Remove</button>` : ''}
          <button class="btn btn--danger btn--sm" type="button" data-signout>${icon('logout', 15)} Sign out</button>
        </div>
      </div>

      <div class="stat-strip mt-6">
        <div class="stat-strip__item"><strong>${num(s.orders)}</strong><span>Orders</span></div>
        <div class="stat-strip__item"><strong>${money(s.spent)}</strong><span>Total spent</span></div>
        <div class="stat-strip__item"><strong>${num(s.saved)}</strong><span>Saved items</span></div>
        <div class="stat-strip__item"><strong>${escapeHtml(s.memberSince)}</strong><span>Member since</span></div>
      </div>

      <form class="panel mt-6" id="detailsForm" novalidate>
        <h3 class="panel__title mb-4">Personal details</h3>
        <div class="grid grid--2">
          <div class="field">
            <label class="field__label" for="pfName">Full name</label>
            <input class="input" type="text" id="pfName" name="name" value="${escapeHtml(user.name)}" required>
            <p class="field__error" data-error="name" role="alert"></p>
          </div>
          <div class="field">
            <label class="field__label" for="pfEmail">Email address</label>
            <input class="input" type="email" id="pfEmail" name="email" value="${escapeHtml(user.email)}" required>
            <p class="field__error" data-error="email" role="alert"></p>
          </div>
          <div class="field">
            <label class="field__label" for="pfPhone">Mobile number</label>
            <input class="input" type="tel" id="pfPhone" name="phone" value="${escapeHtml(user.phone || '')}" placeholder="+91 90000 12345">
            <p class="field__error" data-error="phone" role="alert"></p>
          </div>
          <div class="field">
            <label class="field__label" for="pfCity">City</label>
            <input class="input" type="text" id="pfCity" name="city" value="${escapeHtml(user.city || '')}" placeholder="Bengaluru">
          </div>
        </div>
        <div class="row gap-3 mt-5">
          <button class="btn btn--primary" type="submit">Save changes</button>
          <button class="btn btn--ghost" type="button" data-reset-details>Reset</button>
        </div>
      </form>`;
  }

  function renderAddressesTab() {
    const list = LUMEN.auth.addresses();
    return `
      <div class="row row--between row--wrap gap-3 mb-4">
        <h3 class="panel__title">Saved addresses</h3>
        <button class="btn btn--outline btn--sm" type="button" data-address-add>${icon('plus', 15)} Add address</button>
      </div>

      ${
        list.length
          ? `<div class="address-grid">
              ${list
                .map(
                  (a) => `
                <article class="panel address-tile${a.default ? ' is-default' : ''}">
                  <div class="row row--between">
                    <strong>${escapeHtml(a.label || 'Address')}</strong>
                    ${a.default ? '<span class="badge badge--new">Default</span>' : ''}
                  </div>
                  <p class="muted mt-3" style="font-size:var(--fs-sm)">
                    ${escapeHtml(a.name)}<br>
                    ${escapeHtml(a.line1)}${a.line2 ? '<br>' + escapeHtml(a.line2) : ''}<br>
                    ${escapeHtml(a.city)}, ${escapeHtml(a.state)} ${escapeHtml(a.postal)}<br>
                    ${escapeHtml(a.phone || '')}
                  </p>
                  <div class="address-tile__actions">
                    <button class="icon-link" type="button" data-address-edit="${a.id}">${icon('edit', 14)} Edit</button>
                    <button class="icon-link" type="button" data-address-delete="${a.id}">${icon('trash', 14)} Delete</button>
                    ${a.default ? '' : `<button class="icon-link" type="button" data-address-default="${a.id}">${icon('check', 14)} Make default</button>`}
                  </div>
                </article>`
                )
                .join('')}
            </div>`
          : LUMEN.ui.emptyState({
              icon: 'pin',
              title: 'No saved addresses',
              message: 'Save an address to make checkout a one-tap affair.',
              actionLabel: 'Add an address',
              actionHref: 'checkout.html'
            })
      }`;
  }

  function renderSecurityTab(user) {
    return `
      <form class="panel" id="passwordForm" novalidate>
        <h3 class="panel__title mb-2">Change password</h3>
        <p class="muted mb-4" style="font-size:var(--fs-sm)">Demo only — passwords are stored unencrypted in this browser.</p>

        <div class="grid grid--2">
          <div class="field field--span">
            <label class="field__label" for="secCurrent">Current password</label>
            <input class="input" type="password" id="secCurrent" name="current" autocomplete="current-password" required>
            <p class="field__error" data-error="current" role="alert"></p>
          </div>
          <div class="field">
            <label class="field__label" for="secNext">New password</label>
            <input class="input" type="password" id="secNext" name="next" autocomplete="new-password" required>
            <div class="pw-meter"><div class="pw-meter__bar" data-strength-meter style="--strength:0%"></div></div>
            <p class="field__hint" data-strength-label></p>
            <p class="field__error" data-error="next" role="alert"></p>
          </div>
          <div class="field">
            <label class="field__label" for="secConfirm">Confirm new password</label>
            <input class="input" type="password" id="secConfirm" name="confirm" autocomplete="new-password" required>
            <p class="field__error" data-error="confirm" role="alert"></p>
          </div>
        </div>
        <button class="btn btn--primary mt-5" type="submit">Update password</button>
      </form>

      <div class="panel mt-5">
        <h3 class="panel__title mb-3">Active sessions</h3>
        <ul class="session-list">
          <li>
            <span>${icon('laptop', 18)}</span>
            <div><p class="fw-6" style="font-size:var(--fs-sm)">Chrome on Windows</p><p class="muted" style="font-size:var(--fs-xs)">Current session · Bengaluru, India</p></div>
            <span class="badge badge--new">This device</span>
          </li>
          <li>
            <span>${icon('phone', 18)}</span>
            <div><p class="fw-6" style="font-size:var(--fs-sm)">Lumen app on iPhone</p><p class="muted" style="font-size:var(--fs-xs)">Last active 3 days ago</p></div>
            <button class="btn btn--ghost btn--sm" type="button" data-revoke-session>Revoke</button>
          </li>
        </ul>
      </div>

      <div class="panel panel--danger mt-5">
        <h3 class="panel__title mb-2">Sign out everywhere</h3>
        <p class="muted mb-4" style="font-size:var(--fs-sm)">Ends this session on every device. Your orders and saved items are kept.</p>
        <button class="btn btn--danger" type="button" data-signout-all>${icon('logout', 16)} Sign out of Lumen</button>
      </div>`;
  }

  function renderPreferencesTab(user) {
    const prefs = getData('preferences', null) || {};
    const settings = Object.assign({}, D().SETTINGS_SEED, getData('settings', {}));
    return `
      <div class="panel">
        <h3 class="panel__title mb-4">Notifications</h3>
        <label class="check"><input type="checkbox" data-pref="orderUpdates" ${prefs.orderUpdates !== false ? 'checked' : ''}><span>Order status and delivery updates</span></label>
        <label class="check mt-3"><input type="checkbox" data-pref="offers" ${prefs.offers ? 'checked' : ''}><span>Offers, launches and price drops</span></label>
        <label class="check mt-3"><input type="checkbox" data-pref="backInStock" ${prefs.backInStock ? 'checked' : ''}><span>Back-in-stock alerts for saved items</span></label>
        <label class="check mt-3"><input type="checkbox" data-pref="whatsapp" ${prefs.whatsapp ? 'checked' : ''}><span>Delivery updates over WhatsApp</span></label>
      </div>

      <div class="panel mt-5">
        <h3 class="panel__title mb-4">Appearance</h3>
        <p class="muted mb-3" style="font-size:var(--fs-sm)">Currently using the ${escapeHtml(LUMEN.theme.get())} theme.</p>
        <div class="row gap-3">
          <button class="btn btn--outline" type="button" data-theme-set="light">${icon('sun', 16)} Light</button>
          <button class="btn btn--outline" type="button" data-theme-set="dark">${icon('moon', 16)} Dark</button>
        </div>
      </div>

      <div class="panel mt-5">
        <h3 class="panel__title mb-4">Shopping defaults</h3>
        <p class="muted mb-4" style="font-size:var(--fs-sm)">Read-only in the demo. Values come from the seeded store settings.</p>
        <div class="grid grid--2">
          <div class="field">
            <label class="field__label" for="prCurrency">Currency</label>
            <select class="select" id="prCurrency" disabled><option>₹ INR — Indian Rupee</option></select>
          </div>
          <div class="field">
            <label class="field__label" for="prShip">Free shipping threshold</label>
            <input class="input" type="text" id="prShip" value="Above ${money(settings.freeShippingOver)}" disabled>
          </div>
        </div>
      </div>`;
  }

  const TABS = [
    { key: 'details', label: 'Details' },
    { key: 'addresses', label: 'Addresses' },
    { key: 'security', label: 'Security' },
    { key: 'preferences', label: 'Preferences' }
  ];

  function renderProfilePage() {
    const user = LUMEN.auth.currentUser();
    if (!user) return;

    const host = $('[data-profile-root]');
    const tabsHost = $('[data-profile-tabs]');
    if (!host) return;

    const active = (tabsHost && (tabsHost.querySelector('[data-profile-tab].is-active') || {}).dataset) || { profileTab: 'details' };
    const key = active.profileTab || 'details';

    const renderers = {
      details: () => renderDetailsTab(user),
      addresses: renderAddressesTab,
      security: () => renderSecurityTab(user),
      preferences: () => renderPreferencesTab(user)
    };

    if (tabsHost) {
      tabsHost.innerHTML = TABS.map(
        (t) => `<button class="tab${t.key === key ? ' is-active' : ''}" type="button" data-profile-tab="${t.key}">${escapeHtml(t.label)}</button>`
      ).join('');
    }

    host.innerHTML = (renderers[key] || renderers.details)();
    paintAvatars();
    bindProfileTab(user);
  }

  function bindProfileTab(user) {
    const host = $('[data-profile-root]');
    if (!host) return;

    // --- details -----------------------------------------------------
    const details = host.querySelector('#detailsForm');
    if (details) {
      details.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = details.querySelector('#pfName').value.trim();
        const email = details.querySelector('#pfEmail').value.trim();
        const phone = details.querySelector('#pfPhone').value.trim();
        const city = details.querySelector('#pfCity').value.trim();

        const errors = {};
        if (name.length < 2) errors.name = 'Please enter your full name.';
        if (!LUMEN.auth.EMAIL_RE.test(email)) errors.email = 'Enter a valid email address.';
        else if (LUMEN.auth.findByEmail(email) && LUMEN.auth.findByEmail(email).id !== user.id) {
          errors.email = 'That email is already used by another account.';
        }
        if (phone && details.querySelector('#pfPhone').value.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').length !== 10) {
          errors.phone = 'Enter a valid 10-digit mobile number.';
        }

        details.querySelectorAll('.field__error').forEach((n) => { n.textContent = ''; });
        details.querySelectorAll('.is-invalid').forEach((n) => n.classList.remove('is-invalid'));
        Object.keys(errors).forEach((field) => {
          const err = details.querySelector(`[data-error="${field}"]`);
          const input = details.querySelector(`#pf${field[0].toUpperCase()}${field.slice(1)}`);
          if (err) err.textContent = errors[field];
          if (input) input.classList.add('is-invalid');
        });

        if (Object.keys(errors).length) {
          LUMEN.toast('Check your details', 'error');
          return;
        }

        const result = LUMEN.auth.updateProfile({ name, email, phone: LUMEN.auth.normalisePhone(phone), city });
        if (result.ok) {
          LUMEN.toast('Profile updated', 'success', 'Your details have been saved');
          renderProfilePage();
        }
      });

      const reset = details.querySelector('[data-reset-details]');
      if (reset) {
        reset.addEventListener('click', () => {
          details.reset();
          details.querySelectorAll('.field__error').forEach((n) => { n.textContent = ''; });
          details.querySelectorAll('.is-invalid').forEach((n) => n.classList.remove('is-invalid'));
        });
      }
    }

    // --- avatar ------------------------------------------------------
    const pick = host.querySelector('[data-avatar-pick]');
    if (pick) pick.addEventListener('click', pickAvatar);
    const remove = host.querySelector('[data-avatar-remove]');
    if (remove) {
      remove.addEventListener('click', () => {
        LUMEN.store.removeData('avatar');
        paintAvatars();
        renderProfilePage();
        LUMEN.toast('Photo removed', 'info');
      });
    }

    // --- security ----------------------------------------------------
    const pw = host.querySelector('#passwordForm');
    if (pw) {
      const next = pw.querySelector('#secNext');
      const meter = pw.querySelector('[data-strength-meter]');
      const meterLabel = pw.querySelector('[data-strength-label]');
      if (next && meter) {
        next.addEventListener('input', () => {
          const hint = LUMEN.auth.passwordHint(next.value);
          meter.style.setProperty('--strength', `${hint.percent}%`);
          meter.className = 'pw-meter__bar' + (hint.score >= 3 ? ' is-strong' : hint.score === 2 ? ' is-fair' : ' is-weak');
          if (meterLabel) meterLabel.textContent = next.value ? hint.label : '';
        });
      }

      pw.addEventListener('submit', (event) => {
        event.preventDefault();
        const current = pw.querySelector('#secCurrent').value;
        const value = pw.querySelector('#secNext').value;
        const confirmValue = pw.querySelector('#secConfirm').value;

        pw.querySelectorAll('.field__error').forEach((n) => { n.textContent = ''; });
        pw.querySelectorAll('.is-invalid').forEach((n) => n.classList.remove('is-invalid'));

        if (confirmValue !== value) {
          markPwError(pw, 'confirm', 'Passwords do not match.');
          return;
        }
        const result = LUMEN.auth.changePassword(current, value);
        if (!result.ok) {
          markPwError(pw, result.field, result.message);
          return;
        }
        pw.reset();
        if (meter) meter.style.setProperty('--strength', '0%');
        if (meterLabel) meterLabel.textContent = '';
        LUMEN.toast('Password updated', 'success', 'Use your new password next time you sign in');
      });
    }

    const revoke = host.querySelector('[data-revoke-session]');
    if (revoke) {
      revoke.addEventListener('click', () => {
        revoke.closest('li').remove();
        LUMEN.toast('Session revoked', 'success');
      });
    }

    const signoutAll = host.querySelector('[data-signout-all]');
    if (signoutAll) signoutAll.addEventListener('click', () => { LUMEN.auth.signOut(); global.location.href = 'index.html'; });

    // --- preferences -------------------------------------------------
    host.querySelectorAll('[data-pref]').forEach((input) => {
      input.addEventListener('change', () => {
        const prefs = getData('preferences', null) || {};
        prefs[input.dataset.pref] = input.checked;
        saveData('preferences', prefs);
        LUMEN.toast('Preference saved', 'success');
      });
    });

    host.querySelectorAll('[data-theme-set]').forEach((btn) => {
      btn.addEventListener('click', () => {
        LUMEN.theme.set(btn.dataset.themeSet);
        LUMEN.toast(btn.dataset.themeSet === 'dark' ? 'Dark mode on' : 'Light mode on', 'info');
      });
    });
  }

  function markPwError(scope, field, message) {
    const err = scope.querySelector(`[data-error="${field}"]`);
    const input = scope.querySelector(`#sec${field[0].toUpperCase()}${field.slice(1)}`);
    if (err) err.textContent = message;
    if (input) {
      input.classList.add('is-invalid');
      input.focus();
    }
    LUMEN.toast('Could not update password', 'error', message);
  }

  /* =====================================================================
     5. ADDRESS MODAL (profile tab)
     ===================================================================== */

  function openAddressModal(existingId) {
    const list = LUMEN.auth.addresses();
    const existing = existingId ? list.find((a) => a.id === existingId) : null;
    const draft = existing ? Object.assign({}, existing) : { label: 'Home', country: 'India' };

    LUMEN.modal.open({
      title: existing ? 'Edit address' : 'Add an address',
      size: 'lg',
      body: `
        <form id="pfAddressForm" novalidate>
          <div class="grid grid--2">
            <div class="field">
              <label class="field__label" for="pfAdLabel">Label</label>
              <input class="input" type="text" id="pfAdLabel" name="label" value="${escapeHtml(draft.label || 'Home')}">
            </div>
            <div class="field">
              <label class="field__label" for="pfAdName">Full name</label>
              <input class="input" type="text" id="pfAdName" name="name" value="${escapeHtml(draft.name || '')}" required>
            </div>
            <div class="field field--span">
              <label class="field__label" for="pfAdLine1">Address line 1</label>
              <input class="input" type="text" id="pfAdLine1" name="line1" value="${escapeHtml(draft.line1 || '')}" required>
            </div>
            <div class="field field--span">
              <label class="field__label" for="pfAdLine2">Address line 2 <span class="muted">(optional)</span></label>
              <input class="input" type="text" id="pfAdLine2" name="line2" value="${escapeHtml(draft.line2 || '')}">
            </div>
            <div class="field">
              <label class="field__label" for="pfAdCity">City</label>
              <input class="input" type="text" id="pfAdCity" name="city" value="${escapeHtml(draft.city || '')}" required>
            </div>
            <div class="field">
              <label class="field__label" for="pfAdState">State</label>
              <input class="input" type="text" id="pfAdState" name="state" value="${escapeHtml(draft.state || '')}" required>
            </div>
            <div class="field">
              <label class="field__label" for="pfAdPostal">PIN code</label>
              <input class="input" type="text" id="pfAdPostal" name="postal" inputmode="numeric" maxlength="6" value="${escapeHtml(draft.postal || '')}" required>
            </div>
            <div class="field">
              <label class="field__label" for="pfAdPhone">Mobile number</label>
              <input class="input" type="tel" id="pfAdPhone" name="phone" value="${escapeHtml(draft.phone || '')}">
            </div>
          </div>
          <label class="check mt-4">
            <input type="checkbox" id="pfAdDefault" ${draft.default ? 'checked' : ''} name="default">
            <span>Make this my default address</span>
          </label>
        </form>`,
      footer: `
        <button class="btn btn--secondary" type="button" data-close-modal>Cancel</button>
        <button class="btn btn--primary" type="button" data-save-address>Save address</button>`,
      onMount(el, api) {
        const form = el.querySelector('#pfAddressForm');
        el.querySelector('[data-save-address]').addEventListener('click', () => {
          const data = Object.assign({}, draft);
          ['label', 'name', 'line1', 'line2', 'city', 'state', 'postal', 'phone'].forEach((k) => {
            const node = form.querySelector(`[name="${k}"]`);
            if (node) data[k] = node.value.trim();
          });
          data.default = form.querySelector('#pfAdDefault').checked;

          if (!data.name || data.name.length < 2 || !data.line1 || !data.city || !data.state || !/^\d{6}$/.test(data.postal)) {
            LUMEN.toast('Check the address', 'error', 'Name, address, city, state and a 6-digit PIN are required');
            return;
          }
          if (data.phone) data.phone = LUMEN.auth.normalisePhone(data.phone);
          LUMEN.auth.saveAddress(data);
          api.close();
          LUMEN.toast(existing ? 'Address updated' : 'Address added', 'success');
          renderProfilePage();
        });
      }
    });
  }

  /* =====================================================================
     6. PROFILE PAGE EVENTS
     ===================================================================== */

  function initProfilePage() {
    const user = LUMEN.auth.currentUser();
    if (!user) return;

    const tabsHost = $('[data-profile-tabs]');
    if (tabsHost) {
      tabsHost.addEventListener('click', (event) => {
        const btn = event.target.closest('[data-profile-tab]');
        if (!btn) return;
        const host = $('[data-profile-root]');
        if (host) host.innerHTML = '';
        $$('[data-profile-tab]').forEach((n) => n.classList.remove('is-active'));
        btn.classList.add('is-active');
        renderProfilePage();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Address tile actions are delegated so they survive every re-render.
    const host = $('[data-profile-root]');
    if (host) {
      host.addEventListener('click', async (event) => {
        const add = event.target.closest('[data-address-add]');
        if (add) { openAddressModal(); return; }

        const edit = event.target.closest('[data-address-edit]');
        if (edit) { openAddressModal(edit.dataset.addressEdit); return; }

        const del = event.target.closest('[data-address-delete]');
        if (del) {
          const ok = await LUMEN.modal.confirm({
            title: 'Delete this address?',
            message: 'It will be removed from your address book. Orders already placed are not affected.',
            confirmLabel: 'Delete',
            danger: true
          });
          if (!ok) return;
          LUMEN.auth.deleteAddress(del.dataset.addressDelete);
          LUMEN.toast('Address deleted', 'info');
          renderProfilePage();
          return;
        }

        const makeDefault = event.target.closest('[data-address-default]');
        if (makeDefault) {
          const list = LUMEN.auth.addresses();
          list.forEach((a) => { a.default = a.id === makeDefault.dataset.addressDefault; });
          saveData('addresses', list);
          LUMEN.toast('Default address updated', 'success');
          renderProfilePage();
        }
      });
    }

    const editBtn = $('[data-profile-edit-btn]');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const tab = $('[data-profile-tab="details"]');
        if (tab) tab.click();
      });
    }
  }

  /* =====================================================================
     7. EXPORTS + BOOT
     ===================================================================== */

  // Extend the shared helpers from app.js rather than replacing the object.
  LUMEN.orders.mine = myOrders;
  LUMEN.orders.card = orderCard;

  LUMEN.onReady(() => {
    const page = document.body.dataset.page;

    if (page === 'orders') {
      if (!LUMEN.auth.requireAuth()) return;
      initOrdersEvents();
      renderOrdersPage();
    }

    if (page === 'profile') {
      if (!LUMEN.auth.requireAuth()) return;
      initProfilePage();
      renderProfilePage();

      const welcome = new URLSearchParams(global.location.search).get('welcome');
      if (welcome) {
        LUMEN.toast('Account created', 'success', 'Everything is ready — start shopping');
        global.history.replaceState({}, '', 'profile.html');
      }
    }
  });
})(window);
