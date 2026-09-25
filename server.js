require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, isPg, q, getConnection, ensureDbInit } = require('./db');

const SECRET = process.env.JWT_SECRET || 'flexflow-super-secret-jwt-key-24-characters-production';

/* ---------- helpers ---------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const wrap = fn => (req, res) => fn(req, res).catch(e => {
  if (e.status) return res.status(e.status).json({ error: e.message });
  console.error(e); res.status(500).json({ error: 'Something went wrong. Please try again.' });
});
const auth = (...roles) => (req, res, next) => {
  try {
    req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    if (roles.length && !roles.includes(req.user.role)) return res.status(403).json({ error: 'You do not have access to this' });
    next();
  } catch { res.status(401).json({ error: 'Please sign in again' }); }
};
const ymd = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const local = s => new Date(s + 'T00:00:00');
const addMonths = (s, m) => { const d = local(s); d.setMonth(d.getMonth() + m); return ymd(d); };
const daysLeft = s => Math.round((local(s) - local(ymd(new Date()))) / 864e5);
const METHODS = ['upi', 'card', 'netbanking', 'cash'];
const okMethod = m => { if (!METHODS.includes(m)) throw new HttpError(400, 'Choose a payment method'); };
const validEmail = e => /^\S+@\S+\.\S+$/.test(e || '');

/* ---------- domain logic ---------- */
async function session(u) {
  let mid = null, tid = null;
  if (u.role === 'member') mid = (await q('SELECT id FROM members WHERE user_id=?', [u.id]))[0]?.id;
  if (u.role === 'trainer') tid = (await q('SELECT id FROM trainers WHERE user_id=?', [u.id]))[0]?.id;
  const token = jwt.sign({ uid: u.id, role: u.role, name: u.name, mid, tid }, SECRET, { expiresIn: '7d' });
  return { token, user: { name: u.name, role: u.role } };
}

async function createMember(d) {
  if (!d.name || !validEmail(d.email) || (d.password || '').length < 8)
    throw new HttpError(400, 'Enter your name, a valid email and a password of at least 8 characters');
  const [plan] = await q('SELECT * FROM plans WHERE id=?', [d.plan_id]);
  if (!plan) throw new HttpError(400, 'Choose a membership plan');
  const c = await getConnection();
  try {
    await c.beginTransaction();
    const hash = await bcrypt.hash(d.password, 10);
    const [u] = await c.query('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,"member")',
      [d.name.trim(), d.email.toLowerCase().trim(), d.phone || null, hash]);
    const [m] = await c.query('INSERT INTO members(user_id,goal,height_cm,diet_pref,declared_level) VALUES(?,?,?,?,?)',
      [u.insertId, d.goal || 'stay_fit', d.height_cm || null, d.diet_pref || 'veg', d.declared_level || 'beginner']);
    const [ms] = await c.query('INSERT INTO memberships(member_id,plan_id,status) VALUES(?,?,"pending")', [m.insertId, plan.id]);
    await c.query('INSERT INTO payments(member_id,membership_id,amount,status) VALUES(?,?,?,"pending")', [m.insertId, ms.insertId, plan.price]);
    if (d.weight_kg) await c.query('INSERT INTO progress(member_id,date,weight_kg) VALUES(?,CURDATE(),?)', [m.insertId, d.weight_kg]);
    await c.commit();
    return { user_id: u.insertId, member_id: m.insertId };
  } catch (e) {
    await c.rollback();
    if (e.code === 'ER_DUP_ENTRY' || e.code === '23505') throw new HttpError(409, 'That email is already registered');
    throw e;
  } finally { c.release(); }
}

