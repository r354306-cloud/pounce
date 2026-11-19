/* Pounce prototype. Plain JavaScript, no build step. */
(() => {
'use strict';

const CFG = Object.assign({ backend: '' }, window.POUNCE_CONFIG || {});
const LS = { state: 'pounce.state.v1', key: 'pounce.key', events: 'pounce.events', finds: 'pounce.finds', push: 'pounce.push', synced: 'pounce.synced', hint: 'pounce.hint' };

/* ---------------------------------------------------------------- helpers */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage can be full or blocked */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* same */ } }
};

const qs = new URLSearchParams(location.search);
const DEBUG = { day: parseInt(qs.get('debugDay') || '0', 10) || 0, hour: qs.has('debugHour') ? parseInt(qs.get('debugHour'), 10) : null };
function now() {
  const d = new Date();
  if (DEBUG.day) d.setDate(d.getDate() + DEBUG.day);
  if (DEBUG.hour != null && !isNaN(DEBUG.hour)) d.setHours(DEBUG.hour, 15, 0, 0);
  return d;
}
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseYmd = s => { const a = String(s).split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(now());
const dow = s => parseYmd(s).getDay();
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5);
const DAY1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtDay = s => parseYmd(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
function relDay(s) {
  const n = daysBetween(today(), s);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1 && n < 7) return parseYmd(s).toLocaleDateString('en-US', { weekday: 'long' });
  return fmtDay(s);
}
function daysText(days) {
  const d = [...days].sort();
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Weekdays';
  if (d.join() === '0,6') return 'Weekends';
  return d.map(x => DAY3[x]).join(', ');
}

/* ------------------------------------------------------------------ state */
let S = store.get(LS.state, null);
let KEY = store.get(LS.key, null);
if (!KEY || !/^pk[a-f0-9]{24,48}$/.test(KEY)) {
  const b = new Uint8Array(16);
  (window.crypto || window.msCrypto).getRandomValues(b);
  KEY = 'pk' + [...b].map(x => pad2(x.toString(16))).join('');
  store.set(LS.key, KEY);
}
let FINDS = store.get(LS.finds, []);
const UI = { tab: 'today', say: null, month: null, findFilter: 'all', stamped: false };
const OB = {
  step: 0, name: 'Cece', nag: 'pushy', lsatDate: '',
  pet: { name: 'Pi', kind: 'cat', coat: '#F2994A' },
  packs: { lsat: true, class: true, intern: true, health: false },
  hunt: 'Summer 2027 internships in Washington, DC or Columbus, OH for a political science major'
};

const COLORS = { tomato: '#D8402F', cobalt: '#2F55D4', green: '#1F7A4D', plum: '#7C3F98', amber: '#D9861A', teal: '#0E7C86' };
const COATS = ['#F2994A', '#9AA3B2', '#34313B', '#F6E7CF', '#B9895A', '#FFFFFF'];
const PARTS = [['am', 'Morning'], ['pm', 'Afternoon'], ['eve', 'Evening'], ['any', 'Whenever']];

const PACKS = [
  { id: 'lsat', title: 'LSAT prep', blurb: 'Timed sections, blind review, and a full practice test on Saturdays.',
    goal: { name: 'Crush the LSAT', color: 'tomato' },
    habits: [
      ['Timed Logical Reasoning section (35 min)', [1, 2, 3, 4, 5], 'pm'],
      ['Reading Comp passage set', [2, 4], 'pm'],
      ['Blind review everything I missed', [1, 2, 3, 4, 5], 'eve'],
      ['Full timed practice test', [6], 'am'],
      ['Go over the practice test', [0], 'pm']
    ],
    todos: [['Pick a test date and register with LSAC', 4], ['Take a cold diagnostic test', 6]] },
  { id: 'class', title: 'Classes', blurb: 'Show up, then look at your notes the same day.',
    goal: { name: 'Keep the GPA up', color: 'cobalt' },
    habits: [['Go to every class', [1, 2, 3, 4, 5], 'am'], ["Review today's notes (15 min)", [1, 2, 3, 4], 'eve']],
    todos: [] },
  { id: 'intern', title: 'Summer internship', blurb: 'A fresh hunt for openings every morning, plus the steps to actually apply.',
    goal: { name: 'Land a summer internship', color: 'green' },
    habits: [['Look at what {pet} dragged in', [1, 2, 3, 4, 5], 'am'], ['Work on one application (20 min)', [2, 4], 'pm']],
    todos: [['Update my resume', 2], ['Write a cover letter I can reuse', 5], ['Ask two professors about recommendations', 8]] },
  { id: 'health', title: 'Taking care of myself', blurb: 'Move, sleep, water. The boring stuff that makes the rest work.',
    goal: { name: 'Take care of myself', color: 'plum' },
    habits: [['Move for 30 minutes', [1, 3, 5, 6], 'any'], ['In bed by midnight', [0, 1, 2, 3, 4], 'eve'], ['Three bottles of water', [0, 1, 2, 3, 4, 5, 6], 'any']],
    todos: [] }
];

function migrate(st) {
  if (!st) return st;
  st.goals = st.goals || []; st.items = st.items || []; st.log = st.log || {};
  st.finds = st.finds || {}; st.seen = st.seen || {};
  st.profile = st.profile || {};
  st.profile.pet = st.profile.pet || { name: 'Pi', kind: 'cat', coat: COATS[0] };
  st.profile.nag = st.profile.nag || 'pushy';
  return st;
}
S = migrate(S);

function save(opts = {}) {
  S.updatedAt = Date.now();
  try { S.profile.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* keep the old one */ }
  store.set(LS.state, S);
  updateBadge();
  if (!opts.local) queueSync();
}

/* ----------------------------------------------------------------- domain */
function scheduledOn(it, date) {
  if (it.type !== 'habit') return false;
  if (it.created && date < it.created) return false;
  if (it.archived && (!it.archivedOn || date >= it.archivedOn)) return false;
  return it.days.includes(dow(date));
}
const habitDone = (it, date) => (S.log[date] || []).includes(it.id);
const goalOf = it => S.goals.find(g => g.id === it.goalId) || null;
const goalColor = g => (g && COLORS[g.color]) || '#8A93C4';

function listFor(date) {
  const out = [];
  for (const it of S.items) {
    if (it.type === 'habit') {
      if (scheduledOn(it, date)) out.push({ it, done: habitDone(it, date), late: false });
    } else if (!it.archived) {
      if (it.doneOn) { if (it.doneOn === date) out.push({ it, done: true, late: false }); }
      else if (it.due <= date) out.push({ it, done: false, late: it.due < date });
    }
  }
  return out;
}

function toggle(id) {
  const it = S.items.find(x => x.id === id);
  if (!it) return false;
  const d = today();
  let done;
  if (it.type === 'habit') {
    const arr = S.log[d] || (S.log[d] = []);
    const i = arr.indexOf(id);
    if (i >= 0) { arr.splice(i, 1); done = false; } else { arr.push(id); done = true; }
    if (!arr.length) delete S.log[d];
  } else {
    done = !it.doneOn;
    it.doneOn = done ? d : null;
  }
  pushEvent(done ? 'Checked off' : 'Unchecked', it);
  save();
  return done;
}

function dayStatus(date) {
  const logged = S.log[date] || [];
  const sched = S.items.filter(i => scheduledOn(i, date));
  const todos = S.items.filter(i => i.type === 'todo' && i.doneOn === date).length;
  if (logged.length + todos === 0) return sched.length ? 'miss' : 'rest';
  return sched.length && sched.every(i => logged.includes(i.id)) ? 'perfect' : 'hit';
}
function firstDay() {
  let f = today();
  for (const it of S.items) if (it.created && it.created < f) f = it.created;
  for (const d of Object.keys(S.log)) if (d < f) f = d;
  return f;
}
function currentStreak() {
  const first = firstDay();
  let d = today(), n = 0, guard = 0;
  if (dayStatus(d) !== 'miss' && dayStatus(d) !== 'rest') n++;
  d = addDays(d, -1);
  while (d >= first && guard++ < 800) {
    const st = dayStatus(d);
    if (st === 'miss') break;
    if (st !== 'rest') n++;
    d = addDays(d, -1);
  }
  return n;
}
function bestStreak() {
  let d = firstDay(), best = 0, run = 0, guard = 0;
  const t = today();
  while (d <= t && guard++ < 800) {
    const st = dayStatus(d);
    if (st === 'miss' && d !== t) run = 0;
    else if (st === 'hit' || st === 'perfect') { run++; best = Math.max(best, run); }
    d = addDays(d, 1);
  }
  return best;
}
function habitStreak(it) {
  let d = today(), n = 0, guard = 0;
  if (habitDone(it, d)) n++;
  d = addDays(d, -1);
  while (guard++ < 800 && d >= (it.created || '0')) {
    if (scheduledOn(it, d)) { if (habitDone(it, d)) n++; else break; }
    d = addDays(d, -1);
  }
  return n;
}
function summary() {
  const list = listFor(today());
  return { done: list.filter(x => x.done).length, total: list.length, streak: currentStreak() };
}
function pushEvent(a, it) {
  const ev = store.get(LS.events, []);
  const g = goalOf(it);
  ev.push({ t: Date.now(), a, title: it.title, goal: g ? g.name : '' });
  store.set(LS.events, ev.slice(-80));
}

