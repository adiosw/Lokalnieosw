/* ═══════════════════════════════════════════════════════════════
   LokalnieOSW v2.1 – Chat.js  (messaging module)
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const Chat = (() => {

  /* ── STATE ────────────────────────────────────────────────── */
  let conversations  = [];   // merged & grouped
  let currentConvId  = null;
  let currentMessages= [];
  let pollInterval   = null;
  let lastMsgCount   = 0;

  /* ══════════════════════════════════════════════════════════
     INIT
  ══════════════════════════════════════════════════════════ */
  function init() {
    if (!Auth.isLoggedIn()) return;
    loadConversations();
    startPolling();
  }

  /* ══════════════════════════════════════════════════════════
     LOAD CONVERSATIONS
  ══════════════════════════════════════════════════════════ */
  async function loadConversations() {
    const user = Auth.getUser();
    if (!user) return;

    try {
      const r = await fetch('tables/messages?limit=200&sort=created_at');
      if (!r.ok) throw new Error('API');
      const d = await r.json();
      const allMsgs = (d.data || []).filter(m =>
        m.sender_id === user.id || m.receiver_id === user.id
      );
      conversations = groupIntoConversations(allMsgs, user.id);
    } catch(_) {
      conversations = getDemoConversations(user.id);
    }

    renderConversationList();
    updateBadge();
  }

  /* ── Group messages into conversations ───────────────────── */
  function groupIntoConversations(messages, userId) {
    const map = new Map();

    messages.forEach(msg => {
      const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
      const listingId = msg.listing_id || '';
      const convId  = [userId, otherId, listingId].sort().join('_');

      if (!map.has(convId)) {
        map.set(convId, {
          id:          convId,
          other_id:    otherId,
          other_name:  msg.sender_id === userId ? (msg.receiver_name || otherId) : (msg.sender_name || otherId),
          listing_id:  listingId,
          listing_title: msg.listing_title || '',
          messages:    [],
          unread:      0,
        });
      }
      const conv = map.get(convId);
      conv.messages.push(msg);
      if (!msg.read && msg.sender_id !== userId) conv.unread++;
    });

    // Sort by last message time (newest first)
    return Array.from(map.values())
      .map(c => ({ ...c, last_msg: c.messages[c.messages.length - 1] }))
      .sort((a, b) => (b.last_msg?.created_at || 0) - (a.last_msg?.created_at || 0));
  }

  /* ── Demo conversations ──────────────────────────────────── */
  function getDemoConversations(userId) {
    return [
      {
        id: 'demo_conv_1',
        other_id: 'usr_demo2',
        other_name: 'Anna Wiśniewska',
        listing_id: 'demo_2',
        listing_title: 'Rower górski Trek',
        messages: [
          { id:'dm1', sender_id:'usr_demo2', receiver_id: userId, text:'Czy rower jest jeszcze dostępny?', read:false, created_at: Date.now()-3600000, sender_name:'Anna Wiśniewska' },
          { id:'dm2', sender_id: userId, receiver_id:'usr_demo2', text:'Tak, zapraszam do oglądania!', read:true, created_at: Date.now()-3000000 },
        ],
        unread: 1,
        last_msg: { text:'Tak, zapraszam do oglądania!', created_at: Date.now()-3000000 },
      },
      {
        id: 'demo_conv_2',
        other_id: 'usr_demo3',
        other_name: 'Piotr Zając',
        listing_id: 'demo_1',
        listing_title: 'iPhone 13 Pro',
        messages: [
          { id:'dm3', sender_id:'usr_demo3', receiver_id: userId, text:'Czy możliwa negocjacja ceny?', read:true, created_at: Date.now()-86400000, sender_name:'Piotr Zając' },
        ],
        unread: 0,
        last_msg: { text:'Czy możliwa negocjacja ceny?', created_at: Date.now()-86400000 },
      },
    ];
  }

  /* ══════════════════════════════════════════════════════════
     RENDER CONVERSATION LIST
  ══════════════════════════════════════════════════════════ */
  function renderConversationList() {
    const listEl  = document.getElementById('chatList');
    const emptyEl = document.getElementById('chatEmpty');
    const winEl   = document.getElementById('chatWindow');
    if (!listEl) return;

    // Hide chat window, show list
    if (winEl) winEl.style.display = 'none';
    listEl.style.display = '';

    if (conversations.length === 0) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.style.display = '';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';

    const totalUnread = conversations.reduce((s, c) => s + c.unread, 0);
    const subtitle = document.getElementById('unreadCount');
    if (subtitle) subtitle.textContent = totalUnread > 0 ? `${totalUnread} nieprzeczytanych` : '';

    listEl.innerHTML = conversations.map(conv => {
      const initial = (conv.other_name || '?')[0].toUpperCase();
      const lastMsg = conv.last_msg;
      const preview = lastMsg?.offer_amount
        ? `💰 Oferta: ${fmtPLN(lastMsg.offer_amount)}`
        : (lastMsg?.text || '…');
      const timeStr = lastMsg ? timeAgo(lastMsg.created_at) : '';

      return `
        <div class="chat-item" onclick="Chat.openConversation('${conv.id}')" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter')Chat.openConversation('${conv.id}')">
          <div class="chat-avatar" style="${conv.unread > 0 ? 'border-color:var(--brand);background:var(--brand-light)' : ''}">
            ${initial}
          </div>
          <div class="chat-item-info">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
              <span class="chat-item-name">${escHtml(conv.other_name)}</span>
              <span class="chat-item-time">${timeStr}</span>
            </div>
            ${conv.listing_title ? `<div style="font-size:.7rem;color:var(--brand);margin-bottom:2px"><i class="fa fa-tag"></i> ${escHtml(conv.listing_title)}</div>` : ''}
            <div class="chat-item-preview" style="${conv.unread > 0 ? 'color:var(--text-1);font-weight:600' : ''}">${escHtml(preview)}</div>
          </div>
          ${conv.unread > 0 ? `
            <div style="margin-left:8px;min-width:20px;height:20px;border-radius:9999px;
              background:var(--brand);color:#fff;font-size:.65rem;font-weight:700;
              display:flex;align-items:center;justify-content:center;padding:0 5px">
              ${conv.unread}
            </div>` : ''}
        </div>`;
    }).join('');
  }

  /* ══════════════════════════════════════════════════════════
     OPEN CONVERSATION
  ══════════════════════════════════════════════════════════ */
  function openConversation(convId) {
    const conv = conversations.find(c => c.id === convId);
    if (!conv) return;

    currentConvId = convId;
    currentMessages = [...conv.messages];

    // Mark as read
    conv.unread = 0;
    markAsRead(conv);
    updateBadge();

    // Show chat window
    const listEl = document.getElementById('chatList');
    const winEl  = document.getElementById('chatWindow');
    if (listEl) listEl.style.display = 'none';
    if (winEl)  winEl.style.display = '';

    // Build header
    const headerEl = document.getElementById('chatHeader');
    if (headerEl) {
      const hasListing = !!conv.listing_id;
      headerEl.innerHTML = `
        <button class="chat-back-btn" onclick="Chat.backToList()" aria-label="Powrót">
          <i class="fa fa-arrow-left"></i>
        </button>
        <div class="chat-avatar" style="width:38px;height:38px;font-size:.9rem;flex-shrink:0">
          ${(conv.other_name||'?')[0].toUpperCase()}
        </div>
        <div class="chat-header-info">
          <div class="chat-header-name">${escHtml(conv.other_name)}</div>
          ${conv.listing_title ? `<div class="chat-header-status"><i class="fa fa-tag"></i> ${escHtml(conv.listing_title)}</div>` : '<div class="chat-header-status">Online</div>'}
        </div>
        ${hasListing ? `
          <button style="margin-left:auto;padding:6px 12px;border-radius:var(--r-full);
            background:var(--bg-3);border:1px solid var(--border);color:var(--text-2);font-size:.78rem;font-weight:600"
            onclick="App.openListingDetail('${conv.listing_id}')">
            <i class="fa fa-eye"></i> Ogłoszenie
          </button>` : ''}`;
    }

    // Show/hide offer button
    const offerBtn = document.getElementById('chatOfferBtn');
    if (offerBtn) offerBtn.style.display = conv.listing_id ? '' : 'none';

    renderMessages();

    // Focus input
    setTimeout(() => document.getElementById('chatInput')?.focus(), 100);
  }

  /* ── Back to list ─────────────────────────────────────────── */
  function backToList() {
    currentConvId   = null;
    currentMessages = [];
    document.getElementById('chatWindow').style.display = 'none';
    document.getElementById('chatList').style.display   = '';
    renderConversationList();
  }

  /* ══════════════════════════════════════════════════════════
     RENDER MESSAGES
  ══════════════════════════════════════════════════════════ */
  function renderMessages() {
    const el = document.getElementById('chatMessages');
    if (!el) return;

    const userId = Auth.getUser()?.id;

    if (currentMessages.length === 0) {
      el.innerHTML = `
        <div style="text-align:center;padding:40px 20px;color:var(--text-3)">
          <div style="font-size:2.5rem;margin-bottom:12px">👋</div>
          <p>Rozpocznij rozmowę!</p>
          <p style="font-size:.78rem;margin-top:6px">Napisz wiadomość lub zaproponuj cenę</p>
        </div>`;
      return;
    }

    el.innerHTML = currentMessages.map(msg => {
      const isOwn = msg.sender_id === userId;
      const isOffer = !!msg.offer_amount;

      let bubbleContent = '';
      if (isOffer) {
        bubbleContent = `
          <div style="font-size:.72rem;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">
            <i class="fa fa-tag"></i> Oferta cenowa
          </div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--amber)">${fmtPLN(msg.offer_amount)}</div>
          ${msg.text ? `<div style="font-size:.82rem;color:var(--text-2);margin-top:4px">${escHtml(msg.text)}</div>` : ''}
          ${!isOwn ? `
            <div style="display:flex;gap:6px;margin-top:8px">
              <button onclick="Chat.acceptOffer('${msg.id}',${msg.offer_amount})"
                style="flex:1;padding:6px;border-radius:var(--r);background:var(--brand);color:#fff;font-size:.78rem;font-weight:600">
                Akceptuj
              </button>
              <button onclick="Chat.rejectOffer('${msg.id}')"
                style="flex:1;padding:6px;border-radius:var(--r);background:var(--bg-4);color:var(--text-2);font-size:.78rem;font-weight:600;border:1px solid var(--border)">
                Odrzuć
              </button>
            </div>` : ''}`;
      } else {
        bubbleContent = escHtml(msg.text || '');
      }

      const timeStr = formatMsgTime(msg.created_at);
      const readIcon = isOwn
        ? `<div class="msg-read">${msg.read ? '<i class="fa fa-check-double" style="color:var(--brand)"></i>' : '<i class="fa fa-check" style="color:var(--text-4)"></i>'}</div>`
        : '';

      return `
        <div class="msg-wrap ${isOwn ? 'own' : 'other'} ${isOffer ? 'offer' : ''}">
          <div>
            <div class="msg-bubble">${bubbleContent}</div>
            <div class="msg-time">${timeStr}</div>
            ${readIcon}
          </div>
        </div>`;
    }).join('');

    // Scroll to bottom
    el.scrollTop = el.scrollHeight;
  }

  /* ══════════════════════════════════════════════════════════
     SEND MESSAGE
  ══════════════════════════════════════════════════════════ */
  async function sendMessage() {
    const user  = Auth.getUser();
    if (!user) { showToast('Zaloguj się aby wysyłać wiadomości', 'warning'); return; }

    const input = document.getElementById('chatInput');
    const text  = input?.value?.trim();
    if (!text) return;

    const conv = conversations.find(c => c.id === currentConvId);
    if (!conv) return;

    input.value = '';

    const msg = {
      id:            'msg_' + Math.random().toString(36).slice(2,10),
      sender_id:     user.id,
      sender_name:   user.name,
      receiver_id:   conv.other_id,
      receiver_name: conv.other_name,
      listing_id:    conv.listing_id || '',
      listing_title: conv.listing_title || '',
      text,
      read:          false,
      created_at:    Date.now(),
    };

    // Optimistic UI
    currentMessages.push(msg);
    conv.messages.push(msg);
    conv.last_msg = msg;
    renderMessages();

    // Persist
    try {
      await fetch('tables/messages', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(msg),
      });
    } catch(_) {}
  }

  /* ── Send on Enter ───────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && document.getElementById('chatInput') === document.activeElement) {
      e.preventDefault();
      sendMessage();
    }
  });

  /* ══════════════════════════════════════════════════════════
     SEND OFFER (from offer modal)
  ══════════════════════════════════════════════════════════ */
  async function sendOffer() {
    const user   = Auth.getUser();
    if (!user) return;

    const amount  = parseFloat(document.getElementById('offerAmount')?.value);
    const msgText = document.getElementById('offerMessage')?.value?.trim() || '';
    const listingId = window._offerListingId || '';
    const sellerId  = window._offerSellerId  || '';

    if (!amount || amount <= 0) { showToast('Wpisz kwotę oferty', 'warning'); return; }

    // Find or create conversation
    const listing = (App.getAll ? App.getAll() : []).find(l => l.id === listingId);
    const convId  = [user.id, sellerId, listingId].sort().join('_');
    let conv = conversations.find(c => c.id === convId);
    if (!conv) {
      conv = {
        id: convId, other_id: sellerId,
        other_name: listing?.seller_name || 'Sprzedający',
        listing_id: listingId,
        listing_title: listing?.title || '',
        messages: [], unread: 0,
        last_msg: null,
      };
      conversations.unshift(conv);
    }

    const msg = {
      id:            'msg_' + Math.random().toString(36).slice(2,10),
      sender_id:     user.id,
      sender_name:   user.name,
      receiver_id:   sellerId,
      receiver_name: conv.other_name,
      listing_id:    listingId,
      listing_title: conv.listing_title,
      text:          msgText,
      offer_amount:  amount,
      read:          false,
      created_at:    Date.now(),
    };

    conv.messages.push(msg);
    conv.last_msg = msg;

    try {
      await fetch('tables/messages', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(msg),
      });
    } catch(_) {}

    closeModal('offerModal');
    showToast(`💰 Oferta ${fmtPLN(amount)} wysłana!`, 'success');

    // Open chat
    currentConvId   = convId;
    currentMessages = [...conv.messages];
    App.showView('messages');
    setTimeout(() => openConversation(convId), 300);
  }

  /* ══════════════════════════════════════════════════════════
     QUICK OFFER BUTTON (in chat)
  ══════════════════════════════════════════════════════════ */
  function sendQuickOffer() {
    const conv = conversations.find(c => c.id === currentConvId);
    if (!conv?.listing_id) return;

    const listing = (App.getAll ? App.getAll() : []).find(l => l.id === conv.listing_id);
    window._offerListingId = conv.listing_id;
    window._offerSellerId  = conv.other_id;
    if (listing) {
      document.getElementById('offerCurrentPrice').textContent = `Aktualna cena: ${fmtPLN(listing.price)}`;
    }
    openModal('offerModal');
  }

  /* ══════════════════════════════════════════════════════════
     ACCEPT / REJECT OFFER
  ══════════════════════════════════════════════════════════ */
  async function acceptOffer(msgId, amount) {
    const user = Auth.getUser();
    if (!user) return;

    // Mark message as accepted
    const msg = currentMessages.find(m => m.id === msgId);
    if (msg) msg.offer_accepted = true;

    // Send confirmation message
    const conv = conversations.find(c => c.id === currentConvId);
    if (conv) {
      const reply = {
        id: 'msg_' + Math.random().toString(36).slice(2,10),
        sender_id: user.id, sender_name: user.name,
        receiver_id: conv.other_id, receiver_name: conv.other_name,
        listing_id: conv.listing_id || '',
        text: `✅ Zaakceptowałem ofertę ${fmtPLN(amount)}! Skontaktuj się ze mną aby umówić odbiór.`,
        read: false, created_at: Date.now(),
      };
      currentMessages.push(reply);
      conv.messages.push(reply);
      try {
        await fetch('tables/messages', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(reply),
        });
      } catch(_) {}
    }

    renderMessages();
    showToast(`✅ Zaakceptowałeś ofertę ${fmtPLN(amount)}`, 'success');
  }

  async function rejectOffer(msgId) {
    const user = Auth.getUser();
    if (!user) return;
    const conv = conversations.find(c => c.id === currentConvId);
    if (!conv) return;

    const reply = {
      id: 'msg_' + Math.random().toString(36).slice(2,10),
      sender_id: user.id, sender_name: user.name,
      receiver_id: conv.other_id, receiver_name: conv.other_name,
      listing_id: conv.listing_id || '',
      text: '❌ Niestety nie mogę przyjąć tej oferty.',
      read: false, created_at: Date.now(),
    };
    currentMessages.push(reply);
    conv.messages.push(reply);
    try {
      await fetch('tables/messages', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(reply),
      });
    } catch(_) {}

    renderMessages();
    showToast('Oferta odrzucona', 'info');
  }

  /* ══════════════════════════════════════════════════════════
     OPEN FROM LISTING (click "Napisz" button)
  ══════════════════════════════════════════════════════════ */
  function openFromListing(listingId, sellerId) {
    const user = Auth.getUser();
    if (!user) { showToast('Zaloguj się aby napisać wiadomość', 'warning'); openModal('authModal'); return; }
    if (!sellerId || sellerId === user.id) return;

    const listing = (App.getAll ? App.getAll() : []).find(l => l.id === listingId);
    const convId  = [user.id, sellerId, listingId].sort().join('_');

    let conv = conversations.find(c => c.id === convId);
    if (!conv) {
      conv = {
        id: convId,
        other_id: sellerId,
        other_name: listing?.seller_name || 'Sprzedający',
        listing_id: listingId,
        listing_title: listing?.title || '',
        messages: [], unread: 0, last_msg: null,
      };
      conversations.unshift(conv);
    }

    App.showView('messages');
    setTimeout(() => openConversation(convId), 200);
  }

  /* ══════════════════════════════════════════════════════════
     MARK AS READ
  ══════════════════════════════════════════════════════════ */
  async function markAsRead(conv) {
    const userId = Auth.getUser()?.id;
    const unreadMsgs = conv.messages.filter(m => !m.read && m.sender_id !== userId);
    for (const msg of unreadMsgs) {
      msg.read = true;
      if (!msg.id.startsWith('dm') && !msg.id.startsWith('demo')) {
        try {
          await fetch(`tables/messages/${msg.id}`, {
            method:'PATCH', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ read: true }),
          });
        } catch(_) {}
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     UPDATE BADGE
  ══════════════════════════════════════════════════════════ */
  function updateBadge() {
    const total = conversations.reduce((s, c) => s + c.unread, 0);
    const badges = [
      document.getElementById('bnavMsgBadge'),
      document.getElementById('sidebarMsgBadge'),
    ];
    badges.forEach(b => {
      if (!b) return;
      if (total > 0) { b.textContent = total > 9 ? '9+' : total; b.style.display = ''; }
      else { b.style.display = 'none'; }
    });
  }

  /* ══════════════════════════════════════════════════════════
     POLLING (check for new messages)
  ══════════════════════════════════════════════════════════ */
  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!Auth.isLoggedIn()) return;
      try {
        const r = await fetch('tables/messages?limit=1&sort=created_at');
        if (!r.ok) return;
        const d = await r.json();
        if (d.total > lastMsgCount && lastMsgCount > 0) {
          lastMsgCount = d.total;
          await loadConversations();
          // If chat window open, refresh messages
          if (currentConvId) {
            const conv = conversations.find(c => c.id === currentConvId);
            if (conv) { currentMessages = [...conv.messages]; renderMessages(); }
          }
        } else {
          lastMsgCount = d.total || 0;
        }
      } catch(_) {}
    }, 15000); // poll every 15s
  }

  function stopPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = null;
  }

  /* ══════════════════════════════════════════════════════════
     HELPERS
  ══════════════════════════════════════════════════════════ */
  function timeAgo(timestamp) {
    if (!timestamp) return '';
    const diff = Date.now() - timestamp;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(diff / 3600000);
    const d = Math.floor(diff / 86400000);
    if (m < 1)  return 'teraz';
    if (m < 60) return `${m} min`;
    if (h < 24) return `${h}h`;
    if (d < 7)  return `${d}d`;
    return new Date(timestamp).toLocaleDateString('pl-PL', { day:'2-digit', month:'2-digit' });
  }

  function formatMsgTime(timestamp) {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString('pl-PL', { hour:'2-digit', minute:'2-digit' });
    return d.toLocaleDateString('pl-PL', { day:'2-digit', month:'2-digit' }) + ' ' +
           d.toLocaleTimeString('pl-PL', { hour:'2-digit', minute:'2-digit' });
  }

  function fmtPLN(amount) {
    return new Intl.NumberFormat('pl-PL', {
      style:'currency', currency:'PLN', minimumFractionDigits:0
    }).format(amount);
  }

  function escHtml(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
  ══════════════════════════════════════════════════════════ */
  return {
    init,
    loadConversations,
    openConversation,
    openFromListing,
    backToList,
    sendMessage,
    sendOffer,
    sendQuickOffer,
    acceptOffer,
    rejectOffer,
    updateBadge,
    stopPolling,
  };

})();