// Marks a payment paid and activates its membership. Renewals stack after the current end date.
async function settle(paymentId, method) {
  const [p] = await q('SELECT * FROM payments WHERE id=? AND status="pending"', [paymentId]);
  if (!p) throw new HttpError(404, 'That payment is already settled or does not exist');
  const [pl] = await q('SELECT pl.months FROM memberships ms JOIN plans pl ON pl.id=ms.plan_id WHERE ms.id=?', [p.membership_id]);
  const [last] = await q('SELECT MAX(end_date) e FROM memberships WHERE member_id=? AND status="active"', [p.member_id]);
  let start = ymd(new Date());
  if (last?.e && last.e > start) start = last.e;
  await q('UPDATE memberships SET status="active",start_date=?,end_date=? WHERE id=?', [start, addMonths(start, pl.months), p.membership_id]);
  await q('UPDATE payments SET status="paid",method=?,paid_on=NOW() WHERE id=?', [method, paymentId]);
}

async function newPending(memberId, planId) {
  const [plan] = await q('SELECT * FROM plans WHERE id=?', [planId]);
  if (!plan) throw new HttpError(400, 'Choose a membership plan');
  const ms = await q('INSERT INTO memberships(member_id,plan_id,status) VALUES(?,?,"pending")', [memberId, plan.id]);
  const pay = await q('INSERT INTO payments(member_id,membership_id,amount,status) VALUES(?,?,?,"pending")', [memberId, ms.insertId, plan.price]);
  return pay.insertId;
}

async function streakOf(mid) {
  const rows = await q('SELECT date FROM attendance WHERE member_id=? ORDER BY date DESC LIMIT 400', [mid]);
  const days = new Set(rows.map(r => (typeof r.date === 'string' ? r.date.slice(0, 10) : ymd(new Date(r.date)))));
  const cur = local(ymd(new Date()));
  if (!days.has(ymd(cur))) cur.setDate(cur.getDate() - 1); // today not yet checked in: streak is still alive
  let s = 0;
  while (days.has(ymd(cur))) { s++; cur.setDate(cur.getDate() - 1); }
  return s;
}

async function checkIn(mid) {
  const [active] = await q('SELECT id FROM memberships WHERE member_id=? AND status="active" AND end_date>=CURDATE() LIMIT 1', [mid]);
  if (!active) throw new HttpError(400, 'Membership is not active. Renew to check in.');
  const r = await q('INSERT IGNORE INTO attendance(member_id,date) VALUES(?,CURDATE())', [mid]);
  if (!r.affectedRows) throw new HttpError(409, 'Already checked in today');
  const streak = await streakOf(mid);
  const earned = [];
  for (const [n, type] of [[30, 'streak30'], [90, 'streak90']]) {
    if (streak >= n) {
      const b = await q('INSERT IGNORE INTO badges(member_id,type,earned_on) VALUES(?,?,CURDATE())', [mid, type]);
      if (b.affectedRows) earned.push(type);
    }
  }
  return { streak, earned };
}

/* ---------- workout + diet recommendation engine ---------- */
// Scores a member 0-100 from behaviour (not just what they claim), then maps to a level.
function assess(m, streak, att30, tenureDays) {
  const f = [
    { label: 'Attendance, last 30 days', value: Math.round(Math.min(att30, 20) * 2), max: 40 },
    { label: 'Time training with us', value: Math.round(Math.min(tenureDays / 180, 1) * 25), max: 25 },
    { label: 'Current streak', value: Math.round(Math.min(streak, 30) / 30 * 15), max: 15 },
    { label: 'Experience you reported', value: { beginner: 0, intermediate: 10, advanced: 20 }[m.declared_level] ?? 0, max: 20 },
  ];
  const score = f.reduce((a, x) => a + x.value, 0);
  return { score, level: score >= 65 ? 'advanced' : score >= 30 ? 'intermediate' : 'beginner', factors: f };
}