/* -------------------------------------------------------------------- pet */
function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(n >> 16) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255);
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = v => Math.max(0, Math.min(255, Math.round(v + (amt < 0 ? v : 255 - v) * amt)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => pad2(ch(v).toString(16))).join('');
}

function petSVG(pet, mood = 'neutral') {
  const kind = pet.kind === 'dog' ? 'dog' : 'cat';
  const coat = /^#[0-9a-f]{6}$/i.test(pet.coat || '') ? pet.coat : COATS[0];
  const ink = '#1C2A78';
  const dark = lum(coat) < 0.2;
  const ln = dark ? '#FDF1A9' : ink;
  const L = 42, R = 78;
  const open = (cx, dx = 0, dy = 0) => `<ellipse cx="${cx}" cy="62" rx="7.5" ry="8.5" fill="#fff" stroke="${ink}" stroke-width="2.5"/><circle cx="${cx + dx}" cy="${63 + dy}" r="3.8" fill="${ink}"/><circle cx="${cx + dx + 1.3}" cy="${61.6 + dy}" r="1.1" fill="#fff"/>`;
  const half = (cx, dx = 0, dy = 0) => open(cx, dx, dy) + `<path d="M${cx - 9} 62 A9 10 0 0 1 ${cx + 9} 62 Z" fill="${coat}"/><path d="M${cx - 7.5} 62 A7.5 8.5 0 0 0 ${cx + 7.5} 62" fill="none" stroke="${ink}" stroke-width="2.5"/><path d="M${cx - 8.5} 62 H${cx + 8.5}" stroke="${ln}" stroke-width="3" stroke-linecap="round"/>`;
  const arc = (cx, up) => `<path d="M${cx - 7} ${up ? 65 : 60} Q${cx} ${up ? 55 : 69} ${cx + 7} ${up ? 65 : 60}" fill="none" stroke="${ln}" stroke-width="3.6" stroke-linecap="round"/>`;
  const brow = (a, b, c, d) => `<path d="M${a} ${b} L${c} ${d}" stroke="${ln}" stroke-width="3.8" stroke-linecap="round"/>`;
  const line = d => `<path d="${d}" fill="none" stroke="${ln}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  let eyes, brows = '', mouth, fx = '';
  switch (mood) {
    case 'happy':
      eyes = arc(L, true) + arc(R, true);
      mouth = `<path d="M50 81 Q60 96 70 81 Z" fill="#B4301F" stroke="${ln}" stroke-width="3" stroke-linejoin="round"/>`;
      fx = `<ellipse cx="29" cy="78" rx="6" ry="3.6" fill="#F08A7E" opacity=".6"/><ellipse cx="91" cy="78" rx="6" ry="3.6" fill="#F08A7E" opacity=".6"/>`;
      break;
    case 'smug': eyes = half(L, 1.5, 2.5) + half(R, 1.5, 2.5); mouth = line('M53 85 Q62 90 70 82'); break;
    case 'sideeye': eyes = half(L, 3.2, 2.2) + half(R, 3.2, 2.2); mouth = line('M53 87 H67'); break;
    case 'annoyed': eyes = open(L, 1, 1) + open(R, -1, 1); brows = brow(33, 48, 50, 54) + brow(87, 48, 70, 54); mouth = line('M52 89 Q60 83 68 89'); break;
    case 'furious':
      eyes = open(L, 1.5, 1) + open(R, -1.5, 1); brows = brow(31, 45, 51, 55) + brow(89, 45, 69, 55);
      mouth = `<path d="M51 91 Q60 80 69 91 Z" fill="#B4301F" stroke="${ln}" stroke-width="3" stroke-linejoin="round"/>`;
      fx = `<path d="M99 24 l8 -6 M102 33 l10 -1 M92 19 l3 -9" stroke="#D8402F" stroke-width="3.6" stroke-linecap="round"/>`;
      break;
    case 'sad':
      eyes = open(L, 0, 2.2) + open(R, 0, 2.2); brows = brow(33, 54, 49, 48) + brow(87, 54, 71, 48); mouth = line('M53 90 Q60 84 67 90');
      fx = `<path d="M49 73 q-4.5 7.5 0 9.5 q4.5 -2 0 -9.5z" fill="#7FB3F0" stroke="${ink}" stroke-width="1.5"/>`;
      break;
    case 'asleep':
      eyes = arc(L, false) + arc(R, false); mouth = line('M56 86 H64');
      fx = `<text x="93" y="30" font-family="Besley, Georgia, serif" font-style="italic" font-weight="800" font-size="20" fill="${ink}">z</text><text x="106" y="17" font-family="Besley, Georgia, serif" font-style="italic" font-weight="800" font-size="13" fill="${ink}">z</text>`;
      break;
    default: eyes = open(L) + open(R); mouth = line('M60 80 Q59 87 52 86 M60 80 Q61 87 68 86');
  }
  const head = `<ellipse cx="60" cy="68" rx="44" ry="38" fill="${coat}" stroke="${ink}" stroke-width="4"/>`;
  let body;
  if (kind === 'dog') {
    const ear = shade(coat, dark ? 0.18 : -0.24);
    body = head +
      `<ellipse cx="19" cy="62" rx="13" ry="27" transform="rotate(14 19 62)" fill="${ear}" stroke="${ink}" stroke-width="4"/>` +
      `<ellipse cx="101" cy="62" rx="13" ry="27" transform="rotate(-14 101 62)" fill="${ear}" stroke="${ink}" stroke-width="4"/>` +
      `<ellipse cx="60" cy="84" rx="19" ry="14" fill="#fff" opacity=".5"/>` + fx + eyes + brows +
      `<ellipse cx="60" cy="75.5" rx="7" ry="5" fill="${ink}"/>` + mouth;
  } else {
    const inner = dark ? '#6F6880' : '#F6B8B0';
    body = `<path d="M21 58 L24 14 L57 36 Z" fill="${coat}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M99 58 L96 14 L63 36 Z" fill="${coat}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>` +
      `<path d="M29 45 L30.5 25 L45 35 Z" fill="${inner}"/><path d="M91 45 L89.5 25 L75 35 Z" fill="${inner}"/>` +
      head + `<path d="M22 77 L8 74 M22 83 L8 86 M98 77 L112 74 M98 83 L112 86" stroke="${ink}" stroke-width="2.2" stroke-linecap="round"/>` +
      fx + eyes + brows + `<path d="M55.5 74 H64.5 L60 79.5 Z" fill="#E3766E" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>` + mouth;
  }
  return `<svg viewBox="0 0 120 112" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(pet.name || 'Your pet')}, looking ${esc(mood)}">${body}</svg>`;
}

const MOOD_TEXT = {
  happy: 'Delighted. Do not get used to it.', smug: 'Smug. You are doing fine and they know it.', neutral: 'Watching. Always watching.',
  sideeye: 'Unimpressed.', annoyed: 'Annoyed, and willing to say so.', furious: 'Beyond reasoning with.', sad: 'Quietly heartbroken.', asleep: 'Asleep. The list is not.'
};

const LINES = {
  empty: ['Nothing on the list today. Suspicious.', 'An empty page. Add something before I do it for you.'],
  morning: {
    chill: ['Morning, {name}. {n} things today. No rush. Okay, a little rush.', 'New day. {n} things. Start with the small one.'],
    pushy: ['{n} things on the list. I counted twice.', 'Good morning. "{item}" is first. I will wait right here.'],
    unhinged: ['It is morning. There are {n} things. I have been awake since 4 thinking about them.', 'I {mischief} while you slept. "{item}". Go.']
  },
  going: {
    chill: ['{done} down, {n} to go. This is what a good day looks like.', 'Nice. Keep it rolling.'],
    pushy: ['{done} done. Do not get comfortable. {n} left.', 'Good. Now "{item}".'],
    unhinged: ['{done} done and you are stopping? In this economy?', 'I saw you check that off. I see everything. {n} left.']
  },
  midday: {
    chill: ['Half the day is gone. "{item}" is still sitting here.', 'Afternoon check in. {n} left, whenever you are ready.'],
    pushy: ['"{item}" is not going to do itself. I asked.', 'It is afternoon and the list looks exactly like it did this morning.'],
    unhinged: ['I {mischief} because "{item}" is still not done. I am not sorry.', 'Lunch is over. The list is not. {n} left.']
  },
  evening_ok: {
    chill: ['Solid day. {n} left if you have it in you.', 'Almost there. {n} to go.'],
    pushy: ['{n} left. Finish strong so I can stop looking at you like this.', 'So close. "{item}" and you are basically done.'],
    unhinged: ['{n} left. I can taste it. Do not blow this.', 'Finish "{item}" and nobody gets hurt.']
  },
  evening: {
    chill: ['Still {n} left. You have time, just not infinite time.', 'Evening. "{item}" would be a good one to knock out.'],
    pushy: ['{n} left and it is getting late. Your {streak} day streak is sweating.', 'The sun went down on "{item}". Fix that.'],
    unhinged: ['{streak} days. You are going to throw away {streak} days. For what. A nap?', 'I am sitting on your laptop until "{item}" is done.']
  },
  late: {
    chill: ['It is late and {n} are still open. Do one and call it a win.', 'Tomorrow is fine for some of these. Not all of them.'],
    pushy: ['It is late. {n} left. One of us is going to bed disappointed.', 'Last call for "{item}".'],
    unhinged: ['It is almost midnight and I am SCREAMING. {n} left.', 'Every unchecked circle is a tiny betrayal. There are {n}.']
  },
  alldone: ['Everything is done. I have nothing to complain about and I hate it.', 'Clean list. I am telling everyone.', 'Court is adjourned. Go have fun.', 'All done. I would clap, but, paws.'],
  check: ['Fine. That is one.', 'Okay, I saw that. Do another.', 'Look at you go.', 'Checked. {n} left.', 'Good. Keep moving.'],
  uncheck: ['Un-checking it? I saw that.', 'Wow. Okay. Taking it back.', 'Bold move, lying to a list.'],
  poke: ['Stop poking me and do "{item}".', 'I am not the one with {n} things to do.', 'Poke me again and I add a habit.', 'Yes? "{item}" is that way.'],
  pokedone: ['I am off the clock.', 'Nothing to yell about. Strange feeling.', 'Go outside. I mean it nicely.'],
  why: ['You said it yourself: "{why}". So. "{item}".', 'Remember why: "{why}". Now do "{item}".'],
  lsat: ['Objection. "{item}" is still open.', 'The LSAT is not going to study for itself, counselor.', 'Somebody else just finished their section. Just saying.'],
  missed: ['You ghosted me yesterday. I am not mad. I am a little mad.', 'Yesterday did not happen. Today is going to.'],
  welcome: ['Hi {name}. I am {pet}. I made your list. I will be watching.']
};

