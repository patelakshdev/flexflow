'use strict';
/* ═══════════════════════════════════════════════════════════════
   FlexFlow — Member + Trainer Portal
   ═══════════════════════════════════════════════════════════════ */

/* ─── Utilities ─── */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN');
const fmt = d => d ? new Date(String(d).slice(0,10)+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—';
const fmtTime = d => d ? new Date(String(d).replace(' ','T')).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—';
const GOAL = {lose_fat:'Lose Fat',build_muscle:'Build Muscle',stay_fit:'Stay Fit'};
const GOAL_ICON = {lose_fat:'🔥',build_muscle:'💪',stay_fit:'🧘'};
const LEVEL_COLOR = {beginner:'ok',intermediate:'warn',advanced:'brand'};

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
  token: localStorage.getItem('ff_t') || localStorage.getItem('ff_admin_t'),
  user: null,
  view: null,
  charts: [],
  rec: null,
  plans: null,
};
try {
  S.user = JSON.parse(localStorage.getItem('ff_u') || localStorage.getItem('ff_admin_u') || 'null');
} catch { S.user = null; }

if (S.token && !S.user) {
  const p = decodeToken(S.token);
  if (p) {
    S.user = { name: p.name, role: p.role };
    localStorage.setItem('ff_u', JSON.stringify(S.user));
    localStorage.setItem('ff_t', S.token);
  }
}

const F = {}; // global function namespace
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
  if (r.status === 401 && S.token) { F.logout(); throw new Error('Session expired. Please sign in again.'); }
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

/* ─── Confirm dialog ─── */
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
const CARD_HOVER = 'bg-white rounded-2xl border border-slate-200 shadow-sm card-hover cursor-pointer';
const INP = 'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand transition-colors';
const BTN = 'inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-dark text-white font-semibold text-sm px-5 py-2.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95';
const BTN2 = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-ink font-semibold text-sm px-5 py-2.5 transition-all active:scale-95';
const BTN_DANGER = 'inline-flex items-center justify-center gap-2 rounded-xl bg-bad hover:bg-red-600 text-white font-semibold text-sm px-5 py-2.5 transition-all active:scale-95';
const field = (l, h, hint) => `<label class="block"><span class="block text-sm font-semibold mb-1.5 text-ink">${l}</span>${h}${hint ? `<p class="text-xs text-slate-400 mt-1">${hint}</p>` : ''}</label>`;
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

/* ─── Table helper ─── */
function table(heads, rows, none) {
  if (!rows.length) return none;
  return `
    <div class="overflow-x-auto">
      <table class="w-full text-sm min-w-[560px]">
        <thead>
          <tr class="border-b border-slate-200 text-left">
            ${heads.map(h => `<th class="font-semibold text-slate-500 px-4 py-3 whitespace-nowrap text-xs uppercase tracking-wide">${h}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `<tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 transition-colors">${r.map(c => `<td class="px-4 py-3 align-middle">${c}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ─── Page heading ─── */
const pageHead = (title, sub = '', action = '') => `
  <div class="flex flex-wrap items-start justify-between gap-4 mb-8">
    <div>
      <h1 class="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">${title}</h1>
      ${sub ? `<p class="text-slate-500 mt-1.5 text-sm">${sub}</p>` : ''}
    </div>
    ${action ? `<div class="flex items-center gap-2">${action}</div>` : ''}
  </div>`;

/* ─── Chart helper ─── */
function chartOf(id, type, labels, data, opts = {}) {
  if (!$('#'+id)) return;
  const colors = opts.colors || ['#2D5BFF'];
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
      plugins: { legend: { display: false }, tooltip: { bodyFont: { family: 'Inter' }, titleFont: { family: 'Inter' }, cornerRadius: 8, padding: 10 } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8' } },
        y: { beginAtZero: true, grid: { color: '#F1F5F9', drawBorder: false }, ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8', precision: 0 } }
      },
      ...opts
    }
  });
  S.charts.push(chart);
  return chart;
}

/* ═══════════════════════════════════════════════════════════════
   Session & Routing
   ═══════════════════════════════════════════════════════════════ */
const NAV = {
  member: [
    { id:'home', label:'Home', icon:'🏠' },
    { id:'plan', label:'Plan & Fees', icon:'💳' },
    { id:'workout', label:'Workout', icon:'🏋️' },
    { id:'diet', label:'Diet', icon:'🥗' },
    { id:'progress', label:'Progress', icon:'📈' },
  ],
  trainer: [
    { id:'clients', label:'My Members', icon:'👥' },
    { id:'schedule', label:'Schedule', icon:'📅' },
  ],
};

function start(r) {
  S.token = r.token; S.user = r.user; S.view = null; S.rec = null; S.plans = null;
  localStorage.setItem('ff_t', r.token);
  localStorage.setItem('ff_u', JSON.stringify(r.user));
  localStorage.setItem('ff_admin_t', r.token);
  localStorage.setItem('ff_admin_u', JSON.stringify(r.user));
  if (r.user?.role === 'admin') {
    window.location.href = '/admin';
    return;
  }
  go();
}

F.logout = () => {
  S.token = S.user = null;
  localStorage.removeItem('ff_t'); localStorage.removeItem('ff_u');
  localStorage.removeItem('ff_admin_t'); localStorage.removeItem('ff_admin_u');
  sessionStorage.removeItem('ff_view');
  F.close(); authScreen();
};

F.go = v => go(v);