const WORKOUTS = {
  beginner: [
    { day: 'Day 1', focus: 'Full body A', ex: ['Goblet squat 3x10', 'Incline push-up 3x8', 'Lat pulldown 3x10', 'Plank 3x30s'] },
    { day: 'Day 2', focus: 'Full body B', ex: ['Leg press 3x12', 'Dumbbell bench press 3x10', 'Seated cable row 3x10', 'Glute bridge 3x12'] },
    { day: 'Day 3', focus: 'Full body C', ex: ['Romanian deadlift (light) 3x10', 'Shoulder press 3x10', 'Cable row 3x12', 'Brisk walk 15 min'] },
  ],
  intermediate: [
    { day: 'Day 1', focus: 'Upper A', ex: ['Barbell bench press 4x8', 'Bent-over row 4x8', 'Overhead press 3x10', 'Biceps curl + triceps pushdown 3x12'] },
    { day: 'Day 2', focus: 'Lower A', ex: ['Back squat 4x8', 'Romanian deadlift 3x10', 'Walking lunges 3x12', 'Calf raise 4x15'] },
    { day: 'Day 3', focus: 'Upper B', ex: ['Incline dumbbell press 4x10', 'Pull-ups / assisted 4x8', 'Lateral raise 3x15', 'Face pull 3x15'] },
    { day: 'Day 4', focus: 'Lower B', ex: ['Deadlift 4x5', 'Leg press 3x12', 'Hamstring curl 3x12', 'Hanging knee raise 3x12'] },
  ],
  advanced: [
    { day: 'Day 1', focus: 'Push', ex: ['Bench press 5x5', 'Overhead press 4x6', 'Incline dumbbell press 4x10', 'Dips 3x12', 'Triceps rope 3x15'] },
    { day: 'Day 2', focus: 'Pull', ex: ['Deadlift 5x3', 'Weighted pull-ups 4x6', 'Barbell row 4x8', 'Rear delt fly 3x15', 'Hammer curl 3x12'] },
    { day: 'Day 3', focus: 'Legs', ex: ['Back squat 5x5', 'Front squat 3x8', 'Romanian deadlift 4x8', 'Bulgarian split squat 3x10', 'Calf raise 5x15'] },
    { day: 'Day 4', focus: 'Upper', ex: ['Incline bench 4x8', 'Chest-supported row 4x10', 'Arnold press 3x10', 'Cable curl + pushdown superset 3x12'] },
    { day: 'Day 5', focus: 'Lower + core', ex: ['Trap-bar deadlift 4x6', 'Hack squat 4x10', 'Leg curl 4x12', 'Ab wheel 3x12'] },
  ],
};
const FINISHER = { lose_fat: '10 min interval finisher (30s hard / 60s easy)', build_muscle: 'Stretch major muscles used today, 5 min', stay_fit: 'Mobility flow, 5 min' };

const MEALS = {
  veg: { breakfast: 'Moong dal chilla or vegetable poha with curd', lunch: '2 rotis, dal, seasonal sabzi, salad, chaas', snack: 'Roasted chana with a fruit, or paneer sandwich', dinner: 'Paneer bhurji or tofu stir-fry with sauteed vegetables and 1 roti' },
  nonveg: { breakfast: '3 egg omelette with 2 slices whole-wheat toast', lunch: 'Grilled chicken, rice or 2 rotis, dal, salad', snack: 'Boiled eggs or Greek yogurt with a fruit', dinner: 'Fish or chicken curry with sauteed vegetables and 1 roti' },
};

function dietFor(m, kg, level) {
  const goal = m.goal;
  const kcal = Math.round((kg * 32 + { lose_fat: -400, build_muscle: 300, stay_fit: 0 }[goal] + (level === 'advanced' ? 100 : 0)) / 10) * 10;
  const protein = Math.round(kg * { lose_fat: 1.8, build_muscle: 2, stay_fit: 1.5 }[goal]);
  const fat = Math.round(kcal * 0.25 / 9);
  const carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
  const split = [['Breakfast', .25, 'breakfast'], ['Lunch', .30, 'lunch'], ['Snack', .15, 'snack'], ['Dinner', .30, 'dinner']];
  return {
    kcal, protein, carbs, fat, water_l: Math.round(kg * 0.035 * 10) / 10,
    meals: split.map(([name, share, k]) => ({ name, kcal: Math.round(kcal * share / 10) * 10, food: MEALS[m.diet_pref || 'veg'][k] })),
  };
}

