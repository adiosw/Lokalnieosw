/* ═══════════════════════════════════════════════════════════════
   LokalnieOSW v2.1 – Reservations.js  (escrow reservation module)
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const Reservations = (() => {

  /* ── CONFIG ───────────────────────────────────────────────── */
  const PLATFORM_FEE = 0.30;   // 30% of deposit if buyer no-show
  const SELLER_CUT   = 0.70;   // 70% of deposit to seller
  const DEFAULT_PCT  = 15;
  const MIN_DEPOSIT  = 5;
  const MAX_DEPOSIT_SMALL = 30;   // for items < 200 zł
  const MAX_DEPOSIT_LARGE = 80;   // for items >= 200 zł

  /* ── STATE ────────────────────────────────────────────────── */
  let countdownTimers = {};   // id → intervalId
  let activePayment   = null; // { listingId, hours, deposit, paymentMethod }

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  function init() {
    // Resume any active countdowns from storage
    try {
      const stored = JSON.parse(localStorage.getItem('osw_reservations') || '[]');
      stored.forEach(r => {
        if (r.status === 'active' && r.expiry > Date.now()) {
          startCountdown(r.expiry, 'resTimer_' + r.listing_id);
        }
      });
    } catch(_) {}
  }

  /* ══════════════════════════════════════════════════════════
     DEPOSIT CALCULATOR
  ══════════════════════════════════════════════════════════ */
  function calcDeposit(price, pct = DEFAULT_PCT) {
    const raw = price * (pct / 100);
    const max = price < 200 ? MAX_DEPOSIT_SMALL : MAX_DEPOSIT_LARGE;
    return Math.max(MIN_DEPOSIT, Math.min(raw, max));
  }

  function fmtPLN(amount) {
    return new Intl.NumberFormat('pl-PL', {
      style:'currency', currency:'PLN',
      minimumFractionDigits: 0, maximumFractionDigits: 2
    }).format(amount);
  }

  /* ══════════════════════════════════════════════════════════
     OPEN RESERVATION FLOW
  ══════════════════════════════════════════════════════════ */
  function openFlow(listingId, hours, depositAmount) {
    if (!Auth.isLoggedIn()) {
      showToast('Zaloguj się aby dokonać rezerwacji', 'warning');
      openModal('authModal');
      return;
    }

    // Find listing
    const listing = (App.getAll ? App.getAll() : []).find(l => l.id === listingId);
    if (!listing) { showToast('Nie znaleziono ogłoszenia', 'error'); return; }

    activePayment = { listingId, hours, deposit: depositAmount, paymentMethod: null };

    buildPaymentModal(listing, hours, depositAmount);
    openModal('paymentModal');
  }

  /* ══════════════════════════════════════════════════════════
     BUILD PAYMENT MODAL
  ══════════════════════════════════════════════════════════ */
  function buildPaymentModal(listing, hours, deposit) {
    const expiryDate = new Date(Date.now() + hours * 3600 * 1000);
    const expiryStr  = expiryDate.toLocaleString('pl-PL', { hour:'2-digit', minute:'2-digit', day:'2-digit', month:'2-digit' });

    document.getElementById('paymentContent').innerHTML = `
      <div class="payment-body">

        <!-- Summary -->
        <div class="payment-summary">
          <div class="payment-summary-row">
            <span>📦 Przedmiot</span>
            <strong style="max-width:200px;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${escHtml(listing.title)}
            </strong>
          </div>
          <div class="payment-summary-row">
            <span>💰 Cena przedmiotu</span>
            <strong>${fmtPLN(listing.price)}</strong>
          </div>
          <div class="payment-summary-row">
            <span>⏱ Czas rezerwacji</span>
            <strong>${hours}h (do ${expiryStr})</strong>
          </div>
          <div class="payment-summary-row">
            <span>🛡 Depozyt (kaucja)</span>
            <strong style="color:var(--brand)">${fmtPLN(deposit)}</strong>
          </div>
        </div>

        <!-- Escrow explanation -->
        <div class="escrow-info" style="margin-bottom:16px">
          <strong><i class="fa fa-shield-alt" style="color:var(--brand);margin-right:6px"></i>Jak działa bezpieczny escrow?</strong>
          <ul style="margin-top:8px">
            <li>Kaucja jest przechowywana przez platformę</li>
            <li>Odbierzesz → cała kaucja wraca do Ciebie</li>
            <li>Nie odbierzesz → 70% kaucji trafia do sprzedającego</li>
            <li>Sprzedający wycofał → 100% zwrot natychmiast</li>
          </ul>
        </div>

        <!-- Payment methods -->
        <p style="font-size:.82rem;font-weight:700;color:var(--text-2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">
          Metoda płatności
        </p>
        <div class="payment-methods" id="paymentMethods">
          ${payMethodHTML('blik',      '🔵', 'BLIK',         'Natychmiastowa płatność kodem 6-cyfrowym')}
          ${payMethodHTML('p24',       '🟢', 'Przelewy24',   'Płatność online przez bank')}
          ${payMethodHTML('card',      '💳', 'Karta płatnicza','Visa / Mastercard')}
          ${payMethodHTML('cash',      '💵', 'Przy odbiorze', 'Kaucja zwracana gotówką po odbiorze')}
        </div>

        <!-- BLIK input (shown when blik selected) -->
        <div id="blikWrap" class="blik-input-wrap" style="display:none">
          <label class="form-label" for="blikCode">Kod BLIK z aplikacji bankowej</label>
          <input type="text" id="blikCode" class="blik-input" placeholder="000 000"
                 maxlength="7" inputmode="numeric"
                 oninput="Reservations.formatBlik(this)"/>
          <p class="hint-text"><i class="fa fa-mobile-alt"></i> Otwórz aplikację bankową → BLIK → wpisz 6-cyfrowy kod</p>
        </div>

        <!-- Card form (shown when card selected) -->
        <div id="cardWrap" style="display:none">
          <div class="form-group">
            <label class="form-label" for="cardNumber">Numer karty</label>
            <input type="text" id="cardNumber" class="form-input" placeholder="0000 0000 0000 0000"
                   maxlength="19" inputmode="numeric" oninput="Reservations.formatCard(this)"/>
          </div>
          <div style="display:flex;gap:10px">
            <div class="form-group" style="flex:1">
              <label class="form-label" for="cardExpiry">Data ważności</label>
              <input type="text" id="cardExpiry" class="form-input" placeholder="MM/RR" maxlength="5"
                     oninput="Reservations.formatExpiry(this)"/>
            </div>
            <div class="form-group" style="flex:1">
              <label class="form-label" for="cardCvv">CVV</label>
              <input type="text" id="cardCvv" class="form-input" placeholder="123" maxlength="3" inputmode="numeric"/>
            </div>
          </div>
        </div>

        <!-- Pay button -->
        <button class="btn-primary btn-full" id="payNowBtn" onclick="Reservations.processPayment()"
                style="margin-top:6px;height:48px;font-size:.95rem">
          <i class="fa fa-lock"></i> Zapłać ${fmtPLN(deposit)} – Rezerwuj
        </button>
        <p style="font-size:.72rem;color:var(--text-4);text-align:center;margin-top:8px">
          <i class="fa fa-shield-alt" style="color:var(--brand)"></i>
          Płatność zabezpieczona 256-bit SSL · Środki w escrow do odbioru
        </p>
      </div>`;
  }

  function payMethodHTML(id, icon, name, desc) {
    return `
      <div class="pay-method" id="pm_${id}" onclick="Reservations.selectPayment('${id}')" role="radio" tabindex="0"
           onkeydown="if(event.key===' '||event.key==='Enter')Reservations.selectPayment('${id}')">
        <span class="pay-method-icon">${icon}</span>
        <div>
          <div class="pay-method-name">${name}</div>
          <div class="pay-method-desc">${desc}</div>
        </div>
        <span class="pay-method-check" id="pmCheck_${id}" style="margin-left:auto;display:none;color:var(--brand);font-size:1.1rem">
          <i class="fa fa-check-circle"></i>
        </span>
      </div>`;
  }

  /* ── Select payment method ───────────────────────────────── */
  function selectPayment(method) {
    if (!activePayment) return;
    activePayment.paymentMethod = method;

    // Update UI
    ['blik','p24','card','cash'].forEach(m => {
      document.getElementById('pm_' + m)?.classList.toggle('selected', m === method);
      const check = document.getElementById('pmCheck_' + m);
      if (check) check.style.display = m === method ? '' : 'none';
    });

    // Show/hide sub-forms
    document.getElementById('blikWrap').style.display = method === 'blik' ? '' : 'none';
    document.getElementById('cardWrap').style.display = method === 'card' ? '' : 'none';
  }

  /* ── Input formatters ────────────────────────────────────── */
  function formatBlik(input) {
    let v = input.value.replace(/\D/g,'');
    if (v.length > 3) v = v.slice(0,3) + ' ' + v.slice(3,6);
    input.value = v;
  }

  function formatCard(input) {
    let v = input.value.replace(/\D/g,'').slice(0,16);
    input.value = v.replace(/(.{4})/g,'$1 ').trim();
  }

  function formatExpiry(input) {
    let v = input.value.replace(/\D/g,'').slice(0,4);
    if (v.length >= 2) v = v.slice(0,2) + '/' + v.slice(2);
    input.value = v;
  }

  /* ══════════════════════════════════════════════════════════
     PROCESS PAYMENT
  ══════════════════════════════════════════════════════════ */
  async function processPayment() {
    if (!activePayment) return;
    const { listingId, hours, deposit, paymentMethod } = activePayment;

    if (!paymentMethod) {
      showToast('Wybierz metodę płatności', 'warning'); return;
    }

    // Validate method-specific fields
    if (paymentMethod === 'blik') {
      const code = document.getElementById('blikCode')?.value?.replace(/\s/g,'');
      if (!code || code.length !== 6) {
        showToast('Wpisz 6-cyfrowy kod BLIK', 'warning'); return;
      }
    }
    if (paymentMethod === 'card') {
      const num = document.getElementById('cardNumber')?.value?.replace(/\s/g,'');
      if (!num || num.length < 16) {
        showToast('Wpisz pełny numer karty', 'warning'); return;
      }
    }

    const btn = document.getElementById('payNowBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Przetwarzanie…'; }

    // Simulate payment processing
    await simulatePayment(paymentMethod);

    // Create reservation record
    const user     = Auth.getUser();
    const now      = Date.now();
    const expiry   = now + hours * 3600 * 1000;
    const code     = generateCode();
    const payRef   = 'PAY_' + Math.random().toString(36).slice(2,10).toUpperCase();

    const reservation = {
      id:             'res_' + Math.random().toString(36).slice(2,10),
      listing_id:     listingId,
      buyer_id:       user.id,
      buyer_name:     user.name,
      deposit_amount: deposit,
      platform_fee:   +(deposit * PLATFORM_FEE).toFixed(2),
      seller_cut:     +(deposit * SELLER_CUT).toFixed(2),
      duration_hours: hours,
      start:          now,
      expiry:         expiry,
      status:         'active',
      pickup_code:    code,
      qr_data:        JSON.stringify({ listing_id: listingId, code, expiry }),
      payment_ref:    payRef,
      payment_method: paymentMethod,
      picked_up:      false,
      seller_paid:    false,
      created_at:     now,
    };

    // Save to API
    try {
      await fetch('tables/reservations', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(reservation),
      });
      // Update listing status
      await fetch(`tables/listings/${listingId}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status:'reserved', buyer_id: user.id, reservation_expiry: expiry }),
      });
    } catch(_) {}

    // Update local listing
    const listings = App.getAll ? App.getAll() : [];
    const l = listings.find(x => x.id === listingId);
    if (l) { l.status = 'reserved'; l.buyer_id = user.id; l.reservation_expiry = expiry; }

    // Cache locally
    cacheReservation(reservation);

    closeModal('paymentModal');
    activePayment = null;

    // Show success
    showReservationSuccess(reservation, hours);

    // Refresh views
    if (typeof App !== 'undefined') App.applyFilters();
  }

  /* ── Payment simulation ──────────────────────────────────── */
  async function simulatePayment(method) {
    const delays = { blik: 2200, p24: 1800, card: 1500, cash: 800 };
    await sleep(delays[method] || 1500);
    // 95% success rate simulation
    if (Math.random() < 0.05 && method !== 'cash') {
      throw new Error('Płatność odrzucona – spróbuj ponownie');
    }
  }

  /* ── Success screen ──────────────────────────────────────── */
  function showReservationSuccess(reservation, hours) {
    const expiry = new Date(reservation.expiry);
    const expiryStr = expiry.toLocaleString('pl-PL', {
      weekday:'long', day:'numeric', month:'long', hour:'2-digit', minute:'2-digit'
    });

    // Build success modal content (reuse payment modal)
    document.getElementById('paymentContent').innerHTML = `
      <div class="payment-body" style="text-align:center">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--brand-light);border:3px solid var(--brand);
          display:flex;align-items:center;justify-content:center;margin:16px auto 14px;font-size:1.8rem">
          ✅
        </div>
        <h3 style="font-size:1.2rem;font-weight:800;color:var(--text-1);margin-bottom:8px">Rezerwacja potwierdzona!</h3>
        <p style="color:var(--text-3);font-size:.875rem;margin-bottom:20px">
          Twoja rezerwacja jest aktywna przez ${hours} godziny
        </p>

        <div style="background:var(--bg-3);border-radius:var(--r-lg);padding:16px;margin-bottom:16px;border:1px solid var(--border)">
          <div style="font-size:.78rem;font-weight:600;color:var(--text-3);text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px">
            Twój kod odbioru
          </div>
          <div style="font-size:2.8rem;font-weight:800;letter-spacing:.25em;color:var(--brand);
            font-variant-numeric:tabular-nums;margin-bottom:4px">${reservation.pickup_code}</div>
          <p style="font-size:.75rem;color:var(--text-3)">Pokaż sprzedającemu przy odbiorze</p>
        </div>

        <div style="background:var(--brand-light);border:1px solid var(--border-brand);border-radius:var(--r);
          padding:12px;margin-bottom:16px;font-size:.82rem;color:var(--text-2);text-align:left">
          <i class="fa fa-clock" style="color:var(--brand)"></i>
          <strong> Ważna do:</strong> ${expiryStr}
        </div>

        <div id="qrContainer" style="margin-bottom:16px"></div>

        <div style="display:flex;gap:8px">
          <button class="btn-outline" style="flex:1" onclick="closeModal('paymentModal')">
            Zamknij
          </button>
          <button class="btn-primary" style="flex:1" onclick="Chat.openFromListing('${reservation.listing_id}','');closeModal('paymentModal')">
            <i class="fa fa-comments"></i> Napisz do sprzedającego
          </button>
        </div>
      </div>`;

    openModal('paymentModal');

    // Generate QR code
    setTimeout(() => {
      const qrEl = document.getElementById('qrContainer');
      if (qrEl && typeof QRCode !== 'undefined') {
        new QRCode(qrEl, {
          text: reservation.qr_data,
          width: 120, height: 120,
          colorDark: '#22c55e', colorLight: '#1e1e2a',
        });
      }
    }, 200);

    showToast('🎉 Rezerwacja aktywna! Kod: ' + reservation.pickup_code, 'success', 6000);
  }

  /* ══════════════════════════════════════════════════════════
     CONFIRM PICKUP
  ══════════════════════════════════════════════════════════ */
  async function confirmPickup(listingId, enteredCode) {
    try {
      const r = await fetch(`tables/reservations?search=${listingId}`);
      const d = await r.json();
      const res = (d.data||[]).find(x => x.listing_id === listingId && x.status === 'active');

      if (!res) { showToast('Nie znaleziono aktywnej rezerwacji', 'error'); return false; }
      if (res.pickup_code !== enteredCode) { showToast('❌ Nieprawidłowy kod odbioru', 'error'); return false; }

      // Mark completed
      await fetch(`tables/reservations/${res.id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status:'completed', picked_up:true, completed_at: Date.now() }),
      });
      await fetch(`tables/listings/${listingId}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status:'sold' }),
      });

      showToast('✅ Odbiór potwierdzony! Transakcja zakończona.', 'success', 5000);
      return true;
    } catch(err) {
      showToast('Błąd potwierdzenia odbioru', 'error');
      return false;
    }
  }

  /* ══════════════════════════════════════════════════════════
     COUNTDOWN TIMER
  ══════════════════════════════════════════════════════════ */
  function startCountdown(expiryTimestamp, elementId) {
    if (countdownTimers[elementId]) {
      clearInterval(countdownTimers[elementId]);
    }

    const tick = () => {
      const el = document.getElementById(elementId);
      if (!el) { clearInterval(countdownTimers[elementId]); return; }

      const remaining = expiryTimestamp - Date.now();
      if (remaining <= 0) {
        el.textContent = '⌛ Rezerwacja wygasła';
        el.style.color = 'var(--red)';
        clearInterval(countdownTimers[elementId]);
        return;
      }

      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      el.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;

      // Color urgency
      if (remaining < 600000) el.style.color = 'var(--red)';        // < 10 min
      else if (remaining < 1800000) el.style.color = 'var(--amber)'; // < 30 min
      else el.style.color = 'var(--amber)';
    };

    tick();
    countdownTimers[elementId] = setInterval(tick, 1000);
  }

  function stopCountdown(elementId) {
    if (countdownTimers[elementId]) {
      clearInterval(countdownTimers[elementId]);
      delete countdownTimers[elementId];
    }
  }

  /* ══════════════════════════════════════════════════════════
     LOCAL CACHE
  ══════════════════════════════════════════════════════════ */
  function cacheReservation(reservation) {
    try {
      const stored = JSON.parse(localStorage.getItem('osw_reservations') || '[]');
      const filtered = stored.filter(r => r.listing_id !== reservation.listing_id);
      filtered.push(reservation);
      localStorage.setItem('osw_reservations', JSON.stringify(filtered));
    } catch(_) {}
  }

  function getCachedReservation(listingId) {
    try {
      const stored = JSON.parse(localStorage.getItem('osw_reservations') || '[]');
      return stored.find(r => r.listing_id === listingId && r.expiry > Date.now()) || null;
    } catch(_) { return null; }
  }

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function generateCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  function pad(n) { return String(n).padStart(2,'0'); }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */
  return {
    init,
    calcDeposit,
    openFlow,
    selectPayment,
    processPayment,
    confirmPickup,
    startCountdown,
    stopCountdown,
    getCachedReservation,
    formatBlik,
    formatCard,
    formatExpiry,
    fmtPLN,
  };

})();
