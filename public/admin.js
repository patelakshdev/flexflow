'use strict';
/* ═══════════════════════════════════════════════════════════════
   FlexFlow — Admin Portal
   ═══════════════════════════════════════════════════════════════ */

/* ─── Utilities ─── */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const fmt = d => d ? new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—';
const fmtTime = d => d ? new Date(String(d).replace(' ','T')).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—';
const GOAL = {lose_fat:'Lose Fat',build_muscle:'Build Muscle',stay_fit:'Stay Fit'};

function decodeToken(t) {
  if (!t || typeof t !== 'string') return null;
  try {
    const b64 = t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
    return JSON.parse(json);
  } catch {
    try { return JSON.parse(atob(t.split('.')[1])); } catch { return null; }
  }
}

/* ─── App State ─── */
const S = {
  token: localStorage.getItem('ff_admin_t') || localStorage.getItem('ff_t'),
  user: null,
  view: null,
  charts: [],
};
try {
  S.user = JSON.parse(localStorage.getItem('ff_admin_u') || localStorage.getItem('ff_u') || 'null');
} catch { S.user = null; }

if (S.token && !S.user) {
  const p = decodeToken(S.token);
  if (p) {
    S.user = { name: p.name, role: p.role };
    localStorage.setItem('ff_admin_u', JSON.stringify(S.user));
    localStorage.setItem('ff_admin_t', S.token);
    localStorage.setItem('ff_t', S.token);
    localStorage.setItem('ff_u', JSON.stringify(S.user));
  }
}

const F = {};
const act = fn => async (...a) => { try { await fn(...a); } catch(e) { toast(e.message, 'bad'); } };

// Clean query string if polluted by native GET form submit
if (typeof window !== 'undefined' && window.location.search && (window.location.search.includes('email=') || window.location.search.includes('password='))) {
  window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
}
if (typeof document !== 'undefined') {
  document.addEventListener('submit', e => { e.preventDefault(); }, false);
}

/* ─── API ─── */
async function api(p, o = {}) {
  let r;
  try {
    r = await fetch('/api' + p, {
      method: o.method || 'GET',
      headers: {'Content-Type':'application/json', ...(S.token && {Authorization:'Bearer '+S.token})},
      body: o.body ? JSON.stringify(o.body) : undefined,
    });
  } catch (err) {
    throw new Error('Network error. Please check your internet connection.');
  }
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token) { F.logout(); throw new Error('Session expired.'); }
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

/* ─── Toast ─── */
function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  const colors = {ok:'bg-ink text-white',bad:'bg-bad text-white',warn:'bg-warn text-ink'};
  el.className = `pop pointer-events-auto flex items-center gap-3 max-w-sm rounded-2xl px-4 py-3 text-sm font-medium shadow-xl border ${kind==='ok'?'border-white/10':'border-current/20'} ${colors[kind]||colors.ok}`;
  const icons = {ok:'✓',bad:'✕',warn:'⚠'};
  el.innerHTML = `<span class="text-base leading-none">${icons[kind]||icons.ok}</span><span>${esc(msg)}</span>`;
  $('#toast').appendChild(el);
  setTimeout(() => { el.style.opacity='0'; el.style.transform='translateY(-8px)'; el.style.transition='all .3s'; setTimeout(() => el.remove(), 300); }, 3500);
}

/* ─── Modal ─── */
function modal(html, opts = {}) {
  const size = opts.size || 'sm:max-w-md';
  $('#modal').innerHTML = `
    <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-ink/60 backdrop-blur-sm fade-in" onclick="if(event.target===this)F.close()">
      <div role="dialog" aria-modal="true" class="pop bg-white w-full ${size} rounded-t-3xl sm:rounded-2xl max-h-[92vh] overflow-y-auto shadow-2xl">
        <div class="p-6">${html}</div>
      </div>
    </div>`;
  const f = $('#modal input:not([type=radio]):not([type=checkbox]),#modal select');
  if (f) setTimeout(() => f.focus(), 50);
}
F.close = () => { $('#modal').innerHTML = ''; };

const ask = (msg, sub, ok) => {
  if (typeof sub === 'function') { ok = sub; sub = 'This action cannot be undone.'; }
  window._confirmOk = ok;
  modal(`
    <div class="text-center">
      <div class="w-14 h-14 rounded-full bg-bad-soft mx-auto flex items-center justify-center mb-4">
        <span class="text-bad text-2xl">⚠</span>
      </div>
      <h2 class="font-display text-2xl font-bold">${esc(msg)}</h2>
      <p class="text-sm text-slate-500 mt-1">${esc(sub)}</p>
      <div class="flex gap-3 mt-6">
        <button class="${BTN2} flex-1" onclick="F.close()">Cancel</button>
        <button class="${BTN} !bg-bad flex-1" onclick="F.close();window._confirmOk()">Delete</button>
      </div>
    </div>`);
};