const coachCache = new Map();
async function coachNote(p, mid) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const key = mid + ymd(new Date());
  if (coachCache.has(key)) return coachCache.get(key);
  try { // no name/email/phone is ever sent, only training stats
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5', max_tokens: 400,
        system: 'You are a certified gym coach. Reply with JSON only, no markdown: {"summary": string under 45 words, "tips": [3 short strings]}. Be specific to the stats given.',
        messages: [{ role: 'user', content: JSON.stringify(p) }],
      }),
    });
    const d = await r.json();
    const note = JSON.parse((d.content?.[0]?.text || '').replace(/```json|```/g, '').trim());
    coachCache.set(key, note);
    return note;
  } catch (e) { console.warn('AI coach unavailable:', e.message); return null; }
}

/* ---------- app ---------- */
const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ['https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"],
} } }));
app.use(express.json({ limit: '50kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60e3, max: 40, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', async (req, res, next) => {
  await ensureDbInit();
  next();
});

/* auth */
app.get('/api/plans', wrap(async (req, res) => res.json(await q('SELECT * FROM plans ORDER BY months'))));
app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const [u] = await q('SELECT * FROM users WHERE email=?', [String(email || '').toLowerCase().trim()]);
  if (!u || !(await bcrypt.compare(String(password || ''), u.password_hash))) throw new HttpError(401, 'Email or password is incorrect');
  res.json(await session(u));
}));
app.post('/api/auth/register', wrap(async (req, res) => {
  const { user_id } = await createMember(req.body || {});
  const [u] = await q('SELECT * FROM users WHERE id=?', [user_id]);
  res.status(201).json(await session(u));
}));

/* member */
app.get('/api/me', auth('member'), wrap(async (req, res) => {
  const mid = req.user.mid;
  const [m] = await q(`SELECT u.name,u.email,u.phone,m.goal,m.height_cm,m.diet_pref,m.declared_level,m.joined_on,tu.name trainer
    FROM members m JOIN users u ON u.id=m.user_id LEFT JOIN trainers t ON t.id=m.trainer_id LEFT JOIN users tu ON tu.id=t.user_id WHERE m.id=?`, [mid]);
  const [ms] = await q(`SELECT ms.start_date,ms.end_date,p.name plan_name,p.months FROM memberships ms JOIN plans p ON p.id=ms.plan_id
    WHERE ms.member_id=? AND ms.status='active' ORDER BY ms.end_date DESC LIMIT 1`, [mid]);
  const [pp] = await q(`SELECT pay.id,pay.amount,p.name plan_name FROM payments pay JOIN memberships ms ON ms.id=pay.membership_id
    JOIN plans p ON p.id=ms.plan_id WHERE pay.member_id=? AND pay.status='pending' ORDER BY pay.id DESC LIMIT 1`, [mid]);
  const [c] = await q('SELECT COUNT(*) n FROM attendance WHERE member_id=? AND date=CURDATE()', [mid]);
  const [w] = await q('SELECT weight_kg FROM progress WHERE member_id=? ORDER BY date DESC,id DESC LIMIT 1', [mid]);
  res.json({ ...m, membership: ms ? { ...ms, days_left: daysLeft(ms.end_date) } : null, pendingPayment: pp || null,
    streak: await streakOf(mid), checkedToday: Number(c?.n || 0) > 0, badges: await q('SELECT type,earned_on FROM badges WHERE member_id=?', [mid]), weight: w?.weight_kg ?? null });
}));
app.post('/api/me/checkin', auth('member'), wrap(async (req, res) => res.json(await checkIn(req.user.mid))));
app.get('/api/me/payments', auth('member'), wrap(async (req, res) => res.json(await q(
  `SELECT pay.id,pay.amount,pay.method,pay.status,pay.paid_on,pay.created_at,p.name plan_name FROM payments pay
   JOIN memberships ms ON ms.id=pay.membership_id JOIN plans p ON p.id=ms.plan_id WHERE pay.member_id=? ORDER BY pay.id DESC`, [req.user.mid]))));
