const WEBAPP_BUILD = 'v1';
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.("#0d0703");
  tg.setBackgroundColor?.("#0d0703");
  tg.enableClosingConfirmation?.();
}

const API = (window.HUNTERFACEIT_API_BASE || "/api").replace(/\/$/, "");

const state = {
  user: null,
  top: [],
  topSort: 'elo',
  tourneys: [],
  tourneyFilter: 'registration',
  referrals: null,
  withdrawals: [],
};

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ================= helpers ================= */
function initData() {
  if (tg?.initData) return tg.initData;
  for (const src of [location.hash.replace(/^#/, ''), location.search.replace(/^\?/, '')]) {
    try {
      const v = new URLSearchParams(src).get('tgWebAppData');
      if (v) return v;
    } catch (e) {}
  }
  return "";
}
function authQuery() {
  const d = initData();
  return d ? `?initData=${encodeURIComponent(d)}` : "";
}
async function api(path, opts = {}) {
  opts.headers = {
    ...(opts.headers || {}),
    "X-Telegram-Init-Data": initData(),
    "Content-Type": "application/json",
  };
  let r;
  try { r = await fetch(API + path, opts); }
  catch (e) { const err = new Error('network'); err.status = 0; throw err; }
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const err = new Error(txt || ("HTTP " + r.status));
    err.status = r.status;
    throw err;
  }
  return r.json();
}
function haptic(kind = "light") { try { tg?.HapticFeedback?.impactOccurred?.(kind); } catch (e) {} }
function toast(t) {
  const x = $("#toast"); x.textContent = t; x.classList.add("show");
  clearTimeout(window.__t); window.__t = setTimeout(() => x.classList.remove("show"), 2200);
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}
function avatarUrl(tgId) { return `${API}/avatar/${encodeURIComponent(tgId)}${authQuery()}`; }
function avatarFallback(name = 'M') {
  const letter = String(name || 'M').trim().charAt(0).toUpperCase() || 'M';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="#ff8a3c"/><stop offset="1" stop-color="#d95f14"/>
    </linearGradient></defs>
    <rect width="120" height="120" rx="30" fill="url(#g)"/>
    <text x="60" y="78" text-anchor="middle" font-family="Arial,sans-serif" font-size="58" font-weight="800" fill="white">${letter}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
function avatarImg(u, cls = '') {
  const nm = u?.nick || u?.username || u?.first_name || 'M';
  const src = u?.avatar_url || (u?.tg_id ? avatarUrl(u.tg_id) : '');
  return `<img class="${cls}" src="${esc(src || avatarFallback(nm))}" data-name="${esc(nm)}" alt=""
    loading="lazy" onerror="this.onerror=null;this.src=avatarFallback(this.dataset.name)">`;
}
function eloStr(u) {
  if (!u) return "—";
  if (Number(u.is_calibrated || 0) !== 1) {
    return `Калибровка ${u.calibration_matches || 0}/5`;
  }
  return `${u.elo || 100} ELO`;
}
function faceitLevel(elo) {
  const e = Number(elo) || 0;
  if (e <= 500) return 1;
  if (e <= 750) return 2;
  if (e <= 900) return 3;
  if (e <= 1050) return 4;
  if (e <= 1200) return 5;
  if (e <= 1350) return 6;
  if (e <= 1530) return 7;
  if (e <= 1750) return 8;
  if (e <= 2000) return 9;
  return 10;
}

/* ================= navigation ================= */
function go(id) {
  const current = document.querySelector('.page.active');
  const next = document.getElementById(id);
  if (!next || current === next) return;
  current?.classList.remove('active');
  next.classList.add('active');
  $$('.nav button').forEach(x => x.classList.toggle('active', x.dataset.page === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (id === 'profile') renderProfile();
  if (id === 'top') renderTop();
  if (id === 'tournaments') renderTourneys();
  if (id === 'referrals') renderReferralsPage();
  if (id === 'withdraw') renderWithdrawPage();
  if (id === 'promo') renderPromoPage();
}
$$('[data-page]').forEach(x => x.addEventListener('click', () => { haptic(); go(x.dataset.page); }));
$("#refresh").onclick = () => { haptic('medium'); sync(true); };

$$('[data-top-sort]').forEach(x => x.onclick = () => {
  $$('[data-top-sort]').forEach(y => y.classList.remove('active'));
  x.classList.add('active');
  state.topSort = x.dataset.topSort;
  renderTop();
});
$$('[data-tourney-filter]').forEach(x => x.onclick = () => {
  $$('[data-tourney-filter]').forEach(y => y.classList.remove('active'));
  x.classList.add('active');
  state.tourneyFilter = x.dataset.tourneyFilter;
  loadTourneys().then(renderTourneys);
});

/* ================= sync ================= */
let __loading = null, __fails = 0, __everOk = false, __lastErr = null;

async function loadState() {
  const d = await api('/state');
  state.user = d.user;
  state.top = d.top || [];
  state.referrals = d.referrals || null;
  __fails = 0; __everOk = true; __lastErr = null;
  return state;
}
async function loadTourneys() {
  try {
    const d = await api(`/tournaments?status=${encodeURIComponent(state.tourneyFilter)}`);
    state.tourneys = d.tournaments || [];
  } catch (e) {
    state.tourneys = [];
  }
}
async function loadWithdrawals() {
  try {
    const d = await api('/withdrawals');
    state.withdrawals = d.withdrawals || [];
  } catch (e) {
    state.withdrawals = [];
  }
}

function syncErrorText(e) {
  if (e?.status === 401 || e?.status === 403) return 'Нет доступа — открой WebApp кнопкой из бота';
  if (!initData()) return 'Открой WebApp через кнопку бота';
  return 'Нет соединения с API';
}
function setOnline(ok, e) {
  const t = $("#onlineText");
  if (t) t.textContent = ok ? 'Бот онлайн • данные синхронизированы' : syncErrorText(e || __lastErr);
  const live = document.querySelector('.live');
  if (live) {
    live.classList.toggle('off', !ok);
    const b = live.querySelector('b'); if (b) b.textContent = ok ? 'LIVE' : 'OFFLINE';
  }
}
function renderAll() {
  renderUserHeader();
  renderProfile();
  renderTop();
  if ($("#tournaments").classList.contains('active')) renderTourneys();
  if ($("#referrals").classList.contains('active')) renderReferralsPage();
  if ($("#withdraw").classList.contains('active')) renderWithdrawPage();
}
async function sync(showToast = false) {
  const btn = $("#refresh");
  btn?.classList.add("loading");
  try {
    await loadState();
    setOnline(true);
    renderAll();
    if (showToast) toast('Синхронизировано');
  } catch (e) {
    __lastErr = e; __fails++;
    setOnline(false, e);
    if (showToast) toast(syncErrorText(e));
    renderUserHeader();
    renderProfile();
  } finally {
    setTimeout(() => btn?.classList.remove("loading"), 220);
  }
}

/* ================= header ================= */
function renderUserHeader() {
  const box = $("#userHeader"); if (!box) return;
  const u = state.user;
  const name = u ? (u.nick || u.username || u.first_name || 'Игрок') : 'Гость';
  const sub = !u ? 'Открой через бота' : u.is_owner ? 'OWNER' : (u.game_id ? `ID: ${u.game_id}` : 'Hunter Faceit');
  box.innerHTML = `
    <img src="${esc(u?.avatar_url ? u.avatar_url : avatarFallback(name))}" data-name="${esc(name)}" alt=""
         onerror="this.onerror=null;this.src=avatarFallback(this.dataset.name)">
    <div><b>${esc(name)}</b><small>${esc(sub)}</small></div>`;
}

/* ================= profile ================= */
function offlineHtml() {
  return `<div class="offline-card">
    <div class="offline-ic"><svg class="ic"><use href="#i-refresh"/></svg></div>
    <b>Профиль не синхронизирован</b>
    <small>${esc(syncErrorText(__lastErr))}</small>
    <button class="action pressable" data-retry>Повторить</button>
  </div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest?.('[data-retry]'); if (!b) return;
  haptic(); sync(true);
});

function renderProfile() {
  const u = state.user;
  const box = $("#profileCard"); if (!box) return;
  if (!u) { box.innerHTML = offlineHtml(); return; }

  const matches = (u.wins || 0) + (u.losses || 0);
  const wr = matches ? ((u.wins / matches) * 100).toFixed(1) : '0.0';
  const kd = u.kd != null ? Number(u.kd).toFixed(2) : '0.00';
  const cal = Number(u.is_calibrated || 0) === 1;

  const tags = [];
  if (u.is_owner) tags.push(`<span class="tag owner">👑 OWNER</span>`);
  if (u.is_admin) tags.push(`<span class="tag admin">🛡 ADMIN</span>`);
  if (u.warn_count > 0) tags.push(`<span class="tag warn">⚠ Варны: ${u.warn_count}/3</span>`);
  if (u.muted_until) tags.push(`<span class="tag mute">🔇 Мут до ${esc((u.muted_until || '').slice(0, 16))}</span>`);
  if (u.is_banned) tags.push(`<span class="tag ban">🚫 БАН</span>`);

  let eloBlock = "";
  if (cal) {
    const lvl = faceitLevel(u.elo);
    eloBlock = `<div class="profile-elo"><small>ELO</small><b>${u.elo || 100}</b></div>`;
  } else {
    eloBlock = `<div class="profile-elo"><small>КАЛИБРОВКА</small><b>${u.calibration_matches || 0}/5</b></div>`;
  }

  const warnsBlock = (u.warns && u.warns.length)
    ? `<div class="notice" style="margin-top:12px"><b>⚠ Активные варны (${u.warns.length}/3):</b>
        <div class="warns-list">${u.warns.map(w => `
          <div class="warn-row"><b>${esc(w.reason || '—')}</b>
          <small>Выдал: <code>${esc(w.issued_by || '—')}</code> · ${esc((w.issued_at || '').slice(0, 16))}</small></div>
        `).join("")}</div></div>`
    : "";

  box.innerHTML = `
    <div class="profile-shell">
      <div class="profile-hero">
        <div class="profile-banner"></div>
        <div class="profile-shade"></div>
        <div class="profile-content">
          ${avatarImg(u, 'profile-avatar')}
          <div class="profile-name">
            <b>${esc(u.nick || u.username || 'Игрок')}</b>
            <small>ID в игре: <code>${esc(u.game_id || '—')}</code></small>
          </div>
          ${eloBlock}
        </div>
      </div>
      <div class="profile-body">
        <div class="profile-tags">${tags.join('')}</div>

        ${!cal ? `<div class="notice">
          🎯 <b>Калибровка:</b> ${u.calibration_matches || 0}/5 матчей · Побед: <b>${u.calibration_wins || 0}</b>
          <span class="progress-bar"><em style="width:${Math.min(100, ((u.calibration_matches || 0) / 5) * 100)}%"></em></span>
        </div>` : `<div class="notice">
          🎯 <b>Уровень FACEIT:</b> ${faceitLevel(u.elo)}
          <span class="progress-bar"><em style="width:${Math.min(100, ((u.elo || 100) / 25000) * 100)}%"></em></span>
        </div>`}

        <div class="stat-grid">
          <div class="stat-box"><b>${u.wins || 0}</b><small>ПОБЕД</small></div>
          <div class="stat-box"><b>${u.losses || 0}</b><small>ПОРАЖЕНИЙ</small></div>
          <div class="stat-box"><b>${wr}%</b><small>WINRATE</small></div>
          <div class="stat-box"><b>${kd}</b><small>K/D</small></div>
        </div>

        <div class="stat-grid">
          <div class="stat-box"><b>${u.gold || 0}</b><small>ГОЛДА</small></div>
          <div class="stat-box"><b>${u.referrals || 0}</b><small>РЕФЕРАЛОВ</small></div>
          <div class="stat-box"><b>${u.matches || 0}</b><small>МАТЧЕЙ</small></div>
          <div class="stat-box"><b>${u.warn_count || 0}</b><small>ВАРНОВ</small></div>
        </div>

        ${warnsBlock}
      </div>
    </div>`;
}

/* ================= top ================= */
function renderTop() {
  const box = $("#leaderboard"); if (!box) return;
  const list = [...(state.top || [])];
  list.sort((a, b) => {
    if (state.topSort === 'wins') return (b.wins || 0) - (a.wins || 0);
    if (state.topSort === 'kd') return (b.kd || 0) - (a.kd || 0);
    return (b.elo || 0) - (a.elo || 0);
  });
  if (!list.length) {
    box.innerHTML = `<div class="empty">Пока нет игроков в рейтинге.</div>`;
    return;
  }
  box.innerHTML = list.map((u, i) => {
    const n = i + 1;
    const rank = n === 1 ? 'gold' : n === 2 ? 'silver' : n === 3 ? 'bronze' : '';
    const matches = (u.wins || 0) + (u.losses || 0);
    const wr = matches ? ((u.wins / matches) * 100).toFixed(1) : '0.0';
    const kd = u.kd != null ? Number(u.kd).toFixed(2) : '0.00';
    return `<button class="player-card pressable" data-player="${u.tg_id}">
      <div class="player-rank ${rank}">${n}</div>
      ${avatarImg(u, 'player-avatar')}
      <div class="player-body">
        <div class="player-title"><b>${esc(u.nick || u.username || u.first_name || u.tg_id)}</b></div>
        <div class="player-sub">${esc(u.game_id || '—')} · ${esc(eloStr(u))}</div>
        <div class="player-stats">
          <span><b>${matches}</b><small>МАТЧЕЙ</small></span>
          <span><b>${wr}%</b><small>WR</small></span>
          <span><b>${kd}</b><small>K/D</small></span>
          <span><b>${u.wins || 0}</b><small>WINS</small></span>
        </div>
      </div>
      <span class="player-open">›</span>
    </button>`;
  }).join("");
  $$(".player-card").forEach(card => card.addEventListener('click', () => {
    haptic(); openPlayer(card.dataset.player);
  }));
}
function openPlayer(tgId) {
  const u = (state.top || []).find(x => String(x.tg_id) === String(tgId));
  if (!u) return;
  const matches = (u.wins || 0) + (u.losses || 0);
  const wr = matches ? ((u.wins / matches) * 100).toFixed(1) : '0.0';
  const kd = u.kd != null ? Number(u.kd).toFixed(2) : '0.00';
  $("#playerModalCard").innerHTML = `
    <button class="modal-close pressable" id="closePlayer">×</button>
    ${avatarImg(u, 'modal-avatar')}
    <div class="modal-name">
      <b>${esc(u.nick || u.username || u.first_name || 'Игрок')}</b>
      <small>ID в игре: <code>${esc(u.game_id || '—')}</code></small>
    </div>
    <div class="modal-grid">
      <div><b>${Number(u.is_calibrated) === 1 ? (u.elo || 100) : '—'}</b><small>ELO</small></div>
      <div><b>${wr}%</b><small>WR</small></div>
      <div><b>${kd}</b><small>K/D</small></div>
      <div><b>${matches}</b><small>МАТЧЕЙ</small></div>
    </div>`;
  $("#playerModal").classList.add('show');
  $("#closePlayer").onclick = () => $("#playerModal").classList.remove('show');
}
$("#modalBackdrop")?.addEventListener('click', () => $("#playerModal").classList.remove('show'));

/* ================= tournaments ================= */
function renderTourneys() {
  const box = $("#tourneyList"); if (!box) return;
  if (!state.tourneys.length) {
    box.innerHTML = `<div class="empty">Турниров пока нет.</div>`;
    return;
  }
  box.innerHTML = state.tourneys.map(t => {
    const isReg = t.status === 'registration';
    const players = t.players || [];
    return `<div class="tourney-card">
      <div class="tourney-card-head">
        <div>
          <b>${esc(t.name)}</b>
          <small>${esc(t.mode || '1x1')} · ${esc(t.map || '—')}</small>
        </div>
        <span class="tourney-status ${isReg ? 'reg' : 'act'}">${isReg ? 'РЕГИСТРАЦИЯ' : 'ИДЁТ'}</span>
      </div>
      <div class="tourney-meta">
        <span>👥 ${players.length}/${t.max_players}</span>
        <span>🎁 ${esc(t.prize || '—')}</span>
      </div>
      ${players.length ? `<div class="tourney-players">${players.slice(0, 6).map(p => `
        <div class="tourney-player">
          ${avatarImg(p, 'tp-av')}
          <div><b>${esc(p.nick || p.username || p.tg_id)}</b>
          <small>${esc(p.game_id || '—')}</small></div>
          <span class="tp-elo">${esc(eloStr(p))}</span>
        </div>`).join("")}</div>` : ''}
    </div>`;
  }).join("");
}

/* ================= referrals ================= */
function renderReferralsPage() {
  const box = $("#referralsPage"); if (!box) return;
  const r = state.referrals || {};
  box.innerHTML = `
    <div class="feature-shell">
      <div class="feature-hero">
        <div class="feature-icon"><svg class="ic"><use href="#i-gift"/></svg></div>
        <div>
          <span>REFERRALS</span>
          <h3>Приглашай друзей</h3>
          <p>За каждого друга — <b>${r.reward_g || 700}</b> голды.</p>
        </div>
      </div>
      <div class="ref-stats">
        <div><b>${r.credited || 0}</b><small>ЗАСЧИТАНО</small></div>
        <div><b>${r.invited || 0}</b><small>ПРИГЛАШЕНО</small></div>
        <div><b>${r.balance || 0}</b><small>GOLD</small></div>
      </div>
      <div class="share-card">
        <small>ТВОЯ ССЫЛКА</small>
        <div class="share-link">${esc(r.link || '—')}</div>
        <button class="action pressable full" id="shareReferral">
          <svg class="ic"><use href="#i-share"/></svg> Переслать другу
        </button>
      </div>
      <div class="notice">
        Минимум для вывода: <b>${r.min_withdraw || 5000}</b> голды.
      </div>
    </div>`;
  $("#shareReferral")?.addEventListener('click', shareReferral);
}
function shareReferral() {
  const link = state.referrals?.link;
  if (!link) return toast('Ссылка ещё не готова');
  const text = 'Залетай в Hunter Faceit — турниры и рейтинг 🎮';
  const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  try { tg?.openTelegramLink ? tg.openTelegramLink(url) : window.open(url, '_blank'); }
  catch (e) { window.open(url, '_blank'); }
}

/* ================= withdraw ================= */
function renderWithdrawPage() {
  const box = $("#withdrawPage"); if (!box) return;
  const u = state.user || {};
  const gold = u.gold || 0;
  const min = 5000;

  box.innerHTML = `
    <div class="feature-shell">
      <div class="feature-hero">
        <div class="feature-icon"><svg class="ic"><use href="#i-coin"/></svg></div>
        <div>
          <span>WITHDRAW</span>
          <h3>Вывод голды</h3>
          <p>Обменяй голду на игровой скин. Минимум — <b>${min}</b>.</p>
        </div>
      </div>
      <div class="ref-stats">
        <div><b>${gold}</b><small>ТЕКУЩИЙ БАЛАНС</small></div>
        <div><b>${min}</b><small>МИНИМУМ</small></div>
        <div><b>${state.withdrawals.filter(w => w.status === 'pending').length}</b><small>В ОБРАБОТКЕ</small></div>
      </div>
      <div class="share-card">
        <small>НОВАЯ ЗАЯВКА</small>
        <div style="display:flex;gap:8px;margin-bottom:12px">
          <input id="wdAmount" class="owner-input" type="number" placeholder="Сумма (${min}+)" style="flex:1;margin-bottom:0">
        </div>
        <div class="notice" style="margin-bottom:12px">
          ⚠️ Скриншот скина нужно будет отправить в чат бота — это требование администрации.
        </div>
        <button class="action pressable full" id="wdCreate">
          <svg class="ic"><use href="#i-mail"/></svg> Создать заявку в боте
        </button>
      </div>
      <div class="share-card">
        <small>ИСТОРИЯ ЗАЯВОК</small>
        <div id="wdHistory">
          ${state.withdrawals.length ? state.withdrawals.map(w => `
            <div class="warn-row">
              <b>#${w.id} — ${w.amount} голды</b>
              <small>Статус: <b>${esc(w.status)}</b> · ${esc((w.created_at || '').slice(0, 16))}</small>
              ${w.reject_reason ? `<small>Причина: ${esc(w.reject_reason)}</small>` : ''}
            </div>`).join("") : `<div class="empty">Пока нет заявок.</div>`}
        </div>
      </div>
    </div>`;
  $("#wdCreate")?.addEventListener('click', () => {
    const v = Number($("#wdAmount")?.value || 0);
    if (!v || v < min) return toast(`Минимум ${min} голды`);
    if (v > gold) return toast('Недостаточно голды');
    toast('Открой бота и отправь скриншот скина — там завершим заявку');
    try {
      const me = "https://t.me/";
      tg?.openTelegramLink ? tg.openTelegramLink(me) : window.open(me, '_blank');
    } catch (e) {}
  });
}

/* ================= promo ================= */
function renderPromoPage() {
  const box = $("#promoPage"); if (!box) return;
  box.innerHTML = `
    <div class="feature-shell">
      <div class="feature-hero">
        <div class="feature-icon"><svg class="ic"><use href="#i-ticket"/></svg></div>
        <div>
          <span>PROMO</span>
          <h3>Активировать промокод</h3>
          <p>Введи код и получи голду на баланс.</p>
        </div>
      </div>
      <div class="share-card">
        <div class="promo-form">
          <input id="promoInput" class="owner-input" maxlength="32" placeholder="Введите промокод" autocomplete="off">
          <button class="action pressable" id="promoBtn">Активировать</button>
        </div>
        <div id="promoResult" class="promo-result" aria-live="polite"></div>
      </div>
    </div>`;
  const input = $("#promoInput"), btn = $("#promoBtn"), res = $("#promoResult");
  btn.onclick = () => activatePromo(input, res);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') activatePromo(input, res); });
}
async function activatePromo(input, result) {
  const code = String(input?.value || '').trim().toUpperCase();
  if (!code) { result.className = 'promo-result error'; result.textContent = 'Введите промокод'; return; }
  const btn = input.closest('.promo-form')?.querySelector('button');
  if (btn) btn.disabled = true;
  try {
    const d = await api('/promo', { method: 'POST', body: JSON.stringify({ code }) });
    result.className = 'promo-result success';
    result.innerHTML = `<b>Успешно!</b><span>+${d.amount} голды на баланс</span>`;
    input.value = '';
    if (d.user) state.user = d.user;
    renderUserHeader(); renderProfile();
    haptic('medium');
  } catch (e) {
    result.className = 'promo-result error';
    result.textContent = e.message || 'Промокод не найден';
  } finally { if (btn) btn.disabled = false; }
}

/* ================= start ================= */
function pollOnce() {
  if (document.hidden) return;
  sync(false).catch(() => {});
}
sync(true).then(() => {
  if (state.tourneyFilter) loadTourneys().then(renderTourneys);
  loadWithdrawals().then(renderWithdrawPage);
}).catch(() => {});
setInterval(pollOnce, 8000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollOnce(); });

document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.pressable');
  if (!el || el.disabled) return;
  el.classList.remove('tap'); void el.offsetWidth; el.classList.add('tap');
}, { passive: true });