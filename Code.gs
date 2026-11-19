/**
 * Pounce backend
 *
 * A Google Apps Script web app that lives inside the "Pounce Backend" Google Sheet.
 * It saves each person's goals and check-offs to the sheet, keeps a readable
 * activity log, serves the daily finds (internships and other leads), and sends
 * lock screen nags with Web Push on a 15 minute timer.
 *
 * Set up: open the sheet, Extensions > Apps Script, paste this file, run setup()
 * once, then Deploy > New deployment > Web app (Execute as: Me, Access: Anyone).
 * Put the /exec URL in config.js.
 *
 * @OnlyCurrentDoc
 */

var APP_URL = 'https://r354306-cloud.github.io/pounce/';
var MAX_USERS = 40;
var MAX_STATE = 180000;
var CHUNK = 45000;
var STATE_COLS = 4;

var T_USERS = 'Users';
var T_ACT = 'Activity';
var T_NAGS = 'Nags';
var T_FINDS = 'Finds';

var U_HEAD = ['key', 'name', 'pet', 'nag level', 'time zone', 'last sync', 'done today', 'streak',
  'hunting for', 'last nag', 'meta json', 'push json', 'state 1', 'state 2', 'state 3', 'state 4'];
var A_HEAD = ['when', 'who', 'what', 'item', 'goal'];
var N_HEAD = ['when', 'who', 'kind', 'message', 'phones reached'];
var F_HEAD = ['found', 'key', 'title', 'org', 'city', 'deadline', 'url', 'note'];
var UC = {};
U_HEAD.forEach(function (h, i) { UC[h] = i; });

// Local hours when a nag may go out, by how annoying the pet is allowed to be.
var SLOTS = {
  chill: [19.5],
  pushy: [12, 16.5, 20.5],
  unhinged: [10, 12, 14, 16, 18, 19.5, 21, 22, 23]
};

/* ------------------------------------------------------------------ web app */

function doPost(e) {
  return respond_(function () {
    return route_(JSON.parse((e && e.postData && e.postData.contents) || '{}'));
  });
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  return respond_(function () {
    return route_({ action: p.action || 'hello', key: p.key });
  });
}

function respond_(fn) {
  var out;
  try { out = fn(); } catch (err) { out = { ok: false, error: String((err && err.message) || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function route_(req) {
  var a = req.action;
  if (a === 'hello') return { ok: true, app: 'pounce', vapid: vapid_().pub };
  if (!/^pk[a-f0-9]{24,48}$/.test(String(req.key || ''))) throw new Error('bad key');
  if (a === 'pull') return pull_(req);
  if (a === 'push') return push_(req);
  if (a === 'subscribe') return subscribe_(req);
  if (a === 'unsubscribe') return unsubscribe_(req);
  if (a === 'testnag') return testNag_(req);
  if (a === 'nag') return lastNag_(req);
  if (a === 'finds') return { ok: true, finds: finds_(req.key) };
  throw new Error('unknown action');
}

/* ------------------------------------------------------------------- sheets */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

function sheet_(name, head) {
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]);
    sh.setFrozenRows(1);
  }
  return sh;
}

function users_() { return sheet_(T_USERS, U_HEAD); }

function findRow_(sh, key) {
  var n = sh.getLastRow();
  if (n < 2) return null;
  var keys = sh.getRange(2, 1, n - 1, 1).getValues();
  for (var i = 0; i < keys.length; i++) {
    if (keys[i][0] === key) {
      return { r: i + 2, row: sh.getRange(i + 2, 1, 1, U_HEAD.length).getValues()[0] };
    }
  }
  return null;
}

function readState_(row) {
  var s = '';
  for (var i = 0; i < STATE_COLS; i++) s += String(row[UC['state 1'] + i] || '').replace(/^~/, '');
  if (!s) return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function parse_(v, fallback) {
  try { var x = JSON.parse(String(v || '')); return x == null ? fallback : x; } catch (e) { return fallback; }
}

// Keeps user text from being read as a formula and trims it to a sane length.
function safe_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').replace(/^'+/, '').slice(0, max || 120);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

function dateText_(v, tz, fmt) { return isDate_(v) ? Utilities.formatDate(v, tz, fmt) : String(v == null ? '' : v); }

/* --------------------------------------------------------------------- sync */

function pull_(req) {
  var sh = users_();
  var hit = findRow_(sh, req.key);
  if (!hit) return { ok: true, state: null };
  var meta = parse_(hit.row[UC['meta json']], {});
  meta.lastSeen = Date.now();
  sh.getRange(hit.r, UC['meta json'] + 1).setValue(JSON.stringify(meta));
  return { ok: true, state: readState_(hit.row) };
}

function push_(req) {
  var st = req.state;
  if (!st || typeof st !== 'object' || !st.profile) throw new Error('no state');
  var json = JSON.stringify(st);
  if (json.length > MAX_STATE) throw new Error('too big');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = users_();
    var hit = findRow_(sh, req.key);
    if (hit) {
      var old = readState_(hit.row);
      if (old && (old.updatedAt || 0) > (st.updatedAt || 0)) return { ok: true, conflict: true, state: old };
    } else if (sh.getLastRow() - 1 >= MAX_USERS) {
      throw new Error('full');
    }
    var row = hit ? hit.row : U_HEAD.map(function () { return ''; });
    var p = st.profile;
    var sum = req.summary || {};
    var meta = parse_(row[UC['meta json']], {});
    meta.lastSeen = Date.now();
    meta.streak = Number(sum.streak) || 0;
    row[UC['key']] = req.key;
    row[UC['name']] = safe_(p.name);
    row[UC['pet']] = safe_((p.pet && p.pet.name) || '');
    row[UC['nag level']] = safe_(p.nag);
    row[UC['time zone']] = safe_(p.tz);
    row[UC['last sync']] = new Date();
    row[UC['done today']] = (Number(sum.done) || 0) + ' of ' + (Number(sum.total) || 0);
    row[UC['streak']] = Number(sum.streak) || 0;
    row[UC['hunting for']] = safe_(p.hunt, 400);
    row[UC['last nag']] = safe_(row[UC['last nag']], 300);
    row[UC['meta json']] = JSON.stringify(meta);
    row[UC['push json']] = String(row[UC['push json']] || '[]');
    for (var i = 0; i < STATE_COLS; i++) {
      var part = json.substr(i * CHUNK, CHUNK);
      row[UC['state 1'] + i] = part ? '~' + part : '';
    }
    sh.getRange(hit ? hit.r : sh.getLastRow() + 1, 1, 1, U_HEAD.length).setValues([row]);
    logEvents_(p.name, req.events);
    return { ok: true, updatedAt: st.updatedAt || 0 };
  } finally {
    lock.releaseLock();
  }
}