// NOTE: payment is simulated. In production, create a gateway order here and call settle() from the gateway's verified webhook.
app.post('/api/me/renew', auth('member'), wrap(async (req, res) => {
  okMethod(req.body?.method);
  await settle(await newPending(req.user.mid, req.body.plan_id), req.body.method);
  res.json({ ok: true });
}));
app.post('/api/me/pay', auth('member'), wrap(async (req, res) => {
  okMethod(req.body?.method);
  const [p] = await q('SELECT id FROM payments WHERE id=? AND member_id=?', [req.body.payment_id, req.user.mid]);
  if (!p) throw new HttpError(404, 'Payment not found');
  await settle(p.id, req.body.method);
  res.json({ ok: true });
}));
app.get('/api/me/progress', auth('member'), wrap(async (req, res) =>
  res.json(await q('SELECT date,weight_kg,note FROM progress WHERE member_id=? ORDER BY date', [req.user.mid]))));
app.post('/api/me/progress', auth('member'), wrap(async (req, res) => {
  const w = Number(req.body?.weight_kg);
  if (!(w >= 25 && w <= 300)) throw new HttpError(400, 'Enter a weight between 25 and 300 kg');
  await q('INSERT INTO progress(member_id,date,weight_kg,note) VALUES(?,CURDATE(),?,?) ON DUPLICATE KEY UPDATE weight_kg=VALUES(weight_kg),note=VALUES(note)',
    [req.user.mid, w, String(req.body.note || '').slice(0, 200) || null]);
  res.json({ ok: true });
}));
app.get('/api/me/recommend', auth('member'), wrap(async (req, res) => {
  const mid = req.user.mid;
  const [m] = await q('SELECT * FROM members WHERE id=?', [mid]);
  const [a] = await q('SELECT COUNT(*) n FROM attendance WHERE member_id=? AND date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY)', [mid]);
  const w = await q('SELECT weight_kg FROM progress WHERE member_id=? ORDER BY date,id', [mid]);
  const streak = await streakOf(mid);
  const tenure = Math.max(0, Math.round((local(ymd(new Date())) - local(m.joined_on)) / 864e5));
  const assessment = assess(m, streak, a.n, tenure);
  const kg = Number(w.at(-1)?.weight_kg || 70);
  const trend = w.length > 1 ? +(kg - w[0].weight_kg).toFixed(1) : 0;
  const bmi = m.height_cm ? +(kg / ((m.height_cm / 100) ** 2)).toFixed(1) : null;
  const days = WORKOUTS[assessment.level].map(d => ({ ...d, ex: [...d.ex, FINISHER[m.goal]] }));
  const coach = await coachNote({ level: assessment.level, score: assessment.score, goal: m.goal, streak, sessions_last_30_days: a.n, bmi, weight_change_kg: trend, diet: m.diet_pref }, mid);
  res.json({ assessment, goal: m.goal, workout: { days }, diet: dietFor(m, kg, assessment.level), coach, ai: !!coach, weight: kg, bmi, trend });
}));