function situation() {
  const list = listFor(today());
  const total = list.length, done = list.filter(x => x.done).length, left = total - done;
  const h = now().getHours();
  let sit;
  if (!total) sit = 'empty';
  else if (!left) sit = 'alldone';
  else if (h < 12) sit = done ? 'going' : 'morning';
  else if (h < 17) sit = done / total >= 0.5 ? 'going' : 'midday';
  else if (h < 21) sit = done / total >= 0.5 ? 'evening_ok' : 'evening';
  else sit = 'late';
  const first = list.find(x => !x.done);
  return { sit, total, done, left, h, first: first ? first.it : null };
}
function moodFor(s) {
  const lvl = S.profile.nag;
  switch (s.sit) {
    case 'empty': return 'neutral';
    case 'alldone': return 'happy';
    case 'morning': return s.h < 7 ? 'asleep' : 'neutral';
    case 'going': return 'smug';
    case 'midday': return 'sideeye';
    case 'evening_ok': return 'sideeye';
    case 'evening': return lvl === 'chill' ? 'sideeye' : 'annoyed';
    default: return lvl === 'chill' ? 'sad' : lvl === 'unhinged' ? 'furious' : 'annoyed';
  }
}
function fill(text, s) {
  const p = S.profile;
  const item = s.first ? s.first.title : 'the list';
  const g = s.first ? goalOf(s.first) : null;
  const mischief = p.pet.kind === 'dog' ? 'chewed one shoe' : 'knocked a glass off the table';
  let out = text.replace(/\{name\}/g, p.name || 'you').replace(/\{pet\}/g, p.pet.name).replace(/\{n\}/g, s.left)
    .replace(/\{done\}/g, s.done).replace(/\{item\}/g, item).replace(/\{streak\}/g, currentStreak())
    .replace(/\{mischief\}/g, mischief).replace(/\{why\}/g, (g && g.why) || '');
  if (s.left === 1) out = out.replace(/\b1 things\b/g, '1 thing').replace(/\b1 left\b/g, 'One left').replace(/\b1 are\b/g, 'one is');
  return out;
}
function nagLine(s) {
  const lvl = S.profile.nag;
  if (s.sit === 'empty') return pick(LINES.empty);
  if (s.sit === 'alldone') return pick(LINES.alldone);
  let pool = (LINES[s.sit][lvl] || []).slice();
  const g = s.first ? goalOf(s.first) : null;
  if (g && g.why && s.sit !== 'going' && Math.random() < 0.3) pool = LINES.why;
  else if (s.first && /lsat|logical|reading comp|practice test|blind review/i.test(s.first.title) && s.sit !== 'going' && Math.random() < 0.3) pool = LINES.lsat;
  if (currentStreak() < 2) pool = pool.filter(l => !l.includes('{streak}'));
  if (!pool.length) pool = LINES[s.sit].pushy;
  return fill(pick(pool), s);
}
function sayKey(s) { return [today(), s.sit, s.done, s.total, S.profile.nag].join('|'); }
function currentLine(s) {
  const key = sayKey(s);
  if (!UI.say || UI.say.key !== key) UI.say = { key, text: nagLine(s) };
  return UI.say.text;
}
function sayNow(text) { const s = situation(); UI.say = { key: sayKey(s), text: fill(text, s) }; }

/* ------------------------------------------------------------------ icons */
const ICON = {
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M10 6h10M10 12h10M10 18h10"/><path d="M3.6 6l1 1 2-2.2M3.6 12l1 1 2-2.2M3.6 18l1 1 2-2.2"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h13l-2.5 4.5L18 13H5"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  paw: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="6.2" cy="10" r="2"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="6" r="2"/><circle cx="17.8" cy="10" r="2"/><path d="M12 11.2c-2.9 0-5 2.5-5 4.8 0 1.6 1.2 2.5 2.6 2.5.9 0 1.5-.5 2.4-.5s1.5.5 2.4.5c1.4 0 2.6-.9 2.6-2.5 0-2.3-2.1-4.8-5-4.8z"/></svg>',
  flame: '<svg viewBox="0 0 16 18" fill="currentColor"><path d="M8.2.8c.5 2.7 4.6 4.7 4.6 9.3A4.8 4.8 0 0 1 8 17a4.8 4.8 0 0 1-4.8-4.9c0-2 1.3-3 1.8-4.6.9.6 1.5 1.5 1.6 2.5C7.9 7.4 7.3 3.9 8.2.8z"/></svg>',
  pencil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l1-4.5L16.5 4l3.5 3.5L8.5 19 4 20z"/></svg>',
  repeat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V9a3 3 0 0 1 3-3h11M15 3l3 3-3 3M20 13v2a3 3 0 0 1-3 3H6M9 21l-3-3 3-3"/></svg>',
  check: '<svg viewBox="0 0 16 16"><path d="M3.2 8.4l3 3 6.4-6.8"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>'
};

function tally(done, total) {
  const n = Math.min(total, 15);
  let x = 3, start = 3, out = '';
  for (let i = 0; i < n; i++) {
    const col = i < done ? '#1C2A78' : 'rgba(28,42,120,.24)';
    if (i % 5 === 4) {
      out += `<path d="M${start - 3} 16.5 L${x - 2} 3.5" stroke="${col}"/>`;
      x += 7; start = x;
    } else {
      out += `<path d="M${x} 2.5 L${x + (i % 2 ? 0.7 : -0.5)} 17.5" stroke="${col}"/>`;
      x += 6;
    }
  }
  return `<svg class="tally" viewBox="0 0 ${Math.max(x, 8)} 20" fill="none" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">${out}</svg>`;
}

/* ------------------------------------------------------------------ views */
function renderBind() {
  const el = $('#bind');
  if (!S) { el.innerHTML = '<span class="wordmark">Pounce</span>'; return; }
  const n = currentStreak();
  const hot = dayStatus(today()) === 'hit' || dayStatus(today()) === 'perfect';
  const label = { off: 'On this phone', idle: 'Saved', saved: 'Saved', pending: 'Saving', syncing: 'Saving', error: 'Offline' }[SYNC.state] || '';
  el.innerHTML = `<span class="wordmark">Pounce</span>
    <span class="bind-right">
      <button class="sync" data-s="${SYNC.state}" data-act="tab:pet" aria-label="Sync status: ${label}"><i></i>${label}</button>
      <button class="streak-btn ${hot ? '' : 'cold'}" data-act="streak" aria-label="${n} day streak. Open streak details">${ICON.flame}${n}</button>
    </span>`;
}

function renderTabs() {
  const unseen = FINDS.filter(f => !S.seen[f.url] && !S.finds[f.url]).length;
  const t = (id, label, icon, extra = '') => `<button class="tab" data-act="tab:${id}" ${UI.tab === id ? 'aria-current="page"' : ''}>${icon}${extra}<span>${esc(label)}</span></button>`;
  $('#tabs').innerHTML = t('today', 'Today', ICON.list) + t('goals', 'Goals', ICON.flag) +
    `<button class="tab-add" data-act="add" aria-label="Add a step">${ICON.plus}</button>` +
    t('finds', 'Finds', ICON.paw, unseen ? `<b class="pip">${unseen}</b>` : '') +
    t('pet', S.profile.pet.name || 'Pet', petSVG(S.profile.pet, 'neutral'));
}

