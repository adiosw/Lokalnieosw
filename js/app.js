/* ═══════════════════════════════════════════════════════════════
   LokalnieOSW v2.1 – App.js  (core application module)
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const App = (() => {

  /* ── STATE ────────────────────────────────────────────────── */
  let allListings      = [];
  let filteredListings = [];
  let currentCategory  = 'all';
  let currentView      = 'map';       // 'map' | 'list'
  let currentMainView  = 'home';      // 'home' | 'messages' | 'dashboard' | 'admin' | 'static'
  let uploadedPhotos   = [];
  let deferredPrompt   = null;
  let searchDebounce   = null;
  let currentListingId = null;        // listing open in detail modal

  /* ── CATEGORY META ────────────────────────────────────────── */
  const CATEGORIES = {
    all:         { label:'Wszystkie',   emoji:'🏪' },
    electronics: { label:'Elektronika', emoji:'💻' },
    clothing:    { label:'Odzież',      emoji:'👗' },
    furniture:   { label:'Meble',       emoji:'🪑' },
    sports:      { label:'Sport',       emoji:'⚽' },
    books:       { label:'Książki',     emoji:'📚' },
    kids:        { label:'Dzieci',      emoji:'🧸' },
    home:        { label:'Dom',         emoji:'🏡' },
    other:       { label:'Inne',        emoji:'📦' },
  };

  const CONDITION_LABELS = {
    new:      { label:'Nowy',        cls:'card-tag-condition-new' },
    like_new: { label:'Jak nowy',    cls:'card-tag-condition-like_new' },
    good:     { label:'Dobry',       cls:'' },
    fair:     { label:'Zadowalający',cls:'' },
  };

  /* ── DEMO DATA (fallback when API unavailable) ────────────── */
  const DEMO_LISTINGS = [
    { id:'demo_1', title:'iPhone 13 Pro 128GB', price:2499, category:'electronics', condition:'like_new',
      location:'Oświęcim, ul. Rynek 5', lat:50.0347, lng:19.2134, views:142, status:'active',
      photos:[], description:'Sprawny, bez śladów użytkowania. Oryginalne opakowanie.', featured:true,
      seller_id:'usr_demo1', seller_name:'Marek K.', created_at: Date.now()-86400000 },
    { id:'demo_2', title:'Rower górski Trek Marlin 7', price:1850, category:'sports', condition:'good',
      location:'Oświęcim, ul. Wysokie Brzegi 8', lat:50.0380, lng:19.2200, views:87, status:'active',
      photos:[], description:'Rower w bardzo dobrym stanie, przejechane ok. 800 km.', featured:false,
      seller_id:'usr_demo2', seller_name:'Anna W.', created_at: Date.now()-172800000 },
    { id:'demo_3', title:'Sofa narożna szara 260cm', price:750, category:'furniture', condition:'good',
      location:'Oświęcim, ul. Chemików 12', lat:50.0310, lng:19.2080, views:56, status:'active',
      photos:[], description:'Sofa 3-częściowa, lekko używana, bez uszkodzeń.', featured:false,
      seller_id:'usr_demo1', seller_name:'Marek K.', created_at: Date.now()-259200000 },
    { id:'demo_4', title:'Kurtka zimowa Columbia M', price:180, category:'clothing', condition:'like_new',
      location:'Oświęcim, Osiedle Słoneczne', lat:50.0295, lng:19.2250, views:34, status:'reserved',
      photos:[], description:'Kurtka puchowa, rozmiar M, kolor czarny.', featured:false,
      seller_id:'usr_demo2', seller_name:'Anna W.', created_at: Date.now()-345600000 },
    { id:'demo_5', title:'MacBook Air M2 13" 256GB', price:4200, category:'electronics', condition:'new',
      location:'Oświęcim, ul. Dąbrowskiego 3', lat:50.0360, lng:19.2160, views:203, status:'active',
      photos:[], description:'Fabrycznie nowy, nierozpakowany. Gwarancja Apple.', featured:true,
      seller_id:'usr_demo3', seller_name:'Piotr Z.', created_at: Date.now()-432000000 },
    { id:'demo_6', title:'Zestaw książek do 3 klasy', price:45, category:'books', condition:'good',
      location:'Oświęcim, ul. Szkolna 1', lat:50.0330, lng:19.2190, views:19, status:'active',
      photos:[], description:'Komplet podręczników, lekko używane, dobre do nauki.', featured:false,
      seller_id:'usr_demo3', seller_name:'Piotr Z.', created_at: Date.now()-518400000 },
    { id:'demo_7', title:'Wózek dziecięcy Bugaboo Fox', price:1200, category:'kids', condition:'good',
      location:'Oświęcim, ul. Zatorska 20', lat:50.0275, lng:19.2300, views:65, status:'active',
      photos:[], description:'Wózek 3w1, komplet akcesoriów, sprawny.', featured:false,
      seller_id:'usr_demo1', seller_name:'Marek K.', created_at: Date.now()-604800000 },
    { id:'demo_8', title:'Stolik kawowy IKEA LACK', price:60, category:'furniture', condition:'good',
      location:'Oświęcim, Centrum', lat:50.0347, lng:19.2134, views:28, status:'active',
      photos:[], description:'Stolik w dobrym stanie, kolor biały.', featured:false,
      seller_id:'usr_demo2', seller_name:'Anna W.', created_at: Date.now()-691200000 },
  ];

  /* ══════════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════════ */
  async function boot() {
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }

    // PWA install prompt
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      deferredPrompt = e;
      const dismissed = localStorage.getItem('installDismissed');
      const twoWeeks = 14 * 24 * 3600 * 1000;
      if (!dismissed || (Date.now() - parseInt(dismissed)) > twoWeeks) {
        setTimeout(() => {
          document.getElementById('installPrompt').style.display = '';
        }, 8000);
      }
    });

    // Init modules
    Auth.init();
    await loadListings();
    MapModule.init();
    Chat.init();
    Reservations.init();

    // Search (debounced)
    const searchEl = document.getElementById('globalSearch');
    if (searchEl) {
      searchEl.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(applyFilters, 280);
      });
      searchEl.addEventListener('keydown', e => {
        if (e.key === 'Enter') { clearTimeout(searchDebounce); applyFilters(); }
      });
    }

    // Title counter for listing form
    const titleEl = document.getElementById('listingTitle');
    if (titleEl) {
      titleEl.addEventListener('input', () => {
        document.getElementById('titleCounter').textContent = titleEl.value.length;
      });
    }

    // Photo input listener
    const photoInput = document.getElementById('photoInput');
    if (photoInput) photoInput.addEventListener('change', e => handlePhotos(e.target));

    // Scroll-to-top button
    window.addEventListener('scroll', () => {
      const btn = document.getElementById('scrollTopBtn');
      if (btn) btn.style.display = window.scrollY > 400 ? '' : 'none';
    }, { passive: true });

    // Hash navigation
    if (location.hash === '#add-listing') openModal('addListingModal');
    else if (location.hash === '#dashboard') showView('dashboard');

    // Advance filter inputs trigger
    ['priceMin','priceMax','conditionFilter'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', applyFilters);
    });

    // Distance slider pct visual update
    const ds = document.getElementById('distanceSlider');
    if (ds) {
      const updateSlider = () => {
        const pct = ((ds.value - ds.min) / (ds.max - ds.min)) * 100;
        ds.style.setProperty('--slider-pct', pct + '%');
      };
      ds.addEventListener('input', updateSlider);
      updateSlider();
    }

    // Hide loading overlay
    const ov = document.getElementById('loadingOverlay');
    if (ov) {
      setTimeout(() => ov.classList.add('hidden'), 600);
    }

    console.log('%c✅ LokalnieOSW v2.1 loaded', 'color:#22c55e;font-weight:700');
  }

  /* ══════════════════════════════════════════════════════════
     DATA LOADING
  ══════════════════════════════════════════════════════════ */
  async function loadListings() {
    try {
      const res = await fetch('tables/listings?limit=200&sort=created_at');
      if (!res.ok) throw new Error('API error ' + res.status);
      const data = await res.json();
      const rows = data.data || data || [];
      allListings = rows.filter(l => l.status !== 'sold_archived' && l.status !== 'deleted');
    } catch (err) {
      console.warn('Using demo data:', err.message);
      allListings = DEMO_LISTINGS;
    }
    applyFilters();
    updateResultsCount();
  }

  /* ══════════════════════════════════════════════════════════
     FILTERS & SORTING
  ══════════════════════════════════════════════════════════ */
  function applyFilters() {
    const search    = (document.getElementById('globalSearch')?.value || '').toLowerCase().trim();
    const priceMin  = parseFloat(document.getElementById('priceMin')?.value) || 0;
    const priceMax  = parseFloat(document.getElementById('priceMax')?.value) || Infinity;
    const condition = document.getElementById('conditionFilter')?.value || '';
    const availOnly = document.getElementById('availableOnly')?.checked || false;
    const resOnly   = document.getElementById('reservationOnly')?.checked || false;
    const sortBy    = document.getElementById('sortSelect')?.value || 'featured';

    filteredListings = allListings.filter(l => {
      if (currentCategory !== 'all' && l.category !== currentCategory) return false;
      if (search && !`${l.title} ${l.location} ${l.description||''}`.toLowerCase().includes(search)) return false;
      if (priceMin > 0 && l.price < priceMin) return false;
      if (priceMax < Infinity && l.price > priceMax) return false;
      if (condition && l.condition !== condition) return false;
      if (availOnly && l.status !== 'active') return false;
      if (resOnly && !l.reservation_enabled) return false;
      return true;
    });

    // Sort
    filteredListings.sort((a, b) => {
      switch (sortBy) {
        case 'newest':    return (b.created_at||0) - (a.created_at||0);
        case 'price_asc': return a.price - b.price;
        case 'price_desc':return b.price - a.price;
        case 'popular':   return (b.views||0) - (a.views||0);
        default: // featured first, then newest
          if (b.featured && !a.featured) return 1;
          if (a.featured && !b.featured) return -1;
          return (b.created_at||0) - (a.created_at||0);
      }
    });

    updateResultsCount();
    MapModule.renderMarkers(filteredListings);
    if (currentView === 'list') renderListView();

    // Show filter active dot
    const hasFilters = search || priceMin > 0 || priceMax < Infinity || condition || availOnly || resOnly;
    const dot = document.getElementById('filterActiveDot');
    if (dot) dot.style.display = hasFilters ? '' : 'none';
  }

  function resetFilters() {
    document.getElementById('globalSearch').value = '';
    document.getElementById('searchClearBtn').style.display = 'none';
    if (document.getElementById('priceMin')) document.getElementById('priceMin').value = '';
    if (document.getElementById('priceMax')) document.getElementById('priceMax').value = '';
    if (document.getElementById('conditionFilter')) document.getElementById('conditionFilter').value = '';
    if (document.getElementById('availableOnly')) document.getElementById('availableOnly').checked = false;
    if (document.getElementById('reservationOnly')) document.getElementById('reservationOnly').checked = false;
    if (document.getElementById('sortSelect')) document.getElementById('sortSelect').value = 'featured';
    const ds = document.getElementById('distanceSlider');
    if (ds) { ds.value = 20; document.getElementById('distanceVal').textContent = 20; }
    filterByCategory('all');
    applyFilters();
  }

  function updateResultsCount() {
    const n = filteredListings.length;
    document.getElementById('resultsNum').textContent = n;
    document.getElementById('mapCount').textContent   = n;
  }

  /* ══════════════════════════════════════════════════════════
     CATEGORY FILTER
  ══════════════════════════════════════════════════════════ */
  function filterByCategory(cat) {
    currentCategory = cat;
    // Update chip states
    document.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('chip-active', c.dataset.cat === cat);
      c.setAttribute('aria-selected', c.dataset.cat === cat ? 'true' : 'false');
    });
    applyFilters();
  }

  /* ══════════════════════════════════════════════════════════
     VIEW SWITCHING (map / list)
  ══════════════════════════════════════════════════════════ */
  function switchView(view) {
    currentView = view;
    const mapCont  = document.getElementById('mapContainer');
    const listCont = document.getElementById('listContainer');
    const mapBtn   = document.getElementById('mapViewBtn');
    const listBtn  = document.getElementById('listViewBtn');

    if (view === 'map') {
      mapCont.style.display  = '';
      listCont.style.display = 'none';
      mapBtn.classList.add('active');    mapBtn.setAttribute('aria-pressed','true');
      listBtn.classList.remove('active'); listBtn.setAttribute('aria-pressed','false');
      setTimeout(() => MapModule.invalidate(), 50);
    } else {
      mapCont.style.display  = 'none';
      listCont.style.display = '';
      mapBtn.classList.remove('active');  mapBtn.setAttribute('aria-pressed','false');
      listBtn.classList.add('active');    listBtn.setAttribute('aria-pressed','true');
      renderListView();
    }
  }

  /* ══════════════════════════════════════════════════════════
     MAIN VIEW SWITCHING
  ══════════════════════════════════════════════════════════ */
  function showView(view) {
    currentMainView = view;
    const views = ['home','messages','dashboard','admin','static'];
    views.forEach(v => {
      const el = document.getElementById(v + 'View');
      if (el) { el.style.display = v === view ? '' : 'none'; el.classList.toggle('active', v === view); }
    });

    // Bottom nav active state
    const bnMap = { home:'bnavHome', messages:'bnavMessages', dashboard:'bnavDash' };
    document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'));
    if (bnMap[view]) document.getElementById(bnMap[view])?.classList.add('active');

    // Load view data
    if (view === 'messages')  { Chat.loadConversations(); }
    if (view === 'dashboard') { loadDashboard(); }
    if (view === 'admin')     { if (!Auth.isAdmin()) { showView('home'); return; } loadAdminTab('overview'); }

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ══════════════════════════════════════════════════════════
     LIST VIEW RENDER
  ══════════════════════════════════════════════════════════ */
  function renderListView() {
    const grid  = document.getElementById('listingsGrid');
    const empty = document.getElementById('emptyState');
    if (!grid) return;

    if (filteredListings.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';
    grid.innerHTML = filteredListings.map(renderCard).join('');
  }

  function renderCard(l) {
    const cat      = CATEGORIES[l.category] || CATEGORIES.other;
    const cond     = CONDITION_LABELS[l.condition] || {};
    const photos   = Array.isArray(l.photos) ? l.photos : (l.photos ? JSON.parse(l.photos) : []);
    const imgHtml  = photos.length
      ? `<img src="${photos[0]}" alt="${escHtml(l.title)}" loading="lazy"/>`
      : `<div class="card-img-placeholder">${cat.emoji}</div>`;

    let badge = '';
    if (l.status === 'reserved') badge = '<span class="card-badge card-badge-reserved">🔒 Zarezerwowane</span>';
    else if (l.featured)         badge = '<span class="card-badge card-badge-featured">✨ Wyróżnione</span>';
    else if (l.condition === 'new') badge = '<span class="card-badge card-badge-new">Nowy</span>';

    const condTag = cond.label ? `<span class="card-tag ${cond.cls||''}">${cond.label}</span>` : '';
    const catTag  = `<span class="card-tag">${cat.emoji} ${cat.label}</span>`;

    return `
    <article class="listing-card" onclick="App.openListingDetail('${l.id}')" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter')App.openListingDetail('${l.id}')"
             aria-label="${escHtml(l.title)}, ${fmtPrice(l.price)}">
      <div class="card-img-wrap">
        ${imgHtml}
        ${badge}
      </div>
      <div class="card-body">
        <div class="card-price">${fmtPrice(l.price)}</div>
        <div class="card-title">${escHtml(l.title)}</div>
        <div class="card-location"><i class="fa fa-map-marker-alt"></i>${escHtml(l.location||'Oświęcim')}</div>
        <div class="card-meta">
          ${condTag}${catTag}
          <span class="card-views"><i class="fa fa-eye"></i> ${l.views||0}</span>
        </div>
      </div>
    </article>`;
  }

  /* ══════════════════════════════════════════════════════════
     LISTING DETAIL
  ══════════════════════════════════════════════════════════ */
  async function openListingDetail(id) {
    currentListingId = id;
    let listing = allListings.find(l => l.id === id);

    if (!listing) {
      try {
        const r = await fetch(`tables/listings/${id}`);
        if (r.ok) listing = await r.json();
      } catch(_) {}
    }
    if (!listing) { showToast('Nie można wczytać ogłoszenia', 'error'); return; }

    // Increment views (fire and forget)
    if (!listing.id.startsWith('demo_')) {
      fetch(`tables/listings/${id}`, {
        method:'PATCH',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ views: (listing.views||0) + 1 })
      }).catch(()=>{});
      listing.views = (listing.views||0) + 1;
    }

    const photos  = parsePhotos(listing.photos);
    const cat     = CATEGORIES[listing.category] || CATEGORIES.other;
    const cond    = CONDITION_LABELS[listing.condition] || {};
    const user    = Auth.getUser();
    const isOwner = user && user.id === listing.seller_id;
    const deposit = Reservations.calcDeposit(listing.price, listing.deposit_pct || 15);
    const deposit3h  = deposit;
    const deposit12h = deposit;

    // Gallery HTML
    let galleryHtml;
    if (photos.length > 0) {
      const imgs = photos.map((p,i) =>
        `<img class="detail-gallery-img${i===0?' active':''}" src="${p}" alt="Zdjęcie ${i+1}" data-idx="${i}" loading="lazy"/>`
      ).join('');
      const dots = photos.map((_,i) =>
        `<button class="gallery-dot${i===0?' active':''}" onclick="setPhoto(${i})" aria-label="Zdjęcie ${i+1}"></button>`
      ).join('');
      galleryHtml = `
        <div class="detail-gallery" id="detailGallery">
          ${imgs}
          ${photos.length>1 ? `
            <button class="gallery-nav-btn gallery-prev" onclick="changePhoto(-1)" aria-label="Poprzednie"><i class="fa fa-chevron-left"></i></button>
            <button class="gallery-nav-btn gallery-next" onclick="changePhoto(1)" aria-label="Następne"><i class="fa fa-chevron-right"></i></button>
            <div class="gallery-dots">${dots}</div>` : ''}
        </div>`;
    } else {
      galleryHtml = `<div class="detail-gallery-placeholder">${cat.emoji}</div>`;
    }

    // Reservation / status block
    let statusBlock = '';
    const hasReservation = listing.status === 'reserved';
    if (hasReservation) {
      statusBlock = `
        <div class="reservation-card">
          <div class="d-flex align-center gap-8">
            <i class="fa fa-lock text-amber"></i>
            <strong>Ogłoszenie zarezerwowane</strong>
          </div>
          <div class="reservation-timer" id="resTimer">⌛ Ładowanie…</div>
          <p style="font-size:.78rem;color:var(--text-3)">Rezerwacja wygaśnie automatycznie</p>
        </div>`;
    } else if (listing.reservation_enabled) {
      statusBlock = `
        <div class="reservation-card available">
          <div class="d-flex align-center gap-8 mb-0" style="margin-bottom:8px">
            <i class="fa fa-shield-alt text-brand"></i>
            <strong>Rezerwacja z depozytem</strong>
          </div>
          <p style="font-size:.8rem;color:var(--text-2);margin-bottom:10px">Zabezpiecz spotkanie wpłacając kaucję</p>
          <div class="reservation-actions">
            <button class="res-btn res-btn-3h" onclick="Reservations.openFlow('${listing.id}', 3, ${deposit3h})">
              🕐 3h · ${fmtPrice(deposit3h)}
            </button>
            <button class="res-btn res-btn-12h" onclick="Reservations.openFlow('${listing.id}', 12, ${deposit12h})">
              🕛 12h · ${fmtPrice(deposit12h)}
            </button>
          </div>
          <div class="escrow-info">
            <strong>Jak działa escrow?</strong>
            <ul>
              <li>Kupujący nie przybył → 70% kaucji do sprzedającego</li>
              <li>Sprzedający wycofał → 100% zwrot do kupującego</li>
              <li>30% prowizji platformy</li>
            </ul>
          </div>
        </div>`;
    }

    // Pickup code (for buyer)
    let pickupBlock = '';
    if (user && listing.buyer_id === user.id && listing.status === 'reserved') {
      pickupBlock = `
        <div class="pickup-code-box">
          <div class="pickup-code-label"><i class="fa fa-qrcode"></i> Twój kod odbioru</div>
          <div class="pickup-code-value" id="pickupCodeDisplay">••••</div>
          <p style="font-size:.75rem;color:var(--text-3);margin-top:6px">Podaj sprzedającemu przy odbiorze</p>
        </div>`;
    }

    // Action buttons
    let actionsHtml = '';
    if (isOwner) {
      actionsHtml = `
        <div class="owner-actions">
          <button class="action-btn action-btn-chat" onclick="App.featureListing('${listing.id}')">
            <i class="fa fa-star"></i> Wyróżnij
          </button>
          <button class="action-btn action-btn-offer" onclick="App.markAsSold('${listing.id}')">
            <i class="fa fa-check-circle"></i> Sprzedane
          </button>
          <button class="btn-danger action-btn" onclick="App.deleteListing('${listing.id}')">
            <i class="fa fa-trash"></i> Usuń
          </button>
        </div>`;
      // Active reservation confirmation
      if (listing.status === 'reserved') {
        actionsHtml += `
          <div style="margin-top:12px;background:var(--bg-3);border-radius:var(--r);padding:12px;border:1px solid var(--border)">
            <p style="font-size:.82rem;font-weight:600;margin-bottom:8px">Potwierdź odbiór – wpisz kod kupującego:</p>
            <div style="display:flex;gap:8px">
              <input type="text" id="confirmCodeInput" class="form-input" placeholder="0000" maxlength="4"
                     style="text-align:center;font-size:1.3rem;letter-spacing:.2em;max-width:120px"/>
              <button class="btn-primary" onclick="App.confirmPickupCode('${listing.id}')">Potwierdź</button>
            </div>
          </div>`;
      }
    } else if (!hasReservation) {
      actionsHtml = `
        <div class="buyer-actions">
          <button class="action-btn action-btn-chat" onclick="Chat.openFromListing('${listing.id}','${listing.seller_id}');closeModal('listingModal')">
            <i class="fa fa-comments"></i> Napisz
          </button>
          <button class="action-btn action-btn-offer" onclick="App.openOfferModal('${listing.id}',${listing.price})">
            <i class="fa fa-tag"></i> Zaproponuj cenę
          </button>
        </div>`;
    }

    // Seller info
    const sellerInitial = (listing.seller_name || '?')[0].toUpperCase();
    const sellerHtml = `
      <div class="detail-section">
        <div class="detail-section-title">Sprzedający</div>
        <div class="seller-card">
          <div class="seller-avatar">${sellerInitial}</div>
          <div>
            <div class="seller-name">${escHtml(listing.seller_name || 'Użytkownik')}</div>
            <div class="seller-rating"><i class="fa fa-star"></i><i class="fa fa-star"></i><i class="fa fa-star"></i><i class="fa fa-star"></i><i class="fa fa-star-half-alt"></i><span>4.5 (5 ocen)</span></div>
            ${listing.seller_verified ? '<div class="seller-verified"><i class="fa fa-check-circle"></i> Zweryfikowany</div>' : ''}
          </div>
          <button class="action-btn action-btn-chat" style="margin-left:auto;min-width:auto;padding:8px 14px"
                  onclick="Chat.openFromListing('${listing.id}','${listing.seller_id}');closeModal('listingModal')">
            <i class="fa fa-comments"></i>
          </button>
        </div>
      </div>`;

    // Map mini-preview
    const mapPreview = (listing.lat && listing.lng)
      ? `<div class="detail-section">
           <div class="detail-section-title">Lokalizacja</div>
           <div class="detail-map-preview" id="detailMiniMap" onclick="MapModule.flyTo(${listing.lat},${listing.lng});closeModal('listingModal');App.switchToMapView()"></div>
         </div>`
      : '';

    // Full modal content
    document.getElementById('listingModalContent').innerHTML = `
      ${galleryHtml}
      <div class="detail-body">
        <div class="detail-price-row">
          <div class="detail-price">${fmtPrice(listing.price)}</div>
          <span class="badge ${listing.status==='active'?'badge-success':listing.status==='reserved'?'badge-warning':'badge-muted'}">
            ${listing.status==='active'?'Dostępne':listing.status==='reserved'?'Zarezerwowane':'Nieaktywne'}
          </span>
        </div>
        <div class="detail-title">${escHtml(listing.title)}</div>
        <div class="detail-meta">
          ${cat.emoji ? `<span class="detail-tag"><i class="fa fa-tag"></i>${cat.label}</span>` : ''}
          ${cond.label ? `<span class="detail-tag">${cond.label}</span>` : ''}
          <span class="detail-tag"><i class="fa fa-map-marker-alt"></i>${escHtml(listing.location||'Oświęcim')}</span>
          <span class="detail-tag"><i class="fa fa-eye"></i> ${listing.views||0} wyświetleń</span>
        </div>
        ${listing.description ? `<div class="detail-description">${escHtml(listing.description)}</div>` : ''}
        ${statusBlock}
        ${pickupBlock}
        ${actionsHtml}
        ${sellerHtml}
        ${mapPreview}
      </div>`;

    openModal('listingModal');

    // Init mini-map
    if (listing.lat && listing.lng) {
      setTimeout(() => MapModule.initMiniMap('detailMiniMap', listing.lat, listing.lng), 100);
    }

    // Start reservation countdown
    if (listing.status === 'reserved' && listing.reservation_expiry) {
      Reservations.startCountdown(listing.reservation_expiry, 'resTimer');
    }

    // Load pickup code if buyer
    if (user && listing.buyer_id === user.id && listing.status === 'reserved') {
      loadPickupCode(listing.id);
    }
  }

  async function loadPickupCode(listingId) {
    try {
      const r = await fetch(`tables/reservations?search=${listingId}`);
      const d = await r.json();
      const res = (d.data||[]).find(r => r.listing_id === listingId && r.status === 'active');
      if (res && res.pickup_code) {
        document.getElementById('pickupCodeDisplay').textContent = res.pickup_code;
      }
    } catch(_) {}
  }

  /* ── Gallery navigation ───────────────────────────────────── */
  window.setPhoto = function(idx) {
    const imgs = document.querySelectorAll('.detail-gallery-img');
    const dots = document.querySelectorAll('.gallery-dot');
    imgs.forEach((img,i) => img.classList.toggle('active', i===idx));
    dots.forEach((dot,i) => dot.classList.toggle('active', i===idx));
  };

  window.changePhoto = function(dir) {
    const imgs = document.querySelectorAll('.detail-gallery-img');
    if (!imgs.length) return;
    let cur = 0;
    imgs.forEach((img,i) => { if (img.classList.contains('active')) cur = i; });
    const next = (cur + dir + imgs.length) % imgs.length;
    setPhoto(next);
  };

  /* ── Open Offer Modal ─────────────────────────────────────── */
  function openOfferModal(listingId, currentPrice) {
    document.getElementById('offerCurrentPrice').textContent = `Aktualna cena: ${fmtPrice(currentPrice)}`;
    document.getElementById('offerAmount').value = '';
    document.getElementById('offerMessage').value = '';
    // store listing id for chat module
    window._offerListingId = listingId;
    window._offerSellerId  = allListings.find(l=>l.id===listingId)?.seller_id || '';
    closeModal('listingModal');
    openModal('offerModal');
  }

  /* ── Confirm pickup code ──────────────────────────────────── */
  async function confirmPickupCode(listingId) {
    const code = document.getElementById('confirmCodeInput')?.value?.trim();
    if (!code || code.length !== 4) { showToast('Wpisz 4-cyfrowy kod', 'warning'); return; }
    const success = await Reservations.confirmPickup(listingId, code);
    if (success) {
      closeModal('listingModal');
      showView('dashboard');
    }
  }

  /* ── Owner actions ────────────────────────────────────────── */
  async function featureListing(id) {
    try {
      const listing = allListings.find(l => l.id === id);
      if (!listing) return;
      if (id.startsWith('demo_')) { showToast('Demo: wyróżnienie niedostępne', 'info'); return; }
      // Show payment prompt
      openFeaturedPayment(id);
    } catch(_) {}
  }

  function openFeaturedPayment(listingId) {
    document.getElementById('featuredPayContent').innerHTML = `
      <div class="modal-body">
        <p style="font-size:.9rem;color:var(--text-2);margin-bottom:16px">
          Wyróżnienie sprawi, że Twoje ogłoszenie pojawi się na szczycie wyników przez 7 dni.
        </p>
        <div class="payment-summary" style="background:var(--bg-3);border-radius:var(--r);padding:12px;margin-bottom:14px">
          <div class="payment-summary-row">
            <span>Wyróżnienie 7 dni</span><strong>4,99 zł</strong>
          </div>
        </div>
        <button class="btn-primary btn-full" onclick="App.processFeatured('${listingId}')">
          <i class="fa fa-star"></i> Zapłać 4,99 zł (demo)
        </button>
      </div>`;
    closeModal('listingModal');
    openModal('featuredPayModal');
  }

  async function processFeatured(listingId) {
    await sleep(800);
    if (!listingId.startsWith('demo_')) {
      await fetch(`tables/listings/${listingId}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ featured: true })
      });
    }
    const l = allListings.find(x => x.id === listingId);
    if (l) l.featured = true;
    closeModal('featuredPayModal');
    showToast('✨ Ogłoszenie wyróżnione na 7 dni!', 'success');
    applyFilters();
  }

  async function markAsSold(id) {
    if (!confirm('Oznaczyć jako sprzedane?')) return;
    if (!id.startsWith('demo_')) {
      await fetch(`tables/listings/${id}`, {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status: 'sold' })
      });
    }
    allListings = allListings.filter(l => l.id !== id);
    closeModal('listingModal');
    showToast('✅ Oznaczono jako sprzedane', 'success');
    applyFilters();
  }

  async function deleteListing(id) {
    if (!confirm('Usunąć ogłoszenie? Tej operacji nie można cofnąć.')) return;
    if (!id.startsWith('demo_')) {
      await fetch(`tables/listings/${id}`, { method:'DELETE' });
    }
    allListings = allListings.filter(l => l.id !== id);
    closeModal('listingModal');
    showToast('Ogłoszenie usunięte', 'info');
    applyFilters();
    loadDashboard();
  }

  /* ── Switch to map view ──────────────────────────────────── */
  function switchToMapView() {
    showView('home');
    switchView('map');
  }

  /* ══════════════════════════════════════════════════════════
     ADD LISTING
  ══════════════════════════════════════════════════════════ */
  function handlePhotos(input) {
    const files = Array.from(input.files);
    const remaining = 8 - uploadedPhotos.length;
    files.slice(0, remaining).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        uploadedPhotos.push(e.target.result);
        renderPhotoGrid();
      };
      reader.readAsDataURL(file);
    });
    input.value = '';
  }

  function renderPhotoGrid() {
    const grid = document.getElementById('photoGrid');
    if (!grid) return;
    grid.innerHTML = uploadedPhotos.map((src, i) => `
      <div class="photo-thumb-wrap">
        <img src="${src}" alt="Zdjęcie ${i+1}"/>
        ${i===0 ? '<span class="photo-main-badge">Główne</span>' : ''}
        <button class="photo-remove" onclick="App.removePhoto(${i})" aria-label="Usuń zdjęcie">
          <i class="fa fa-times"></i>
        </button>
      </div>`).join('') + (uploadedPhotos.length < 8 ? `
      <label class="photo-add-btn" for="photoInput" aria-label="Dodaj zdjęcie">
        <i class="fa fa-camera"></i><span>Dodaj</span>
      </label>
      <input type="file" id="photoInput" accept="image/*" multiple style="display:none" onchange="App.handlePhotos(this)"/>
    ` : '');
  }

  function removePhoto(idx) {
    uploadedPhotos.splice(idx, 1);
    renderPhotoGrid();
  }

  async function submitListing() {
    if (!Auth.isLoggedIn()) { openModal('authModal'); return; }
    const user  = Auth.getUser();
    const title = document.getElementById('listingTitle')?.value?.trim();
    const price = parseFloat(document.getElementById('listingPrice')?.value);
    const cat   = document.getElementById('listingCategory')?.value;
    const cond  = document.getElementById('listingCondition')?.value;

    if (!title) { showToast('Podaj tytuł ogłoszenia', 'warning'); return; }
    if (!price || price <= 0) { showToast('Podaj prawidłową cenę', 'warning'); return; }
    if (!cat)  { showToast('Wybierz kategorię', 'warning'); return; }
    if (!cond) { showToast('Wybierz stan przedmiotu', 'warning'); return; }

    const payload = {
      title, price, category: cat, condition: cond,
      description: document.getElementById('listingDescription')?.value?.trim() || '',
      location:    document.getElementById('listingLocation')?.value?.trim() || 'Oświęcim',
      lat:  parseFloat(document.getElementById('listingLat')?.value) || 50.0347,
      lng:  parseFloat(document.getElementById('listingLng')?.value) || 19.2134,
      photos: uploadedPhotos,
      reservation_enabled: document.getElementById('reservationToggle')?.checked || false,
      deposit_pct: parseInt(document.getElementById('depositPct')?.value) || 15,
      featured: document.getElementById('featuredToggle')?.checked || false,
      seller_id:   user.id,
      seller_name: user.name,
      seller_verified: user.verified || false,
      status: 'active', views: 0,
      created_at: Date.now(),
    };

    const submitBtn = document.querySelector('#addListingModal .btn-primary');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Publikowanie…'; }

    try {
      let newListing;
      try {
        const r = await fetch('tables/listings', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(payload)
        });
        if (!r.ok) throw new Error('API');
        newListing = await r.json();
      } catch(_) {
        newListing = { ...payload, id: 'local_' + Date.now() };
      }

      allListings.unshift(newListing);
      applyFilters();
      closeModal('addListingModal');
      resetListingForm();
      showToast('🎉 Ogłoszenie opublikowane!', 'success', 4000);

      // Featured payment
      if (payload.featured) {
        setTimeout(() => openFeaturedPayment(newListing.id), 500);
      }
    } finally {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = '<i class="fa fa-check"></i> Opublikuj ogłoszenie'; }
    }
  }

  function resetListingForm() {
    uploadedPhotos = [];
    ['listingTitle','listingPrice','listingDescription','listingLocation','listingLat','listingLng'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['listingCategory','listingCondition'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.selectedIndex = 0;
    });
    ['reservationToggle','featuredToggle'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });
    document.getElementById('reservationOptions').style.display = 'none';
    document.getElementById('titleCounter').textContent = '0';
    renderPhotoGrid();
  }

  /* ══════════════════════════════════════════════════════════
     DASHBOARD
  ══════════════════════════════════════════════════════════ */
  async function loadDashboard() {
    const user = Auth.getUser();
    if (!user) { showView('home'); return; }

    const myListings = allListings.filter(l => l.seller_id === user.id);
    const totalViews = myListings.reduce((s, l) => s + (l.views||0), 0);

    // Stats
    document.getElementById('statTotal').textContent = myListings.length;
    document.getElementById('statViews').textContent = totalViews;
    document.getElementById('statReservations').textContent = myListings.filter(l => l.status === 'reserved').length;
    document.getElementById('statSold').textContent = allListings.filter(l => l.seller_id === user.id && l.status === 'sold').length;

    const grid  = document.getElementById('myListingsGrid');
    const empty = document.getElementById('dashEmpty');
    if (!grid) return;
    if (myListings.length === 0) {
      grid.innerHTML = '';
      if (empty) empty.style.display = '';
    } else {
      if (empty) empty.style.display = 'none';
      grid.innerHTML = myListings.map(renderCard).join('');
    }
  }

  /* ══════════════════════════════════════════════════════════
     ADMIN PANEL
  ══════════════════════════════════════════════════════════ */
  async function loadAdminTab(tab) {
    const content = document.getElementById('adminContent');
    if (!content) return;
    content.innerHTML = '<div class="spinner"></div>';

    if (tab === 'overview') {
      const totalListings = allListings.length;
      const activeListings = allListings.filter(l=>l.status==='active').length;
      const reservedListings = allListings.filter(l=>l.status==='reserved').length;
      let userCount = 0, resvCount = 0;
      try {
        const ur = await fetch('tables/users?limit=1');
        if (ur.ok) { const ud = await ur.json(); userCount = ud.total||0; }
        const rr = await fetch('tables/reservations?limit=1');
        if (rr.ok) { const rd = await rr.json(); resvCount = rd.total||0; }
      } catch(_){}
      content.innerHTML = `
        <div class="admin-stat-grid">
          ${adminStat('Ogłoszenia', totalListings, 'fa-list', 'var(--brand)')}
          ${adminStat('Aktywne', activeListings, 'fa-check-circle', 'var(--blue)')}
          ${adminStat('Zarezerwowane', reservedListings, 'fa-lock', 'var(--amber)')}
          ${adminStat('Użytkownicy', userCount||'—', 'fa-users', 'var(--purple)')}
          ${adminStat('Rezerwacje', resvCount||'—', 'fa-calendar', 'var(--cyan)')}
          ${adminStat('Przychód (est.)', '—', 'fa-coins', 'var(--amber)')}
        </div>
        <h3 style="font-size:.85rem;font-weight:700;color:var(--text-2);margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em">Ostatnie ogłoszenia</h3>
        <div class="listings-grid">${allListings.slice(0,6).map(renderCard).join('')}</div>`;

    } else if (tab === 'listings') {
      content.innerHTML = `
        <div style="overflow-x:auto">
          <table class="admin-table">
            <thead><tr>
              <th>Tytuł</th><th>Cena</th><th>Status</th><th>Kategoria</th><th>Wyświetlenia</th><th>Akcje</th>
            </tr></thead>
            <tbody>
              ${allListings.slice(0,50).map(l => `<tr>
                <td style="max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(l.title)}</td>
                <td>${fmtPrice(l.price)}</td>
                <td><span class="badge ${l.status==='active'?'badge-success':l.status==='reserved'?'badge-warning':'badge-muted'}">${l.status}</span></td>
                <td>${CATEGORIES[l.category]?.emoji||''} ${CATEGORIES[l.category]?.label||l.category}</td>
                <td>${l.views||0}</td>
                <td>
                  <button class="admin-action-btn btn-danger" onclick="App.deleteListing('${l.id}')">Usuń</button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;

    } else if (tab === 'users') {
      let users = [];
      try {
        const r = await fetch('tables/users?limit=100');
        if (r.ok) { const d = await r.json(); users = d.data||[]; }
      } catch(_){}
      content.innerHTML = users.length ? `
        <div style="overflow-x:auto">
          <table class="admin-table">
            <thead><tr><th>Imię</th><th>E-mail</th><th>Admin</th><th>Zweryfikowany</th></tr></thead>
            <tbody>${users.map(u=>`<tr>
              <td>${escHtml(u.name||'—')}</td>
              <td>${escHtml(u.email||'—')}</td>
              <td>${u.is_admin?'<span class="badge badge-warning">Admin</span>':'—'}</td>
              <td>${u.verified?'<span class="badge badge-success">Tak</span>':'<span class="badge badge-muted">Nie</span>'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>` : '<p class="text-muted text-center">Brak danych o użytkownikach</p>';

    } else if (tab === 'reservations') {
      let reservations = [];
      try {
        const r = await fetch('tables/reservations?limit=100');
        if (r.ok) { const d = await r.json(); reservations = d.data||[]; }
      } catch(_){}
      content.innerHTML = reservations.length ? `
        <div style="overflow-x:auto">
          <table class="admin-table">
            <thead><tr><th>ID</th><th>Listing</th><th>Depozyt</th><th>Status</th><th>Ważność</th></tr></thead>
            <tbody>${reservations.map(r=>`<tr>
              <td style="font-size:.72rem;color:var(--text-3)">${r.id?.slice(0,8)||'—'}</td>
              <td style="font-size:.78rem">${r.listing_id?.slice(0,12)||'—'}…</td>
              <td>${r.deposit_amount ? fmtPrice(r.deposit_amount) : '—'}</td>
              <td><span class="badge ${r.status==='active'?'badge-warning':r.status==='completed'?'badge-success':'badge-muted'}">${r.status||'—'}</span></td>
              <td style="font-size:.78rem">${r.expiry ? new Date(r.expiry).toLocaleString('pl-PL') : '—'}</td>
            </tr>`).join('')}</tbody>
          </table>
        </div>` : '<p class="text-muted text-center">Brak rezerwacji</p>';
    }
  }

  function adminStat(label, value, icon, color) {
    return `<div class="stat-card">
      <div class="stat-icon" style="color:${color}"><i class="fa ${icon}"></i></div>
      <div class="stat-value">${value}</div>
      <div class="stat-label">${label}</div>
    </div>`;
  }

  /* ══════════════════════════════════════════════════════════
     STATIC PAGES
  ══════════════════════════════════════════════════════════ */
  const STATIC_PAGES = {
    about: {
      title: 'O nas',
      content: `
        <h1>O projekcie LokalnieOSW</h1>
        <p>LokalnieOSW to lokalny marketplace dla mieszkańców Oświęcimia i okolic. Naszym celem jest stworzenie bezpiecznego i przyjaznego miejsca do kupowania i sprzedawania używanych rzeczy w Twojej okolicy.</p>
        <h2>Nasza misja</h2>
        <p>Wierzymy, że lokalna wymiana towarów jest ekologiczna, ekonomiczna i buduje społeczność. Każda sprzedana rzecz to mniej odpadów i więcej pieniędzy w Twoim portfelu.</p>
        <h2>Jak działamy?</h2>
        <ul>
          <li>Bezpłatne dodawanie ogłoszeń dla każdego</li>
          <li>System rezerwacji z depozytem zabezpiecza transakcję</li>
          <li>Bezpośredni kontakt między kupującym a sprzedającym</li>
          <li>Aplikacja PWA – działa jak natywna aplikacja na telefonie</li>
        </ul>
        <h2>Kontakt</h2>
        <p>Masz pytania lub sugestie? Napisz do nas: <a href="mailto:kontakt@lokalnieosw.pl">kontakt@lokalnieosw.pl</a></p>`
    },
    pricing: {
      title: 'Cennik',
      content: `
        <h1>Cennik LokalnieOSW</h1>
        <p>Wierzymy w przejrzystość. Oto wszystko co musisz wiedzieć o opłatach.</p>
        <h2>Darmowe</h2>
        <ul>
          <li>Dodawanie ogłoszeń – bezpłatnie</li>
          <li>Przeglądanie ogłoszeń – bezpłatnie</li>
          <li>Wysyłanie wiadomości – bezpłatnie</li>
          <li>Rejestracja konta – bezpłatnie</li>
        </ul>
        <h2>Płatne funkcje</h2>
        <ul>
          <li><strong>Wyróżnienie ogłoszenia</strong> – 4,99 zł / 7 dni</li>
          <li><strong>Prowizja od rezerwacji</strong> – 30% wartości depozytu (tylko jeśli kupujący nie odbierze)</li>
        </ul>
        <h2>Depozyt rezerwacyjny</h2>
        <p>Sprzedający może ustawić depozyt w wysokości 5–30% ceny. Standardowo 15%. Minimalna kwota to 5 zł.</p>
        <ul>
          <li>Kupujący odbierze → depozyt w całości zwrócony</li>
          <li>Kupujący nie odbierze → 70% dla sprzedającego, 30% prowizja</li>
          <li>Sprzedający wycofał → 100% zwrot dla kupującego</li>
        </ul>`
    },
    terms: {
      title: 'Regulamin',
      content: `
        <h1>Regulamin LokalnieOSW</h1>
        <p><em>Obowiązuje od: 1 stycznia 2025</em></p>
        <h2>§1 Postanowienia ogólne</h2>
        <p>LokalnieOSW jest platformą marketplace umożliwiającą wystawianie ogłoszeń przez osoby fizyczne.</p>
        <h2>§2 Warunki korzystania</h2>
        <ul>
          <li>Użytkownik zobowiązuje się do podawania prawdziwych danych</li>
          <li>Zabrania się wystawiania rzeczy nielegalnych, niebezpiecznych lub podrobionych</li>
          <li>Każde ogłoszenie musi opisywać rzeczywisty przedmiot</li>
        </ul>
        <h2>§3 Rezerwacje i depozyty</h2>
        <p>System rezerwacji działa zgodnie z opisem w Cenniku. Platforma pośredniczy w przekazywaniu środków z depozytu.</p>
        <h2>§4 Ochrona danych</h2>
        <p>Dane przetwarzane są zgodnie z RODO. Szczegóły w Polityce Prywatności.</p>
        <h2>§5 Kontakt</h2>
        <p><a href="mailto:kontakt@lokalnieosw.pl">kontakt@lokalnieosw.pl</a></p>`
    },
    privacy: {
      title: 'Polityka prywatności',
      content: `
        <h1>Polityka Prywatności</h1>
        <p>Dbamy o Twoją prywatność. Zbieramy tylko dane niezbędne do działania platformy.</p>
        <h2>Jakie dane zbieramy?</h2>
        <ul>
          <li>Imię i adres e-mail przy rejestracji</li>
          <li>Dane ogłoszeń które wystawiasz</li>
          <li>Historia wiadomości</li>
        </ul>
        <h2>Jak używamy danych?</h2>
        <p>Dane służą wyłącznie do obsługi platformy. Nie sprzedajemy ich stronom trzecim.</p>
        <h2>Prawa użytkownika</h2>
        <p>Masz prawo do dostępu, poprawy i usunięcia swoich danych. Kontakt: <a href="mailto:kontakt@lokalnieosw.pl">kontakt@lokalnieosw.pl</a></p>`
    }
  };

  function showStaticPage(name) {
    const page = STATIC_PAGES[name];
    if (!page) return;
    document.getElementById('staticContent').innerHTML = `
      <h1 style="font-size:1.5rem;font-weight:800;color:var(--text-1);margin-bottom:16px">${page.title}</h1>
      ${page.content}`;
    showView('static');
  }

  /* ══════════════════════════════════════════════════════════
     PWA INSTALL
  ══════════════════════════════════════════════════════════ */
  async function installPWA() {
    if (!deferredPrompt) { showToast('Instalacja niedostępna w tej przeglądarce', 'info'); return; }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') showToast('✅ Aplikacja zainstalowana!', 'success');
    deferredPrompt = null;
    document.getElementById('installPrompt').style.display = 'none';
  }

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function fmtPrice(p) {
    if (p === undefined || p === null) return '—';
    return new Intl.NumberFormat('pl-PL', { style:'currency', currency:'PLN', minimumFractionDigits:0, maximumFractionDigits:2 }).format(p);
  }

  function escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function parsePhotos(photos) {
    if (!photos) return [];
    if (Array.isArray(photos)) return photos;
    try { return JSON.parse(photos); } catch(_) { return []; }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* expose helpers globally */
  window.fmtPrice = fmtPrice;
  window.escHtml  = escHtml;

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */
  return {
    boot,
    showView,
    switchView,
    switchToMapView,
    applyFilters,
    resetFilters,
    filterByCategory,
    renderListView,
    openListingDetail,
    openOfferModal,
    confirmPickupCode,
    featureListing,
    processFeatured,
    markAsSold,
    deleteListing,
    handlePhotos,
    removePhoto,
    submitListing,
    loadDashboard,
    loadAdminTab,
    showStaticPage,
    installPWA,
    getAll: () => allListings,
    getFiltered: () => filteredListings,
  };

})();

/* ── Boot on DOM ready ─────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => App.boot());