/* admin */
const admin = auth('admin');
app.get('/api/admin/dashboard', admin, wrap(async (req, res) => {
  const [k] = await q(`SELECT (SELECT COUNT(*) FROM members) members,
    (SELECT COUNT(DISTINCT member_id) FROM memberships WHERE status='active' AND end_date>=CURDATE()) active,
    (SELECT COUNT(DISTINCT member_id) FROM memberships WHERE status='active' AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 7 DAY)) expiring,
    (SELECT COUNT(*) FROM attendance WHERE date=CURDATE()) today,
    (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='paid' AND paid_on>=DATE_FORMAT(CURDATE(),'%Y-%m-01')) revMonth,
    (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='paid') revTotal,
    (SELECT COALESCE(SUM(amount),0) FROM payments WHERE status='pending') pending`);
  const rev = await q(`SELECT DATE_FORMAT(paid_on,'%Y-%m') m,SUM(amount) t FROM payments WHERE status='paid'
    AND paid_on>=DATE_SUB(DATE_FORMAT(CURDATE(),'%Y-%m-01'),INTERVAL 5 MONTH) GROUP BY m`);
  const att = await q(`SELECT date d,COUNT(*) c FROM attendance WHERE date>=DATE_SUB(CURDATE(),INTERVAL 6 DAY) GROUP BY date`);
  const revenue = [], attendance = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); const key = ymd(d).slice(0, 7);
    revenue.push({ label: d.toLocaleString('en-IN', { month: 'short' }), value: Number(rev.find(r => r.m === key)?.t || 0) }); }
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i); const key = ymd(d);
    const item = att.find(r => (typeof r.d === 'string' ? r.d.slice(0, 10) : ymd(new Date(r.d))) === key);
    attendance.push({ label: d.toLocaleString('en-IN', { weekday: 'short' }), value: Number(item?.c || 0) });
  }

  const kpiData = {
    members: Number(k?.members || 0),
    active: Number(k?.active || 0),
    expiring: Number(k?.expiring || 0),
    today: Number(k?.today || 0),
    revMonth: Number(k?.revMonth ?? k?.revmonth ?? 0),
    revTotal: Number(k?.revTotal ?? k?.revtotal ?? 0),
    pending: Number(k?.pending || 0),
  };

  res.json({ kpi: kpiData, revenue, attendance,
    plans: await q(`SELECT p.name,COUNT(*) c FROM memberships ms JOIN plans p ON p.id=ms.plan_id WHERE ms.status='active' AND ms.end_date>=CURDATE() GROUP BY p.id,p.name ORDER BY p.months`),
    expiring: await q(`SELECT m.id,u.name,u.phone,MAX(ms.end_date) end_date FROM memberships ms JOIN members m ON m.id=ms.member_id JOIN users u ON u.id=m.user_id
      WHERE ms.status='active' GROUP BY m.id,u.name,u.phone HAVING MAX(ms.end_date) BETWEEN CURDATE() AND DATE_ADD(CURDATE(),INTERVAL 7 DAY) ORDER BY end_date`) });
}));

app.get('/api/admin/members', admin, wrap(async (req, res) => res.json(await q(
  `SELECT m.id,u.name,u.email,u.phone,m.goal,m.trainer_id,tu.name trainer_name,
   (SELECT p.name FROM memberships ms JOIN plans p ON p.id=ms.plan_id WHERE ms.member_id=m.id AND ms.status='active' ORDER BY ms.end_date DESC LIMIT 1) plan_name,
   (SELECT MAX(end_date) FROM memberships WHERE member_id=m.id AND status='active') end_date,
   (SELECT COUNT(*) FROM payments WHERE member_id=m.id AND status='pending') dues
   FROM members m JOIN users u ON u.id=m.user_id LEFT JOIN trainers t ON t.id=m.trainer_id LEFT JOIN users tu ON tu.id=t.user_id ORDER BY u.name`))));