function logEvents_(name, events) {
  if (!events || !events.length) return;
  var rows = events.slice(0, 60).map(function (ev) {
    return [new Date(Number(ev.t) || Date.now()), safe_(name), safe_(ev.a, 40), safe_(ev.title, 160), safe_(ev.goal, 80)];
  });
  var sh = sheet_(T_ACT, A_HEAD);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, A_HEAD.length).setValues(rows);
}

/* -------------------------------------------------------------------- finds */

function finds_(key) {
  var sh = sheet_(T_FINDS, F_HEAD);
  var n = sh.getLastRow();
  if (n < 2) return [];
  var tz = ss_().getSpreadsheetTimeZone();
  return sh.getRange(2, 1, n - 1, F_HEAD.length).getValues().filter(function (r) {
    return /^https:\/\//.test(String(r[6])) && r[2] && (!r[1] || r[1] === key || r[1] === 'all');
  }).map(function (r) {
    return {
      found: dateText_(r[0], tz, 'yyyy-MM-dd'),
      title: String(r[2]), org: String(r[3]), city: String(r[4]),
      deadline: dateText_(r[5], tz, 'MMM d, yyyy'),
      url: String(r[6]), note: String(r[7] || '')
    };
  }).slice(-80);
}

/* --------------------------------------------------------------------- nags */

function subscribe_(req) {
  var sub = req.sub;
  if (!sub || !okEndpoint_(sub.endpoint)) throw new Error('bad subscription');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = users_();
    var hit = findRow_(sh, req.key);
    if (!hit) throw new Error('sync first');
    var subs = parse_(hit.row[UC['push json']], []).filter(function (s) { return s.endpoint !== sub.endpoint; });
    subs.push({ endpoint: String(sub.endpoint).slice(0, 700) });
    subs = subs.slice(-3);
    sh.getRange(hit.r, UC['push json'] + 1).setValue(JSON.stringify(subs));
    return { ok: true, devices: subs.length };
  } finally {
    lock.releaseLock();
  }
}

function unsubscribe_(req) {
  var sh = users_();
  var hit = findRow_(sh, req.key);
  if (!hit) return { ok: true, devices: 0 };
  var subs = parse_(hit.row[UC['push json']], []).filter(function (s) { return s.endpoint !== (req.sub && req.sub.endpoint); });
  sh.getRange(hit.r, UC['push json'] + 1).setValue(JSON.stringify(subs));
  return { ok: true, devices: subs.length };
}