async function go(v) {
  if (!S.token) return authScreen();

  if (S.user?.role === 'admin') {
    localStorage.setItem('ff_admin_t', S.token);
    localStorage.setItem('ff_admin_u', JSON.stringify(S.user));
    window.location.replace('/admin');
    return;
  }

  const role = S.user?.role || 'member';
  const nav = NAV[role];
  if (!nav) { authScreen(); return; }

  const targetView = v || window.location.hash.slice(1) || sessionStorage.getItem('ff_view');
  S.view = nav.some(n => n.id === targetView) ? targetView : (nav.some(n => n.id === S.view) ? S.view : nav[0].id);
  window.location.hash = S.view;
  sessionStorage.setItem('ff_view', S.view);

  S.charts.forEach(c => { try { c.destroy(); } catch {} }); S.charts = [];

  const logo = `<a href="/" class="font-display text-2xl font-extrabold tracking-tight text-white">FLEX<span class="text-brand-light">FLOW</span></a>`;
  const roleName = S.user?.role === 'trainer' ? 'Trainer Portal' : 'Member Portal';
  const userName = S.user?.name || 'Member';
  const userRole = S.user?.role || 'member';

  $('#app').innerHTML = `
    <div class="min-h-screen lg:flex">
      <!-- Sidebar (desktop) -->
      <aside class="hidden lg:flex w-64 xl:w-72 shrink-0 flex-col bg-ink text-white sticky top-0 h-screen overflow-y-auto">
        <div class="p-6 pb-2">
          ${logo.replace('text-2xl','text-3xl')}
          <p class="text-xs text-slate-400 mt-1 uppercase tracking-widest">${roleName}</p>
        </div>
        <nav class="flex-1 px-3 py-4 space-y-0.5">
          ${nav.map(n => `
            <button onclick="F.go('${n.id}')" class="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-left transition-all ${n.id===S.view ? 'bg-brand text-white shadow-lg shadow-brand/25' : 'text-slate-300 hover:bg-white/8 hover:text-white'}">
              <span class="text-base leading-none">${n.icon}</span>
              <span>${n.label}</span>
            </button>`).join('')}
        </nav>
        <div class="p-4 border-t border-white/10">
          <div class="flex items-center gap-3 mb-3">
            <div class="w-9 h-9 rounded-full bg-brand flex items-center justify-center font-bold text-white text-sm shrink-0">${esc(userName.charAt(0).toUpperCase())}</div>
            <div class="min-w-0">
              <p class="font-semibold text-sm truncate">${esc(userName)}</p>
              <p class="text-xs text-slate-400 capitalize">${userRole}</p>
            </div>
          </div>
          <button onclick="F.logout()" class="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors w-full rounded-lg px-2 py-1.5 hover:bg-white/8">
            <span>→</span> Sign out
          </button>
        </div>
      </aside>

      <!-- Main content -->
      <div class="flex-1 min-w-0 pb-24 lg:pb-0 flex flex-col">
        <!-- Mobile header -->
        <header class="lg:hidden sticky top-0 z-30 bg-ink text-white px-4 py-3 flex items-center justify-between shadow-md">
          ${logo}
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-400 capitalize">${userRole}</span>
            <button onclick="F.logout()" class="p-2 rounded-lg hover:bg-white/10 transition-colors" aria-label="Sign out">→</button>
          </div>
        </header>

        <!-- View content -->
        <main id="main" class="flex-1 max-w-6xl w-full mx-auto p-4 sm:p-6 lg:p-10">
          <div class="flex items-center justify-center h-64">
            <div class="w-8 h-8 rounded-full border-2 border-brand border-t-transparent spin"></div>
          </div>
        </main>
      </div>

      <!-- Bottom nav (mobile) -->
      <nav class="bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 flex justify-around">
        ${nav.map(n => `
          <button onclick="F.go('${n.id}')" class="flex-1 flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-semibold transition-colors ${n.id===S.view ? 'text-brand' : 'text-slate-400'}">
            <span class="text-xl leading-none">${n.icon}</span>
            <span>${n.label.split(' ')[0]}</span>
          </button>`).join('')}
      </nav>
    </div>`;

  try {
    if (V[S.view]) {
      await V[S.view]();
    } else {
      await V[nav[0].id]();
    }
  } catch(e) {
    console.error(e);
    $('#main').innerHTML = `<div class="flex flex-col items-center justify-center h-64 text-center"><p class="text-4xl mb-3">😕</p><p class="font-semibold">Could not load this page</p><p class="text-sm text-slate-500 mt-1">${esc(e.message)}</p></div>`;
  }
  scrollTo(0,0);
}

/* ═══════════════════════════════════════════════════════════════
   Auth Screen
   ═══════════════════════════════════════════════════════════════ */