function rowHTML(x, opts = {}) {
  const it = x.it, g = goalOf(it);
  const streak = it.type === 'habit' ? habitStreak(it) : 0;
  const showGoal = g && !opts.noGoal;
  const meta = x.late ? `From ${relDay(it.due)}` : (showGoal ? esc(g.name) : (opts.noGoal ? '' : (it.type === 'habit' ? esc(daysText(it.days)) : 'One time')));
  return `<li class="row ${x.done ? 'is-done' : ''} ${x.late ? 'is-late' : ''}" data-id="${it.id}">
    <button class="check" data-act="toggle:${it.id}" aria-pressed="${x.done}" aria-label="${x.done ? 'Uncheck' : 'Check off'} ${esc(it.title)}"><span>${ICON.check}</span></button>
    <button class="row-main" data-act="edit:${it.id}">
      <span class="row-title"><span>${esc(it.title)}</span></span>
      ${meta ? `<span class="row-meta">${showGoal ? `<i class="dot" style="background:${goalColor(g)}"></i>` : ''}${meta}</span>` : ''}
    </button>
    ${opts.right != null ? opts.right : (streak >= 2 ? `<span class="row-streak" aria-label="${streak} in a row">${ICON.flame}${streak}</span>` : '<span></span>')}
  </li>`;
}

function viewToday() {
  const d = today(), list = listFor(d), s = situation();
  const dt = now();
  const mood = moodFor(s);
  let rows = '';
  const late = list.filter(x => x.late);
  if (late.length) rows += `<li class="sec late">Carried over</li>` + late.map(x => rowHTML(x)).join('');
  for (const [id, label] of PARTS) {
    const part = list.filter(x => !x.late && (x.it.part || 'any') === id);
    if (part.length) rows += `<li class="sec">${label}</li>` + part.map(x => rowHTML(x)).join('');
  }
  if (!list.length) rows = `<li class="empty">Nothing scheduled today. Add a step, or enjoy it while it lasts.</li>`;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  const hint = isIOS && !standalone && !store.get(LS.hint, false)
    ? `<div class="block"><h2>Put Pounce on your Home Screen</h2><p>That is how ${esc(S.profile.pet.name)} gets to nag your lock screen.</p><button class="btn small" data-act="install">Show me how</button> <button class="btn small ghost" data-act="hint-off">Not now</button></div>` : '';
  const stamp = s.sit === 'alldone' ? `<span class="stamp ${UI.stamped ? '' : 'thump'}">All done</span>` : '';
  if (s.sit === 'alldone') UI.stamped = true; else UI.stamped = false;
  return `<section class="top">
      <h1 class="day">${dt.toLocaleDateString('en-US', { weekday: 'long' })}</h1>
      <p class="date"><span>${dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}</span>${s.total ? tally(s.done, s.total) + (stamp || `<span>${s.done} of ${s.total} done</span>`) : ''}</p>
    </section>
    <section class="pet-row">
      <button class="pet-tap" data-act="poke" aria-label="Poke ${esc(S.profile.pet.name)}">${petSVG(S.profile.pet, mood)}</button>
      <p class="bubble" id="bubble">${esc(currentLine(s))}</p>
    </section>
    <ul class="lines">${rows}
      <li><button class="add-line" data-act="add"><b>+</b><span>Add a step</span></button></li>
    </ul>${hint}`;
}

function weekBoxes(items) {
  const t = today();
  const monday = addDays(t, -((dow(t) + 6) % 7));
  let out = '', done = 0, total = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const sched = items.filter(it => scheduledOn(it, d));
    const did = sched.filter(it => habitDone(it, d)).length;
    if (d <= t) { done += did; total += sched.length; }
    let cls = 'off';
    if (sched.length) cls = d > t ? '' : (did === sched.length ? 'full' : did ? 'part' : '');
    out += `<span class="wk ${cls} ${d === t ? 'today' : ''}">${DAY1[dow(d)]}</span>`;
  }
  return { html: out, done, total };
}

function goalBlock(g, items) {
  const habits = items.filter(i => i.type === 'habit' && !i.archived);
  const todos = items.filter(i => i.type === 'todo' && !i.archived && !i.doneOn).sort((a, b) => a.due.localeCompare(b.due));
  const doneTodos = items.filter(i => i.type === 'todo' && i.doneOn).length;
  const wk = weekBoxes(habits);
  let when = '';
  if (g && g.due) {
    const n = daysBetween(today(), g.due);
    when = n >= 0 ? `<b>${n} ${n === 1 ? 'day' : 'days'}</b> until ${fmtDay(g.due)}` : `${fmtDay(g.due)} has passed`;
  }
  const t = today();
  const steps = habits.map(it => `<li class="row"><span class="glyph">${ICON.repeat}</span>
      <button class="row-main" data-act="edit:${it.id}"><span class="row-title"><span>${esc(it.title)}</span></span></button>
      <span class="step-when">${esc(daysText(it.days))}</span></li>`).join('') +
    todos.map(it => rowHTML({ it, done: false, late: false }, { noGoal: true, right: `<span class="step-when" ${it.due < t ? 'style="color:var(--red-ink);font-weight:600"' : ''}>${esc(relDay(it.due))}</span>` })).join('');
  return `<section class="goal">
    <div class="goal-head">
      <i class="dot" style="background:${goalColor(g)}"></i>
      <div><h2 class="goal-name">${esc(g ? g.name : 'No goal yet')}</h2>
        ${when ? `<p class="goal-when">${when}</p>` : ''}
        ${g && g.why ? `<p class="goal-when">Why: ${esc(g.why)}</p>` : ''}</div>
      ${g ? `<button class="icon-btn" data-act="goal-edit:${g.id}" aria-label="Edit ${esc(g.name)}">${ICON.pencil}</button>` : '<span></span>'}
    </div>
    <div class="week"><span class="week-boxes">${wk.html}</span><span>${wk.total ? `${wk.done} of ${wk.total} this week` : 'No daily steps yet'}${doneTodos ? `, ${doneTodos} one time ${doneTodos === 1 ? 'step' : 'steps'} done` : ''}</span></div>
    <ul class="lines steps">${steps}
      <li><button class="add-line" style="min-height:50px" data-act="add:${g ? g.id : ''}"><b>+</b><span>Add a step</span></button></li>
    </ul>
  </section>`;
}

function viewGoals() {
  const blocks = S.goals.map(g => goalBlock(g, S.items.filter(i => i.goalId === g.id))).join('');
  const loose = S.items.filter(i => !goalOf(i) && !i.archived && !(i.type === 'todo' && i.doneOn));
  return `<header class="page-head">
      <h1 class="page-title">The long game</h1>
      <p class="page-sub">Big goals up top. The small daily steps that get you there underneath.</p>
    </header>
    ${blocks}${loose.length ? goalBlock(null, loose) : ''}
    <div style="padding:22px 16px 0"><button class="btn ghost" data-act="goal-new">New goal</button></div>`;
}

function dueInfo(f) {
  const t = Date.parse(f.deadline);
  if (!f.deadline) return { text: 'No deadline listed', soon: false, date: null };
  if (isNaN(t)) return { text: f.deadline, soon: false, date: null };
  const date = ymd(new Date(t));
  const n = daysBetween(today(), date);
  if (n < 0) return { text: `Closed ${f.deadline}`, soon: false, date, closed: true };
  return { text: `Apply by ${f.deadline} (${n === 0 ? 'today' : n + (n === 1 ? ' day' : ' days')})`, soon: n <= 14, date };
}

function viewFinds() {
  const pet = esc(S.profile.pet.name);
  const fresh = addDays(today(), -1);
  let list = FINDS.filter(f => S.finds[f.url] !== 'passed');
  const cities = [...new Set(FINDS.map(f => f.city).filter(Boolean))];
  if (UI.findFilter !== 'all') list = list.filter(f => f.city === UI.findFilter);
  list = list.slice().sort((a, b) => (b.found || '').localeCompare(a.found || ''));
  const chips = cities.length > 1 ? `<div class="chips filter">${['all', ...cities].map(c => `<button class="chip" aria-pressed="${UI.findFilter === c}" data-act="find-filter:${esc(c)}">${c === 'all' ? 'All' : esc(c)}</button>`).join('')}</div>` : '';
  const rows = list.map(f => {
    const due = dueInfo(f);
    const added = S.finds[f.url] === 'added';
    return `<li class="find ${added ? 'added' : ''}">
      ${f.found >= fresh && !added ? '<span class="tag">New</span>' : ''}
      <h3 class="find-title">${esc(f.title)}</h3>
      <p class="find-org">${esc(f.org)}${f.city ? `, ${esc(f.city)}` : ''}</p>
      <p class="find-due ${due.soon ? 'soon' : ''}">${esc(due.text)}</p>
      ${f.note ? `<p class="find-note">${esc(f.note)}</p>` : ''}
      <div class="find-acts">
        ${added ? '<span class="hint">On your list</span>' : `<button class="btn small" data-act="find-add" data-url="${esc(f.url)}">Add to my list</button>`}
        <a class="link" href="${esc(f.url)}" target="_blank" rel="noopener noreferrer">View posting</a>
        ${added ? '' : `<button class="link" data-act="find-pass" data-url="${esc(f.url)}">Pass</button>`}
      </div></li>`;
  }).join('');
  return `<header class="page-head">
      <h1 class="page-title">What ${pet} dragged in</h1>
      <p class="page-sub">${pet} goes hunting every morning and leaves what turned up right here.</p>
    </header>
    <div class="hunt"><b>Hunting for</b>${esc(S.profile.hunt || 'Nothing yet. Tell ' + S.profile.pet.name + ' what to look for.')}
      <div style="margin-top:8px"><button class="link" data-act="hunt-edit">Change the hunt</button></div></div>
    ${chips}
    <ul class="lines">${rows || `<li class="empty">Nothing new yet. ${pet} is still out there. Check back tomorrow morning.</li>`}</ul>`;
}