function lastNag_(req) {
  var hit = findRow_(users_(), req.key);
  var meta = hit ? parse_(hit.row[UC['meta json']], {}) : {};
  return { ok: true, title: meta.nagTitle || 'Pounce', body: meta.nagBody || 'Your list is waiting.' };
}

function testNag_(req) {
  var sh = users_();
  var hit = findRow_(sh, req.key);
  if (!hit) throw new Error('sync first');
  var st = readState_(hit.row) || {};
  var pet = (st.profile && st.profile.pet && st.profile.pet.name) || 'Pounce';
  var meta = parse_(hit.row[UC['meta json']], {});
  var sent = deliver_(sh, hit, meta, { title: pet, body: 'Test nag. I can reach your lock screen now. Be afraid.' }, 'test');
  return { ok: true, sent: sent };
}

function deliver_(sh, hit, meta, msg, kind) {
  meta.nagTitle = msg.title;
  meta.nagBody = msg.body;
  meta.nagAt = Date.now();
  var subs = parse_(hit.row[UC['push json']], []);
  var keep = [];
  var sent = 0;
  subs.forEach(function (s) {
    var code = sendPush_(s.endpoint);
    if (code >= 200 && code < 300) sent++;
    if (code !== 404 && code !== 410) keep.push(s);
  });
  sh.getRange(hit.r, UC['meta json'] + 1).setValue(JSON.stringify(meta));
  sh.getRange(hit.r, UC['last nag'] + 1).setValue(safe_(msg.body, 300));
  if (keep.length !== subs.length) sh.getRange(hit.r, UC['push json'] + 1).setValue(JSON.stringify(keep));
  sheet_(T_NAGS, N_HEAD).appendRow([new Date(), safe_(hit.row[UC['name']]), kind, safe_(msg.body, 300), sent]);
  return sent;
}

// Runs every 15 minutes from a time trigger.
function nagTick() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) return;
  try {
    var sh = users_();
    var n = sh.getLastRow();
    if (n < 2) return;
    var rows = sh.getRange(2, 1, n - 1, U_HEAD.length).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (!rows[i][0]) continue;
      try { nagUser_(sh, { r: i + 2, row: rows[i] }); } catch (err) { Logger.log('nag error: ' + err); }
    }
  } finally {
    lock.releaseLock();
  }
}

function nagUser_(sh, hit) {
  var st = readState_(hit.row);
  if (!st || !st.profile) return;
  var p = st.profile;
  var meta = parse_(hit.row[UC['meta json']], {});
  var local = localNow_(p.tz);
  if (local.hour < 8) return;
  var pet = (p.pet && p.pet.name) || 'Pounce';
  var dirty = false;
  var msg = null;
  var kind = '';

  // Anything new in the Finds tab since we last told her?
  var count = finds_(hit.row[UC['key']]).length;
  if (meta.findsCount == null) {
    meta.findsCount = count; dirty = true;
  } else if (count > meta.findsCount) {
    var k = count - meta.findsCount;
    msg = { title: pet, body: pet + ' dragged in ' + k + ' new ' + (k === 1 ? 'find' : 'finds') + ' for you. Go look before someone else applies.' };
    kind = 'finds';
    meta.findsCount = count; dirty = true;
  } else if (count < meta.findsCount) {
    meta.findsCount = count; dirty = true;
  }

  // List nags. Skipped while she has the app open.
  var inApp = meta.lastSeen && (Date.now() - meta.lastSeen < 10 * 60000);
  if (!msg && !inApp) {
    var slots = SLOTS[p.nag] || SLOTS.pushy;
    var due = slots.filter(function (h) { return local.hour >= h; }).length;
    var sent = meta.nagDate === local.date ? (meta.nagsSent || 0) : 0;
    if (due > sent) {
      meta.nagDate = local.date; meta.nagsSent = due; dirty = true;
      var left = remaining_(st, local.date);
      if (left.length) {
        msg = composeNag_(p, pet, left, meta.streak || 0, local.hour);
        kind = p.nag || 'pushy';
      }
    }
  }

  if (msg) deliver_(sh, hit, meta, msg, kind);
  else if (dirty) sh.getRange(hit.r, UC['meta json'] + 1).setValue(JSON.stringify(meta));
}