async function authScreen(tab = 'in') {
  S.charts.forEach(c => c.destroy()); S.charts = [];
  const plans = tab === 'up' ? (S.plans || await api('/plans').catch(() => [])) : [];
  if (tab === 'up') S.plans = plans;
  const base = plans.length ? plans[0].price / plans[0].months : 0;

  $('#app').innerHTML = `
    <div class="min-h-screen lg:grid lg:grid-cols-[1.1fr_1fr]">
      <!-- Hero panel -->
      <section class="bg-ink text-white flex flex-col justify-between px-6 py-8 lg:p-14 relative overflow-hidden">
        <!-- Background decoration -->
        <div class="absolute inset-0 pointer-events-none">
          <div class="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-brand/10 blur-3xl"></div>
          <div class="absolute bottom-0 right-0 w-80 h-80 rounded-full bg-purple-500/8 blur-3xl"></div>
        </div>

        <div class="relative">
          <span class="font-display text-2xl font-extrabold tracking-tight">FLEX<span class="text-brand-light">FLOW</span></span>
        </div>

        <div class="relative py-8 lg:py-0">
          <h1 class="font-display font-extrabold leading-[.85] text-[72px] sm:text-[100px] lg:text-[120px] xl:text-[150px] tracking-tight">
            Show up.<br>Streak.<br><span class="text-brand-light">Level up.</span>
          </h1>
          <p class="mt-6 max-w-sm text-slate-300 text-base leading-relaxed hidden sm:block">
            Track every session, unlock AI-powered workouts and diet plans tailored to your level. Earn badges at 30 and 90 days.
          </p>
          <div class="mt-8 hidden lg:flex gap-6">
            <div class="flex items-center gap-3">
              <div class="medal-gold w-12 h-12 rounded-full flex items-center justify-center shadow-lg">
                <div class="w-9 h-9 rounded-full bg-ink/90 flex items-center justify-center font-display font-extrabold text-gold text-sm">30</div>
              </div>
              <div>
                <p class="font-semibold text-sm">30-Day Badge</p>
                <p class="text-xs text-slate-400">Consistency starter</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <div class="medal-gold w-12 h-12 rounded-full flex items-center justify-center shadow-lg" style="background:conic-gradient(from 200deg,#9B59B6,#DDA0DD,#9B59B6,#6C3483,#9B59B6)">
                <div class="w-9 h-9 rounded-full bg-ink/90 flex items-center justify-center font-display font-extrabold text-purple-300 text-sm">90</div>
              </div>
              <div>
                <p class="font-semibold text-sm">90-Day Badge</p>
                <p class="text-xs text-slate-400">Elite dedication</p>
              </div>
            </div>
          </div>
        </div>

        <div class="relative hidden lg:flex items-center gap-2 text-sm text-slate-400">
          <span class="text-ok">✓</span> AI workout plans
          <span class="mx-2">·</span>
          <span class="text-ok">✓</span> Diet suggestions
          <span class="mx-2">·</span>
          <span class="text-ok">✓</span> Progress tracking
        </div>
      </section>

      <!-- Auth form -->
      <section class="bg-chalk flex items-center justify-center px-4 py-10 sm:px-8 lg:p-14">
        <div class="w-full max-w-md">
          <!-- Tabs -->
          <div class="inline-flex rounded-xl bg-slate-200 p-1 mb-8" role="tablist">
            ${[['in','Sign In'],['up','Join FlexFlow']].map(([k,l]) =>
              `<button role="tab" aria-selected="${tab===k}" onclick="authScreen('${k}')"
                class="px-5 py-2 rounded-lg text-sm font-semibold transition-all ${tab===k ? 'bg-white shadow text-ink' : 'text-slate-500 hover:text-ink'}">${l}</button>`
            ).join('')}
          </div>

          ${tab === 'in' ? loginForm() : registerForm(plans, base)}
        </div>
      </section>
    </div>`;
}
window.authScreen = authScreen;

function loginForm() {
  return `
    <div class="slide-up">
      <h2 class="font-display text-4xl font-extrabold mb-1">Welcome back</h2>
      <p class="text-slate-500 text-sm mb-8">Members and trainers sign in here</p>
      <form action="javascript:void(0);" method="POST" onsubmit="event.preventDefault();F.login(event);return false" class="space-y-4">
        ${field('Email address', `<input class="${INP}" type="email" name="email" autocomplete="username" placeholder="you@example.com" required>`)}
        ${field('Password', `<input class="${INP}" type="password" name="password" autocomplete="current-password" placeholder="••••••••" required>`)}
        <button type="submit" class="${BTN} w-full py-3 text-base">Sign in →</button>
        <div class="flex items-center justify-between text-xs text-slate-400 mt-3 pt-2">
          <span>Forgot password? Contact gym admin.</span>
          <a href="/admin" class="font-semibold text-brand hover:underline">Admin Portal →</a>
        </div>
      </form>
    </div>`;
}