const NAG_COPY = {
  chill: ['Chill', 'One nudge in the evening if things are still open.'],
  pushy: ['Pushy', 'Three a day until the list is clear.'],
  unhinged: ['Unhinged', 'Every couple of hours, with feelings.']
};

function viewPet() {
  const p = S.profile, s = situation(), mood = moodFor(s), pet = esc(p.pet.name);
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone;
  const pushOn = !!store.get(LS.push, null);
  let nags;
  if (!CFG.backend) nags = `<p>Lock screen nags switch on once Pounce is connected to its Google Sheet.</p>`;
  else if (pushOn) nags = `<p>On. ${pet} can reach your lock screen, even when Pounce is closed.</p><button class="btn" data-act="test-nag">Send me a test nag</button>`;
  else if (isIOS && !standalone) nags = `<p>iPhones only allow lock screen nags from the Home Screen. Add Pounce there first, then come back to this button.</p><button class="btn" data-act="install">Show me how</button>`;
  else nags = `<p>Let ${pet} reach your lock screen, even when Pounce is closed.</p><button class="btn" data-act="enable-push">Turn on lock screen nags</button>`;
  const syncText = !CFG.backend ? 'Saved on this phone only for now.'
    : SYNC.state === 'error' ? 'Could not reach Google Drive just now. Your changes are safe on this phone and will sync when it can.'
    : `Backed up to the Pounce sheet in Google Drive${SYNC.last ? ', last at ' + new Date(SYNC.last).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}.`;
  return `<section class="pet-hero">${petSVG(p.pet, mood)}
      <h1 class="pet-name">${pet}</h1><p class="pet-mood">${MOOD_TEXT[mood]}</p></section>
    <section class="block"><h2>How annoying should ${pet} be?</h2>
      <div class="seg">${Object.keys(NAG_COPY).map(k => `<button aria-pressed="${p.nag === k}" data-act="nag:${k}">${NAG_COPY[k][0]}</button>`).join('')}</div>
      <p>${NAG_COPY[p.nag][1]}</p></section>
    <section class="block"><h2>Lock screen nags</h2>${nags}
      <button class="btn ghost" data-act="preview-nag">Preview a nag in the app</button></section>
    <section class="block"><h2>Make ${pet} yours</h2>
      <div class="field" style="margin-top:12px"><label for="pet-name">Name</label><input class="input" id="pet-name" data-bind="petname" value="${esc(p.pet.name)}" maxlength="16" autocomplete="off"></div>
      <div class="seg"><button aria-pressed="${p.pet.kind !== 'dog'}" data-act="kind:cat">Cat</button><button aria-pressed="${p.pet.kind === 'dog'}" data-act="kind:dog">Dog</button></div>
      <div class="swatches">${COATS.map(c => `<button class="swatch" style="background:${c}" aria-pressed="${p.pet.coat === c}" data-act="coat:${c}" aria-label="Coat color ${c}"></button>`).join('')}</div>
      <div class="field"><label for="my-name">Your name</label><input class="input" id="my-name" data-bind="name" value="${esc(p.name)}" maxlength="24" autocomplete="off"></div></section>
    <section class="block"><h2>Where your list lives</h2><p>${syncText}</p>
      <button class="btn ghost" data-act="link">Use Pounce on another phone</button></section>
    <section class="block"><h2>Prototype tools</h2><p>For showing it off. Sample history fills in the last three weeks so the streak and calendar have something to say.</p>
      <button class="btn ghost" data-act="sample">Load sample history</button>
      <button class="btn danger" data-act="reset">Start over</button></section>
    <p class="hint" style="text-align:center;margin-top:22px">Pounce prototype 0.1. Made for Cece.</p>`;
}

function viewOnboard() {
  const pet = esc(OB.pet.name || 'your pet');
  if (OB.step === 0) {
    return `<section class="ob"><p class="ob-step">1 of 3</p>
      <h1>First, who is keeping you honest?</h1>
      <p class="lead">They live at the top of your list and they do not let things go.</p>
      <div class="ob-pet">${petSVG(OB.pet, 'smug')}</div>
      <div class="field"><label for="ob-pet">Their name</label><input class="input" id="ob-pet" value="${esc(OB.pet.name)}" maxlength="16" autocomplete="off">
        <div class="chips">${['Pi', 'Cookie', 'Niko'].map(n => `<button class="chip" data-act="ob-petname:${n}">${n}</button>`).join('')}</div></div>
      <div class="field"><span class="lab">Cat or dog</span><div class="seg"><button aria-pressed="${OB.pet.kind === 'cat'}" data-act="ob-kind:cat">Cat</button><button aria-pressed="${OB.pet.kind === 'dog'}" data-act="ob-kind:dog">Dog</button></div>
        <div class="swatches">${COATS.map(c => `<button class="swatch" style="background:${c}" aria-pressed="${OB.pet.coat === c}" data-act="ob-coat:${c}" aria-label="Coat color ${c}"></button>`).join('')}</div></div>
      <div class="field"><label for="ob-name">And your name</label><input class="input" id="ob-name" value="${esc(OB.name)}" maxlength="24" autocomplete="given-name"></div>
      <div class="grow"></div>
      <button class="btn" data-act="ob-next">Next</button>
      <p class="hint" style="text-align:center;margin-top:14px"><button class="link" data-act="link">I already use Pounce on another phone</button></p>
    </section>`;
  }
  if (OB.step === 1) {
    return `<section class="ob"><p class="ob-step">2 of 3</p>
      <h1>What are you working on?</h1>
      <p class="lead">Pick the big things. ${pet} breaks each one into small daily steps. You can change all of it later.</p>
      <div class="packs">${PACKS.map(p => `<button class="pack" aria-pressed="${!!OB.packs[p.id]}" data-act="ob-pack:${p.id}"><i>${ICON.check}</i><span><b>${p.title}</b><span>${esc(p.blurb)}</span></span></button>`).join('')}</div>
      ${OB.packs.lsat ? `<div class="field"><label for="ob-lsat">LSAT test date, if you have one</label><input class="input" type="date" id="ob-lsat" value="${esc(OB.lsatDate)}" min="${today()}"></div>` : ''}
      ${OB.packs.intern ? `<div class="field"><label for="ob-hunt">What should ${pet} hunt for every morning?</label><textarea class="input" id="ob-hunt" rows="3" maxlength="300">${esc(OB.hunt)}</textarea></div>` : ''}
      <div class="grow"></div>
      <button class="btn" data-act="ob-next">Next</button>
      <button class="btn ghost" style="margin-top:10px" data-act="ob-back">Back</button>
    </section>`;
  }
  return `<section class="ob"><p class="ob-step">3 of 3</p>
    <h1>How annoying should ${pet} be?</h1>
    <p class="lead">Be honest about what it takes to get you moving.</p>
    <div class="ob-pet">${petSVG(OB.pet, { chill: 'neutral', pushy: 'sideeye', unhinged: 'furious' }[OB.nag])}</div>
    <div class="levels">${Object.keys(NAG_COPY).map(k => `<button class="level" aria-pressed="${OB.nag === k}" data-act="ob-nag:${k}"><b>${NAG_COPY[k][0]}</b><span>${NAG_COPY[k][1]}</span></button>`).join('')}</div>
    <div class="grow"></div>
    <button class="btn" data-act="ob-done">Start my list</button>
    <button class="btn ghost" style="margin-top:10px" data-act="ob-back">Back</button>
  </section>`;
}

function render() {
  renderBind();
  const v = $('#view');
  if (!S) { $('#tabs').hidden = true; v.innerHTML = viewOnboard(); return; }
  $('#tabs').hidden = false;
  v.innerHTML = ({ today: viewToday, goals: viewGoals, finds: viewFinds, pet: viewPet }[UI.tab] || viewToday)();
  if (UI.tab === 'finds') {
    let changed = false;
    FINDS.forEach(f => { if (!S.seen[f.url]) { S.seen[f.url] = 1; changed = true; } });
    if (changed) save();
  }
  renderTabs();
}

/* ----------------------------------------------------------------- sheets */
let SHEET = null;
function openSheet(build) {
  closeSheet();
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div><div class="sheet-body"></div></div>';
  $('#sheets').appendChild(scrim);
  const body = $('.sheet-body', scrim);
  const api = { el: body, scrim, handle: null, redraw() { body.innerHTML = build(); } };
  scrim.addEventListener('click', e => { if (e.target === scrim) closeSheet(); });
  api.redraw();
  SHEET = api;
  document.body.style.overflow = 'hidden';
  return api;
}
function closeSheet() {
  if (!SHEET) return;
  SHEET.scrim.remove();
  SHEET = null;
  document.body.style.overflow = '';
}
const sheetHead = title => `<div class="sheet-head"><h2 class="sheet-title">${esc(title)}</h2><button class="icon-btn" data-s="close" aria-label="Close">${ICON.x}</button></div>`;

