/* ═══════════════════════════════════════════════════════════════
   LokalnieOSW v2.1 – Auth.js  (authentication module)
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const Auth = (() => {

  /* ── STATE ────────────────────────────────────────────────── */
  const STORAGE_KEY = 'osw_user_v2';
  let currentUser   = null;

  /* ── DEMO ACCOUNTS ────────────────────────────────────────── */
  const DEMO_ACCOUNTS = [
    { email:'admin@lokalnieosw.pl', password:'admin123',
      id:'usr_admin', name:'Administrator', is_admin:true, verified:true, avatar:'A' },
    { email:'marek@example.com', password:'demo123',
      id:'usr_demo1', name:'Marek Kowalski', is_admin:false, verified:true, avatar:'M' },
    { email:'anna@example.com', password:'demo123',
      id:'usr_demo2', name:'Anna Wiśniewska', is_admin:false, verified:true, avatar:'A' },
  ];

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  function init() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) currentUser = JSON.parse(stored);
    } catch(_) { currentUser = null; }
    updateUI();
  }

  /* ══════════════════════════════════════════════════════════
     GETTERS
  ══════════════════════════════════════════════════════════ */
  const getUser    = () => currentUser;
  const isLoggedIn = () => !!currentUser;
  const isAdmin    = () => !!(currentUser && currentUser.is_admin);

  /* ══════════════════════════════════════════════════════════
     LOGIN – GOOGLE (simulated)
  ══════════════════════════════════════════════════════════ */
  async function loginGoogle() {
    const btn = document.querySelector('.google-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Łączenie…'; }
    await sleep(1100);
    const user = {
      id:       'usr_g_' + Math.random().toString(36).slice(2,8),
      name:     'Użytkownik Google',
      email:    'user@gmail.com',
      avatar:   'G',
      verified: true,
      is_admin: false,
      provider: 'google',
    };
    setUser(user);
    closeModal('authModal');
    showToast(`👋 Witaj, ${user.name}!`, 'success');
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Kontynuuj z Google'; }
  }

  /* ══════════════════════════════════════════════════════════
     LOGIN – EMAIL / PASSWORD
  ══════════════════════════════════════════════════════════ */
  async function loginEmail() {
    const emailEl = document.getElementById('loginEmail');
    const passEl  = document.getElementById('loginPassword');
    const email   = emailEl?.value?.trim().toLowerCase();
    const pass    = passEl?.value;

    if (!email) { showToast('Podaj adres e-mail', 'warning'); emailEl?.focus(); return; }
    if (!pass)  { showToast('Podaj hasło', 'warning'); passEl?.focus(); return; }
    if (!isValidEmail(email)) { showToast('Nieprawidłowy format e-mail', 'warning'); return; }

    const btn = document.querySelector('#loginForm .btn-primary');
    setLoading(btn, true, 'Logowanie…');
    await sleep(900);

    const demo = DEMO_ACCOUNTS.find(a => a.email === email && a.password === pass);
    let user;
    if (demo) {
      const { password, ...rest } = demo;
      user = { ...rest, provider: 'email' };
    } else {
      // Try API
      try {
        const r = await fetch(`tables/users?search=${encodeURIComponent(email)}`);
        if (r.ok) {
          const d = await r.json();
          const found = (d.data||[]).find(u => u.email?.toLowerCase() === email);
          if (found) {
            user = { ...found, provider: 'email', verified: found.verified || false };
          }
        }
      } catch(_) {}

      if (!user) {
        // Generic unverified login (demo fallback)
        user = {
          id:       'usr_' + Math.random().toString(36).slice(2,8),
          name:     email.split('@')[0],
          email,
          avatar:   email[0].toUpperCase(),
          verified: false,
          is_admin: false,
          provider: 'email',
        };
      }
    }

    setLoading(btn, false);
    setUser(user);
    closeModal('authModal');

    const greeting = getGreeting();
    showToast(`${greeting} ${user.name}!`, 'success');
    if (user.is_admin) showToast('🛡️ Zalogowano jako Administrator', 'info', 4000);
  }

  /* ══════════════════════════════════════════════════════════
     REGISTER
  ══════════════════════════════════════════════════════════ */
  async function register() {
    const name    = document.getElementById('regName')?.value?.trim();
    const email   = document.getElementById('regEmail')?.value?.trim().toLowerCase();
    const phone   = document.getElementById('regPhone')?.value?.trim();
    const pass    = document.getElementById('regPassword')?.value;
    const terms   = document.getElementById('regTerms')?.checked;

    if (!name)  { showToast('Podaj imię i nazwisko', 'warning'); return; }
    if (!email) { showToast('Podaj adres e-mail', 'warning'); return; }
    if (!isValidEmail(email)) { showToast('Nieprawidłowy format e-mail', 'warning'); return; }
    if (!pass || pass.length < 8) { showToast('Hasło musi mieć minimum 8 znaków', 'warning'); return; }
    if (!terms) { showToast('Zaakceptuj Regulamin aby kontynuować', 'warning'); return; }

    const btn = document.querySelector('#registerForm .btn-primary');
    setLoading(btn, true, 'Rejestracja…');
    await sleep(1000);

    const user = {
      id:        'usr_' + Math.random().toString(36).slice(2,10),
      name, email,
      phone:     phone || null,
      avatar:    name[0].toUpperCase(),
      verified:  false,
      is_admin:  false,
      provider:  'email',
      created_at: Date.now(),
    };

    // Save to API
    try {
      await fetch('tables/users', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ...user, password_hash: btoa(pass) }),
      });
    } catch(_) {}

    setLoading(btn, false);
    setUser(user);
    closeModal('authModal');
    showToast('🎉 Konto utworzone! Witaj w LokalnieOSW!', 'success', 5000);
  }

  /* ══════════════════════════════════════════════════════════
     LOGOUT
  ══════════════════════════════════════════════════════════ */
  function logout() {
    currentUser = null;
    localStorage.removeItem(STORAGE_KEY);
    updateUI();
    App.showView('home');
    showToast('👋 Wylogowano pomyślnie', 'info');
  }

  /* ══════════════════════════════════════════════════════════
     SET USER + PERSIST
  ══════════════════════════════════════════════════════════ */
  function setUser(user) {
    currentUser = user;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(user)); } catch(_) {}
    updateUI();
  }

  /* ══════════════════════════════════════════════════════════
     UPDATE UI
  ══════════════════════════════════════════════════════════ */
  function updateUI() {
    const loggedIn = isLoggedIn();
    const admin    = isAdmin();
    const user     = currentUser;

    // Navbar
    const loginBtn = document.getElementById('navLoginBtn');
    const addBtn   = document.getElementById('navAddBtn');
    const notifyBtn= document.getElementById('notifyBtn');
    if (loginBtn)  loginBtn.style.display = loggedIn ? 'none' : '';
    if (addBtn)    addBtn.style.display   = loggedIn ? '' : 'none';
    if (notifyBtn) notifyBtn.style.display = loggedIn ? '' : 'none';

    // Sidebar
    const sidebarUser  = document.getElementById('sidebarUser');
    const sidebarAvatar= document.getElementById('sidebarAvatar');
    const sidebarName  = document.getElementById('sidebarUserName');
    const sidebarEmail = document.getElementById('sidebarUserEmail');
    const sidebarLogout= document.getElementById('sidebarLogoutBtn');
    const dashLink     = document.getElementById('dashLink');
    const messagesLink = document.getElementById('messagesLink');
    const addLink      = document.getElementById('addLink');
    const adminLink    = document.getElementById('adminLink');

    if (sidebarAvatar) sidebarAvatar.textContent = loggedIn ? (user.avatar || user.name[0].toUpperCase()) : '?';
    if (sidebarName)   sidebarName.textContent   = loggedIn ? user.name  : 'Gość';
    if (sidebarEmail)  sidebarEmail.textContent  = loggedIn ? user.email : 'Zaloguj się aby sprzedawać';
    if (sidebarLogout) sidebarLogout.style.display = loggedIn ? '' : 'none';
    if (dashLink)      dashLink.style.display      = loggedIn ? '' : 'none';
    if (messagesLink)  messagesLink.style.display  = loggedIn ? '' : 'none';
    if (addLink)       addLink.style.display       = loggedIn ? '' : 'none';
    if (adminLink)     adminLink.style.display     = admin    ? '' : 'none';

    // Bottom nav
    const bnavMessages = document.getElementById('bnavMessages');
    const bnavAdd      = document.getElementById('bnavAdd');
    const bnavDash     = document.getElementById('bnavDash');
    const bnavLogin    = document.getElementById('bnavLogin');
    if (bnavMessages)  bnavMessages.style.display = loggedIn ? '' : 'none';
    if (bnavAdd)       bnavAdd.style.display       = loggedIn ? '' : 'none';
    if (bnavDash)      bnavDash.style.display      = loggedIn ? '' : 'none';
    if (bnavLogin) {
      bnavLogin.style.display = loggedIn ? 'none' : '';
      bnavLogin.innerHTML = loggedIn
        ? ''
        : `<i class="fa fa-user"></i><span>Konto</span>`;
    }

    // User dropdown trigger (navbar login btn shows avatar when logged in)
    if (loginBtn && loggedIn) {
      loginBtn.style.display = '';
      loginBtn.innerHTML = `
        <div style="width:32px;height:32px;border-radius:50%;background:var(--brand-light);
          border:2px solid var(--brand);display:flex;align-items:center;justify-content:center;
          font-weight:700;font-size:.85rem;color:var(--brand)">
          ${user.avatar || user.name[0].toUpperCase()}
        </div>`;
      loginBtn.onclick = showUserDropdown;
      addBtn.style.display = '';
    } else if (loginBtn) {
      loginBtn.innerHTML = '<i class="fa fa-user"></i>';
      loginBtn.onclick = () => openModal('authModal');
    }

    // Update chat badge
    if (typeof Chat !== 'undefined') Chat.updateBadge?.();
  }

  /* ══════════════════════════════════════════════════════════
     USER DROPDOWN
  ══════════════════════════════════════════════════════════ */
  function showUserDropdown() {
    const existing = document.getElementById('userDropdown');
    if (existing) { existing.remove(); return; }

    const user = currentUser;
    const dd = document.createElement('div');
    dd.id = 'userDropdown';
    dd.style.cssText = `
      position:fixed; top:62px; right:12px; z-index:9000;
      background:var(--bg-3); border:1px solid var(--border-2);
      border-radius:var(--r-lg); box-shadow:var(--shadow-lg);
      min-width:220px; overflow:hidden;
      animation: fadeSlideDown 0.18s ease;
    `;

    dd.innerHTML = `
      <style>@keyframes fadeSlideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}</style>
      <div style="padding:14px;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:38px;height:38px;border-radius:50%;background:var(--brand-light);border:2px solid var(--brand);
            display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--brand);font-size:.95rem">
            ${user.avatar || user.name[0].toUpperCase()}
          </div>
          <div>
            <div style="font-weight:700;font-size:.9rem;color:var(--text-1)">${escHtml(user.name)}</div>
            <div style="font-size:.75rem;color:var(--text-3)">${escHtml(user.email)}</div>
            ${user.verified ? '<div style="font-size:.7rem;color:var(--brand)"><i class="fa fa-check-circle"></i> Zweryfikowany</div>' : ''}
          </div>
        </div>
      </div>
      <div style="padding:6px">
        ${ddItem('fa-chart-bar','Moje ogłoszenia',"App.showView('dashboard');this.closest('#userDropdown').remove()")}
        ${ddItem('fa-comments','Wiadomości',"App.showView('messages');this.closest('#userDropdown').remove()")}
        ${user.is_admin ? ddItem('fa-shield-halved','Panel Admina',"App.showView('admin');this.closest('#userDropdown').remove()",'var(--amber)') : ''}
        <div style="height:1px;background:var(--border);margin:4px 0"></div>
        ${ddItem('fa-sign-out-alt','Wyloguj się','Auth.logout();this.closest(\'#userDropdown\').remove()','var(--red)')}
      </div>`;

    document.body.appendChild(dd);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('click', function handler(e) {
        if (!dd.contains(e.target)) {
          dd.remove();
          document.removeEventListener('click', handler);
        }
      });
    }, 50);
  }

  function ddItem(icon, label, onclick, color='var(--text-2)') {
    return `<button onclick="${onclick}" style="width:100%;display:flex;align-items:center;gap:10px;
      padding:9px 12px;border-radius:var(--r);font-size:.875rem;font-weight:500;color:${color};
      transition:background .15s;text-align:left" onmouseover="this.style.background='var(--bg-4)'"
      onmouseout="this.style.background=''">
      <i class="fa ${icon}" style="width:16px;text-align:center;opacity:.7"></i>${label}
    </button>`;
  }

  /* ══════════════════════════════════════════════════════════
     TAB SWITCHING
  ══════════════════════════════════════════════════════════ */
  function switchTab(tab) {
    const isLogin = tab === 'login';
    document.getElementById('loginForm').style.display    = isLogin ? '' : 'none';
    document.getElementById('registerForm').style.display = isLogin ? 'none' : '';
    document.getElementById('loginTabBtn').classList.toggle('active', isLogin);
    document.getElementById('registerTabBtn').classList.toggle('active', !isLogin);
  }

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return '🌅 Dzień dobry,';
    if (h < 18) return '☀️ Witaj,';
    return '🌙 Dobry wieczór,';
  }

  function setLoading(btn, loading, text = '') {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.original = btn.innerHTML;
      btn.innerHTML = `<i class="fa fa-spinner fa-spin"></i> ${text}`;
    } else {
      btn.innerHTML = btn.dataset.original || btn.innerHTML;
    }
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */
  return {
    init,
    getUser,
    isLoggedIn,
    isAdmin,
    setUser,
    updateUI,
    loginGoogle,
    loginEmail,
    register,
    logout,
    switchTab,
    showUserDropdown,
  };

})();