function registerForm(plans, base) {
  return `
    <div class="slide-up">
      <h2 class="font-display text-4xl font-extrabold mb-1">Join FlexFlow</h2>
      <p class="text-slate-500 text-sm mb-6">Create your member account</p>
      <form action="javascript:void(0);" method="POST" onsubmit="event.preventDefault();F.register(event);return false" class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div class="col-span-2">${field('Full name', `<input class="${INP}" name="name" placeholder="John Doe" required>`)}</div>
          <div class="col-span-2">${field('Email', `<input class="${INP}" type="email" name="email" autocomplete="username" placeholder="john@example.com" required>`)}</div>
          ${field('Phone', `<input class="${INP}" type="tel" name="phone" inputmode="tel" placeholder="+91 98765 43210">`)}
          ${field('Password', `<input class="${INP}" type="password" name="password" minlength="8" autocomplete="new-password" placeholder="8+ characters" required>`)}
          ${field('Height (cm)', `<input class="${INP}" type="number" name="height_cm" min="100" max="250" placeholder="175">`)}
          ${field('Weight (kg)', `<input class="${INP}" type="number" name="weight_kg" min="25" max="300" step="0.1" placeholder="70">`)}
          <div class="col-span-2">${field('Your fitness goal', `<select class="${INP}" name="goal"><option value="lose_fat">🔥 Lose Fat</option><option value="build_muscle">💪 Build Muscle</option><option value="stay_fit">🧘 Stay Fit</option></select>`)}</div>
          ${field('Diet preference', `<select class="${INP}" name="diet_pref"><option value="veg">🌱 Vegetarian</option><option value="nonveg">🍗 Non-vegetarian</option></select>`)}
          ${field('Experience level', `<select class="${INP}" name="declared_level"><option value="beginner">🌱 Beginner — New to gym</option><option value="intermediate">⚡ Intermediate — On & off</option><option value="advanced">🔥 Advanced — Regular</option></select>`)}
        </div>

        <fieldset class="mt-2">
          <legend class="text-sm font-semibold mb-3 text-ink">Choose membership plan</legend>
          <div class="grid grid-cols-2 gap-2">
            ${plans.map((p, i) => `
              <label class="cursor-pointer">
                <input type="radio" name="plan_id" value="${p.id}" class="peer sr-only" ${i===1?'checked':''}>
                <div class="rounded-xl border-2 border-slate-200 bg-white p-3.5 transition-all peer-checked:border-brand peer-checked:bg-brand-soft peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40">
                  <p class="font-semibold text-sm">${esc(p.name)}</p>
                  <p class="font-display text-2xl font-extrabold mt-0.5">${inr(p.price)}</p>
                  <p class="text-xs text-slate-500 mt-0.5">${inr(Math.round(p.price/p.months))}/mo${p.months>1?` · save ${Math.round((1-p.price/p.months/base)*100)}%`:''}</p>
                </div>
              </label>`).join('')}
          </div>
        </fieldset>

        <button type="submit" class="${BTN} w-full py-3 text-base mt-2">Create account →</button>
        <p class="text-xs text-center text-slate-400">Membership starts the day you pay.</p>
      </form>
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
    start(await api('/auth/login', {method:'POST', body: creds}));
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Sign in →'; } }
});

F.register = act(async e => {
  if (e && e.preventDefault) e.preventDefault();
  if (e && e.stopPropagation) e.stopPropagation();
  const form = e?.target?.tagName === 'FORM' ? e.target : (e?.target?.closest ? e.target.closest('form') : document.querySelector('form'));
  const btn = form?.querySelector ? (form.querySelector('button[type=submit],button:last-of-type') || form.querySelector('button')) : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Creating account…'; }
  try {
    const creds = form ? Object.fromEntries(new FormData(form)) : {};
    start(await api('/auth/register', {method:'POST', body: creds}));
    toast('Welcome to FlexFlow! Pay your membership fee to start training.', 'ok');
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Create account →'; } }
});

/* ═══════════════════════════════════════════════════════════════
   Member Views
   ═══════════════════════════════════════════════════════════════ */
const V = {};

/* ─── Payment method picker ─── */
const methodPicker = () => `
  <fieldset>
    <legend class="text-sm font-semibold mb-2.5">Pay with</legend>
    <div class="grid grid-cols-2 gap-2">
      ${[['upi','📱 UPI'],['card','💳 Card'],['netbanking','🏦 Net Banking'],['cash','💵 Cash']].map(([k,l],i) => `
        <label class="cursor-pointer">
          <input type="radio" name="method" value="${k}" class="peer sr-only" ${i===0?'checked':''}>
          <div class="text-center rounded-xl border-2 border-slate-200 py-2.5 text-sm font-medium transition-all peer-checked:border-brand peer-checked:bg-brand-soft">${l}</div>
        </label>`).join('')}
    </div>
  </fieldset>`;

/* ─── Membership alert banners ─── */
function membershipBanner(m) {
  if (!m) return '';
  const ms = m.membership, dl = ms?.days_left;
  if (m.pendingPayment) return `
    <div class="mb-6 rounded-2xl p-4 bg-warn-soft border border-amber-200 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="text-2xl">⏳</span>
        <div>
          <p class="font-semibold text-amber-800">Payment pending</p>
          <p class="text-sm text-amber-700">${inr(m.pendingPayment.amount)} for ${esc(m.pendingPayment.plan_name)}. Membership starts after payment.</p>
        </div>
      </div>
      <button class="${BTN} !bg-amber-600 hover:!bg-amber-700" onclick="F.pay(${m.pendingPayment.id},${m.pendingPayment.amount})">Pay now</button>
    </div>`;
  if (!ms || dl < 0) return `
    <div class="mb-6 rounded-2xl p-4 bg-bad-soft border border-red-200 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="text-2xl">❌</span>
        <div>
          <p class="font-semibold text-red-800">Membership expired</p>
          <p class="text-sm text-red-700">Renew your plan to continue training and protect your streak.</p>
        </div>
      </div>
      <button class="${BTN} !bg-bad hover:!bg-red-600" onclick="F.go('plan')">Renew now</button>
    </div>`;
  if (dl <= 7) return `
    <div class="mb-6 rounded-2xl p-4 bg-warn-soft border border-amber-200 flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <span class="text-2xl">⚠️</span>
        <div>
          <p class="font-semibold text-amber-800">Expiring in ${dl} day${dl===1?'':'s'}</p>
          <p class="text-sm text-amber-700">Your membership ends on ${fmt(ms.end_date)}. Renew now to protect your streak.</p>
        </div>
      </div>
      <button class="${BTN} !bg-amber-600 hover:!bg-amber-700" onclick="F.go('plan')">Renew</button>
    </div>`;
  return '';
}

/* ─── Badge medal ─── */
const badge = (n, on, label, sub) => `
  <div class="flex items-center gap-4 p-4 ${CARD} ${on ? '' : 'opacity-60'}">
    <div class="${on ? (n===30?'medal-gold':'') + ' w-14 h-14' : 'medal-locked w-14 h-14'} rounded-full flex items-center justify-center shrink-0 shadow-sm" ${n===90&&on?'style="background:conic-gradient(from 200deg,#9B59B6,#DDA0DD,#9B59B6,#6C3483,#9B59B6)"':''}>
      <div class="w-10 h-10 rounded-full ${on?'bg-white/90':'bg-slate-200'} flex items-center justify-center font-display text-xl font-extrabold ${on?(n===30?'text-amber-700':'text-purple-700'):'text-slate-400'}">${n}</div>
    </div>
    <div>
      <p class="font-semibold">${label}</p>
      <p class="text-xs text-slate-500 mt-0.5">${on ? '🎉 Earned!' : sub}</p>
    </div>
  </div>`;

/* ─── HOME ─── */
V.home = async () => {
  const m = await api('/me'), ms = m?.membership, dl = ms?.days_left ?? -1;
  const streak = Number(m?.streak || 0);
  const next = streak < 30 ? 30 : (streak < 90 ? 90 : 90);
  const pct = Math.min(100, Math.round(streak / next * 100));
  const badges = Array.isArray(m?.badges) ? m.badges : [];
  const has = t => badges.some(b => b.type === t);
  const name = m?.name || S.user?.name || 'Member';
  const firstName = name.split(' ')[0] || 'Member';

  $('#main').innerHTML = `
    ${pageHead(`Hi, ${esc(firstName)} 👋`, m?.trainer ? `Your trainer: ${esc(m.trainer)}` : 'No trainer assigned yet')}
    ${membershipBanner(m)}

    <div class="grid lg:grid-cols-3 gap-5">
      <!-- Streak card -->
      <div class="${CARD} p-6 lg:col-span-2">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="text-sm font-medium text-slate-500">Current Streak</p>
            <div class="flex items-end gap-3 mt-1">
              <span class="num font-display text-[80px] sm:text-[100px] leading-none font-extrabold text-ink">${streak}</span>
              <span class="fire text-5xl pb-2">🔥</span>
            </div>
            <p class="text-slate-500 text-sm mt-1">${streak === 1 ? 'day in a row' : 'days in a row'}</p>
          </div>
          <button id="ci-btn" class="${BTN} py-3 px-5" onclick="F.checkin()" ${m?.checkedToday || !ms || dl < 0 ? 'disabled' : ''}>
            ${m?.checkedToday ? '✓ Checked in' : 'Check In'}
          </button>
        </div>

        <!-- Progress to next badge -->
        <div class="mt-6">
          <div class="flex justify-between text-xs font-medium text-slate-500 mb-1.5">
            <span>Next badge: ${next} days</span>
            <span>${Math.max(0, next - streak)} to go</span>
          </div>
          <div class="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div class="h-full rounded-full bg-gradient-to-r from-brand to-purple-500 progress-bar" style="width:${pct}%"></div>
          </div>
        </div>

        <!-- Badges -->
        <div class="grid sm:grid-cols-2 gap-3 mt-6">
          ${badge(30, has('streak30'), '30-Day Streak', `${30 - Math.min(streak,30)} days to go`)}
          ${badge(90, has('streak90'), '90-Day Streak', `${90 - Math.min(streak,90)} days to go`)}
        </div>
      </div>

      <!-- Membership card -->
      <div class="${CARD} p-6 flex flex-col">
        <p class="text-sm font-medium text-slate-500 mb-2">Membership</p>
        ${ms ? `
          <p class="font-display text-3xl font-extrabold">${esc(ms.plan_name)}</p>
          <div class="mt-1 flex items-center gap-2">
            ${dl >= 0 ? `<span class="font-display text-2xl font-bold text-ok num">${dl}</span><span class="text-sm text-slate-500">days left</span>` : pill('Expired','bad')}
          </div>
          <dl class="mt-5 space-y-2.5 text-sm flex-1">
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
              <dt class="text-slate-500">Started</dt>
              <dd class="font-medium">${fmt(ms.start_date)}</dd>
            </div>
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
              <dt class="text-slate-500">Expires</dt>
              <dd class="font-medium">${fmt(ms.end_date)}</dd>
            </div>
            <div class="flex justify-between items-center py-2">
              <dt class="text-slate-500">Payment</dt>
              <dd>${m?.pendingPayment ? pill('Pending','warn') : pill('Paid','ok')}</dd>
            </div>
          </dl>
          <button class="${BTN2} w-full mt-4" onclick="F.go('plan')">Renew / Change Plan</button>
        ` : `
          <div class="flex-1 flex flex-col items-center justify-center text-center py-6">
            <span class="text-5xl mb-3">🏋️</span>
            <p class="font-semibold">No active membership</p>
            <p class="text-sm text-slate-500 mt-1">Choose a plan to start training</p>
          </div>
          <button class="${BTN} w-full" onclick="F.go('plan')">Choose a Plan</button>
        `}
      </div>
    </div>

    <!-- Quick stats -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5">
      <div class="${CARD} p-5 text-center">
        <p class="text-2xl mb-1">⚖️</p>
        <p class="font-display text-2xl font-extrabold num">${m?.weight ? m.weight + ' kg' : '—'}</p>
        <p class="text-xs text-slate-500 mt-0.5">Current weight</p>
      </div>
      <div class="${CARD} p-5 text-center">
        <p class="text-2xl mb-1">${GOAL_ICON[m?.goal]||'🎯'}</p>
        <p class="font-semibold text-sm">${GOAL[m?.goal]||'—'}</p>
        <p class="text-xs text-slate-500 mt-0.5">Your goal</p>
      </div>
      <div class="${CARD} p-5 text-center">
        <p class="text-2xl mb-1">🏅</p>
        <p class="font-display text-2xl font-extrabold num">${badges.length}</p>
        <p class="text-xs text-slate-500 mt-0.5">Badges earned</p>
      </div>
      <div class="${CARD} p-5 text-center">
        <p class="text-2xl mb-1">📅</p>
        <p class="font-semibold text-sm">${m?.checkedToday ? '✓ Done' : 'Not yet'}</p>
        <p class="text-xs text-slate-500 mt-0.5">Today's check-in</p>
      </div>
    </div>`;
};

F.checkin = act(async () => {
  const btn = $('#ci-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking in…'; }
  const r = await api('/me/checkin', {method:'POST'});
  if (r.earned.length) toast(`🎉 Badge unlocked: ${r.streak}-day streak!`, 'ok');
  else toast(`✓ Checked in! Streak: ${r.streak} day${r.streak===1?'':'s'}.`, 'ok');
  await V.home();
});

/* ─── PLAN & FEES ─── */
V.plan = async () => {
  const [plans, pays, m] = await Promise.all([api('/plans'), api('/me/payments'), api('/me')]);
  const base = plans[0].price / plans[0].months;
  const ms = m.membership, dl = ms?.days_left ?? -1;

  $('#main').innerHTML = `
    ${pageHead('Plan & Fees', ms ? `${esc(ms.plan_name)} · expires ${fmt(ms.end_date)}` : 'Choose a plan to start your journey')}
    ${membershipBanner(m)}

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      ${plans.map((p, i) => {
        const saving = p.months > 1 ? Math.round((1 - p.price/p.months/base)*100) : 0;
        const isCurrent = ms?.plan_name === p.name;
        return `
          <div class="${CARD} p-6 flex flex-col relative ${isCurrent ? 'ring-2 ring-brand' : ''}">
            ${saving >= 20 ? `<span class="absolute -top-3 left-1/2 -translate-x-1/2 bg-ok text-white text-xs font-bold px-3 py-1 rounded-full shadow">Save ${saving}%</span>` : ''}
            ${isCurrent ? `<span class="absolute -top-3 right-4 bg-brand text-white text-xs font-bold px-3 py-1 rounded-full shadow">Current Plan</span>` : ''}
            <p class="font-display text-lg font-bold">${esc(p.name)}</p>
            <div class="my-3">
              <span class="font-display text-4xl font-extrabold num">${inr(p.price)}</span>
            </div>
            <p class="text-xs text-slate-500 flex-1">${inr(Math.round(p.price/p.months))} per month${saving > 0 ? ` · ${saving}% off` : ''}</p>
            <button class="${BTN} mt-5 w-full" onclick="F.buy(${p.id},'${esc(p.name)}',${p.price})">
              ${ms && dl >= 0 ? 'Renew' : 'Choose Plan'}
            </button>
          </div>`;
      }).join('')}
    </div>

    <h2 class="font-display text-3xl font-extrabold mb-4">Payment History</h2>
    <div class="${CARD}">
      ${table(
        ['Date','Plan','Amount','Method','Status'],
        pays.map(p => [
          fmt(p.paid_on || p.created_at),
          esc(p.plan_name),
          `<span class="font-semibold num">${inr(p.amount)}</span>`,
          p.method ? `<span class="uppercase text-xs font-bold bg-slate-100 px-2 py-0.5 rounded">${p.method}</span>` : '—',
          p.status === 'paid' ? pill('Paid','ok') : `<button class="${BTN2} !py-1 !px-3 text-xs" onclick="F.pay(${p.id},${p.amount})">Pay now</button>`
        ]),
        empty('💳','No payments yet','Your payment history will appear here.')
      )}
    </div>`;
};

F.buy = (id, name, price) => modal(`
  <h2 class="font-display text-3xl font-extrabold">${esc(name)}</h2>
  <p class="text-slate-500 text-sm mt-1 mb-5">Total: <span class="font-bold text-ink">${inr(price)}</span> · Starts the day you pay</p>
  <form action="javascript:void(0);" method="POST" onsubmit="event.preventDefault();F.doBuy(event,${id});return false" class="space-y-4">
    ${methodPicker()}
    <button type="submit" class="${BTN} w-full py-3 mt-2">Pay ${inr(price)} →</button>
  </form>`);

F.doBuy = act(async (e, id) => {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target?.tagName === 'FORM' ? e.target : (e?.target?.closest ? e.target.closest('form') : document.querySelector('form'));
  const btn = form?.querySelector ? (form.querySelector('button[type=submit],button:last-of-type') || form.querySelector('button')) : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
  try {
    await api('/me/renew', {method:'POST', body: {plan_id:id, method: new FormData(form).get('method')}});
    F.close(); toast('✓ Payment received. Membership activated!', 'ok'); go();
  } finally { if (btn) { btn.disabled = false; btn.textContent = `Pay ${inr(price)} →`; } }
});

F.pay = (id, amt) => modal(`
  <h2 class="font-display text-3xl font-extrabold">Pay ${inr(amt)}</h2>
  <p class="text-slate-500 text-sm mt-1 mb-5">Complete your pending payment</p>
  <form action="javascript:void(0);" method="POST" onsubmit="event.preventDefault();F.doPay(event,${id});return false" class="space-y-4">
    ${methodPicker()}
    <button type="submit" class="${BTN} w-full py-3 mt-2">Pay now →</button>
  </form>`);

F.doPay = act(async (e, id) => {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target?.tagName === 'FORM' ? e.target : (e?.target?.closest ? e.target.closest('form') : document.querySelector('form'));
  const btn = form?.querySelector ? (form.querySelector('button[type=submit],button:last-of-type') || form.querySelector('button')) : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
  try {
    await api('/me/pay', {method:'POST', body: {payment_id:id, method: new FormData(form).get('method')}});
    F.close(); toast('✓ Payment confirmed. You are all set!', 'ok'); go();
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Pay now →'; } }
});

/* ─── AI Recommendation cache ─── */
const LEVELS = ['beginner','intermediate','advanced'];
async function rec() {
  if (!S.rec) S.rec = await api('/me/recommend');
  return S.rec;
}

const coachNote = r => r.coach ? `
  <div class="${CARD} p-5 mb-6 border-l-4 border-brand">
    <div class="flex items-center gap-2 mb-2">
      <span class="text-lg">🤖</span>
      <p class="font-semibold text-brand text-sm">AI Coach Note</p>
      <span class="text-xs bg-brand-soft text-brand px-2 py-0.5 rounded-full font-medium ml-auto">Powered by AI</span>
    </div>
    <p class="text-sm leading-relaxed">${esc(r.coach.summary)}</p>
    <ul class="mt-3 space-y-1.5">
      ${(r.coach.tips||[]).map(t => `<li class="text-sm flex items-start gap-2"><span class="text-brand mt-0.5">→</span>${esc(t)}</li>`).join('')}
    </ul>
  </div>` : '';

/* ─── WORKOUT ─── */
V.workout = async () => {
  const r = await rec(), a = r.assessment, li = LEVELS.indexOf(a.level);
  const levelColor = {beginner:'ok',intermediate:'warn',advanced:'brand'}[a.level];

  $('#main').innerHTML = `
    ${pageHead('Workout Plan', `${GOAL[r.goal]} · Updated from your last 30 days`)}

    <!-- AI Assessment card -->
    <div class="${CARD} p-6 mb-6">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Your Level</p>
          <p class="font-display text-5xl font-extrabold capitalize text-${levelColor}">${a.level}</p>
        </div>
        <div class="text-right">
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Readiness Score</p>
          <p class="font-display text-5xl font-extrabold num">${a.score}<span class="text-xl text-slate-300">/100</span></p>
        </div>
      </div>

      <!-- Level bars -->
      <div class="flex gap-1.5 mb-6">
        ${LEVELS.map((l,i) => `
          <div class="flex-1 rounded-full overflow-hidden">
            <div class="h-2.5 rounded-full ${i<=li?'bg-brand':'bg-slate-100'}"></div>
            <p class="text-[10px] text-slate-400 mt-1 text-center capitalize">${l}</p>
          </div>`).join('')}
      </div>

      <!-- Score factors -->
      <div class="grid sm:grid-cols-2 gap-4">
        ${a.factors.map(f => `
          <div>
            <div class="flex justify-between text-xs font-medium mb-1">
              <span class="text-slate-600">${f.label}</span>
              <span class="num">${f.value}/${f.max}</span>
            </div>
            <div class="h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div class="h-full rounded-full bg-brand/70 progress-bar" style="width:${f.value/f.max*100}%"></div>
            </div>
          </div>`).join('')}
      </div>
    </div>

    ${coachNote(r)}

    <!-- Workout days -->
    <div class="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      ${r.workout.days.map((d, di) => `
        <div class="${CARD} p-5 hover:shadow-md transition-shadow">
          <div class="flex items-center gap-2 mb-3">
            <span class="w-8 h-8 rounded-lg bg-brand-soft flex items-center justify-center font-display font-bold text-brand text-sm">${di+1}</span>
            <div>
              <p class="text-xs text-slate-500">${d.day}</p>
              <p class="font-display text-xl font-bold">${d.focus}</p>
            </div>
          </div>
          <ul class="space-y-2">
            ${d.ex.map(e => `
              <li class="flex items-start gap-2.5 text-sm">
                <span class="text-ok mt-0.5 shrink-0 font-bold">✓</span>
                <span>${esc(e)}</span>
              </li>`).join('')}
          </ul>
        </div>`).join('')}
    </div>

    <p class="text-xs text-slate-400 mt-6 text-center">Rest 1–2 days between sessions. Your level improves as your attendance and streak grow.</p>`;
};