function itemSheet(item, preset = {}) {
  const isNew = !item;
  const d = item ? JSON.parse(JSON.stringify(item)) : Object.assign({ title: '', type: 'habit', days: [0, 1, 2, 3, 4, 5, 6], part: 'any', due: today(), goalId: null }, preset);
  if (!d.days) d.days = [0, 1, 2, 3, 4, 5, 6];
  if (!d.due) d.due = today();
  let armed = false;
  const sh = openSheet(() => {
    const t = today();
    return `${sheetHead(isNew ? 'Add a step' : 'Edit step')}
      <div class="field"><label for="it-title">What are you going to do?</label><input class="input" id="it-title" value="${esc(d.title)}" maxlength="120" placeholder="One timed LR section" autocomplete="off"></div>
      <div class="field"><span class="lab">How often</span><div class="seg"><button aria-pressed="${d.type === 'habit'}" data-s="type:habit">Keeps repeating</button><button aria-pressed="${d.type === 'todo'}" data-s="type:todo">Just once</button></div></div>
      ${d.type === 'habit'
        ? `<div class="field"><span class="lab">Which days</span><div class="days">${[1, 2, 3, 4, 5, 6, 0].map(n => `<button aria-pressed="${d.days.includes(n)}" data-s="day:${n}" aria-label="${DAY3[n]}">${DAY1[n]}</button>`).join('')}</div>
            <div class="chips"><button class="chip" data-s="days:all">Every day</button><button class="chip" data-s="days:week">Weekdays</button></div></div>`
        : `<div class="field"><span class="lab">Due</span><div class="chips"><button class="chip" aria-pressed="${d.due === t}" data-s="due:0">Today</button><button class="chip" aria-pressed="${d.due === addDays(t, 1)}" data-s="due:1">Tomorrow</button><button class="chip" aria-pressed="${d.due === addDays(t, 7)}" data-s="due:7">In a week</button></div>
            <input class="input" type="date" id="it-date" value="${esc(d.due)}" aria-label="Due date"></div>`}
      <div class="field"><span class="lab">Time of day</span><div class="seg">${PARTS.map(([id, label]) => `<button aria-pressed="${(d.part || 'any') === id}" data-s="part:${id}">${label}</button>`).join('')}</div></div>
      <div class="field"><span class="lab">Which goal is this for</span><div class="chips">${S.goals.map(g => `<button class="chip" aria-pressed="${d.goalId === g.id}" data-s="goal:${g.id}"><i class="dot" style="background:${goalColor(g)}"></i>${esc(g.name)}</button>`).join('')}<button class="chip" aria-pressed="${!d.goalId}" data-s="goal:">None</button></div></div>
      ${d.link ? `<p style="margin-top:16px"><a class="link" href="${esc(d.link)}" target="_blank" rel="noopener noreferrer">Open the posting</a></p>` : ''}
      <button class="btn" data-s="save">${isNew ? 'Add to my list' : 'Save changes'}</button>
      ${isNew ? '' : `<button class="btn danger" data-s="delete">${armed ? 'Tap again to delete' : 'Delete this step'}</button>`}`;
  });
  const read = () => {
    const t = $('#it-title', sh.el); if (t) d.title = t.value.trim();
    const dt = $('#it-date', sh.el); if (dt && dt.value) d.due = dt.value;
  };
  sh.handle = (name, arg) => {
    read();
    if (name === 'type') d.type = arg;
    else if (name === 'day') { const n = +arg; d.days = d.days.includes(n) ? d.days.filter(x => x !== n) : d.days.concat(n); }
    else if (name === 'days') d.days = arg === 'all' ? [0, 1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];
    else if (name === 'due') d.due = addDays(today(), +arg);
    else if (name === 'part') d.part = arg;
    else if (name === 'goal') d.goalId = arg || null;
    else if (name === 'delete') {
      if (!armed) { armed = true; }
      else {
        const real = S.items.find(x => x.id === d.id);
        if (real.type === 'habit') { real.archived = true; real.archivedOn = today(); }
        else S.items = S.items.filter(x => x.id !== d.id);
        pushEvent('Deleted', real); save(); closeSheet(); render(); toast('Deleted.'); return;
      }
    } else if (name === 'save') {
      if (!d.title) { toast('Give it a name first.'); return; }
      if (d.type === 'habit' && !d.days.length) { toast('Pick at least one day.'); return; }
      if (isNew) {
        const it = { id: uid(), title: d.title, type: d.type, goalId: d.goalId, part: d.part, created: today() };
        if (d.type === 'habit') it.days = d.days; else { it.due = d.due; it.doneOn = null; }
        if (d.link) it.link = d.link;
        S.items.push(it); pushEvent('Added', it);
      } else {
        const real = S.items.find(x => x.id === d.id);
        Object.assign(real, { title: d.title, type: d.type, goalId: d.goalId, part: d.part });
        if (d.type === 'habit') { real.days = d.days; delete real.due; delete real.doneOn; }
        else { real.due = d.due; if (real.doneOn === undefined) real.doneOn = null; delete real.days; }
      }
      save(); closeSheet(); render(); toast(isNew ? 'Added.' : 'Saved.'); return;
    }
    sh.redraw();
    if (name === 'type' || name === 'close') return;
  };
  if (isNew) setTimeout(() => { const t = $('#it-title', sh.el); if (t) t.focus(); }, 280);
}

function goalSheet(goal) {
  const isNew = !goal;
  const d = goal ? JSON.parse(JSON.stringify(goal)) : { name: '', color: Object.keys(COLORS)[S.goals.length % 6], due: '', why: '' };
  let armed = false;
  const sh = openSheet(() => `${sheetHead(isNew ? 'New goal' : 'Edit goal')}
    <div class="field"><label for="g-name">The big thing</label><input class="input" id="g-name" value="${esc(d.name)}" maxlength="60" placeholder="Get into law school" autocomplete="off"></div>
    <div class="field"><label for="g-why">Why it matters to you</label><textarea class="input" id="g-why" rows="2" maxlength="140" placeholder="${esc(S.profile.pet.name)} will quote this back at you">${esc(d.why || '')}</textarea></div>
    <div class="field"><label for="g-due">Target date, if there is one</label><input class="input" type="date" id="g-due" value="${esc(d.due || '')}"></div>
    <div class="field"><span class="lab">Color</span><div class="swatches">${Object.keys(COLORS).map(c => `<button class="swatch" style="background:${COLORS[c]}" aria-pressed="${d.color === c}" data-s="color:${c}" aria-label="${c}"></button>`).join('')}</div></div>
    <button class="btn" data-s="save">${isNew ? 'Create goal' : 'Save changes'}</button>
    ${isNew ? '' : `<button class="btn danger" data-s="delete">${armed ? 'Tap again to delete' : 'Delete this goal'}</button>`}`);
  const read = () => {
    d.name = ($('#g-name', sh.el).value || '').trim();
    d.why = ($('#g-why', sh.el).value || '').trim();
    d.due = $('#g-due', sh.el).value || '';
  };
  sh.handle = (name, arg) => {
    read();
    if (name === 'color') d.color = arg;
    else if (name === 'delete') {
      if (!armed) armed = true;
      else {
        S.goals = S.goals.filter(g => g.id !== d.id);
        S.items.forEach(i => { if (i.goalId === d.id) i.goalId = null; });
        save(); closeSheet(); render(); toast('Goal deleted. Its steps are still on your list.'); return;
      }
    } else if (name === 'save') {
      if (!d.name) { toast('Name the goal first.'); return; }
      if (isNew) { const g = { id: uid(), name: d.name, color: d.color, due: d.due || null, why: d.why }; S.goals.push(g); save(); closeSheet(); render(); itemSheet(null, { goalId: g.id }); toast('Goal created. Now give it a first step.'); return; }
      Object.assign(S.goals.find(g => g.id === d.id), { name: d.name, color: d.color, due: d.due || null, why: d.why });
      save(); closeSheet(); render(); toast('Saved.'); return;
    }
    sh.redraw();
  };
}