/* ─── Design tokens ─── */
const CARD = 'bg-white rounded-2xl border border-slate-200 shadow-sm';
const INP = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors';
const BTN = 'inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold text-sm px-5 py-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95';
const BTN2 = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-ink font-semibold text-sm px-5 py-2.5 transition-all active:scale-95';
const BTN_SM = 'inline-flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold px-3 py-1.5 transition-all';
const field = (l, h, hint) => `<label class="block"><span class="block text-sm font-semibold mb-1.5">${l}</span>${h}${hint?`<p class="text-xs text-slate-400 mt-1">${hint}</p>`:''}</label>`;
const pill = (t, k) => {
  const cls = {ok:'bg-ok-soft text-ok font-semibold',warn:'bg-warn-soft text-amber-700 font-semibold',bad:'bg-bad-soft text-bad font-semibold',mute:'bg-slate-100 text-slate-500',brand:'bg-brand-soft text-brand font-semibold'}[k] || 'bg-slate-100 text-slate-600';
  return `<span class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs ${cls}">${esc(t)}</span>`;
};
const empty = (icon, t, sub) => `
  <div class="text-center py-16 px-4">
    <div class="text-5xl mb-3">${icon}</div>
    <p class="font-semibold text-ink">${t}</p>
    <p class="text-sm text-slate-500 mt-1">${sub||''}</p>
  </div>`;