/* ─── DIET ─── */
V.diet = async () => {
  const r = await rec(), d = r.diet;

  $('#main').innerHTML = `
    ${pageHead('Diet Plan', `Built for ${GOAL[r.goal].toLowerCase()} at ${r.weight} kg${r.bmi ? ` · BMI ${r.bmi}` : ''}`)}
    ${coachNote(r)}

    <!-- Macro targets -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      ${[['🔥','Calories',d.kcal,'kcal/day'],['🥩','Protein',d.protein,'grams'],['🍞','Carbs',d.carbs,'grams'],['🥑','Fat',d.fat,'grams']].map(([icon,l,v,u]) => `
        <div class="${CARD} p-5 text-center">
          <p class="text-3xl mb-2">${icon}</p>
          <p class="font-display text-4xl font-extrabold num">${v}</p>
          <p class="text-sm font-semibold mt-0.5">${l}</p>
          <p class="text-xs text-slate-400">${u}</p>
        </div>`).join('')}
    </div>

    <!-- Hydration -->
    <div class="${CARD} p-4 mb-6 flex items-center gap-4">
      <span class="text-3xl">💧</span>
      <div>
        <p class="font-semibold">Daily Hydration Target</p>
        <p class="text-sm text-slate-500">Drink at least <strong>${d.water_l} litres</strong> of water daily</p>
      </div>
    </div>

    <!-- Meal plan -->
    <h2 class="font-display text-3xl font-extrabold mb-4">Daily Meal Plan</h2>
    <div class="${CARD} divide-y divide-slate-100">
      ${d.meals.map(m => `
        <div class="p-5 flex flex-wrap gap-4 items-baseline">
          <div class="w-32 shrink-0">
            <p class="font-semibold">${m.name}</p>
            <p class="text-xs text-slate-400 mt-0.5 num">~${m.kcal} kcal</p>
          </div>
          <p class="flex-1 min-w-[200px] text-sm text-slate-700 leading-relaxed">${esc(m.food)}</p>
          <div class="shrink-0">
            <div class="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden">
              <div class="h-full rounded-full bg-brand progress-bar" style="width:${Math.round(m.kcal/d.kcal*100)}%"></div>
            </div>
            <p class="text-xs text-slate-400 mt-1 text-right">${Math.round(m.kcal/d.kcal*100)}% of daily</p>
          </div>
        </div>`).join('')}
    </div>

    <p class="text-xs text-slate-400 mt-4 text-center">These are general guidelines, not medical advice. Adjust portions based on hunger and energy levels.</p>`;
};