function streakSheet() {
  if (!UI.month) UI.month = today().slice(0, 7);
  const sh = openSheet(() => {
    const n = currentStreak(), best = Math.max(bestStreak(), n);
    const t = today();
    let perfect = 0, d = firstDay(), guard = 0;
    while (d <= t && guard++ < 800) { if (dayStatus(d) === 'perfect') perfect++; d = addDays(d, 1); }
    let wkDone = 0, wkTotal = 0;
    for (let i = 0; i < 7; i++) {
      const day = addDays(t, -i);
      const sched = S.items.filter(it => scheduledOn(it, day));
      wkTotal += sched.length; wkDone += sched.filter(it => habitDone(it, day)).length;
    }
    const [y, m] = UI.month.split('-').map(Number);
    const first = new Date(y, m - 1, 1), count = new Date(y, m, 0).getDate();
    const start = firstDay();
    let cells = DAY1.map(x => `<span class="dow">${x}</span>`).join('') + '<span></span>'.repeat(first.getDay());
    for (let i = 1; i <= count; i++) {
      const day = `${y}-${pad2(m)}-${pad2(i)}`;
      let cls = '';
      if (day <= t && day >= start) { const st = dayStatus(day); cls = st === 'rest' ? '' : (st === 'miss' && day === t ? '' : st); }
      cells += `<span class="cd ${cls} ${day === t ? 'today' : ''}">${i}</span>`;
    }
    const habits = S.items.filter(i => i.type === 'habit' && !i.archived).map(i => [i, habitStreak(i)]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const hot = dayStatus(t) === 'hit' || dayStatus(t) === 'perfect';
    return `${sheetHead('Your streak')}
      <p class="big-num" style="margin-top:14px">${n}</p>
      <p class="big-cap">${n === 1 ? 'day' : 'days'} in a row${hot || !n ? '' : '. Check one thing off today to keep it.'}</p>
      <div class="stats"><div class="stat"><b>${best}</b><span>best streak</span></div><div class="stat"><b>${perfect}</b><span>perfect days</span></div><div class="stat"><b>${wkTotal ? Math.round(100 * wkDone / wkTotal) : 0}%</b><span>last 7 days</span></div></div>
      <div class="cal-head"><button class="icon-btn" data-s="month:-1" aria-label="Previous month">${ICON.left}</button><h3>${first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3><button class="icon-btn" data-s="month:1" aria-label="Next month">${ICON.right}</button></div>
      <div class="cal">${cells}</div>
      <p class="legend"><span><i class="l1"></i>Everything done</span><span><i class="l2"></i>Showed up</span><span style="text-decoration:line-through;color:var(--red-ink)">12</span><span>Missed</span></p>
      ${habits.length ? `<div class="cal-head"><h3>Longest running</h3></div><ul style="margin-top:6px">${habits.map(([i, k]) => `<li class="kv"><span>${esc(i.title)}</span><b class="row-streak" style="padding:0">${ICON.flame}${k}</b></li>`).join('')}</ul>` : ''}`;
  });
  sh.handle = (name, arg) => {
    if (name === 'month') { const [y, m] = UI.month.split('-').map(Number); const d = new Date(y, m - 1 + (+arg), 1); UI.month = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; sh.redraw(); }
  };
}

function installSheet() {
  openSheet(() => `${sheetHead('Put Pounce on your iPhone')}
    <ol><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (the square with the arrow).</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li><li>Open Pounce from your Home Screen, go to the ${esc(S ? S.profile.pet.name : 'pet')} tab, and turn on lock screen nags.</li></ol>
    <p class="hint" style="margin-top:14px">It opens full screen like any other app and works without signal.</p>
    <button class="btn" data-s="close">Got it</button>`);
}

function linkSheet() {
  const sh = openSheet(() => `${sheetHead('Use Pounce on another phone')}
    <p class="hint" style="margin-top:10px">Your list follows this code. Paste it into Pounce on the other phone and everything shows up there.</p>
    <div class="kv"><span>Your code</span><code>${esc(KEY)}</code></div>
    <button class="btn ghost" data-s="copy">Copy my code</button>
    <div class="field"><label for="lk-code">Or paste a code from your other phone</label><input class="input" id="lk-code" placeholder="pk..." autocomplete="off" autocapitalize="off" spellcheck="false"></div>
    <button class="btn" data-s="use">Load that list here</button>`);
  sh.handle = async (name) => {
    if (name === 'copy') { try { await navigator.clipboard.writeText(KEY); toast('Copied.'); } catch (e) { toast('Copy did not work. Press and hold the code instead.'); } }
    if (name === 'use') {
      const code = ($('#lk-code', sh.el).value || '').trim();
      if (!/^pk[a-f0-9]{24,48}$/.test(code)) { toast('That does not look like a Pounce code.'); return; }
      if (!CFG.backend) { toast('Syncing is not connected yet.'); return; }
      const old = KEY; KEY = code;
      try {
        const r = await api('pull');
        if (!r.state) { KEY = old; toast('No list found for that code.'); return; }
        store.set(LS.key, KEY); S = migrate(r.state); store.set(LS.state, S); writeSWConfig();
        closeSheet(); UI.tab = 'today'; render(); toast('Loaded your list.');
      } catch (e) { KEY = old; toast('Could not reach the server. Try again.'); }
    }
  };
}

function huntSheet() {
  const sh = openSheet(() => `${sheetHead('Change the hunt')}
    <div class="field"><label for="hunt">What should ${esc(S.profile.pet.name)} look for every morning?</label><textarea class="input" id="hunt" rows="4" maxlength="300">${esc(S.profile.hunt || '')}</textarea></div>
    <p class="hint" style="margin-top:10px">Say what, where, and for who. Changes take effect on the next morning hunt.</p>
    <button class="btn" data-s="save">Save the hunt</button>`);
  sh.handle = (name) => { if (name === 'save') { S.profile.hunt = ($('#hunt', sh.el).value || '').trim(); save(); closeSheet(); render(); toast('Saved. Next hunt is tomorrow morning.'); } };
}

/* ------------------------------------------------------------ nags, toast */
let toastT = null;
function toast(text) {
  const el = $('#toast');
  el.textContent = text; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2400);
}
function banner(body) {
  const el = document.createElement('button');
  el.className = 'banner';
  el.innerHTML = `${petSVG(S.profile.pet, moodFor(situation()))}<span><span class="banner-top"><b>${esc(S.profile.pet.name)}</b><span>now</span></span><span class="banner-body">${esc(body)}</span></span>`;
  const out = () => { el.classList.add('out'); setTimeout(() => el.remove(), 260); };
  el.addEventListener('click', () => { out(); if (UI.tab !== 'today') { UI.tab = 'today'; render(); } });
  $('#banners').innerHTML = '';
  $('#banners').appendChild(el);
  setTimeout(out, 6500);
}
let nagTimer = null;
function startNagTimer() {
  clearInterval(nagTimer);
  if (!S) return;
  const mins = { chill: 0, pushy: 8, unhinged: 3 }[S.profile.nag] || 0;
  if (!mins) return;
  nagTimer = setInterval(() => {
    const s = situation();
    if (document.visibilityState === 'visible' && s.left > 0 && !SHEET) banner(nagLine(s));
  }, mins * 60000);
}
function updateBadge() {
  try {
    if (!S || !('setAppBadge' in navigator)) return;
    const left = situation().left;
    if (left) navigator.setAppBadge(left); else navigator.clearAppBadge();
  } catch (e) { /* not supported here */ }
}

