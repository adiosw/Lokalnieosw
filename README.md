# LokalnieOSW v2.1 – Lokalny Marketplace PWA

> **Komercyjnie gotowa** aplikacja Progressive Web App dla lokalnego marketplace w Oświęcimiu i okolicach. Dark-mode design system, interaktywna mapa Leaflet, rezerwacje z depozytem escrow, czat z ofertami cenowymi, panel admina i pełna obsługa PWA.

---

## 🚀 Aktualnie zaimplementowane funkcje

### 🏪 Marketplace
- Przeglądanie ogłoszeń na **interaktywnej mapie** (Leaflet + CartoDB Dark tiles) z kolorowymi price-bubble markerami
- **Widok listy** z responsywną siatką kart ogłoszeń (3-kolumnowy grid na desktop)
- **Zaawansowane filtry**: kategoria, cena (min/max), stan, dystans (slider), dostępność, rezerwacja
- **Sortowanie**: wyróżnione, najnowsze, cena ↑↓, popularne
- **Debounce search** z autoclear buttonem
- 9 kategorii z emoji: Elektronika, Odzież, Meble, Sport, Książki, Dzieci, Dom, Inne
- Demo data (8 ogłoszeń) jako fallback gdy API niedostępne

### 📍 Mapa
- CartoDB Dark Matter tiles (pasuje do dark mode)
- Animowane **price-bubble markery** z kolorami: zielony (aktywne), żółty (zarezerwowane), gradient (wyróżnione)
- Popup karta po kliknięciu markera z podglądem zdjęcia i przyciskiem "Zobacz ogłoszenie"
- **Geolokalizacja** użytkownika z okręgiem dokładności
- **Odwrotne geokodowanie** Nominatim (auto-wypełnianie adresu przy zaznaczaniu lokalizacji)
- Mini-mapa w detalu ogłoszenia
- Picker lokalizacji w formularzu dodawania
- 20km radius circle wokół centrum Oświęcimia

### 📦 Ogłoszenia
- Formularz dodawania z **max 8 zdjęciami** (drag preview, remove, main badge)
- Licznik znaków tytułu (max 80)
- Toggle rezerwacji z suwakiem procentu depozytu (5–30%)
- Toggle "Wyróżnij" (4,99 zł / 7 dni)
- Szczegóły ogłoszenia: galeria ze strzałkami + dots, seller card, escrow info
- Akcje właściciela: Wyróżnij, Sprzedane, Usuń
- Akcje kupującego: Napisz, Zaproponuj cenę
- Licznik wyświetleń (PATCH na views)

### 🛡 Rezerwacje z Escrow
- Depozyt: 5–30% ceny, min 5 zł, max 30/80 zł
- Wybór czasu: **3h** lub **12h**
- Metody płatności: **BLIK** (formatter 6-cyfr), **Przelewy24**, **Karta** (formatter numeru/daty), **Przy odbiorze**
- Animowane przetwarzanie płatności z walidacją
- Modal sukcesu z **kodem odbioru 4-cyfrowym** + generowanie QR
- Countdown timer ze zmianą koloru (zielony → żółty → czerwony)
- Potwierdzenie odbioru: sprzedający wpisuje kod kupującego
- Escrow podział: 70% sprzedającemu / 30% platforma gdy no-show
- LocalStorage cache rezerwacji

### 💬 Czat
- Lista konwersacji z unread badges i time-ago
- Chat window z animowanymi wiadomościami (own/other/offer)
- **Oferty cenowe** z przyciskami Akceptuj/Odrzuć
- Szybki przycisk "Cena?" w oknie czatu
- **Read receipts** (✓ szary / ✓✓ zielony)
- Polling co 15 sekund po nowe wiadomości
- Demo rozmowy jako fallback

### 👤 Autoryzacja
- Google Sign-In (simulated, 1.1s delay)
- E-mail + hasło z walidacją
- Rejestracja z checkboxem regulaminu
- 3 konta demo: `admin@lokalnieosw.pl`/`admin123`, `marek@example.com`/`demo123`, `anna@example.com`/`demo123`
- Dropdown użytkownika z animacją
- Persistent session w localStorage (`osw_user_v2`)
- Show/hide password toggle

### 🛠 Panel Admina
- Zakładki: Przegląd, Ogłoszenia, Użytkownicy, Rezerwacje
- Stat karty z real-time danymi z API
- Tabele z paginacją i akcjami (usuń)
- Dostępny tylko dla is_admin=true

### 📱 PWA
- Service Worker v2.1 z strategiami Cache-first / Network-first / SWR
- Precache assets przy instalacji
- Background Sync (pending messages)
- **Push Notifications** (VAPID ready)
- Install prompt (pokazuje się po 8s, nie częściej niż co 2 tygodnie)
- `manifest.json` z shortcuts (Dodaj ogłoszenie, Moje ogłoszenia)
- Offline fallback do index.html

### 🎨 Design System
- Pełny dark mode design system (`--bg`, `--brand #22c55e`, `--red`, `--amber`, `--blue`, `--purple`)
- Glass morphism navbar + filter bar (backdrop-filter blur)
- Bottom nav z FAB add button
- Collapsible advanced filters panel
- Toast notifications (4 typy)
- Skeleton loaders
- Micro-animations (fadeIn, scaleIn, float, pulse, glow)
- Reduced motion support
- ARIA labels, role attributes, keyboard navigation (Escape, Enter)

---

## 🔗 Endpoints API (RESTful Table API)