/* ─── PROGRESS ─── */
V.progress = async () => {
  const rows = await api('/me/progress');
  const diff = rows.length > 1 ? (rows.at(-1).weight_kg - rows[0].weight_kg).toFixed(1) : null;
  const trend = diff !== null ? (diff > 0 ? `+${diff} kg since ${fmt(rows[0].date)}` : `${diff} kg since ${fmt(rows[0].date)}`) : '';
  const trendColor = diff > 0 ? 'text-bad' : diff < 0 ? 'text-ok' : 'text-slate-500';

  $('#main').innerHTML = `
    ${pageHead('Progress', trend ? `<span class="${trendColor} font-semibold">${trend}</span>` : 'Log your weight to see your trend')}

    <div class="grid lg:grid-cols-3 gap-5">
      <!-- Chart -->
      <div class="${CARD} p-5 lg:col-span-2">
        <h2 class="font-semibold mb-4">Weight History</h2>
        ${rows.length >= 2 ? `<div class="h-64"><canvas id="wc"></canvas></div>` :
          empty('📊','Not enough data yet','Log at least 2 entries to see your chart.')}
      </div>

      <!-- Log form -->
      <form action="javascript:void(0);" method="POST" onsubmit="event.preventDefault();F.logW(event);return false" class="${CARD} p-5 space-y-4">
        <h2 class="font-display text-2xl font-extrabold">Log Today</h2>
        ${field('Weight (kg)', `<input class="${INP}" type="number" name="weight_kg" step="0.1" min="25" max="300" placeholder="70.0" required>`, 'Enter your morning weight')}
        ${field('Note (optional)', `<input class="${INP}" name="note" maxlength="200" placeholder="Felt strong today…">`)}
        <button type="submit" class="${BTN} w-full">Save Entry</button>
      </form>
    </div>

    ${rows.length ? `
    <div class="${CARD} mt-5">
      <div class="p-5 border-b border-slate-100 flex items-center justify-between">
        <h2 class="font-semibold">All Entries</h2>
        <span class="text-sm text-slate-400">${rows.length} entries</span>
      </div>
      ${table(
        ['Date','Weight','Change','Note'],
        [...rows].reverse().map((r, i, arr) => {
          const prev = arr[i+1];
          const change = prev ? (r.weight_kg - prev.weight_kg).toFixed(1) : null;
          return [
            fmt(r.date),
            `<span class="font-semibold num">${r.weight_kg} kg</span>`,
            change ? `<span class="${change > 0 ? 'text-bad' : change < 0 ? 'text-ok' : 'text-slate-400'} font-medium">${change > 0 ? '+' : ''}${change}</span>` : '—',
            esc(r.note || '')
          ];
        }),
        ''
      )}
    </div>` : ''}`;

  if (rows.length >= 2) {
    chartOf('wc', 'line',
      rows.map(r => fmt(r.date).slice(0,6)),
      rows.map(r => r.weight_kg),
      {scales: {y:{beginAtZero:false}}}
    );
  }
};