function localNow_(tz) {
  var d = new Date();
  var fmt = "yyyy-MM-dd'|'H'|'m";
  var s;
  try { s = Utilities.formatDate(d, tz || 'America/New_York', fmt); } catch (e) { s = Utilities.formatDate(d, 'America/New_York', fmt); }
  var a = s.split('|');
  return { date: a[0], hour: Number(a[1]) + Number(a[2]) / 60 };
}

// Titles of everything still open today. Mirrors the app's own schedule rules.
function remaining_(st, date) {
  var dow = new Date(date + 'T12:00:00Z').getUTCDay();
  var done = (st.log && st.log[date]) || [];
  var out = [];
  (st.items || []).forEach(function (it) {
    if (it.archived) return;
    if (it.type === 'habit') {
      if ((it.days || []).indexOf(dow) >= 0 && done.indexOf(it.id) < 0 && !(it.created && it.created > date)) out.push(it.title);
    } else if (!it.doneOn && it.due && it.due <= date) {
      out.push(it.title);
    }
  });
  return out;
}

var NAG_LINES = {
  chill: [
    'Hi {name}. "{item}" is still on the list. No pressure. A little pressure.',
    '{n} left today. You have time, just not infinite time.',
    'Quick reminder from {pet}: "{item}". That is all.'
  ],
  pushy: [
    '"{item}" is not going to do itself. I asked.',
    '{n} left and the day is leaving. Your {streak} day streak is sweating.',
    '{name}. "{item}". Now would be good.',
    'I can see the list from here. {n} unchecked. I counted twice.'
  ],
  unhinged: [
    'I knocked a glass off the table because "{item}" is still not done. There are more glasses.',
    '{streak} days. You are going to throw away {streak} days. For what. A nap?',
    '{n} things left. I am sitting on your laptop until they are done.',
    'It is me again. It will keep being me. Do "{item}".',
    'Every hour you skip "{item}" I get louder. Ask the neighbors.'
  ]
};

function composeNag_(p, pet, left, streak, hour) {
  var pool = (NAG_LINES[p.nag] || NAG_LINES.pushy).filter(function (l) { return streak >= 2 || l.indexOf('{streak}') < 0; });
  var line = pool[Math.floor(Math.random() * pool.length)];
  var body = line.replace(/\{name\}/g, p.name || 'Hey').replace(/\{pet\}/g, pet)
    .replace(/\{n\}/g, left.length).replace(/\{item\}/g, left[0]).replace(/\{streak\}/g, streak);
  if (left.length === 1) body = body.replace('1 things', '1 thing').replace('1 left', 'One left');
  return { title: pet, body: body };
}

/* ----------------------------------------------------------------- web push */

function okEndpoint_(url) {
  return /^https:\/\/[a-z0-9.\-]+\.(push\.apple\.com|googleapis\.com|mozilla\.com|notify\.windows\.com)\//i.test(String(url || ''));
}

// Sends an empty Web Push. The app's service worker then asks this script for
// the words (action=nag), so no payload encryption is needed here.
function sendPush_(endpoint) {
  if (!okEndpoint_(endpoint)) return 0;
  var v = vapid_();
  var aud = String(endpoint).match(/^https:\/\/[^\/]+/)[0];
  var head = b64u_(strBytes_(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  var body = b64u_(strBytes_(JSON.stringify({ aud: aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: APP_URL })));
  var sig = P256.sign(v.priv, sha256_(strBytes_(head + '.' + body)));
  var jwt = head + '.' + body + '.' + b64u_(sig);
  try {
    var res = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      headers: { Authorization: 'vapid t=' + jwt + ', k=' + v.pub, TTL: '14400', Urgency: 'high' },
      muteHttpExceptions: true
    });
    return res.getResponseCode();
  } catch (e) {
    return 0;
  }
}

// The push keys are made here on first use and never leave the script.
function vapid_() {
  var props = PropertiesService.getScriptProperties();
  var priv = props.getProperty('VAPID_PRIV');
  var pub = props.getProperty('VAPID_PUB');
  if (!priv || !pub) {
    var seed = [];
    for (var i = 0; i < 6; i++) seed = seed.concat(strBytes_(Utilities.getUuid()));
    seed = seed.concat(strBytes_(String(Date.now())));
    var kp = P256.keypair(sha256_(seed));
    priv = kp.privHex;
    pub = b64u_(kp.pubBytes);
    props.setProperty('VAPID_PRIV', priv);
    props.setProperty('VAPID_PUB', pub);
  }
  return { priv: priv, pub: pub };
}

function strBytes_(s) {
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 128) out.push(c);
    else if (c < 2048) out.push(192 | (c >> 6), 128 | (c & 63));
    else out.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
  }
  return out;
}

