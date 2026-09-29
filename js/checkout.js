/* ==========================================================================
   LUMEN — Checkout
   js/checkout.js
   --------------------------------------------------------------------------
   Four-step checkout: Contact → Shipping → Payment → Review
     · progress indicator with back / next navigation
     · inline validation per step, plus a summary of blocking problems
     · coupon support, address book, saved cards
     · places the order into `lumen:orders`, clears the bag, issues an id
     · a printable "order placed" screen
   No real payment is taken anywhere in this prototype.
   ========================================================================== */

(function (global) {
  'use strict';

  const LUMEN = global.LUMEN;
  const { getData, saveData } = LUMEN.store;
  const { escapeHtml, $, $$ } = LUMEN.dom;
  const { money, num, formatDate, uid } = LUMEN.fmt;
  const icon = LUMEN.icon;
  const D = () => LUMEN.data;

  const STEPS = [
    { key: 'contact', label: 'Contact' },
    { key: 'shipping', label: 'Shipping' },
    { key: 'payment', label: 'Payment' },
    { key: 'review', label: 'Review' }
  ];

  const STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat',
    'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra',
    'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan',
    'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
  ];

  const PAY_METHODS = [
    { id: 'UPI', label: 'UPI', hint: 'GPay, PhonePe, Paytm, BHIM' },
    { id: 'Card', label: 'Credit / Debit card', hint: 'Visa, Mastercard, RuPay, Amex' },
    { id: 'NetBanking', label: 'Net banking', hint: 'All major Indian banks' },
    { id: 'COD', label: 'Cash on delivery', hint: '₹49 handling fee applies' }
  ];

  const SHIPPING_METHODS = [
    { id: 'standard', label: 'Standard delivery', hint: '3–5 business days', price: 0, note: 'Free above ₹999' },
    { id: 'express', label: 'Express delivery', hint: '1–2 business days', price: 199 },
    { id: 'priority', label: 'Priority same-day', hint: 'Ordered before 2 pm', price: 349 }
  ];

  const state = {
    step: 0,
    contact: { email: '', phone: '', updates: true },
    shipping: { method: 'standard', addressId: null, gift: false, note: '' },
    payment: { method: 'UPI', upiId: '', card: { number: '', name: '', expiry: '', cvv: '' }, bank: 'HDFC Bank' },
    errors: {},
    submitting: false
  };

  /* =====================================================================
     1. PERSISTENCE HELPERS
     ===================================================================== */

  function savedDetails() {
    return getData('checkoutDetails', null) || {};
  }

  function saveDetails() {
    saveData('checkoutDetails', {
      contact: state.contact,
      shipping: { method: state.shipping.method, addressId: state.shipping.addressId, gift: state.shipping.gift, note: state.shipping.note },
      payment: { method: state.payment.method, upiId: state.payment.upiId, bank: state.payment.bank }
    });
  }

  function hydrate() {
    const saved = savedDetails();
    if (saved.contact) Object.assign(state.contact, saved.contact);
    if (saved.shipping) Object.assign(state.shipping, saved.shipping);
    if (saved.payment) Object.assign(state.payment, saved.payment);
  }

  /* =====================================================================
     2. ADDRESSES
     ===================================================================== */

  function addressList() {
    return LUMEN.auth ? LUMEN.auth.addresses() : [];
  }

  function chosenAddress() {
    const list = addressList();
    return list.find((a) => a.id === state.shipping.addressId) || list.find((a) => a.default) || list[0] || null;
  }

  /* =====================================================================
     3. MONEY
     ===================================================================== */

  function shippingPrice() {
    const method = SHIPPING_METHODS.find((m) => m.id === state.shipping.method) || SHIPPING_METHODS[0];
    // Standard shipping still respects the free-shipping threshold.
    return method.id === 'standard' ? LUMEN.cart.totals().shipping : method.price;
  }

  function codFee() {
    return state.payment.method === 'COD' ? 49 : 0;
  }

  function totals() {
    const t = LUMEN.cart.totals(LUMEN.cart.appliedCoupon());
    const ship = shippingPrice();
    const cod = codFee();
    return {
      count: t.count,
      subtotal: t.subtotal,
      discount: t.discount,
      taxIncluded: t.taxIncluded,
      taxRate: t.taxRate,
      shipping: ship,
      codFee: cod,
      total: t.subtotal - t.discount + ship + cod,
      freeShipping: t.freeShipping
    };
  }

  /* =====================================================================
     4. VALIDATION
     ===================================================================== */

  function setError(field, message) {
    if (message) state.errors[field] = message;
    else delete state.errors[field];
  }

  function validateStep(index) {
    Object.keys(state.errors).forEach((k) => delete state.errors[k]);

    if (index === 0) {
      if (!LUMEN.auth.EMAIL_RE.test(state.contact.email)) {
        setError('contactEmail', 'Enter a valid email address.');
      }
      if (String(state.contact.phone).replace(/\D/g, '').length < 10) {
        setError('contactPhone', 'Enter a 10-digit mobile number.');
      }
    }

    if (index === 1) {
      const addr = chosenAddress();
      if (!addr) {
        setError('address', 'Add a delivery address to continue.');
      } else {
        if (!addr.name) setError('addressName', 'Recipient name is required.');
        if (!addr.line1) setError('addressLine', 'Street address is required.');
        if (!addr.city) setError('addressCity', 'City is required.');
        if (!addr.state) setError('addressState', 'Select a state.');
        if (!/^\d{6}$/.test(String(addr.postal))) setError('addressPostal', 'Enter a valid 6-digit PIN code.');
      }
    }

    if (index === 2) {
      const method = state.payment.method;
      if (method === 'UPI') {
        if (!/^[\w.\-]{2,}@[a-z]{2,}$/i.test(state.payment.upiId.trim())) {
          setError('upiId', 'Enter a valid UPI ID, for example riya@okhdfcbank.');
        }
      }
      if (method === 'Card') {
        const digits = state.payment.card.number.replace(/\D/g, '');
        if (digits.length < 15 || digits.length > 16) setError('cardNumber', 'Enter a valid card number.');
        if (!state.payment.card.name.trim()) setError('cardName', 'Enter the name on the card.');
        if (!/^(0[1-9]|1[0-2])\s*\/\s*\d{2}$/.test(state.payment.card.expiry.trim())) setError('cardExpiry', 'Use MM/YY format.');
        if (!/^\d{3,4}$/.test(state.payment.card.cvv.trim())) setError('cardCvv', 'CVV is 3 or 4 digits.');
      }
    }

    return Object.keys(state.errors).length === 0;
  }

  function paintErrors() {
    $$('.field__error').forEach((n) => { n.textContent = ''; });
    $$('.is-invalid').forEach((n) => n.classList.remove('is-invalid'));
    Object.keys(state.errors).forEach((field) => {
      const error = document.querySelector(`[data-error="${field}"]`);
      const input = document.querySelector(`[data-field="${field}"]`);
      if (error) error.textContent = state.errors[field];
      if (input) {
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
      }
    });
  }

  /* =====================================================================
     5. SUMMARY PANEL
     ===================================================================== */

  function summaryMarkup() {
    const t = totals();
    const addr = chosenAddress();
    const method = SHIPPING_METHODS.find((m) => m.id === state.shipping.method) || SHIPPING_METHODS[0];
    const pay = PAY_METHODS.find((m) => m.id === state.payment.method) || PAY_METHODS[0];
    const items = LUMEN.cart.items();

    return `
      <div class="panel summary checkout-summary">
        <div class="row row--between row--wrap gap-3 mb-4">
          <h2 class="panel__title">Order summary</h2>
          <a class="link-arrow" href="cart.html">${icon('edit', 15)} Edit bag</a>
        </div>

        <ul class="checkout-items">
          ${items
            .map(
              (line) => `
            <li>
              <img src="${D().imageUrl(line.image)}" alt="" width="52" height="52" loading="lazy">
              <div>
                <p class="checkout-items__name">${escapeHtml(line.name)}</p>
                <p class="checkout-items__meta">${line.variant ? escapeHtml(line.variant) + ' · ' : ''}Qty ${line.qty}</p>
              </div>
              <span>${money(line.price * line.qty)}</span>
            </li>`
            )
            .join('')}
        </ul>

        <div class="totals mt-4">
          <div class="totals__row"><span>Subtotal</span><strong>${money(t.subtotal)}</strong></div>
          ${t.discount ? `<div class="totals__row totals__row--discount"><span>Discount</span><strong>− ${money(t.discount)}</strong></div>` : ''}
          <div class="totals__row"><span>Shipping (${escapeHtml(method.label)})</span><strong>${t.shipping === 0 ? 'Free' : money(t.shipping)}</strong></div>
          ${t.codFee ? `<div class="totals__row"><span>COD handling</span><strong>${money(t.codFee)}</strong></div>` : ''}
          <div class="totals__row"><span>GST (${t.taxRate}%, included)</span><strong>${money(t.taxIncluded)}</strong></div>
          <div class="totals__row totals__row--grand"><span>Total</span><strong>${money(t.total)}</strong></div>
        </div>

        <div class="checkout-summary__meta">
          <div>
            <span class="field__label">Deliver to</span>
            <p>${addr ? escapeHtml(addr.name) + '<br>' + escapeHtml(addr.city) + ', ' + escapeHtml(addr.postal) : '<span class="muted">Address needed</span>'}</p>
          </div>
          <div>
            <span class="field__label">Paying with</span>
            <p>${escapeHtml(pay.label)}</p>
          </div>
        </div>

        <p class="secure-note">${icon('shield', 14)} Demo checkout — no payment is processed</p>
      </div>`;
  }

  /* =====================================================================
     6. STEP PANELS
     ===================================================================== */

  function stepContact() {
    return `
      <section class="checkout-step" data-step-panel="0" aria-labelledby="stepContactTitle">
        <h2 class="checkout-step__title" id="stepContactTitle">Contact information</h2>
        <p class="muted">We will send your receipt and delivery updates here.</p>

        <div class="grid grid--2 mt-5">
          <div class="field">
            <label class="field__label" for="coEmail">Email address</label>
            <input class="input" type="email" id="coEmail" name="contactEmail" data-field="contactEmail"
                   value="${escapeHtml(state.contact.email)}" autocomplete="email" placeholder="you@example.com" required>
            <p class="field__error" data-error="contactEmail" role="alert"></p>
          </div>
          <div class="field">
            <label class="field__label" for="coPhone">Mobile number</label>
            <input class="input" type="tel" id="coPhone" name="contactPhone" data-field="contactPhone"
                   value="${escapeHtml(state.contact.phone)}" autocomplete="tel" placeholder="+91 90000 12345" required>
            <p class="field__error" data-error="contactPhone" role="alert"></p>
          </div>
        </div>

        <label class="check mt-4">
          <input type="checkbox" id="coUpdates" ${state.contact.updates ? 'checked' : ''}>
          <span>Email me about new arrivals and offers</span>
        </label>

        ${
          isSignedIn()
            ? `<p class="muted mt-4" style="font-size:var(--fs-sm)">${icon('user', 14)} Signed in as ${escapeHtml(currentName())}</p>`
            : `<p class="mt-4" style="font-size:var(--fs-sm)">Already have an account? <a class="link-arrow" href="login.html?next=checkout.html">Sign in</a> for faster checkout.</p>`
        }
      </section>`;
  }

  function stepShipping() {
    const list = addressList();
    const active = chosenAddress();

    return `
      <section class="checkout-step" data-step-panel="1" aria-labelledby="stepShipTitle">
        <div class="row row--between row--wrap gap-3">
          <h2 class="checkout-step__title" id="stepShipTitle">Delivery address</h2>
          <button class="btn btn--outline btn--sm" type="button" data-add-address>${icon('plus', 15)} Add address</button>
        </div>
        <p class="field__error" data-error="address" role="alert"></p>

        ${
          list.length
            ? `<div class="address-picker mt-4">
                ${list
                  .map(
                    (a) => `
                  <label class="address-card${active && a.id === active.id ? ' is-selected' : ''}">
                    <input type="radio" name="addressPick" value="${a.id}" ${active && a.id === active.id ? 'checked' : ''} data-address-radio>
                    <span class="address-card__body">
                      <span class="address-card__top">
                        <strong>${escapeHtml(a.label || 'Address')}</strong>
                        ${a.default ? '<span class="badge badge--new">Default</span>' : ''}
                      </span>
                      <span>${escapeHtml(a.name)}</span>
                      <span class="muted">${escapeHtml(a.line1)}${a.line2 ? ', ' + escapeHtml(a.line2) : ''}<br>${escapeHtml(a.city)}, ${escapeHtml(a.state)} ${escapeHtml(a.postal)}<br>${escapeHtml(a.phone || '')}</span>
                      <span class="address-card__actions">
                        <button class="icon-link" type="button" data-edit-address="${a.id}">${icon('edit', 14)} Edit</button>
                        <button class="icon-link" type="button" data-delete-address="${a.id}">${icon('trash', 14)} Remove</button>
                      </span>
                    </span>
                  </label>`
                  )
                  .join('')}
              </div>`
            : `<div class="notice mt-4">${icon('pin', 18)} You have no saved addresses yet. Add one to continue.</div>`
        }

        <h3 class="checkout-step__subtitle mt-6">Shipping method</h3>
        <div class="option-list mt-3">
          ${SHIPPING_METHODS.map((m) => {
            const price = m.id === 'standard' ? LUMEN.cart.totals().shipping : m.price;
            return `
            <label class="option">
              <input type="radio" name="shipMethod" value="${m.id}" ${state.shipping.method === m.id ? 'checked' : ''} data-ship-method>
              <span class="option__body">
                <span class="option__title">${escapeHtml(m.label)}</span>
                <span class="option__hint">${escapeHtml(m.hint)}${m.note ? ' · ' + escapeHtml(m.note) : ''}</span>
              </span>
              <span class="option__price">${price === 0 ? 'Free' : money(price)}</span>
            </label>`;
          }).join('')}
        </div>

        <div class="grid grid--2 mt-5">
          <label class="check"><input type="checkbox" id="coGift" ${state.shipping.gift ? 'checked' : ''} data-gift><span>This is a gift</span></label>
          <label class="check"><input type="checkbox" id="coSaveAddr" checked><span>Save this address for next time</span></label>
        </div>

        ${
          state.shipping.gift
            ? `<div class="field mt-4">
                 <label class="field__label" for="coNote">Gift message (max 200 characters)</label>
                 <textarea class="input" id="coNote" rows="3" maxlength="200" data-note placeholder="Written on a Lumen card, free of charge.">${escapeHtml(state.shipping.note)}</textarea>
                 <p class="field__hint" data-note-count>0 / 200</p>
               </div>`
            : ''
        }
      </section>`;
  }

  function stepPayment() {
    const p = state.payment;
    return `
      <section class="checkout-step" data-step-panel="2" aria-labelledby="stepPayTitle">
        <h2 class="checkout-step__title" id="stepPayTitle">Payment</h2>
        <p class="muted">This is a demo. No card details are transmitted or stored anywhere.</p>

        <div class="option-list mt-4">
          ${PAY_METHODS.map((m) => {
            const fee = m.id === 'COD' ? '+ ₹49 handling' : '';
            return `
            <label class="option">
              <input type="radio" name="payMethod" value="${m.id}" ${p.method === m.id ? 'checked' : ''} data-pay-method>
              <span class="option__body">
                <span class="option__title">${escapeHtml(m.label)}</span>
                <span class="option__hint">${escapeHtml(m.hint)}</span>
              </span>
              <span class="option__price">${escapeHtml(fee)}</span>
            </label>`;
          }).join('')}
        </div>

        <div class="pay-panel mt-4" data-pay-panel="${p.method}">
          ${
            p.method === 'UPI'
              ? `<div class="field">
                   <label class="field__label" for="payUpi">UPI ID</label>
                   <input class="input" type="text" id="payUpi" data-field="upiId" value="${escapeHtml(p.upiId)}" placeholder="yourname@okhdfcbank" autocomplete="off">
                   <p class="field__error" data-error="upiId" role="alert"></p>
                   <p class="field__hint">You will get a collect request on your UPI app. Never share your UPI PIN.</p>
                 </div>
                 <div class="quick-links">
                   ${['okhdfcbank', 'ybl', 'paytm', 'oksbi'].map((h) => `<button class="chip" type="button" data-upi="riya@${h}">riya@${h}</button>`).join('')}
                 </div>`
              : ''
          }
          ${
            p.method === 'Card'
              ? `<div class="grid grid--2">
                   <div class="field field--span">
                     <label class="field__label" for="cardNo">Card number</label>
                     <input class="input" type="text" id="cardNo" inputmode="numeric" data-field="cardNumber"
                            value="${escapeHtml(p.card.number)}" placeholder="4242 4242 4242 4242" autocomplete="cc-number" maxlength="19">
                     <p class="field__error" data-error="cardNumber" role="alert"></p>
                   </div>
                   <div class="field field--span">
                     <label class="field__label" for="cardName">Name on card</label>
                     <input class="input" type="text" id="cardName" data-field="cardName" value="${escapeHtml(p.card.name)}" autocomplete="cc-name">
                     <p class="field__error" data-error="cardName" role="alert"></p>
                   </div>
                   <div class="field">
                     <label class="field__label" for="cardExp">Expiry</label>
                     <input class="input" type="text" id="cardExp" inputmode="numeric" data-field="cardExpiry"
                            value="${escapeHtml(p.card.expiry)}" placeholder="MM/YY" autocomplete="cc-exp" maxlength="7">
                     <p class="field__error" data-error="cardExpiry" role="alert"></p>
                   </div>
                   <div class="field">
                     <label class="field__label" for="cardCvv">CVV</label>
                     <input class="input" type="password" id="cardCvv" inputmode="numeric" data-field="cardCvv"
                            value="${escapeHtml(p.card.cvv)}" placeholder="•••" autocomplete="cc-csc" maxlength="4">
                     <p class="field__error" data-error="cardCvv" role="alert"></p>
                   </div>
                 </div>
                 <p class="secure-note">${icon('lock', 14)} Use 4242 4242 4242 4242 with any future expiry to preview the flow</p>`
              : ''
          }
          ${
            p.method === 'NetBanking'
              ? `<div class="field">
                   <label class="field__label" for="payBank">Choose your bank</label>
                   <select class="select" id="payBank" data-bank>
                     ${['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra Bank', 'Punjab National Bank', 'Yes Bank', 'IndusInd Bank']
                       .map((b) => `<option ${p.bank === b ? 'selected' : ''}>${escapeHtml(b)}</option>`)
                       .join('')}
                   </select>
                 </div>`
              : ''
          }
          ${
            p.method === 'COD'
              ? `<div class="notice">${icon('info', 18)} Pay ${money(totals().total)} in cash when your order arrives. A ${money(49)} handling fee applies.</div>`
              : ''
          }
        </div>
      </section>`;
  }

  function stepReview() {
    const addr = chosenAddress();
    const pay = PAY_METHODS.find((m) => m.id === state.payment.method);
    const method = SHIPPING_METHODS.find((m) => m.id === state.shipping.method);
    const t = totals();

    return `
      <section class="checkout-step" data-step-panel="3" aria-labelledby="stepReviewTitle">
        <h2 class="checkout-step__title" id="stepReviewTitle">Review your order</h2>

        <div class="review-grid mt-4">
          <div class="review-card">
            <div class="review-card__head">
              <h3>Contact</h3>
              <button class="icon-link" type="button" data-goto="0">Edit</button>
            </div>
            <p>${escapeHtml(state.contact.email)}<br>${escapeHtml(state.contact.phone)}</p>
          </div>

          <div class="review-card">
            <div class="review-card__head">
              <h3>Shipping</h3>
              <button class="icon-link" type="button" data-goto="1">Edit</button>
            </div>
            <p>${addr ? escapeHtml(addr.name) + '<br>' + escapeHtml(addr.line1) + '<br>' + escapeHtml(addr.city) + ', ' + escapeHtml(addr.state) + ' ' + escapeHtml(addr.postal) : '—'}</p>
            <p class="muted" style="font-size:var(--fs-sm)">${escapeHtml(method.label)} · ${method.hint}</p>
          </div>

          <div class="review-card">
            <div class="review-card__head">
              <h3>Payment</h3>
              <button class="icon-link" type="button" data-goto="2">Edit</button>
            </div>
            <p>${escapeHtml(pay.label)}</p>
            ${
              state.payment.method === 'UPI'
                ? `<p class="muted" style="font-size:var(--fs-sm)">${escapeHtml(state.payment.upiId)}</p>`
                : state.payment.method === 'Card'
                ? `<p class="muted" style="font-size:var(--fs-sm)">Card ending ${escapeHtml(state.payment.card.number.replace(/\D/g, '').slice(-4) || '••••')}</p>`
                : ''
            }
          </div>
        </div>

        <div class="notice mt-5">
          ${icon('truck', 18)}
          <p>Estimated delivery <strong>${deliveryWindow()}</strong>. You will get a tracking link by email once the parcel leaves our warehouse.</p>
        </div>

        <label class="check mt-4">
          <input type="checkbox" id="placeConfirm">
          <span>I confirm the delivery address and payment details above are correct.</span>
        </label>
      </section>`;
  }

  function currentName() {
    const user = LUMEN.auth.currentUser();
    return user ? user.name : '';
  }

  function isSignedIn() {
    return Boolean(LUMEN.auth.currentUser());
  }

  function deliveryWindow() {
    const days = state.shipping.method === 'priority' ? 0 : state.shipping.method === 'express' ? 2 : 5;
    const start = new Date();
    start.setDate(start.getDate() + 1);
    const end = new Date();
    end.setDate(end.getDate() + days);
    return `${formatDate(start)} – ${formatDate(end)}`;
  }

  /* =====================================================================
     7. RENDER
     ===================================================================== */

  function renderSteps() {
    const host = $('[data-checkout-steps]');
    if (!host) return;
    host.innerHTML = STEPS.map((s, i) => {
      const stateClass = i === state.step ? 'is-current' : i < state.step ? 'is-done' : '';
      return `
        <li class="checkout-steps__item ${stateClass}">
          <button class="checkout-steps__btn" type="button" data-step-go="${i}" ${i > state.step ? 'disabled' : ''} aria-current="${i === state.step ? 'step' : 'false'}">
            <span class="checkout-steps__num">${i < state.step ? icon('check', 14) : num(i + 1)}</span>
            <span class="checkout-steps__label">${escapeHtml(s.label)}</span>
          </button>
        </li>`;
    }).join('');
  }

  /* The nav host ships empty on checkout.html, so the Back / Continue pair is
     built here once and then only re-labelled. Delegated clicks in
     initEvents() keep working because the listeners live on the root. */
  function renderNav() {
    const host = $('[data-checkout-nav]');
    if (!host) return;
    if (!host.querySelector('[data-checkout-next]')) {
      const root = document.body.dataset.root || '';
      host.innerHTML = `
        <a class="link-arrow" href="${root}cart.html">${icon('arrowLeft', 16)} Back to bag</a>
        <div class="row gap-3">
          <button class="btn btn--ghost" type="button" data-checkout-prev>Back</button>
          <button class="btn btn--primary" type="button" data-checkout-next></button>
        </div>`;
    }
  }

  function renderPanel() {
    const host = $('[data-checkout-panel]');
    if (!host) return;
    const renderers = [stepContact, stepShipping, stepPayment, stepReview];
    host.innerHTML = renderers[state.step]();

    const prev = $('[data-checkout-prev]');
    const next = $('[data-checkout-next]');
    if (prev) prev.hidden = state.step === 0;
    if (next) {
      const isLast = state.step === STEPS.length - 1;
      next.innerHTML = isLast
        ? `${icon('lock', 16)} Place order · ${money(totals().total)}`
        : `Continue ${icon('arrowRight', 16)}`;
    }
  }

  function renderSummary() {
    const host = $('[data-checkout-summary]');
    if (host) host.innerHTML = summaryMarkup();
  }

  function renderAll() {
    renderSteps();
    renderNav();
    renderPanel();
    renderSummary();
  }

  /* =====================================================================
     8. ADDRESS MODAL
     ===================================================================== */

  function addressFormMarkup(addr) {
    const a = addr || {};
    return `
      <form id="addressForm" novalidate>
        <div class="grid grid--2">
          <div class="field field--span">
            <label class="field__label" for="adLabel">Label</label>
            <input class="input" type="text" id="adLabel" name="label" value="${escapeHtml(a.label || 'Home')}" placeholder="Home, Office…">
          </div>
          <div class="field field--span">
            <label class="field__label" for="adName">Full name</label>
            <input class="input" type="text" id="adName" name="name" data-field="addressName" value="${escapeHtml(a.name || '')}" required>
            <p class="field__error" data-error="addressName" role="alert"></p>
          </div>
          <div class="field field--span">
            <label class="field__label" for="adLine1">Address line 1</label>
            <input class="input" type="text" id="adLine1" name="line1" data-field="addressLine" value="${escapeHtml(a.line1 || '')}" required>
            <p class="field__error" data-error="addressLine" role="alert"></p>
          </div>
          <div class="field field--span">
            <label class="field__label" for="adLine2">Address line 2 <span class="muted">(optional)</span></label>
            <input class="input" type="text" id="adLine2" name="line2" value="${escapeHtml(a.line2 || '')}">
          </div>
          <div class="field">
            <label class="field__label" for="adCity">City</label>
            <input class="input" type="text" id="adCity" name="city" data-field="addressCity" value="${escapeHtml(a.city || '')}" required>
            <p class="field__error" data-error="addressCity" role="alert"></p>
          </div>
          <div class="field">
            <label class="field__label" for="adState">State</label>
            <select class="select" id="adState" name="state" data-field="addressState" required>
              <option value="">Select a state</option>
              ${STATES.map((s) => `<option ${a.state === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
            <p class="field__error" data-error="addressState" role="alert"></p>
          </div>
          <div class="field">
            <label class="field__label" for="adPostal">PIN code</label>
            <input class="input" type="text" id="adPostal" name="postal" data-field="addressPostal" inputmode="numeric" maxlength="6" value="${escapeHtml(a.postal || '')}" required>
            <p class="field__error" data-error="addressPostal" role="alert"></p>
          </div>
          <div class="field">
            <label class="field__label" for="adPhone">Mobile number</label>
            <input class="input" type="tel" id="adPhone" name="phone" value="${escapeHtml(a.phone || '')}" placeholder="+91 90000 12345">
          </div>
        </div>
        <label class="check mt-4">
          <input type="checkbox" id="adDefault" ${a.default ? 'checked' : ''} name="default">
          <span>Use as my default delivery address</span>
        </label>
      </form>`;
  }

  function openAddressModal(existingId) {
    const existing = existingId ? addressList().find((a) => a.id === existingId) : null;
    let draft = existing ? Object.assign({}, existing) : { label: 'Home', country: 'India' };

    LUMEN.modal.open({
      title: existing ? 'Edit address' : 'Add a delivery address',
      size: 'lg',
      body: addressFormMarkup(draft),
      footer: `
        <button class="btn btn--secondary" type="button" data-close-modal>Cancel</button>
        <button class="btn btn--primary" type="button" data-save-address>Save address</button>`,
      onMount(el, api) {
        const form = el.querySelector('#addressForm');

        form.addEventListener('input', (event) => {
          const key = event.target.name;
          if (!key) return;
          draft[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        });

        el.querySelector('[data-save-address]').addEventListener('click', () => {
          form.querySelectorAll('.field__error').forEach((n) => { n.textContent = ''; });
          const errors = {};
          if (!draft.name || draft.name.trim().length < 2) errors.addressName = 'Recipient name is required.';
          if (!draft.line1 || !draft.line1.trim()) errors.addressLine = 'Street address is required.';
          if (!draft.city || !draft.city.trim()) errors.addressCity = 'City is required.';
          if (!draft.state) errors.addressState = 'Select a state.';
          if (!/^\d{6}$/.test(String(draft.postal || ''))) errors.addressPostal = 'Enter a valid 6-digit PIN code.';

          Object.keys(errors).forEach((field) => {
            const err = form.querySelector(`[data-error="${field}"]`);
            const input = form.querySelector(`[data-field="${field}"]`);
            if (err) err.textContent = errors[field];
            if (input) input.classList.add('is-invalid');
          });

          if (Object.keys(errors).length) {
            LUMEN.toast('Check the address', 'error', 'Some required details are missing');
            return;
          }

          draft.default = Boolean(form.querySelector('#adDefault').checked);
          draft.country = draft.country || 'India';
          if (draft.phone) draft.phone = LUMEN.auth.normalisePhone(draft.phone);

          const saved = LUMEN.auth.saveAddress(draft);
          state.shipping.addressId = saved.id;
          saveDetails();
          api.close();
          LUMEN.toast(existing ? 'Address updated' : 'Address added', 'success');
          renderAll();
        });
      }
    });
  }

  /* =====================================================================
     9. ORDER PLACEMENT
     ===================================================================== */

  function nextOrderId() {
    const orders = getData('orders', []) || [];
    const highest = orders.reduce((max, o) => {
      const n = Number(String(o.id).replace(/\D/g, '')) || 0;
      return n > max ? n : max;
    }, 48210);
    return `LUM-${highest + Math.floor(Math.random() * 8) + 1}`;
  }

  function placeOrder() {
    if (state.submitting) return;
    const confirmBox = $('#placeConfirm');
    if (!confirmBox || !confirmBox.checked) {
      LUMEN.toast('One last step', 'warn', 'Please tick the confirmation box to place your order');
      if (confirmBox) {
        confirmBox.focus();
        confirmBox.closest('.check').classList.add('is-invalid');
      }
      return;
    }
    if (!validateStep(3)) {
      paintErrors();
      return;
    }

    state.submitting = true;
    const btn = $('[data-checkout-next]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Processing payment…';
    }

    // Simulated authorisation delay so the loading state is visible.
    setTimeout(() => {
      const addr = chosenAddress();
      const t = totals();
      const method = SHIPPING_METHODS.find((m) => m.id === state.shipping.method);
      const pay = PAY_METHODS.find((m) => m.id === state.payment.method);
      const user = LUMEN.auth.currentUser();
      const id = nextOrderId();

      const order = {
        id,
        userId: user ? user.id : 'GUEST',
        userName: user ? user.name : addr.name,
        userEmail: user ? user.email : state.contact.email,
        date: new Date().toISOString(),
        status: 'Processing',
        payment: {
          method: pay.id,
          status: pay.id === 'COD' ? 'Pending' : 'Paid',
          ref: pay.id === 'UPI' ? 'UPI' + Math.floor(Math.random() * 899999 + 100000) : pay.id === 'COD' ? 'COD' + Math.floor(Math.random() * 89999 + 10000) : 'CRD' + Math.floor(Math.random() * 899999 + 100000)
        },
        address: {
          name: addr.name,
          line1: addr.line1,
          line2: addr.line2 || '',
          city: addr.city,
          state: addr.state,
          postal: addr.postal,
          country: 'India',
          phone: addr.phone || state.contact.phone
        },
        shippingMethod: { id: method.id, label: method.label, price: t.shipping },
        items: LUMEN.cart.items().map((line) => ({
          id: line.id,
          name: line.name,
          brand: line.brand,
          price: line.price,
          qty: line.qty,
          image: line.image,
          variant: line.variant
        })),
        subtotal: t.subtotal,
        discount: t.discount,
        coupon: (LUMEN.cart.appliedCoupon() || {}).code || null,
        shipping: t.shipping,
        codFee: t.codFee,
        tax: t.taxIncluded,
        total: t.total,
        gift: state.shipping.gift ? { message: state.shipping.note } : null
      };

      const orders = getData('orders', []) || [];
      saveData('orders', [order].concat(orders));
      LUMEN.cart.clearCart({ silent: true });
      LUMEN.cart.clearCoupon();
      saveData('lastOrderId', id);
      LUMEN.store.removeData('checkoutDetails');

      state.submitting = false;
      showConfirmation(order);
    }, 1400);
  }

  function showConfirmation(order) {
    const host = $('[data-checkout-root]');
    if (!host) return;

    const eta = new Date();
    eta.setDate(eta.getDate() + (order.shippingMethod.id === 'priority' ? 1 : order.shippingMethod.id === 'express' ? 3 : 6));

    host.innerHTML = `
      <section class="order-done">
        <div class="order-done__mark">${icon('check', 40)}</div>
        <h1>Thank you, ${escapeHtml(String(order.userName).split(' ')[0])}.</h1>
        <p class="order-done__lead">Your order is confirmed. We have emailed a receipt to <strong>${escapeHtml(order.userEmail)}</strong>.</p>

        <div class="order-done__id">
          <span>Order number</span>
          <strong>${escapeHtml(order.id)}</strong>
        </div>

        <div class="order-done__grid">
          <div class="panel">
            <h3 class="panel__title mb-3">Delivering to</h3>
            <p class="muted">${escapeHtml(order.address.name)}<br>${escapeHtml(order.address.line1)}<br>${escapeHtml(order.address.city)}, ${escapeHtml(order.address.state)} ${escapeHtml(order.address.postal)}</p>
          </div>
          <div class="panel">
            <h3 class="panel__title mb-3">Estimated delivery</h3>
            <p class="muted">${formatDate(eta)}<br>${escapeHtml(order.shippingMethod.label)}</p>
          </div>
          <div class="panel">
            <h3 class="panel__title mb-3">Payment</h3>
            <p class="muted">${escapeHtml(order.payment.method)} · ${escapeHtml(order.payment.status)}<br>Ref ${escapeHtml(order.payment.ref)}</p>
          </div>
        </div>

        <ul class="order-done__items">
          ${order.items
            .map(
              (line) => `
            <li>
              <img src="${D().imageUrl(line.image)}" alt="" width="64" height="64" loading="lazy">
              <div>
                <p class="fw-6">${escapeHtml(line.name)}</p>
                <p class="muted" style="font-size:var(--fs-sm)">${line.variant ? escapeHtml(line.variant) + ' · ' : ''}Qty ${line.qty}</p>
              </div>
              <span>${money(line.price * line.qty)}</span>
            </li>`
            )
            .join('')}
        </ul>

        <div class="order-done__total">
          <span>Total paid</span>
          <strong>${money(order.total)}</strong>
        </div>

        <div class="row gap-3 row--wrap mt-6" style="justify-content:center">
          <a class="btn btn--primary" href="orders.html">Track this order</a>
          <a class="btn btn--outline" href="shop.html">Continue shopping</a>
          <button class="btn btn--ghost" type="button" data-print>${icon('download', 16)} Print receipt</button>
        </div>
      </section>`;

    const printBtn = host.querySelector('[data-print]');
    if (printBtn) printBtn.addEventListener('click', () => global.print());

    const stepsHost = $('[data-checkout-steps]');
    if (stepsHost) stepsHost.closest('.checkout-steps')?.classList.add('is-complete');
    const summaryHost = $('[data-checkout-summary]');
    if (summaryHost) summaryHost.innerHTML = '';
    const nav = $('[data-checkout-nav]');
    if (nav) nav.hidden = true;

    LUMEN.toast('Order placed successfully', 'success', order.id);
    global.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* =====================================================================
     10. EVENTS
     ===================================================================== */

  function goToStep(index) {
    if (index < 0 || index > STEPS.length - 1) return;
    // Validate every step we are skipping past.
    for (let i = 0; i < index; i += 1) {
      if (!validateStep(i)) {
        state.step = i;
        renderAll();
        paintErrors();
        LUMEN.toast('Check the earlier steps', 'warn', 'A previous step still needs attention');
        return;
      }
    }
    state.step = index;
    state.errors = {};
    saveDetails();
    renderAll();
    const main = $('[data-checkout-panel]');
    if (main) main.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function readInputs(scope) {
    const contactEmail = scope.querySelector('[data-field="contactEmail"]');
    const contactPhone = scope.querySelector('[data-field="contactPhone"]');
    const updates = scope.querySelector('#coUpdates');
    if (contactEmail) state.contact.email = contactEmail.value.trim();
    if (contactPhone) state.contact.phone = contactPhone.value.trim();
    if (updates) state.contact.updates = updates.checked;

    const method = scope.querySelector('[data-ship-method]:checked');
    if (method) state.shipping.method = method.value;
    const radio = scope.querySelector('[data-address-radio]:checked');
    if (radio) state.shipping.addressId = radio.value;
    const gift = scope.querySelector('[data-gift]');
    if (gift) {
      state.shipping.gift = gift.checked;
      if (!gift.checked) state.shipping.note = '';
    }
    const note = scope.querySelector('[data-note]');
    if (note) state.shipping.note = note.value;

    const pay = scope.querySelector('[data-pay-method]:checked');
    if (pay) state.payment.method = pay.value;
    const upi = scope.querySelector('[data-field="upiId"]');
    if (upi) state.payment.upiId = upi.value.trim();
    const bank = scope.querySelector('[data-bank]');
    if (bank) state.payment.bank = bank.value;
    const cardNo = scope.querySelector('[data-field="cardNumber"]');
    if (cardNo) state.payment.card.number = cardNo.value;
    const cardName = scope.querySelector('[data-field="cardName"]');
    if (cardName) state.payment.card.name = cardName.value;
    const cardExp = scope.querySelector('[data-field="cardExpiry"]');
    if (cardExp) state.payment.card.expiry = cardExp.value;
    const cardCvv = scope.querySelector('[data-field="cardCvv"]');
    if (cardCvv) state.payment.card.cvv = cardCvv.value;
  }

  function initEvents() {
    const root = $('[data-checkout-root]');
    if (!root) return;

    // Delegated so it survives every re-render of the step panel.
    root.addEventListener('click', (event) => {
      const stepBtn = event.target.closest('[data-step-go]');
      if (stepBtn) {
        readInputs(root);
        goToStep(Number(stepBtn.dataset.stepGo));
        return;
      }

      const goto = event.target.closest('[data-goto]');
      if (goto) {
        readInputs(root);
        goToStep(Number(goto.dataset.goto));
        return;
      }

      if (event.target.closest('[data-add-address]')) {
        readInputs(root);
        openAddressModal();
        return;
      }

      const editAddr = event.target.closest('[data-edit-address]');
      if (editAddr) {
        event.preventDefault();
        readInputs(root);
        openAddressModal(editAddr.dataset.editAddress);
        return;
      }

      const delAddr = event.target.closest('[data-delete-address]');
      if (delAddr) {
        event.preventDefault();
        readInputs(root);
        LUMEN.auth.deleteAddress(delAddr.dataset.deleteAddress);
        LUMEN.toast('Address removed', 'info');
        renderAll();
        return;
      }

      const upiChip = event.target.closest('[data-upi]');
      if (upiChip) {
        const input = root.querySelector('[data-field="upiId"]');
        if (input) {
          input.value = upiChip.dataset.upi;
          state.payment.upiId = upiChip.dataset.upi;
          input.classList.remove('is-invalid');
        }
        return;
      }

      const prev = event.target.closest('[data-checkout-prev]');
      if (prev) {
        readInputs(root);
        goToStep(state.step - 1);
        return;
      }

      const next = event.target.closest('[data-checkout-next]');
      if (next) {
        readInputs(root);
        if (state.step === STEPS.length - 1) placeOrder();
        else {
          if (!validateStep(state.step)) {
            paintErrors();
            LUMEN.toast('Please fix the highlighted fields', 'error');
            return;
          }
          goToStep(state.step + 1);
        }
      }
    });

    // Live mirror of state while typing so the summary stays honest.
    root.addEventListener('input', (event) => {
      const el = event.target;
      if (el.matches('[data-pay-method], [data-ship-method], [data-address-radio], [data-gift]')) {
        readInputs(root);
        renderSummary();
        return;
      }
      if (el.matches('[data-field="cardNumber"]')) {
        const digits = el.value.replace(/\D/g, '').slice(0, 16);
        el.value = digits.replace(/(.{4})/g, '$1 ').trim();
      }
      if (el.matches('[data-field="cardExpiry"]')) {
        const digits = el.value.replace(/\D/g, '').slice(0, 4);
        el.value = digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
      }
      if (el.matches('[data-field="cardCvv"]')) el.value = el.value.replace(/\D/g, '').slice(0, 4);
      if (el.matches('[data-field="upiId"]')) state.payment.upiId = el.value.trim();
      if (el.matches('[data-note]')) {
        const counter = root.querySelector('[data-note-count]');
        if (counter) counter.textContent = `${el.value.length} / 200`;
      }
    });

    // Re-render the panel when a payment method changes (different fields).
    root.addEventListener('change', (event) => {
      const el = event.target;
      if (el.matches('[data-pay-method]')) {
        readInputs(root);
        const panelHost = root.querySelector('[data-checkout-panel]');
        if (panelHost) panelHost.innerHTML = stepPayment();
        renderSummary();
      } else if (el.matches('[data-gift]')) {
        readInputs(root);
        const panelHost = root.querySelector('[data-checkout-panel]');
        if (panelHost) panelHost.innerHTML = stepShipping();
      } else if (el.matches('[data-address-radio]')) {
        readInputs(root);
        renderSummary();
      }
    });
  }

  function initEmptyState() {
    const host = $('[data-checkout-root]');
    if (!host) return;
    if (LUMEN.cart.items().length) {
      renderAll();
      return;
    }
    host.innerHTML = LUMEN.ui.emptyState({
      icon: 'bag',
      title: 'Your bag is empty.',
      message: 'Add a product to your bag before heading to checkout.',
      actionLabel: 'Browse the shop',
      actionHref: 'shop.html'
    });
    const summaryHost = $('[data-checkout-summary]');
    if (summaryHost) summaryHost.innerHTML = '';
    const nav = $('[data-checkout-nav]');
    if (nav) nav.hidden = true;
  }

  /* =====================================================================
     11. BOOT
     ===================================================================== */

  LUMEN.checkout = { totals, placeOrder, STEPS };

  LUMEN.onReady(() => {
    if (document.body.dataset.page !== 'checkout') return;
    hydrate();
    initEvents();
    initEmptyState();
  });
})(window);