F.logW = act(async e => {
  if (e && e.preventDefault) e.preventDefault();
  const form = e?.target?.tagName === 'FORM' ? e.target : (e?.target?.closest ? e.target.closest('form') : document.querySelector('form'));
  const btn = form?.querySelector ? (form.querySelector('button[type=submit],button:last-of-type') || form.querySelector('button')) : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    await api('/me/progress', {method:'POST', body: Object.fromEntries(new FormData(form))});
    toast('✓ Weight saved!', 'ok');
    S.rec = null; // refresh recommendations
    await V.progress();
  } finally { if (btn) { btn.disabled = false; btn.textContent = 'Save Entry'; } }
});

/* ═══════════════════════════════════════════════════════════════
   Trainer Views
   ═══════════════════════════════════════════════════════════════ */

V.clients = async () => {
  const ms = await api('/trainer/members'), today = new Date().toISOString().slice(0,10);

  $('#main').innerHTML = `
    ${pageHead('My Members', `${ms.length} assigned to you`)}

    ${ms.length === 0 ? empty('👥','No members assigned yet','The admin will assign members to your account.') : `
    <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
      ${ms.map(m => `
        <div class="${CARD} p-5 flex flex-col">
          <div class="flex items-start gap-3 mb-4">
            <div class="w-11 h-11 rounded-full bg-brand-soft flex items-center justify-center font-bold text-brand text-lg shrink-0">${esc(m.name.charAt(0).toUpperCase())}</div>
            <div class="min-w-0">
              <p class="font-semibold truncate">${esc(m.name)}</p>
              <p class="text-xs text-slate-500 capitalize">${GOAL[m.goal]||m.goal}</p>
            </div>
            <div class="ml-auto shrink-0">
              ${!m.end_date || m.end_date < today ? pill('Expired','bad') : pill('Active','ok')}
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center mb-4">
            <div class="bg-slate-50 rounded-xl p-2">
              <p class="font-display text-xl font-extrabold num">${m.att30}</p>
              <p class="text-[10px] text-slate-400">Sessions/30d</p>
            </div>
            <div class="bg-slate-50 rounded-xl p-2">
              <p class="font-display text-xl font-extrabold num">${m.weight ? m.weight : '—'}</p>
              <p class="text-[10px] text-slate-400">Weight kg</p>
            </div>
            <div class="bg-slate-50 rounded-xl p-2">
              <p class="font-display text-xl font-extrabold capitalize text-xs">${m.declared_level}</p>
              <p class="text-[10px] text-slate-400">Level</p>
            </div>
          </div>
          <button class="${BTN2} w-full text-sm" onclick="F.viewP(${m.id},'${esc(m.name).replace(/'/g,'')}')">
            View Progress
          </button>
        </div>`).join('')}
    </div>`}`;
};