/* ------------------------------------------------------------------- sync */
const SYNC = { state: CFG.backend ? 'idle' : 'off', last: store.get(LS.synced, 0), timer: null, busy: false, again: false };
function setSync(st) { SYNC.state = st; renderBind(); }
async function api(action, body = {}) {
  if (!CFG.backend) throw new Error('no backend');
  const res = await fetch(CFG.backend, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action, key: KEY }, body)), redirect: 'follow' });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'backend error');
  return j;
}
function queueSync() {
  if (!CFG.backend || !S) return;
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(pushNow, 1200);
  setSync('pending');
}
async function pushNow() {
  if (!CFG.backend || !S) return;
  if (SYNC.busy) { SYNC.again = true; return; }
  SYNC.busy = true; setSync('syncing');
  try {
    const events = store.get(LS.events, []);
    const r = await api('push', { state: S, events, summary: summary() });
    store.set(LS.events, store.get(LS.events, []).slice(events.length));
    if (r.conflict && r.state) { S = migrate(r.state); store.set(LS.state, S); render(); }
    SYNC.last = Date.now(); store.set(LS.synced, SYNC.last);
    setSync('saved');
  } catch (e) {
    setSync('error');
  }
  SYNC.busy = false;
  if (SYNC.again) { SYNC.again = false; queueSync(); }
}
async function firstSync() {
  if (!CFG.backend) return;
  try {
    const r = await api('pull');
    if (r.state && (!S || (r.state.updatedAt || 0) > (S.updatedAt || 0))) {
      S = migrate(r.state); store.set(LS.state, S); render(); setSync('saved');
    } else if (S) pushNow();
  } catch (e) { if (S) setSync('error'); }
}
async function loadFinds() {
  try {
    let list = null;
    if (CFG.backend) { try { list = (await api('finds')).finds; } catch (e) { list = null; } }
    if (!list || !list.length) { const r = await fetch('finds.json', { cache: 'no-store' }); if (r.ok) list = await r.json(); }
    if (Array.isArray(list)) {
      FINDS = list.filter(f => f && f.title && /^https:\/\//.test(f.url || ''));
      store.set(LS.finds, FINDS);
      if (S) { if (UI.tab === 'finds') render(); else renderTabs(); }
    }
  } catch (e) { /* keep whatever we had */ }
}

/* ------------------------------------------------------------------- push */
async function writeSWConfig() {
  try {
    if (!('caches' in window)) return;
    const c = await caches.open('pounce-cfg');
    await c.put('cfg.json', new Response(JSON.stringify({ backend: CFG.backend, key: KEY, pet: S ? S.profile.pet.name : 'Pounce' }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (e) { /* fine */ }
}
function b64uBytes(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { installSheet(); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifications are off for Pounce. Turn them on in Settings, then try again.'); return; }
    const reg = await navigator.serviceWorker.ready;
    const hello = await api('hello');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(hello.vapid) });
    await pushNow();
    await api('subscribe', { sub: sub.toJSON() });
    store.set(LS.push, sub.endpoint);
    await writeSWConfig();
    render(); toast(`${S.profile.pet.name} can reach your lock screen now.`);
  } catch (e) {
    toast('Could not turn on nags. Try again in a minute.');
  }
}
async function testNag() {
  try { const r = await api('testnag'); toast(r.sent ? 'Sent. Lock your phone and wait a few seconds.' : 'No phone answered. Turn nags on again.'); if (!r.sent) { store.del(LS.push); render(); } }
  catch (e) { toast('Could not send it. Try again in a minute.'); }
}

/* --------------------------------------------------------------- creation */
function createFromOnboarding() {
  const t = today();
  const st = migrate({
    v: 1, goals: [], items: [], log: {}, finds: {}, seen: {},
    profile: { name: OB.name.trim() || 'Friend', pet: Object.assign({}, OB.pet, { name: OB.pet.name.trim() || 'Pi' }), nag: OB.nag, hunt: OB.packs.intern ? OB.hunt.trim() : '' }
  });
  for (const p of PACKS) {
    if (!OB.packs[p.id]) continue;
    const g = { id: uid(), name: p.goal.name, color: p.goal.color, due: p.id === 'lsat' && OB.lsatDate ? OB.lsatDate : null, why: '', pack: p.id };
    st.goals.push(g);
    for (const [title, days, part] of p.habits) st.items.push({ id: uid(), title: title.replace('{pet}', st.profile.pet.name), type: 'habit', days, part, goalId: g.id, created: t });
    for (const [title, inDays] of p.todos) st.items.push({ id: uid(), title, type: 'todo', due: addDays(t, inDays), doneOn: null, part: 'any', goalId: g.id, created: t });
  }
  S = st;
  UI.tab = 'today';
  save();
  sayNow(LINES.welcome[0]);
  writeSWConfig();
  startNagTimer();
}
function loadSample() {
  const start = addDays(today(), -24);
  S.items.forEach(it => { it.created = start; });
  let seed = 11;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  for (let i = 24; i >= 1; i--) {
    const d = addDays(today(), -i);
    const sched = S.items.filter(x => scheduledOn(x, d));
    if (!sched.length || i === 13) { delete S.log[d]; continue; }
    const done = sched.filter(() => rnd() < (i <= 12 ? 0.88 : 0.6)).map(x => x.id);
    S.log[d] = done.length ? done : [sched[0].id];
  }
  save(); render(); toast('Loaded three weeks of history. Tap the flame up top.');
}
function addFind(url) {
  const f = FINDS.find(x => x.url === url);
  if (!f) return;
  const due = dueInfo(f);
  const t = today();
  let when = addDays(t, 5);
  if (due.date) { when = addDays(due.date, -3); if (when > addDays(t, 7)) when = addDays(t, 7); if (when < t) when = t; }
  const g = S.goals.find(x => x.pack === 'intern') || S.goals.find(x => /intern/i.test(x.name)) || null;
  const it = { id: uid(), title: `Apply: ${f.title}${f.org && !f.title.includes(f.org) ? ' (' + f.org + ')' : ''}`.slice(0, 120), type: 'todo', due: when, doneOn: null, part: 'any', goalId: g ? g.id : null, created: t, link: f.url };
  S.items.push(it); S.finds[url] = 'added';
  pushEvent('Added from finds', it);
  save(); render(); toast(`On your list for ${relDay(when)}.`);
}

/* ----------------------------------------------------------------- events */
document.addEventListener('click', e => {
  const sEl = e.target.closest('[data-s]');
  if (sEl && SHEET) {
    const [name, ...rest] = sEl.dataset.s.split(':');
    if (name === 'close') { closeSheet(); return; }
    if (SHEET.handle) SHEET.handle(name, rest.join(':'));
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const [act, ...rest] = el.dataset.act.split(':');
  const arg = rest.join(':');
  const obRead = () => {
    const a = $('#ob-pet'); if (a) OB.pet.name = a.value;
    const b = $('#ob-name'); if (b) OB.name = b.value;
    const c = $('#ob-lsat'); if (c) OB.lsatDate = c.value;
    const d = $('#ob-hunt'); if (d) OB.hunt = d.value;
  };
  switch (act) {
    case 'tab': UI.tab = arg; render(); window.scrollTo(0, 0); if (arg === 'finds') loadFinds(); break;
    case 'toggle': {
      const done = toggle(arg);
      const s = situation();
      UI.say = { key: sayKey(s), text: s.sit === 'alldone' ? pick(LINES.alldone) : fill(pick(done ? LINES.check : LINES.uncheck), s) };
      const row = el.closest('.row');
      if (row && UI.tab === 'today') {
        row.classList.toggle('is-done', done);
        el.setAttribute('aria-pressed', done);
        setTimeout(() => { render(); const p = $('.pet-tap'); if (p && done) p.classList.add('bop'); }, 380);
        renderBind();
      } else render();
      break;
    }
    case 'edit': { const it = S.items.find(x => x.id === arg); if (it) itemSheet(it); break; }
    case 'add': itemSheet(null, arg ? { goalId: arg } : (UI.tab === 'today' ? { type: 'todo' } : {})); break;
    case 'poke': {
      const s = situation();
      UI.say = { key: sayKey(s), text: fill(pick(s.left ? LINES.poke : LINES.pokedone), s) };
      $('#bubble').textContent = UI.say.text;
      el.classList.remove('bop'); void el.offsetWidth; el.classList.add('bop');
      break;
    }
    case 'streak': streakSheet(); break;
    case 'goal-edit': goalSheet(S.goals.find(g => g.id === arg)); break;
    case 'goal-new': goalSheet(null); break;
    case 'find-add': addFind(el.dataset.url); break;
    case 'find-pass': S.finds[el.dataset.url] = 'passed'; save(); render(); toast('Passed.'); break;
    case 'find-filter': UI.findFilter = arg; render(); break;
    case 'hunt-edit': huntSheet(); break;
    case 'nag': S.profile.nag = arg; UI.say = null; save(); render(); startNagTimer(); break;
    case 'kind': S.profile.pet.kind = arg; save(); render(); writeSWConfig(); break;
    case 'coat': S.profile.pet.coat = arg; save(); render(); break;
    case 'enable-push': enablePush(); break;
    case 'test-nag': testNag(); break;
    case 'preview-nag': { const s = situation(); banner(s.left ? nagLine(s) : 'Nothing to nag about. This is what it looks like when there is.'); break; }
    case 'install': installSheet(); break;
    case 'hint-off': store.set(LS.hint, true); render(); break;
    case 'link': linkSheet(); break;
    case 'sample': loadSample(); break;
    case 'reset':
      if (el.dataset.armed) { store.del(LS.state); store.del(LS.events); store.del(LS.push); S = null; OB.step = 0; UI.tab = 'today'; render(); window.scrollTo(0, 0); }
      else { el.dataset.armed = '1'; el.textContent = 'Tap again to erase this phone'; }
      break;
    case 'ob-petname': obRead(); OB.pet.name = arg; if (arg === 'Niko') OB.pet.kind = 'dog'; else OB.pet.kind = 'cat'; render(); break;
    case 'ob-kind': obRead(); OB.pet.kind = arg; render(); break;
    case 'ob-coat': obRead(); OB.pet.coat = arg; render(); break;
    case 'ob-pack': obRead(); OB.packs[arg] = !OB.packs[arg]; render(); break;
    case 'ob-nag': OB.nag = arg; render(); break;
    case 'ob-back': obRead(); OB.step = Math.max(0, OB.step - 1); render(); window.scrollTo(0, 0); break;
    case 'ob-next':
      obRead();
      if (OB.step === 1 && !Object.values(OB.packs).some(Boolean)) { toast('Pick at least one to start with.'); break; }
      OB.step++; render(); window.scrollTo(0, 0); break;
    case 'ob-done': createFromOnboarding(); render(); window.scrollTo(0, 0); loadFinds(); break;
  }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-bind]');
  if (!el || !S) return;
  const v = el.value.trim();
  if (el.dataset.bind === 'petname' && v) { S.profile.pet.name = v; writeSWConfig(); }
  if (el.dataset.bind === 'name' && v) S.profile.name = v;
  UI.say = null; save(); render();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && SHEET) closeSheet();
  if (e.key === 'Enter' && SHEET && e.target.id === 'it-title') { const b = $('[data-s="save"]', SHEET.el); if (b) b.click(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { updateBadge(); if (SYNC.state === 'pending') { clearTimeout(SYNC.timer); pushNow(); } }
  else if (S) { UI.say = null; render(); firstSync(); loadFinds(); }
});

/* ------------------------------------------------------------------- boot */
window.__pounce = { petSVG, COATS };
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').then(writeSWConfig).catch(() => {});
firstSync();
loadFinds();
if (S) {
  updateBadge();
  startNagTimer();
  setTimeout(() => {
    const s = situation();
    if (S && s.left > 0 && s.h >= 10 && !SHEET) {
      const y = addDays(today(), -1);
      banner(dayStatus(y) === 'miss' && y >= firstDay() ? fill(pick(LINES.missed), s) : nagLine(s));
    }
  }, 1500);
}
})();