app.post('/api/admin/members', admin, wrap(async (req, res) => {
  const { member_id } = await createMember(req.body || {});
  if (req.body.method) { okMethod(req.body.method); const [p] = await q('SELECT id FROM payments WHERE member_id=? AND status="pending"', [member_id]); await settle(p.id, req.body.method); }
  res.status(201).json({ id: member_id });
}));
app.patch('/api/admin/members/:id/trainer', admin, wrap(async (req, res) => {
  await q('UPDATE members SET trainer_id=? WHERE id=?', [req.body?.trainer_id || null, req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/admin/members/:id', admin, wrap(async (req, res) => {
  await q('DELETE FROM users WHERE id=(SELECT user_id FROM members WHERE id=?)', [req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/admin/trainers', admin, wrap(async (req, res) => res.json(await q(
  `SELECT t.id,u.name,u.email,u.phone,t.specialization,(SELECT COUNT(*) FROM members WHERE trainer_id=t.id) clients
   FROM trainers t JOIN users u ON u.id=t.user_id ORDER BY u.name`))));
app.post('/api/admin/trainers', admin, wrap(async (req, res) => {
  const d = req.body || {};
  if (!d.name || !validEmail(d.email) || (d.password || '').length < 8) throw new HttpError(400, 'Enter a name, a valid email and a password of at least 8 characters');
  const c = await getConnection();
  try {
    await c.beginTransaction();
    const [u] = await c.query('INSERT INTO users(name,email,phone,password_hash,role) VALUES(?,?,?,?,"trainer")',
      [d.name.trim(), d.email.toLowerCase().trim(), d.phone || null, await bcrypt.hash(d.password, 10)]);
    await c.query('INSERT INTO trainers(user_id,specialization) VALUES(?,?)', [u.insertId, d.specialization || null]);
    await c.commit(); res.status(201).json({ ok: true });
  } catch (e) { await c.rollback(); if (e.code === 'ER_DUP_ENTRY' || e.code === '23505') throw new HttpError(409, 'That email is already registered'); throw e; }
  finally { c.release(); }
}));
app.delete('/api/admin/trainers/:id', admin, wrap(async (req, res) => {
  await q('DELETE FROM users WHERE id=(SELECT user_id FROM trainers WHERE id=?)', [req.params.id]);
  res.json({ ok: true });
}));

app.get('/api/admin/payments', admin, wrap(async (req, res) => res.json(await q(
  `SELECT pay.id,u.name,pay.amount,pay.method,pay.status,pay.paid_on,pay.created_at,p.name plan_name FROM payments pay
   JOIN members m ON m.id=pay.member_id JOIN users u ON u.id=m.user_id JOIN memberships ms ON ms.id=pay.membership_id
   JOIN plans p ON p.id=ms.plan_id ORDER BY pay.id DESC LIMIT 300`))));
app.post('/api/admin/payments', admin, wrap(async (req, res) => {
  okMethod(req.body?.method);
  await settle(await newPending(req.body.member_id, req.body.plan_id), req.body.method);
  res.status(201).json({ ok: true });
}));
app.post('/api/admin/payments/:id/settle', admin, wrap(async (req, res) => {
  okMethod(req.body?.method); await settle(req.params.id, req.body.method); res.json({ ok: true });
}));

app.get('/api/admin/attendance', admin, wrap(async (req, res) => res.json(await q(
  `SELECT a.id,u.name,a.checked_in_at FROM attendance a JOIN members m ON m.id=a.member_id JOIN users u ON u.id=m.user_id
   WHERE a.date=? ORDER BY a.checked_in_at DESC`, [/^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : ymd(new Date())]))));
app.post('/api/admin/attendance', admin, wrap(async (req, res) => res.json(await checkIn(req.body?.member_id))));

/* trainer */
const trainer = auth('trainer');
app.get('/api/trainer/members', trainer, wrap(async (req, res) => res.json(await q(
  `SELECT m.id,u.name,m.goal,m.declared_level,
   (SELECT MAX(end_date) FROM memberships WHERE member_id=m.id AND status='active') end_date,
   (SELECT COUNT(*) FROM attendance WHERE member_id=m.id AND date>=DATE_SUB(CURDATE(),INTERVAL 30 DAY)) att30,
   (SELECT weight_kg FROM progress WHERE member_id=m.id ORDER BY date DESC,id DESC LIMIT 1) weight
   FROM members m JOIN users u ON u.id=m.user_id WHERE m.trainer_id=? ORDER BY u.name`, [req.user.tid]))));
app.get('/api/trainer/members/:id/progress', trainer, wrap(async (req, res) => {
  const [ok] = await q('SELECT id FROM members WHERE id=? AND trainer_id=?', [req.params.id, req.user.tid]);
  if (!ok) throw new HttpError(404, 'Member not found');
  res.json(await q('SELECT date,weight_kg,note FROM progress WHERE member_id=? ORDER BY date', [req.params.id]));
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ---------- start & exports ---------- */
if (require.main === module) {
  ensureDbInit().then(() => {
    app.listen(process.env.PORT || 3000, () => console.log('FlexFlow running on port', process.env.PORT || 3000));
  }).catch(e => {
    console.error('Database connection warning on startup:', e.message);
    app.listen(process.env.PORT || 3000, () => console.log('FlexFlow running on port', process.env.PORT || 3000));
  });
}

module.exports = app;