function sha256_(bytes) {
  var signed = bytes.map(function (b) { return b > 127 ? b - 256 : b; });
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, signed).map(function (b) { return (b + 256) % 256; });
}

function b64u_(bytes) {
  var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  var out = '';
  for (var i = 0; i < bytes.length; i += 3) {
    var b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += abc[b0 >> 2] + abc[((b0 & 3) << 4) | ((b1 || 0) >> 4)];
    if (i + 1 < bytes.length) out += abc[((b1 & 15) << 2) | ((b2 || 0) >> 6)];
    if (i + 2 < bytes.length) out += abc[b2 & 63];
  }
  return out;
}

// Small P-256 ECDSA signer (Apps Script has no built in one). Used only to sign
// the short VAPID token that push services require.
var P256 = (function () {
  var ZERO = BigInt(0), ONE = BigInt(1), TWO = BigInt(2), THREE = BigInt(3);
  var p = BigInt('0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff');
  var n = BigInt('0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551');
  var a = p - THREE;
  var G = [
    BigInt('0x6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296'),
    BigInt('0x4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5')
  ];

  function mod(x, m) { var r = x % m; return r >= ZERO ? r : r + m; }

  function inv(x, m) {
    var r0 = mod(x, m), r1 = m, s0 = ONE, s1 = ZERO;
    while (r1 !== ZERO) {
      var q = r0 / r1;
      var t = r0 - q * r1; r0 = r1; r1 = t;
      t = s0 - q * s1; s0 = s1; s1 = t;
    }
    return mod(s0, m);
  }

  function dbl(P) {
    if (!P || P[1] === ZERO) return null;
    var l = mod((THREE * P[0] * P[0] + a) * inv(TWO * P[1], p), p);
    var x = mod(l * l - TWO * P[0], p);
    return [x, mod(l * (P[0] - x) - P[1], p)];
  }

  function add(P, Q) {
    if (!P) return Q;
    if (!Q) return P;
    if (P[0] === Q[0]) return mod(P[1] + Q[1], p) === ZERO ? null : dbl(P);
    var l = mod((Q[1] - P[1]) * inv(Q[0] - P[0], p), p);
    var x = mod(l * l - P[0] - Q[0], p);
    return [x, mod(l * (P[0] - x) - P[1], p)];
  }

  function mul(k, P) {
    var R = null, Q = P;
    while (k > ZERO) {
      if ((k & ONE) === ONE) R = add(R, Q);
      Q = dbl(Q);
      k = k >> ONE;
    }
    return R;
  }

  function toBig(bytes) {
    var hex = '';
    for (var i = 0; i < bytes.length; i++) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return BigInt('0x' + (hex || '0'));
  }

  function toBytes(x, len) {
    var hex = x.toString(16);
    while (hex.length < len * 2) hex = '0' + hex;
    var out = [];
    for (var i = 0; i < hex.length; i += 2) out.push(parseInt(hex.substr(i, 2), 16));
    return out;
  }

  function keypair(seed32) {
    var d = mod(toBig(seed32), n - ONE) + ONE;
    var Q = mul(d, G);
    return { privHex: d.toString(16), pubBytes: [4].concat(toBytes(Q[0], 32), toBytes(Q[1], 32)) };
  }

  // Returns the 64 byte r||s signature that JWT ES256 expects.
  function sign(privHex, hash32) {
    var d = BigInt('0x' + privHex);
    var z = toBig(hash32);
    for (var ctr = 0; ctr < 40; ctr++) {
      var kSeed = toBytes(d, 32).concat(hash32, strBytes_(Utilities.getUuid() + ':' + ctr));
      var k = mod(toBig(sha256_(kSeed)), n - ONE) + ONE;
      var R = mul(k, G);
      var r = mod(R[0], n);
      if (r === ZERO) continue;
      var s = mod(inv(k, n) * (z + r * d), n);
      if (s === ZERO) continue;
      return toBytes(r, 32).concat(toBytes(s, 32));
    }
    throw new Error('could not sign');
  }

  return { keypair: keypair, sign: sign };
})();

/* -------------------------------------------------------------------- setup */

// Run this once from the editor. It makes the tabs, the push keys, and the timer.
function setup() {
  users_();
  sheet_(T_ACT, A_HEAD);
  sheet_(T_NAGS, N_HEAD);
  sheet_(T_FINDS, F_HEAD);
  vapid_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'nagTick') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('nagTick').timeBased().everyMinutes(15).create();
  return 'Pounce backend is ready.';
}
