/* ═══════════════════════════════════════════════════════════════
   LokalnieOSW v2.1 – Map.js  (Leaflet map module)
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const MapModule = (() => {

  /* ── CONFIG ───────────────────────────────────────────────── */
  const OSW_CENTER  = [50.0347, 19.2134];
  const OSW_ZOOM    = 13;
  const OSW_RADIUS  = 20000; // 20 km

  const TILE_URL    = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  const TILE_ATTR   = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

  /* ── STATE ────────────────────────────────────────────────── */
  let map         = null;
  let markers     = [];       // { marker, listing }
  let pickerMap   = null;
  let pickerMarker= null;
  let miniMaps    = {};       // id → L.map instances
  let userLocCirc = null;

  /* ══════════════════════════════════════════════════════════
     INIT MAIN MAP
  ══════════════════════════════════════════════════════════ */
  function init() {
    const container = document.getElementById('map');
    if (!container || map) return;

    map = L.map('map', {
      center: OSW_CENTER,
      zoom:   OSW_ZOOM,
      zoomControl: false,
      attributionControl: false,
    });

    // Dark tile layer (CartoDB Dark Matter)
    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map);

    // Attribution (minimal)
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

    // Zoom control – top right
    L.control.zoom({ position: 'topright' }).addTo(map);

    // Radius circle
    L.circle(OSW_CENTER, {
      radius: OSW_RADIUS,
      color: 'rgba(34,197,94,0.4)',
      weight: 1.5,
      fill: true,
      fillColor: 'rgba(34,197,94,0.04)',
      fillOpacity: 1,
      dashArray: '6 4',
    }).addTo(map);

    // Center marker
    L.circleMarker(OSW_CENTER, {
      radius: 5, color: '#22c55e', weight: 2,
      fillColor: '#22c55e', fillOpacity: 0.8,
    }).addTo(map).bindTooltip('Oświęcim', { permanent: false, direction: 'top' });
  }

  /* ══════════════════════════════════════════════════════════
     RENDER MARKERS
  ══════════════════════════════════════════════════════════ */
  function renderMarkers(listings) {
    if (!map) return;

    // Clear existing
    markers.forEach(m => m.marker.remove());
    markers = [];

    if (!listings || listings.length === 0) return;

    listings.forEach(listing => {
      const lat = parseFloat(listing.lat);
      const lng = parseFloat(listing.lng);
      if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

      const marker = createPriceMarker(listing);
      marker.addTo(map);
      marker.on('click', () => showPopup(listing, marker));
      markers.push({ marker, listing });
    });
  }

  /* ── Price marker icon ────────────────────────────────────── */
  function createPriceMarker(listing) {
    const cls = ['price-marker'];
    if (listing.status === 'reserved') cls.push('reserved');
    else if (listing.featured) cls.push('featured');
    else if (listing.status === 'sold') cls.push('sold');

    const price = listing.price !== undefined
      ? new Intl.NumberFormat('pl-PL', { style:'currency', currency:'PLN', minimumFractionDigits:0 }).format(listing.price)
      : '—';

    const icon = L.divIcon({
      className: '',
      html: `<div class="${cls.join(' ')}">${price}</div>`,
      iconAnchor: [0, 0],
      iconSize: null,
    });

    return L.marker([listing.lat, listing.lng], { icon, riseOnHover: true });
  }

  /* ── Popup card ───────────────────────────────────────────── */
  function showPopup(listing, marker) {
    const photos = parsePhotos(listing.photos);
    const cat    = getCatEmoji(listing.category);
    const price  = typeof fmtPrice === 'function'
      ? fmtPrice(listing.price)
      : listing.price + ' zł';

    const imgHtml = photos.length
      ? `<img src="${photos[0]}" class="map-popup-img" alt="${escHtml(listing.title)}" loading="lazy"/>`
      : `<div class="map-popup-img">${cat}</div>`;

    let badges = '';
    if (listing.status === 'reserved') badges += `<span class="badge badge-warning">🔒 Zarezerwowane</span>`;
    if (listing.featured) badges += `<span class="badge badge-success">✨ Wyróżnione</span>`;

    const popup = L.popup({
      maxWidth: 230,
      minWidth: 220,
      className: 'osw-popup',
      closeButton: true,
      autoPan: true,
    }).setContent(`
      <div class="map-popup">
        ${imgHtml}
        <div class="map-popup-body">
          <div class="map-popup-price">${price}</div>
          <div class="map-popup-title">${escHtml(listing.title)}</div>
          ${badges ? `<div class="map-popup-meta">${badges}</div>` : ''}
          <button class="map-popup-btn" onclick="App.openListingDetail('${listing.id}');this.closest('.leaflet-popup').remove()">
            <i class="fa fa-eye"></i> Zobacz ogłoszenie
          </button>
        </div>
      </div>`);

    marker.bindPopup(popup).openPopup();
  }

  /* ══════════════════════════════════════════════════════════
     FILTER MARKERS
  ══════════════════════════════════════════════════════════ */
  function filterMarkers(category) {
    markers.forEach(({ marker, listing }) => {
      const show = category === 'all' || listing.category === category;
      if (show) marker.addTo(map);
      else map.removeLayer(marker);
    });
  }

  function filterMarkersBy(predicate) {
    markers.forEach(({ marker, listing }) => {
      if (predicate(listing)) marker.addTo(map);
      else map.removeLayer(marker);
    });
  }

  /* ══════════════════════════════════════════════════════════
     NAVIGATION
  ══════════════════════════════════════════════════════════ */
  function flyTo(lat, lng, zoom = 16) {
    if (!map) return;
    map.flyTo([lat, lng], zoom, { animate: true, duration: 1.0 });
  }

  function flyToListing(listingId) {
    const all = App.getAll ? App.getAll() : [];
    const l = all.find(x => x.id === listingId);
    if (l && l.lat && l.lng) flyTo(l.lat, l.lng);
  }

  function resetView() {
    if (!map) return;
    map.flyTo(OSW_CENTER, OSW_ZOOM, { animate: true, duration: 0.8 });
  }

  function invalidate() {
    if (map) setTimeout(() => map.invalidateSize(), 50);
  }

  /* ══════════════════════════════════════════════════════════
     USER LOCATION
  ══════════════════════════════════════════════════════════ */
  function locateUser() {
    if (!navigator.geolocation) {
      showToast('Geolokalizacja niedostępna', 'warning');
      return;
    }
    showToast('Szukam Twojej lokalizacji…', 'info', 2000);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (userLocCirc) map.removeLayer(userLocCirc);

        // Accuracy circle
        userLocCirc = L.circle([lat, lng], {
          radius: accuracy,
          color: '#3b82f6', weight: 1.5,
          fillColor: '#3b82f6', fillOpacity: 0.1,
        }).addTo(map);

        // Blue dot
        L.circleMarker([lat, lng], {
          radius: 8, color: '#fff', weight: 2,
          fillColor: '#3b82f6', fillOpacity: 1,
        }).addTo(map).bindTooltip('Jesteś tutaj', { permanent: false });

        flyTo(lat, lng, 15);
        showToast('📍 Lokalizacja znaleziona', 'success');
      },
      err => {
        const msgs = {
          1: 'Odmówiono dostępu do lokalizacji',
          2: 'Nie można ustalić lokalizacji',
          3: 'Przekroczono czas oczekiwania',
        };
        showToast(msgs[err.code] || 'Błąd geolokalizacji', 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  /* ══════════════════════════════════════════════════════════
     LOCATION PICKER (in add-listing form)
  ══════════════════════════════════════════════════════════ */
  function initPicker() {
    const wrap = document.getElementById('locationPicker');
    if (!wrap) return;
    wrap.style.display = '';

    if (pickerMap) {
      pickerMap.invalidateSize();
      return;
    }

    pickerMap = L.map('pickerMap', {
      center: OSW_CENTER,
      zoom: 14,
      zoomControl: true,
    });

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR,
      maxZoom: 19, subdomains: 'abcd',
    }).addTo(pickerMap);

    // Default marker
    pickerMarker = L.marker(OSW_CENTER, { draggable: true }).addTo(pickerMap);
    updatePickerFields(OSW_CENTER[0], OSW_CENTER[1]);

    // Click to place
    pickerMap.on('click', e => {
      const { lat, lng } = e.latlng;
      pickerMarker.setLatLng([lat, lng]);
      updatePickerFields(lat, lng);
      reverseGeocode(lat, lng);
    });

    // Drag end
    pickerMarker.on('dragend', e => {
      const { lat, lng } = e.target.getLatLng();
      updatePickerFields(lat, lng);
      reverseGeocode(lat, lng);
    });
  }

  function updatePickerFields(lat, lng) {
    const latEl = document.getElementById('listingLat');
    const lngEl = document.getElementById('listingLng');
    if (latEl) latEl.value = lat.toFixed(6);
    if (lngEl) lngEl.value = lng.toFixed(6);
  }

  async function reverseGeocode(lat, lng) {
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=pl`,
        { headers: { 'User-Agent': 'LokalnieOSW/2.1' } }
      );
      const d = await r.json();
      const addr = d.address;
      if (!addr) return;
      const parts = [
        addr.road || addr.pedestrian || addr.footway,
        addr.house_number,
        addr.city || addr.town || addr.village,
      ].filter(Boolean);
      const locEl = document.getElementById('listingLocation');
      if (locEl && parts.length) locEl.value = parts.join(' ');
    } catch(_) {}
  }

  /* ══════════════════════════════════════════════════════════
     MINI MAP (in listing detail modal)
  ══════════════════════════════════════════════════════════ */
  function initMiniMap(containerId, lat, lng) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Destroy previous if exists
    if (miniMaps[containerId]) {
      miniMaps[containerId].remove();
      delete miniMaps[containerId];
    }

    const m = L.map(containerId, {
      center: [lat, lng], zoom: 15,
      zoomControl: false, attributionControl: false,
      dragging: false, scrollWheelZoom: false,
      doubleClickZoom: false, touchZoom: false,
    });

    L.tileLayer(TILE_URL, {
      attribution: TILE_ATTR, maxZoom: 19, subdomains: 'abcd',
    }).addTo(m);

    L.circleMarker([lat, lng], {
      radius: 10, color: '#22c55e', weight: 2,
      fillColor: '#22c55e', fillOpacity: 0.9,
    }).addTo(m);

    miniMaps[containerId] = m;
  }

  /* ══════════════════════════════════════════════════════════
     UTILITIES
  ══════════════════════════════════════════════════════════ */
  function distance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  function parsePhotos(photos) {
    if (!photos) return [];
    if (Array.isArray(photos)) return photos;
    try { return JSON.parse(photos); } catch(_) { return []; }
  }

  function getCatEmoji(cat) {
    const MAP = { electronics:'💻', clothing:'👗', furniture:'🪑', sports:'⚽',
                  books:'📚', kids:'🧸', home:'🏡', other:'📦' };
    return MAP[cat] || '📦';
  }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */
  return {
    init,
    renderMarkers,
    filterMarkers,
    filterMarkersBy,
    flyTo,
    flyToListing,
    resetView,
    invalidate,
    locateUser,
    initPicker,
    initMiniMap,
    distance,
    getMap: () => map,
  };

})();