V.schedule = async () => {
  $('#main').innerHTML = `
    ${pageHead('Schedule', 'Your training schedule and sessions')}
    <div class="${CARD} p-8 text-center">
      <span class="text-5xl mb-3 block">📅</span>
      <p class="font-semibold text-lg">Schedule Feature</p>
      <p class="text-slate-500 mt-1">Session scheduling coming soon. Contact your admin to set training times.</p>
    </div>`;
};

F.viewP = act(async (id, name) => {
  const rows = await api(`/trainer/members/${id}/progress`);
  modal(`
    <h2 class="font-display text-3xl font-extrabold mb-1">${esc(name)}</h2>
    <p class="text-sm text-slate-500 mb-5">Weight progress history</p>
    ${rows.length >= 2 ? `<div class="h-48 mb-5"><canvas id="tp-chart"></canvas></div>` : ''}
    ${rows.length ? `
      <div class="max-h-64 overflow-y-auto">
        <ul class="text-sm divide-y divide-slate-100">
          ${[...rows].reverse().map(r => `
            <li class="py-2.5 flex justify-between gap-3">
              <span class="text-slate-400">${fmt(r.date)}</span>
              <span class="flex-1 truncate text-slate-500">${esc(r.note||'')}</span>
              <span class="font-semibold num shrink-0">${r.weight_kg} kg</span>
            </li>`).join('')}
        </ul>
      </div>` : `<p class="text-sm text-slate-500 text-center py-8">No weight entries logged yet.</p>`}
    <button class="${BTN2} w-full mt-5" onclick="F.close()">Close</button>`, {size:'sm:max-w-lg'});

  if (rows.length >= 2) {
    setTimeout(() => {
      chartOf('tp-chart', 'line',
        rows.map(r => fmt(r.date).slice(0,6)),
        rows.map(r => r.weight_kg),
        {scales: {y:{beginAtZero:false}}}
      );
    }, 50);
  }
});

/* ═══════════════════════════════════════════════════════════════
   Bootstrap
   ═══════════════════════════════════════════════════════════════ */
window.V = V; window.F = F;
window.addEventListener('hashchange', () => {
  const h = window.location.hash.slice(1);
  if (h && S.token && S.user && S.view !== h) go(h);
});

if (S.token) {
  if (S.user?.role === 'admin') {
    window.location.replace('/admin');
  } else {
    go();
  }
} else {
  authScreen();
}