function table(heads, rows, none) {
  if (!rows.length) return none;
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-sm min-w-[600px]">
        <thead>
          <tr class="border-b border-slate-200 text-left">
            ${heads.map(h => `<th class="font-semibold text-slate-400 px-4 py-3 whitespace-nowrap text-xs uppercase tracking-wide">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `<tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">${r.map(c => `<td class="px-4 py-3 align-middle">${c}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

const pageHead = (title, sub = '', action = '') => `
  <div class="flex flex-wrap items-start justify-between gap-4 mb-8">
    <div>
      <h1 class="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">${title}</h1>
      ${sub ? `<p class="text-slate-500 mt-1.5 text-sm">${sub}</p>` : ''}
    </div>
    ${action ? `<div class="flex items-center gap-2">${action}</div>` : ''}
  </div>`;

function chartOf(id, type, labels, data, opts = {}) {
  if (!$('#'+id)) return;
  const colors = opts.color ? [opts.color] : ['#2D5BFF'];
  const existing = S.charts.find(c => c.canvas?.id === id);
  if (existing) existing.destroy();
  const chart = new Chart($('#'+id), {
    type,
    data: {
      labels,
      datasets: [{
        data,
        borderColor: colors[0],
        backgroundColor: type === 'bar' ? colors[0] + 'CC' : colors[0] + '1A',
        fill: type === 'line',
        tension: .4,
        borderWidth: 2,
        borderRadius: type === 'bar' ? 8 : 0,
        maxBarThickness: 48,
        pointRadius: type === 'line' ? 4 : 0,
        pointHoverRadius: 6,
        pointBackgroundColor: '#fff',
        pointBorderColor: colors[0],
        pointBorderWidth: 2,
      }]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { cornerRadius: 8, padding: 10 } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#94A3B8', font: {size:11} } },
        y: { beginAtZero: true, grid: { color: '#F1F5F9' }, ticks: { color: '#94A3B8', font: {size:11}, precision: 0 } }
      },
    }
  });
  S.charts.push(chart);
  return chart;
}

/* ═══════════════════════════════════════════════════════════════
   Session & Routing
   ═══════════════════════════════════════════════════════════════ */
const NAV = [
  { id:'dash', label:'Dashboard', icon:'📊' },
  { id:'members', label:'Members', icon:'👥' },
  { id:'trainers', label:'Trainers', icon:'🏋️' },
  { id:'payments', label:'Payments', icon:'💳' },
  { id:'memberships', label:'Memberships', icon:'🎫' },
  { id:'attendance', label:'Attendance', icon:'📅' },
];

function start(r) {
  S.token = r.token; S.user = r.user; S.view = null;
  localStorage.setItem('ff_admin_t', r.token);
  localStorage.setItem('ff_admin_u', JSON.stringify(r.user));
  localStorage.setItem('ff_t', r.token);
  localStorage.setItem('ff_u', JSON.stringify(r.user));
  go();
}

F.logout = () => {
  S.token = S.user = null;
  localStorage.removeItem('ff_admin_t');
  localStorage.removeItem('ff_admin_u');
  localStorage.removeItem('ff_t');
  localStorage.removeItem('ff_u');
  sessionStorage.removeItem('ff_admin_view');
  F.close();
  loginScreen();
};

F.go = v => go(v);

async function go(v) {
  if (!S.token) return loginScreen();
  if (S.user?.role === 'member') {
    window.location.replace('/');
    return;
  }
  if (S.user?.role !== 'admin') {
    toast('Admin access required', 'bad');
    return loginScreen();
  }
  const targetView = v || window.location.hash.slice(1) || sessionStorage.getItem('ff_admin_view');
  S.view = NAV.some(n => n.id === targetView) ? targetView : (NAV.some(n => n.id === S.view) ? S.view : NAV[0].id);
  window.location.hash = S.view;
  sessionStorage.setItem('ff_admin_view', S.view);
  S.charts.forEach(c => { try { c.destroy(); } catch{} }); S.charts = [];

  const logo = `<span class="font-display text-2xl font-extrabold tracking-tight text-white">FLEX<span class="text-brand-light">FLOW</span></span>`;

  $('#app').innerHTML = `
    <div class="min-h-screen lg:flex">
      <!-- Sidebar -->
      <aside class="hidden lg:flex w-64 xl:w-72 shrink-0 flex-col bg-ink text-white sticky top-0 h-screen overflow-y-auto">
        <div class="p-6 pb-2">
          ${logo.replace('text-2xl','text-3xl')}
          <p class="text-xs text-slate-400 mt-1 uppercase tracking-widest">Admin Portal</p>
        </div>
        <nav class="flex-1 px-3 py-4 space-y-0.5">
          ${NAV.map(n => `
            <button onclick="F.go('${n.id}')" class="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-left transition-all ${n.id===S.view ? 'bg-brand text-white shadow-lg shadow-brand/25' : 'text-slate-300 hover:bg-white/8 hover:text-white'}">
              <span class="text-base leading-none">${n.icon}</span>
              <span>${n.label}</span>
            </button>`).join('')}
        </nav>
        <div class="p-4 border-t border-white/10">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 rounded-full bg-brand flex items-center justify-center font-bold text-white text-sm shrink-0">${esc(S.user.name.charAt(0).toUpperCase())}</div>
            <div class="min-w-0">
              <p class="font-semibold text-sm truncate">${esc(S.user.name)}</p>
              <p class="text-xs text-slate-400">Administrator</p>
            </div>
          </div>
          <a href="/" class="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors mb-2">← User portal</a>
          <button onclick="F.logout()" class="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors">→ Sign out</button>
        </div>
      </aside>

      <!-- Main -->
      <div class="flex-1 min-w-0 pb-24 lg:pb-0 flex flex-col">
        <!-- Mobile header -->
        <header class="lg:hidden sticky top-0 z-30 bg-ink text-white px-4 py-3 flex items-center justify-between shadow-md">
          ${logo}
          <button onclick="F.logout()" class="p-2 rounded-lg hover:bg-white/10 transition-colors text-sm">→ Out</button>
        </header>

        <main id="main" class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-10">
          <div class="flex items-center justify-center h-64">
            <div class="w-8 h-8 rounded-full border-2 border-brand border-t-transparent spin"></div>
          </div>
        </main>
      </div>

      <!-- Bottom nav (mobile) -->
      <nav class="bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex justify-around">
        ${NAV.map(n => `
          <button onclick="F.go('${n.id}')" class="flex-1 flex flex-col items-center gap-0.5 py-2 px-0.5 text-[9px] font-semibold transition-colors ${n.id===S.view ? 'text-brand' : 'text-slate-400'}">
            <span class="text-lg leading-none">${n.icon}</span>
            <span class="truncate w-full text-center">${n.label.split(' ')[0]}</span>
          </button>`).join('')}
      </nav>
    </div>`;

  try { await V[S.view](); } catch(e) {
    console.error(e);
    $('#main').innerHTML = `<div class="text-center py-16"><p class="text-4xl mb-3">😕</p><p class="font-semibold">${esc(e.message)}</p></div>`;
  }
  scrollTo(0,0);
}

/* ─── Login ─── */
async function loginScreen() {
  S.charts.forEach(c => { try { c.destroy(); } catch{} }); S.charts = [];
  $('#app').innerHTML = `
    <div class="min-h-screen bg-ink flex items-center justify-center p-4">
      <div class="w-full max-w-sm">
        <div class="text-center mb-8">
          <span class="font-display text-4xl font-extrabold text-white">FLEX<span class="text-brand-light">FLOW</span></span>
          <p class="text-slate-400 mt-1 text-sm">Admin Portal</p>
        </div>
        <div class="bg-white rounded-2xl p-8 shadow-2xl slide-up">
          <h2 class="font-display text-3xl font-extrabold mb-1">Admin Login</h2>
          <p class="text-slate-500 text-sm mb-6">Sign in with your admin credentials</p>
          <form action="javascript:void(0);" method="POST" onsubmit="event.preventDefault();F.login(event);return false" class="space-y-4">
            ${field('Email', `<input class="${INP}" type="email" name="email" autocomplete="username" placeholder="admin@flexflow.com" required>`)}
            ${field('Password', `<input class="${INP}" type="password" name="password" autocomplete="current-password" placeholder="••••••••" required>`)}
            <button type="submit" class="${BTN} w-full py-3">Sign in to Admin →</button>
          </form>
          <p class="text-xs text-slate-400 text-center mt-4"><a href="/" class="hover:text-brand">← Back to member portal</a></p>
        </div>
      </div>
    </div>`;
}

F.login = act(async e => {
  if (e && e.preventDefault) e.preventDefault();
  if (e && e.stopPropagation) e.stopPropagation();
  const form = e?.target?.tagName === 'FORM' ? e.target : (e?.target?.closest ? e.target.closest('form') : document.querySelector('form'));
  const btn = form?.querySelector ? (form.querySelector('button[type=submit],button:last-of-type') || form.querySelector('button')) : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
  try {
    const creds = form ? Object.fromEntries(new FormData(form)) : {};
    const r = await api('/auth/login', {method:'POST', body: creds});
    if (r.user.role === 'member') {
      localStorage.setItem('ff_t', r.token);
      localStorage.setItem('ff_u', JSON.stringify(r.user));
      localStorage.setItem('ff_admin_t', r.token);
      localStorage.setItem('ff_admin_u', JSON.stringify(r.user));
      toast('Member account detected. Redirecting to Member Portal...', 'ok');
      setTimeout(() => { window.location.href = '/'; }, 400);
      return;
    }
    if (r.user.role !== 'admin') throw new Error('This portal is for admins only.');
    start(r);
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Sign in to Admin →'; } }
});

/* ═══════════════════════════════════════════════════════════════
   Admin Views
   ═══════════════════════════════════════════════════════════════ */
const V = {};

/* ─── KPI Card ─── */
const kpi = (icon, label, value, sub, cls = '') => `
  <div class="${CARD} p-5">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-xs font-semibold text-slate-400 uppercase tracking-widest">${label}</p>
        <p class="font-display text-4xl font-extrabold num mt-1 ${cls}">${value}</p>
        <p class="text-xs text-slate-500 mt-1">${sub}</p>
      </div>
      <span class="text-3xl">${icon}</span>
    </div>
  </div>`;

/* ─── DASHBOARD ─── */
V.dash = async () => {
  const d = await api('/admin/dashboard'), k = d.kpi;

  $('#main').innerHTML = `
    ${pageHead('Dashboard', 'Real-time gym performance overview')}

    <!-- KPIs -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${kpi('💰','Revenue this month', inr(k.revMonth), `${inr(k.revTotal)} all time`)}
      ${kpi('👥','Active members', k.active, `of ${k.members} registered`)}
      ${kpi('📅','Today\'s check-ins', k.today, 'members in gym now')}
      ${kpi('⚠️','Expiring in 7 days', k.expiring, `${inr(k.pending)} in unpaid fees`, k.expiring > 0 ? 'text-warn' : '')}
    </div>

    <!-- Charts -->
    <div class="grid lg:grid-cols-2 gap-5 mb-6">
      <div class="${CARD} p-5">
        <h2 class="font-semibold mb-4">Revenue — Last 6 Months</h2>
        <div class="h-56"><canvas id="rv"></canvas></div>
      </div>
      <div class="${CARD} p-5">
        <h2 class="font-semibold mb-4">Attendance — Last 7 Days</h2>
        <div class="h-56"><canvas id="at"></canvas></div>
      </div>
    </div>

    <!-- Bottom row -->
    <div class="grid lg:grid-cols-3 gap-5">
      <!-- Expiring -->
      <div class="${CARD} lg:col-span-2 overflow-hidden">
        <div class="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 class="font-semibold">Memberships Expiring Soon</h2>
          ${k.expiring > 0 ? `<span class="text-xs font-bold bg-warn-soft text-amber-700 px-2.5 py-1 rounded-full">${k.expiring} expiring</span>` : ''}
        </div>
        ${table(
          ['Member','Phone','Expires','Action'],
          d.expiring.map(e => [
            `<p class="font-semibold">${esc(e.name)}</p>`,
            esc(e.phone || '—'),
            fmt(e.end_date),
            e.phone ? `<a class="${BTN_SM} bg-ok-soft text-ok hover:bg-ok hover:text-white" href="tel:${esc(e.phone)}">📞 Call</a>` : ''
          ]),
          empty('✅','No expiring memberships','Everyone is good for the next 7 days.')
        )}
      </div>

      <!-- Plan distribution -->
      <div class="${CARD} p-5">
        <h2 class="font-semibold mb-4">Active Plans</h2>
        ${d.plans.length ? d.plans.map(p => `
          <div class="flex justify-between items-center py-2.5 border-b border-slate-100 last:border-0">
            <span class="text-sm">${esc(p.name)}</span>
            <span class="font-display font-bold text-lg num">${p.c}</span>
          </div>`).join('') : `<p class="text-sm text-slate-400">No active memberships.</p>`}
      </div>
    </div>`;

  chartOf('rv', 'bar', d.revenue.map(x => x.label), d.revenue.map(x => x.value));
  chartOf('at', 'line', d.attendance.map(x => x.label), d.attendance.map(x => x.value), {color:'#10B981'});
};

/* ─── MEMBERS ─── */
let MEMBERS = [], TRAINERS_CACHE = null;

V.members = async () => {
  MEMBERS = await api('/admin/members'); TRAINERS_CACHE = null;

  $('#main').innerHTML = `
    ${pageHead('Members', `${MEMBERS.length} registered`, `<button class="${BTN}" onclick="F.addMember()">+ Add Member</button>`)}
    <div class="flex flex-wrap gap-3 mb-4">
      <input id="ms" class="${INP} max-w-xs" type="search" placeholder="🔍 Search name, email, phone…" oninput="F.filterMembers()" aria-label="Search members">
      <select id="mf-plan" class="${INP} max-w-[160px]" onchange="F.filterMembers()">
        <option value="">All plans</option>
        <option value="active">Active only</option>
        <option value="expired">Expired</option>
        <option value="due">Has dues</option>
      </select>
    </div>
    <div id="mt" class="${CARD} overflow-hidden"></div>
    <p id="member-count" class="text-xs text-slate-400 mt-2 text-right"></p>`;

  F.filterMembers();
};

F.filterMembers = () => {
  const s = ($('#ms')?.value || '').toLowerCase();
  const f = $('#mf-plan')?.value || '';
  const today = new Date().toISOString().slice(0,10);

  let rows = MEMBERS.filter(m => [m.name, m.email, m.phone].join(' ').toLowerCase().includes(s));
  if (f === 'active') rows = rows.filter(m => m.end_date && m.end_date >= today);
  else if (f === 'expired') rows = rows.filter(m => !m.end_date || m.end_date < today);
  else if (f === 'due') rows = rows.filter(m => m.dues > 0);

  $('#mt').innerHTML = table(
    ['Member','Plan','Expires','Fees','Trainer',''],
    rows.map(m => [
      `<div><p class="font-semibold">${esc(m.name)}</p><p class="text-xs text-slate-400">${esc(m.email)}</p>${m.phone ? `<p class="text-xs text-slate-400">${esc(m.phone)}</p>` : ''}</div>`,
      esc(m.plan_name || '—'),
      m.end_date ? `<span>${fmt(m.end_date)}</span>${m.end_date < today ? ' ' + pill('Expired','bad') : ''}` : '—',
      m.dues > 0 ? pill(`${m.dues} due`,'warn') : pill('Clear','ok'),
      `<select class="${INP} !py-1 !w-36 text-xs" onchange="F.assign(${m.id},this.value)" data-t="${m.trainer_id||''}">
        <option value="">No trainer</option>
      </select>`,
      `<div class="flex gap-1.5">
        <button class="${BTN_SM} bg-brand-soft text-brand hover:bg-brand hover:text-white" onclick="F.addPaymentFor(${m.id},'${esc(m.name).replace(/'/g,'')}')">💳 Pay</button>
        <button class="${BTN_SM} bg-bad-soft text-bad hover:bg-bad hover:text-white" onclick="F.delMember(${m.id},'${esc(m.name).replace(/'/g,'')}')">🗑</button>
      </div>`
    ]),
    empty('👥','No members found','Try adjusting your search or add a member.')
  );
  $('#member-count').textContent = `${rows.length} of ${MEMBERS.length} members`;

  // Populate trainer dropdowns
  (TRAINERS_CACHE ? Promise.resolve(TRAINERS_CACHE) : api('/admin/trainers').then(t => (TRAINERS_CACHE = t)))
    .then(ts => {
      document.querySelectorAll('select[data-t]').forEach(sel => {
        sel.insertAdjacentHTML('beforeend', ts.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join(''));
        sel.value = sel.dataset.t || '';
      });
    }).catch(() => {});
};

F.assign = act(async (id, t) => {
  await api(`/admin/members/${id}/trainer`, {method:'PATCH', body:{trainer_id: t || null}});
  toast('Trainer updated', 'ok');
});

F.delMember = (id, name) => ask(`Delete ${name}?`, 'This will remove their account and all data.', act(async () => {
  await api('/admin/members/' + id, {method:'DELETE'});
  toast('Member deleted', 'ok');
  V.members();
}));

F.addMember = async () => {
  const plans = await api('/plans');
  modal(`
    <h2 class="font-display text-3xl font-extrabold mb-5">Add Member</h2>
    <form action="javascript:void(0);" method="POST" onsubmit="event.preventDefault();F.saveMember(event);return false" class="space-y-3">
      <div class="grid grid-cols-2 gap-3">
        <div class="col-span-2">${field('Full name', `<input class="${INP}" name="name" placeholder="John Doe" required>`)}</div>
        <div class="col-span-2">${field('Email', `<input class="${INP}" type="email" name="email" placeholder="john@example.com" required>`)}</div>
        ${field('Phone', `<input class="${INP}" type="tel" name="phone" placeholder="+91 98765 43210">`)}
        ${field('Password', `<input class="${INP}" name="password" type="password" minlength="8" placeholder="8+ chars" required>`)}
        ${field('Height (cm)', `<input class="${INP}" type="number" name="height_cm" min="100" max="250" placeholder="175">`)}
        ${field('Weight (kg)', `<input class="${INP}" type="number" name="weight_kg" step="0.1" min="25" max="300" placeholder="70">`)}
        <div class="col-span-2">${field('Fitness goal', `<select class="${INP}" name="goal"><option value="lose_fat">🔥 Lose Fat</option><option value="build_muscle">💪 Build Muscle</option><option value="stay_fit">🧘 Stay Fit</option></select>`)}</div>
        ${field('Diet', `<select class="${INP}" name="diet_pref"><option value="veg">🌱 Vegetarian</option><option value="nonveg">🍗 Non-veg</option></select>`)}
        ${field('Level', `<select class="${INP}" name="declared_level"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select>`)}
      </div>
      ${field('Membership plan', `<select class="${INP}" name="plan_id">${plans.map(p => `<option value="${p.id}">${esc(p.name)} · ${inr(p.price)}</option>`).join('')}</select>`)}
      ${field('Payment received', `<select class="${INP}" name="method"><option value="cash">💵 Cash</option><option value="upi">📱 UPI</option><option value="card">💳 Card</option><option value="">Not yet (pending)</option></select>`)}
      <div class="flex gap-2 pt-2">
        <button type="button" class="${BTN2} flex-1" onclick="F.close()">Cancel</button>
        <button type="submit" class="${BTN} flex-1">Add Member</button>
      </div>
    </form>`, {size:'sm:max-w-lg'});
};

F.saveMember = act(async e => {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target?.tagName === 'FORM' ? e.target : (e?.target?.closest ? e.target.closest('form') : document.querySelector('form'));
  const btn = form?.querySelector ? (form.querySelector('button[type=submit],button:last-of-type') || form.querySelector('button')) : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  try {
    await api('/admin/members', {method:'POST', body: Object.fromEntries(new FormData(form))});
    F.close(); toast('Member added successfully', 'ok'); V.members();
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Add Member'; } }
});

/* ─── TRAINERS ─── */
V.trainers = async () => {
  const ts = await api('/admin/trainers');

  $('#main').innerHTML = `
    ${pageHead('Trainers', `${ts.length} on staff`, `<button class="${BTN}" onclick="F.addTrainer()">+ Add Trainer</button>`)}
    <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      ${ts.length ? ts.map(t => `
        <div class="${CARD} p-5">
          <div class="flex items-start gap-3 mb-4">
            <div class="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center font-bold text-purple-600 text-xl shrink-0">${esc(t.name.charAt(0).toUpperCase())}</div>
            <div class="min-w-0 flex-1">
              <p class="font-semibold">${esc(t.name)}</p>
              <p class="text-xs text-slate-400">${esc(t.email)}</p>
              ${t.phone ? `<p class="text-xs text-slate-400">${esc(t.phone)}</p>` : ''}
            </div>
          </div>
          <dl class="text-sm space-y-2 mb-4">
            <div class="flex justify-between">
              <dt class="text-slate-500">Specialization</dt>
              <dd class="font-medium truncate max-w-[140px] text-right">${esc(t.specialization || '—')}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Members</dt>
              <dd class="font-display font-bold text-lg">${t.clients}</dd>
            </div>
          </dl>
          <button class="${BTN_SM} bg-bad-soft text-bad hover:bg-bad hover:text-white w-full justify-center py-2" onclick="F.delTrainer(${t.id},'${esc(t.name).replace(/'/g,'')}')">Remove Trainer</button>
        </div>`).join('')
      : empty('🏋️','No trainers yet','Add your first trainer to the team.')}
    </div>`;
};

F.addTrainer = () => modal(`
  <h2 class="font-display text-3xl font-extrabold mb-5">Add Trainer</h2>
  <form action="javascript:void(0);" method="POST" onsubmit="event.preventDefault();F.saveTrainer(event);return false" class="space-y-3">
    ${field('Full name', `<input class="${INP}" name="name" placeholder="Jane Smith" required>`)}
    ${field('Email', `<input class="${INP}" type="email" name="email" placeholder="jane@flexflow.com" required>`)}
    ${field('Phone', `<input class="${INP}" type="tel" name="phone" placeholder="+91 98765 43210">`)}
    ${field('Specialization', `<input class="${INP}" name="specialization" placeholder="Strength, Weight Loss, Yoga…">`)}
    ${field('Password', `<input class="${INP}" type="password" name="password" minlength="8" placeholder="8+ characters" required>`)}
    <div class="flex gap-2 pt-2">
      <button type="button" class="${BTN2} flex-1" onclick="F.close()">Cancel</button>
      <button type="submit" class="${BTN} flex-1">Add Trainer</button>
    </div>
  </form>`);

F.saveTrainer = act(async e => {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target?.tagName === 'FORM' ? e.target : (e?.target?.closest ? e.target.closest('form') : document.querySelector('form'));
  const btn = form?.querySelector ? (form.querySelector('button[type=submit],button:last-of-type') || form.querySelector('button')) : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
  try {
    await api('/admin/trainers', {method:'POST', body: Object.fromEntries(new FormData(form))});
    F.close(); toast('Trainer added', 'ok'); V.trainers();
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Add Trainer'; } }
});

F.delTrainer = (id, name) => ask(`Remove ${name}?`, 'Their members will be unassigned.', act(async () => {
  await api('/admin/trainers/' + id, {method:'DELETE'});
  toast('Trainer removed', 'ok'); V.trainers();
}));

/* ─── PAYMENTS ─── */
V.payments = async () => {
  const ps = await api('/admin/payments');
  const total = ps.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount), 0);
  const pending = ps.filter(p => p.status !== 'paid').reduce((s, p) => s + Number(p.amount), 0);

  $('#main').innerHTML = `
    ${pageHead('Payments', `${ps.length} transactions`, `<button class="${BTN}" onclick="F.addPayment()">+ Record Payment</button>`)}

    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
      ${kpi('💰','Total collected', inr(total), 'All time revenue')}
      ${kpi('⏳','Pending dues', inr(pending), `${ps.filter(p=>p.status!=='paid').length} unpaid`, pending > 0 ? 'text-warn' : '')}
      ${kpi('📊','Transactions', ps.length, 'All records')}
    </div>

    <div class="${CARD} overflow-hidden">
      <div class="p-4 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
        <h2 class="font-semibold">All Transactions</h2>
        <input id="ps" class="${INP} max-w-xs" type="search" placeholder="🔍 Search member…" oninput="F.filterPayments()" aria-label="Search">
      </div>
      <div id="pt"></div>
    </div>`;

  window._allPayments = ps;
  F.filterPayments();
};

F.filterPayments = () => {
  const s = ($('#ps')?.value || '').toLowerCase();
  const rows = (window._allPayments || []).filter(p => (p.name||'').toLowerCase().includes(s));
  $('#pt').innerHTML = table(
    ['Date','Member','Plan','Amount','Method','Status'],
    rows.map(p => [
      fmt(p.paid_on || p.created_at),
      esc(p.name),
      esc(p.plan_name),
      `<span class="font-semibold num">${inr(p.amount)}</span>`,
      p.method ? `<span class="uppercase text-xs font-bold bg-slate-100 px-2 py-0.5 rounded">${p.method}</span>` : '—',
      p.status === 'paid' ? pill('Paid','ok') :
        `<button class="${BTN_SM} bg-ok-soft text-ok hover:bg-ok hover:text-white" onclick="F.settle(${p.id})">Mark Paid</button>`
    ]),
    empty('💳','No payments found','')
  );
};

F.settle = id => modal(`
  <h2 class="font-display text-2xl font-extrabold mb-1">Mark as Paid</h2>
  <p class="text-slate-500 text-sm mb-5">Select the payment method received</p>
  <form action="javascript:void(0);" method="POST" onsubmit="event.preventDefault();F.doSettle(event,${id});return false" class="space-y-4">
    ${field('Received via', `<select class="${INP}" name="method">
      <option value="cash">💵 Cash</option>
      <option value="upi">📱 UPI</option>
      <option value="card">💳 Card</option>
      <option value="netbanking">🏦 Net Banking</option>
    </select>`)}
    <div class="flex gap-2">
      <button type="button" class="${BTN2} flex-1" onclick="F.close()">Cancel</button>
      <button type="submit" class="${BTN} flex-1">Confirm Payment</button>
    </div>
  </form>`);

F.doSettle = act(async (e, id) => {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target?.tagName === 'FORM' ? e.target : (e?.target?.closest ? e.target.closest('form') : document.querySelector('form'));
  await api(`/admin/payments/${id}/settle`, {method:'POST', body: Object.fromEntries(new FormData(form))});
  F.close(); toast('Payment confirmed', 'ok'); V.payments();
});

F.addPayment = async () => {
  const [ms, plans] = await Promise.all([api('/admin/members'), api('/plans')]);
  modal(`
    <h2 class="font-display text-3xl font-extrabold mb-5">Record Payment</h2>
    <form action="javascript:void(0);" method="POST" onsubmit="event.preventDefault();F.savePayment(event);return false" class="space-y-3">
      ${field('Member', `<select class="${INP}" name="member_id" required><option value="">Select member…</option>${ms.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>`)}
      ${field('Plan', `<select class="${INP}" name="plan_id">${plans.map(p => `<option value="${p.id}">${esc(p.name)} · ${inr(p.price)}</option>`).join('')}</select>`)}
      ${field('Received via', `<select class="${INP}" name="method"><option value="cash">💵 Cash</option><option value="upi">📱 UPI</option><option value="card">💳 Card</option><option value="netbanking">🏦 Net Banking</option></select>`)}
      <div class="flex gap-2 pt-2">
        <button type="button" class="${BTN2} flex-1" onclick="F.close()">Cancel</button>
        <button type="submit" class="${BTN} flex-1">Save Payment</button>
      </div>
    </form>`);
};

F.savePayment = act(async e => {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target?.tagName === 'FORM' ? e.target : (e?.target?.closest ? e.target.closest('form') : document.querySelector('form'));
  await api('/admin/payments', {method:'POST', body: Object.fromEntries(new FormData(form))});
  F.close(); toast('Payment recorded', 'ok'); V.payments();
});

F.addPaymentFor = async (memberId, memberName) => {
  const plans = await api('/plans');
  modal(`
    <h2 class="font-display text-2xl font-extrabold mb-1">Record Payment</h2>
    <p class="text-slate-500 text-sm mb-5">for <strong>${esc(memberName)}</strong></p>
    <form action="javascript:void(0);" method="POST" onsubmit="event.preventDefault();F.savePaymentFor(event,${memberId});return false" class="space-y-3">
      ${field('Plan', `<select class="${INP}" name="plan_id">${plans.map(p => `<option value="${p.id}">${esc(p.name)} · ${inr(p.price)}</option>`).join('')}</select>`)}
      ${field('Received via', `<select class="${INP}" name="method"><option value="cash">💵 Cash</option><option value="upi">📱 UPI</option><option value="card">💳 Card</option></select>`)}
      <div class="flex gap-2">
        <button type="button" class="${BTN2} flex-1" onclick="F.close()">Cancel</button>
        <button type="submit" class="${BTN} flex-1">Confirm</button>
      </div>
    </form>`);
};

F.savePaymentFor = act(async (e, memberId) => {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target?.tagName === 'FORM' ? e.target : (e?.target?.closest ? e.target.closest('form') : document.querySelector('form'));
  const d = Object.fromEntries(new FormData(form));
  await api('/admin/payments', {method:'POST', body: {member_id: memberId, plan_id: d.plan_id, method: d.method}});
  F.close(); toast('Payment recorded', 'ok');
  if (S.view === 'members') V.members();
});

/* ─── MEMBERSHIPS ─── */
V.memberships = async () => {
  const [plans, members] = await Promise.all([api('/plans'), api('/admin/members')]);
  const today = new Date().toISOString().slice(0,10);
  const active = members.filter(m => m.end_date && m.end_date >= today);
  const expired = members.filter(m => !m.end_date || m.end_date < today);

  $('#main').innerHTML = `
    ${pageHead('Membership Management', 'Plans, active members, and expiry overview')}

    <!-- Plan cards -->
    <h2 class="font-display text-3xl font-extrabold mb-4">Membership Plans</h2>
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      ${plans.map(p => {
        const cnt = members.filter(m => m.plan_name === p.name && m.end_date >= today).length;
        return `
          <div class="${CARD} p-5">
            <p class="font-display text-2xl font-extrabold">${esc(p.name)}</p>
            <p class="font-display text-3xl font-extrabold num mt-1">${inr(p.price)}</p>
            <p class="text-xs text-slate-400 mt-1">${inr(Math.round(p.price/p.months))}/month</p>
            <div class="mt-4 pt-4 border-t border-slate-100">
              <p class="font-display text-2xl font-bold num text-brand">${cnt}</p>
              <p class="text-xs text-slate-500">active members</p>
            </div>
          </div>`;
      }).join('')}
    </div>

    <!-- Active list -->
    <div class="grid lg:grid-cols-2 gap-5">
      <div class="${CARD} overflow-hidden">
        <div class="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 class="font-semibold">Active Memberships</h2>
          <span class="text-xs bg-ok-soft text-ok font-bold px-2.5 py-1 rounded-full">${active.length}</span>
        </div>
        <div class="max-h-80 overflow-y-auto">
          ${active.length ? active.map(m => `
            <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <div>
                <p class="font-medium text-sm">${esc(m.name)}</p>
                <p class="text-xs text-slate-400">${esc(m.plan_name||'—')}</p>
              </div>
              <div class="text-right">
                <p class="text-xs text-slate-500">${fmt(m.end_date)}</p>
                ${pill('Active','ok')}
              </div>
            </div>`).join('')
          : `<div class="p-8 text-center text-slate-400 text-sm">No active memberships</div>`}
        </div>
      </div>

      <div class="${CARD} overflow-hidden">
        <div class="p-5 border-b border-slate-100 flex items-center justify-between">
          <h2 class="font-semibold">Expired / No Plan</h2>
          <span class="text-xs bg-bad-soft text-bad font-bold px-2.5 py-1 rounded-full">${expired.length}</span>
        </div>
        <div class="max-h-80 overflow-y-auto">
          ${expired.length ? expired.map(m => `
            <div class="flex items-center justify-between px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <div>
                <p class="font-medium text-sm">${esc(m.name)}</p>
                <p class="text-xs text-slate-400">${esc(m.email)}</p>
              </div>
              <div class="text-right flex flex-col items-end gap-1">
                ${m.end_date ? `<p class="text-xs text-slate-400">${fmt(m.end_date)}</p>` : ''}
                ${pill('Expired','bad')}
              </div>
            </div>`).join('')
          : `<div class="p-8 text-center text-slate-400 text-sm">No expired memberships 🎉</div>`}
        </div>
      </div>
    </div>`;
};

/* ─── ATTENDANCE ─── */
V.attendance = async () => {
  const day = $('#ad')?.value || new Date().toISOString().slice(0,10);
  const [rows, ms] = await Promise.all([
    api('/admin/attendance?date=' + day),
    api('/admin/members')
  ]);

  $('#main').innerHTML = `
    ${pageHead('Attendance', `${rows.length} check-in${rows.length===1?'':'s'} on ${fmt(day)}`)}

    <div class="${CARD} p-5 mb-6">
      <div class="flex flex-wrap gap-3 items-end">
        ${field('Date', `<input id="ad" type="date" class="${INP} !w-44" value="${day}" onchange="V.attendance()" aria-label="Date">`)}
        <form action="javascript:void(0);" method="POST" class="flex gap-2 flex-1 min-w-[260px]" onsubmit="event.preventDefault();F.mark(event);return false">
          ${field('Manual check-in', `
            <div class="flex gap-2">
              <select name="member_id" class="${INP}" required aria-label="Member">
                <option value="">Select member…</option>
                ${ms.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
              </select>
              <button type="submit" class="${BTN} shrink-0">Check In</button>
            </div>`)}
        </form>
      </div>
    </div>

    <div class="${CARD} overflow-hidden">
      <div class="p-5 border-b border-slate-100">
        <h2 class="font-semibold">Check-in Log</h2>
      </div>
      ${table(
        ['#','Member','Time','Streak'],
        rows.map((r, i) => [
          `<span class="text-slate-400 num">${i+1}</span>`,
          `<div class="flex items-center gap-2"><div class="w-7 h-7 rounded-full bg-brand-soft flex items-center justify-center text-brand font-bold text-xs">${esc(r.name.charAt(0).toUpperCase())}</div><span class="font-medium">${esc(r.name)}</span></div>`,
          fmtTime(r.checked_in_at),
          `<span class="text-orange-500">🔥</span>`
        ]),
        empty('📅','No check-ins yet','Members can check in from their app, or use manual check-in above.')
      )}
    </div>`;
};

F.mark = act(async e => {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target?.tagName === 'FORM' ? e.target : (e?.target?.closest ? e.target.closest('form') : document.querySelector('form'));
  const btn = form?.querySelector ? (form.querySelector('button[type=submit],button:last-of-type') || form.querySelector('button')) : null;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const r = await api('/admin/attendance', {method:'POST', body: {member_id: new FormData(form).get('member_id')}});
    toast(r.earned?.length ? '🎉 Checked in. A badge was just earned!' : `✓ Checked in. Streak: ${r.streak}`, 'ok');
    await V.attendance();
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Check In'; } }
});

/* ═══════════════════════════════════════════════════════════════
   Bootstrap
   ═══════════════════════════════════════════════════════════════ */
window.V = V; window.F = F;
window.addEventListener('hashchange', () => {
  const h = window.location.hash.slice(1);
  if (h && S.token && S.user?.role === 'admin' && S.view !== h) go(h);
});

if (S.token) {
  if (S.user?.role === 'member') {
    window.location.replace('/');
  } else {
    go();
  }
} else {
  loginScreen();
}