| Endpoint | Metoda | Opis |
|---|---|---|
| `tables/listings?limit=200` | GET | Lista ogłoszeń |
| `tables/listings/:id` | GET | Szczegóły |
| `tables/listings` | POST | Nowe ogłoszenie |
| `tables/listings/:id` | PATCH | Aktualizacja (views, status) |
| `tables/listings/:id` | DELETE | Usuń |
| `tables/reservations` | POST | Nowa rezerwacja |
| `tables/reservations/:id` | PATCH | Aktualizacja statusu |
| `tables/messages?limit=200` | GET | Wiadomości |
| `tables/messages` | POST | Nowa wiadomość |
| `tables/messages/:id` | PATCH | Read receipt |
| `tables/users` | POST | Rejestracja |
| `tables/users?search=email` | GET | Wyszukaj użytkownika |

---

## 📁 Struktura plików

```
index.html              ← Główny plik HTML (39 KB) – wszystkie widoki i modale
css/
  main.css              ← Kompletny dark design system (61 KB)
  animations.css        ← Micro-interactions i animacje (8 KB)
js/
  app.js                ← Core moduł aplikacji (49 KB)
  auth.js               ← Autoryzacja (16 KB)
  map.js                ← Leaflet mapa (12 KB)
  reservations.js       ← Rezerwacje + escrow (20 KB)
  chat.js               ← Wiadomości (23 KB)
icons/                  ← PWA ikony (72–512px)
screenshots/            ← PWA screenshots
manifest.json           ← PWA manifest z shortcuts
sw.js                   ← Service Worker v2.1 (8 KB)
README.md               ← Ta dokumentacja
```

---

## 🔐 Modele danych

### Listing
```json
{
  "id": "uuid",
  "title": "string (max 80)",
  "price": "number",
  "category": "electronics|clothing|furniture|sports|books|kids|home|other",
  "condition": "new|like_new|good|fair",
  "description": "string",
  "location": "string",
  "lat": "number",
  "lng": "number",
  "photos": "array (max 8, base64)",
  "status": "active|reserved|sold",
  "reservation_enabled": "boolean",
  "deposit_pct": "number (5-30)",
  "featured": "boolean",
  "seller_id": "string",
  "seller_name": "string",
  "buyer_id": "string",
  "reservation_expiry": "timestamp",
  "views": "number",
  "created_at": "timestamp"
}
```

### Reservation
```json
{
  "id": "uuid",
  "listing_id": "string",
  "buyer_id": "string",
  "deposit_amount": "number",
  "platform_fee": "number (30%)",
  "seller_cut": "number (70%)",
  "duration_hours": "3|12",
  "start": "timestamp",
  "expiry": "timestamp",
  "status": "active|completed|expired|cancelled",
  "pickup_code": "string (4-digit)",
  "payment_method": "blik|p24|card|cash",
  "payment_ref": "string",
  "picked_up": "boolean",
  "created_at": "timestamp"
}
```

### Message
```json
{
  "id": "uuid",
  "sender_id": "string",
  "receiver_id": "string",
  "listing_id": "string",
  "text": "string",
  "offer_amount": "number (optional)",
  "read": "boolean",
  "created_at": "timestamp"
}
```

---

## ⚠️ Nie zaimplementowane / Wymagające integracji produkcyjnej

| Funkcja | Status | Uwagi |
|---|---|---|
| Prawdziwe Google OAuth 2.0 | ❌ Simulated | Wymaga Firebase Auth / Google Cloud |
| Przelewy24 API | ❌ Simulated | Wymaga konta merchantskiego |
| BLIK (PSP) | ❌ Simulated | Wymaga integracji z bankiem/PSP |
| Stripe/Tpay | ❌ Brak | Alternatywa dla Przelewy24 |
| VAPID Push Notifications | ⚠️ Partial | SW gotowy, brak serwera VAPID |
| E-mail weryfikacja | ❌ Brak | Wymaga SendGrid/Mailgun |
| SMS/OTP | ❌ Brak | Wymaga Twilio/SMSAPI |
| Moderacja AI ogłoszeń | ❌ Brak | Wymaga OpenAI API |
| Zdjęcia na CDN | ❌ Base64 | Wymaga S3/Cloudinary |
| Rating/opinie sprzedawców | ⚠️ UI only | Brak zapisu ocen |
| Historia transakcji | ❌ Brak | Wymaga rozbudowy modelu |
| Multi-język (i18n) | ❌ PL only | – |

---

## 🛠 Zalecane kolejne kroki

1. **Integracja płatności** – Przelewy24 Sandbox → produkcja (priorytet #1)
2. **Firebase Auth** – zastąpić simulated Google login
3. **Cloudinary** – upload zdjęć zamiast base64 (limit rozmiaru)
4. **Push Notifications** – backend VAPID (Node.js + web-push)
5. **E-mail** – potwierdzenie rejestracji, powiadomienia o rezerwacji
6. **SEO** – SSR/SSG (Next.js) dla lepszej indeksowalności
7. **Moderacja** – AI screening nowych ogłoszeń
8. **Analytics** – Google Analytics 4 / Plausible
9. **Testy** – Playwright E2E, Vitest unit tests
10. **CI/CD** – GitHub Actions → Vercel/Netlify deploy

---

## 🚀 Deploy

Aby uruchomić aplikację produkcyjnie, przejdź do zakładki **Publish** w panelu projektu.

- Brak wymagań serwerowych – statyczna aplikacja
- Wymaga HTTPS dla PWA / Service Worker
- Rekomendowane: Vercel, Netlify, Cloudflare Pages

---

*LokalnieOSW v2.1.0 · Oświęcim · Built with ❤️*
