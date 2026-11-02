
(function () {
'use strict';
/* ================= Constants and utilities ================= */
var LS_USERS = 'finance-audit-v1:users';
var LS_RECORDS = 'finance-audit-v1:records';
/* Static configuration: income/expense categories, default retention, currency, app name.
   The same values live in ./finance-audit.json. When the page can fetch that file, its
   values replace these defaults at startup; when it cannot (for example the page was
   opened directly via file://, or the JSON was not uploaded), these built-in defaults
   are used instead, so the app always starts. The JSON holds configuration only - the
   ledger itself always lives in this browser's localStorage and is never written to
   any server file. */
var APP_CONFIG = {
  appName: 'Financial Audit',
  currency: 'CAD',
  defaultRetention: 3,
  incomeCategories: ['Salary', 'Bonus', 'Investment Income', 'Other'],
  expenseCategories: ['Dining', 'Transport', 'Housing', 'Shopping', 'Entertainment', 'Healthcare', 'Other']
};
var defaultRetention = APP_CONFIG.defaultRetention;
var INCOME_CATS = APP_CONFIG.incomeCategories.slice();
var EXPENSE_CATS = APP_CONFIG.expenseCategories.slice();
function applyConfig(cfg) {
  if (!cfg || typeof cfg !== 'object') return;
  function goodCats(list) {
    return Array.isArray(list) && list.length > 0 && list.every(function (c) { return typeof c === 'string' && !!c; });
  }
  if (goodCats(cfg.incomeCategories)) INCOME_CATS = cfg.incomeCategories.slice();
  if (goodCats(cfg.expenseCategories)) EXPENSE_CATS = cfg.expenseCategories.slice();
  if (typeof cfg.defaultRetention === 'number' && cfg.defaultRetention >= 1 && cfg.defaultRetention <= 12) {
    defaultRetention = Math.floor(cfg.defaultRetention);
  }
  if (typeof cfg.appName === 'string' && cfg.appName) {
    document.title = cfg.appName;
    var brand = document.querySelector('.brand');
    if (brand) brand.textContent = cfg.appName;
  }
  var entryModal = document.getElementById ? document.getElementById('modal-entry') : null;
  if (entryModal && entryModal.classList && entryModal.classList.contains('open')) {
    setEntryType(entryType);
  }
}
function fetchConfig() {
  if (typeof fetch !== 'function') return;
  var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 2000); });
  var req = fetch('./finance-audit.json').then(function (res) { return res.ok ? res.json() : null; }).catch(function () { return null; });
  Promise.race([req, timeout]).then(function (cfg) { if (cfg) applyConfig(cfg); });
}
fetchConfig();
var NAME_RE = /^[A-Za-z]{2,6}$/;

function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function pad(n) { return (n < 10 ? '0' : '') + n; }
function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function fmtMoney(n) {
  var v = (Math.round(n * 100) / 100).toFixed(2);
  var parts = v.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return 'CA$' + parts.join('.');
}
var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtDate(ds) {
  var p = String(ds).split('-');
  return MONTHS_SHORT[parseInt(p[1], 10) - 1] + ' ' + parseInt(p[2], 10) + ', ' + p[0];
}
function monthTitle(y, m) { return MONTHS[m - 1] + ' ' + y; }
function monthsLabel(m) { m = parseInt(m, 10) || 0; return m + (m === 1 ? ' month' : ' months'); }
function fmtDateObj(d) {
  return MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}
function fmtDateTime(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return MONTHS_SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ================= Toast ================= */
var toastTimer = null;
function toast(msg, isErr) {
  if (isErr) sfxFail();
  var t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = 'toast'; }, 2600);
}

/* ================= Sound: Web Audio live synthesis, no external audio ================= */
var LS_SOUND = 'finance-audit-v1:sound';
function loadSoundSetting() {
  try { return localStorage.getItem(LS_SOUND) !== '0'; } catch (e) { return true; }
}
var soundOn = loadSoundSetting();
var audioCtx = null;
function unlockAudio() {
  if (!soundOn) return;
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {}
}
document.addEventListener('pointerdown', unlockAudio, { passive: true });
document.addEventListener('keydown', unlockAudio);
function playTone(freq, delay, dur, type, vol) {
  if (!soundOn || !audioCtx) return;
  try {
    var t0 = audioCtx.currentTime + delay;
    var o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  } catch (e) {}
}
function sfxClick() { unlockAudio(); playTone(1100, 0, 0.05, 'triangle', 0.02); }
function sfxSuccess() { unlockAudio(); playTone(660, 0, 0.12, 'sine', 0.05); playTone(880, 0.09, 0.14, 'sine', 0.05); }
function sfxFail() { unlockAudio(); playTone(170, 0, 0.13, 'sine', 0.05); }
function saveSoundSetting() { try { localStorage.setItem(LS_SOUND, soundOn ? '1' : '0'); } catch (e) {} }

/* ================= Password hashing: SHA-256 first, fallback never stores plain text ================= */
function hex(buf) {
  var a = new Uint8Array(buf), s = '';
  for (var i = 0; i < a.length; i++) s += ('0' + a[i].toString(16)).slice(-2);
  return s;
}
function fallbackHash(salt, pw) {
  var h1 = 2166136261, h2 = 5381;
  var s = salt + ':' + pw;
  for (var r = 0; r < 1000; r++) {
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 16777619) >>> 0;
      h2 = (Math.imul(h2, 33) ^ c) >>> 0;
    }
    s = h1.toString(16) + h2.toString(16);
  }
  return ('00000000' + h1.toString(16)).slice(-8) + ('00000000' + h2.toString(16)).slice(-8);
}
function makeSalt() {
  try {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return hex(a);
  } catch (e) {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
}
function hashBoth(salt, pw) {
  var fb = fallbackHash(salt, pw);
  try {
    var sub = window.crypto && window.crypto.subtle;
    if (sub) {
      return sub.digest('SHA-256', new TextEncoder().encode(salt + ':' + pw)).then(function (buf) {
        return { hash256: hex(buf), hashFallback: fb };
      });
    }
  } catch (e) { /* Fallback */ }
  return Promise.resolve({ hash256: null, hashFallback: fb });
}
function verifyPw(user, pw) {
  var sub = window.crypto && window.crypto.subtle;
  if (sub && user.hash256) {
    return sub.digest('SHA-256', new TextEncoder().encode(user.salt + ':' + pw)).then(function (buf) {
      return hex(buf) === user.hash256;
    });
  }
  return Promise.resolve(fallbackHash(user.salt, pw) === user.hashFallback);
}

/* ================= Storage ================= */
function loadUsers() {
  try { return JSON.parse(localStorage.getItem(LS_USERS) || 'null'); } catch (e) { return null; }
}
function loadRecords() {
  try {
    var r = JSON.parse(localStorage.getItem(LS_RECORDS) || '[]');
    return Array.isArray(r) ? r : [];
  } catch (e) { return []; }
}
function saveUsers(u) { return saveVerified(LS_USERS, u); }
function saveRecords(r) { return saveVerified(LS_RECORDS, r); }
var LS_RETENTION = 'finance-audit-v1:retention';
function loadRetention() {
  var v = parseInt(localStorage.getItem(LS_RETENTION) || String(defaultRetention), 10);
  if (isNaN(v) || v < 1 || v > 12) return defaultRetention;
  return v;
}
function saveRetention(m) { return writeVerified(LS_RETENTION, String(m)); }
/* Single-amount money model: carried-forward and opening balances are plain numbers.
   Old {cash, book} pairs merge into one total (cash + book) so totals never change. */
function normalizeMoney(v) {
  if (typeof v === 'number' && isFinite(v)) return Math.round(v * 100) / 100;
  if (v && typeof v.cash === 'number' && typeof v.book === 'number')
    return Math.round(((v.cash || 0) + (v.book || 0)) * 100) / 100;
  return 0;
}
var LS_CARRY = 'finance-audit-v1:carry';
function loadCarry() {
  try { return normalizeMoney(JSON.parse(localStorage.getItem(LS_CARRY) || 'null')); }
  catch (e) { return 0; }
}
function saveCarry(c) { return saveVerified(LS_CARRY, c); }
/* Opening balance: money held before bookkeeping started, editable anytime in Settings.
   Total Balance = Opening Balance + Carried Forward + all posted net. */
var LS_INITIAL = 'finance-audit-v1:initial';
function loadInitial() {
  try { return normalizeMoney(JSON.parse(localStorage.getItem(LS_INITIAL) || 'null')); }
  catch (e) { return 0; }
}
function saveInitial(v) { return saveVerified(LS_INITIAL, v); }
/* Display mapping for legacy Chinese categories (stored values untouched). */
var CAT_MAP = {'工资': 'Salary', '奖金': 'Bonus', '投资收益': 'Investment Income',
  '餐饮': 'Dining', '交通': 'Transport', '住房': 'Housing', '购物': 'Shopping',
  '娱乐': 'Entertainment', '医疗': 'Healthcare', '其他': 'Other'};
function catLabel(c) { return CAT_MAP[c] || c || ''; }
/* Password rule: exactly 6 characters — 2 letters + 4 digits, any order, letters case-sensitive.
   Applies only when setting or changing a password; sign-in compares hashes only. */
function validPassword(p) {
  if (typeof p !== 'string' || p.length !== 6) return false;
  if (!/^[A-Za-z0-9]{6}$/.test(p)) return false;
  var letters = (p.match(/[A-Za-z]/g) || []).length;
  var digits = (p.match(/[0-9]/g) || []).length;
  return letters === 2 && digits === 4;
}
var PW_MSG = 'Password must be 6 characters: exactly 2 letters and 4 digits (letters are case-sensitive)';
/* Account names are payer and payee. Stored users with any other name must claim one.
   This is checked on every load (not a one-time flag), so restoring an old backup re-opens it. */
function needsClaim() {
  return !!users && users.length > 0 &&
    users.some(function (u) { return u.name !== 'payer' && u.name !== 'payee'; });
}
function otherName(name) { return name === 'payer' ? 'payee' : 'payer'; }
function stripUserRoles(list) {
  if (Array.isArray(list)) list.forEach(function (u) { if (u) delete u.role; });
}
/* Notifications: same namespace as the ledger, kept permanently, never cleaned by the transaction retention rule */
var LS_NOTES = 'finance-audit-v1:notes';
function loadNotes() {
  try {
    var n = JSON.parse(localStorage.getItem(LS_NOTES) || '[]');
    return Array.isArray(n) ? n : [];
  } catch (e) { return []; }
}
function saveNotes(n) { return saveVerified(LS_NOTES, n); }

/* ================= Data safety layer: verify-after-write, auto backup, validation, cleanup log ================= */
var LS_AUTO1 = 'finance-audit-v1:auto-backup';
var LS_AUTO2 = 'finance-audit-v1:auto-backup-prev';
var LS_CLEANLOG = 'finance-audit-v1:clean-log';
/* Verify after write: read back and compare right after writing; retry once on mismatch; return false on failure (callers must not treat it as saved) */
function writeVerified(key, json) {
  var ok = false;
  try { localStorage.setItem(key, json); ok = (localStorage.getItem(key) === json); } catch (e) { ok = false; }
  if (!ok) {
    try { localStorage.setItem(key, json); ok = (localStorage.getItem(key) === json); } catch (e2) { ok = false; }
  }
  return ok;
}
function saveVerified(key, val) {
  var json;
  try { json = JSON.stringify(val); } catch (e) { return false; }
  return writeVerified(key, json);
}
/* Legacy records: a missing method field is ignored; a missing status defaults to posted for income and pending for expense; everything else is kept as is */
function normalizeRecords(list) {
  if (!Array.isArray(list)) return [];
  return list.map(function (r) {
    if (!r || typeof r !== 'object') return null;
    var n = {};
    for (var k in r) n[k] = r[k];
    n.id = (typeof r.id === 'string' && r.id) ? r.id : uid();
    n.category = (typeof r.category === 'string') ? r.category : '';
    n.note = (typeof r.note === 'string') ? r.note : '';
    n.by = (typeof r.by === 'string') ? r.by : '';
    n.createdAt = (typeof r.createdAt === 'string') ? r.createdAt : '';
    n.confirmedBy = (typeof r.confirmedBy === 'string') ? r.confirmedBy : null;
    n.confirmedAt = (typeof r.confirmedAt === 'string') ? r.confirmedAt : null;
    if (n.status !== 'posted' && n.status !== 'pending' && n.status !== 'rejected') {
      n.status = (n.type === 'income') ? 'posted' : 'pending';
    }
    return n;
  }).filter(function (r) { return !!r; });
}
function isValidUser(u) {
  return !!u && NAME_RE.test(u.name) && typeof u.salt === 'string' && !!u.salt &&
    (typeof u.hash256 === 'string' || typeof u.hashFallback === 'string');
}
function isValidUsers(v) {
  return Array.isArray(v) && v.length >= 1 && v.length <= 2 && v.every(isValidUser) &&
    (v.length < 2 || v[0].name !== v[1].name);
}
function isValidRecord(r) {
  return !!r && (r.type === 'income' || r.type === 'expense') &&
    typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
    typeof r.amount === 'number' && isFinite(r.amount) && r.amount > 0 &&
    (r.status === 'posted' || r.status === 'pending' || r.status === 'rejected') &&
    typeof r.id === 'string' && !!r.id;
}
function isValidRecords(v) { return Array.isArray(v) && v.every(isValidRecord); }
function isValidNotes(v) {
  return Array.isArray(v) && v.every(function (n) {
    return !!n && typeof n.id === 'string' && typeof n.from === 'string' && typeof n.content === 'string' &&
      typeof n.createdAt === 'string' && (n.readAt === null || typeof n.readAt === 'string');
  });
}
function isMoneyValue(v) {
  return typeof v === 'number' && isFinite(v);
}
function isMoneyPairLegacy(v) {
  return !!v && typeof v.cash === 'number' && isFinite(v.cash) && typeof v.book === 'number' && isFinite(v.book);
}
function isValidSnapshot(s) {
  return !!s && s.app === 'finance-audit' && isValidUsers(s.users) && isValidRecords(s.records) &&
    isMoneyValue(s.carry) && isMoneyValue(s.initial) && isValidNotes(s.notes) &&
    typeof s.retention === 'number' && s.retention >= 1 && s.retention <= 12 &&
    (s.sound === undefined || typeof s.sound === 'boolean');
}
/* Snapshot: one copy after each successful save (latest + previous); key names unchanged, old data stays readable */
function makeSnapshot() {
  return { app: 'finance-audit', version: 1, savedAt: new Date().toISOString(),
    users: users, records: records, carry: carry, initial: initial, notes: notes,
    retention: loadRetention(), sound: soundOn };
}
function autoBackup() {
  try {
    var prev = null;
    try { prev = localStorage.getItem(LS_AUTO1); } catch (e) {}
    if (prev) { try { localStorage.setItem(LS_AUTO2, prev); } catch (e) {} }
    localStorage.setItem(LS_AUTO1, JSON.stringify(makeSnapshot()));
  } catch (e) {}
}
function readAuto(key) {
  var raw;
  try { raw = localStorage.getItem(key); } catch (e) { return null; }
  if (!raw) return null;
  try {
    var s = JSON.parse(raw);
    s.records = normalizeRecords(s.records);
    s.carry = normalizeMoney(s.carry);
    s.initial = normalizeMoney(s.initial);
    return isValidSnapshot(s) ? s : null;
  } catch (e) { return null; }
}
function loadCleanLog() {
  try {
    var v = JSON.parse(localStorage.getItem(LS_CLEANLOG) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}
function pushCleanLog(entry) {
  try {
    var log = loadCleanLog();
    log.unshift(entry);
    localStorage.setItem(LS_CLEANLOG, JSON.stringify(log.slice(0, 20)));
  } catch (e) {}
}
/* Retention cutoff: the same day months ago (last day of the month when the month is shorter) */
function cutoffDate(months) {
  var d = new Date();
  var y = d.getFullYear(), m = d.getMonth() + 1 - months;
  while (m < 1) { m += 12; y -= 1; }
  var last = new Date(y, m, 0).getDate();
  var day = Math.min(d.getDate(), last);
  return y + '-' + pad(m) + '-' + pad(day);
}
/* Cleanup: delete income and expenses dated before the retention cutoff, except two —
   the latest income and the latest expense by transaction date (posted or not); those two are never deleted.
   Carried forward: the deleted posted net is added to the carried-forward balance; the next cleanup recomputes with the same formula,
   never double-counting. Deleting 0 records shows no message. Returns the number deleted. */
function runRetentionCleanup(showToast) {
  var months = loadRetention();
  var cut = cutoffDate(months);
  var latestInc = null, latestExp = null;
  records.forEach(function (r) {
    var cur = r.type === 'income' ? latestInc : latestExp;
    if (!cur || r.date > cur.date || (r.date === cur.date && r.createdAt > cur.createdAt)) {
      if (r.type === 'income') latestInc = r; else latestExp = r;
    }
  });
  function keep(r) {
    if (r.date >= cut) return true;
    if (latestInc && r.id === latestInc.id) return true;
    if (latestExp && r.id === latestExp.id) return true;
    return false;
  }
  var deleted = records.filter(function (r) { return !keep(r); });
  if (!deleted.length) return 0;
  var delInc = 0, delExp = 0, delIncAmt = 0, delExpAmt = 0;
  deleted.forEach(function (r) {
    if (r.type === 'income') { delInc++; delIncAmt += r.amount; } else { delExp++; delExpAmt += r.amount; }
  });
  var c = loadCarry();
  var carryBefore = c;
  var di = deleted.filter(function (r) { return r.type === 'income' && r.status === 'posted'; })
    .reduce(function (s, r) { return s + r.amount; }, 0);
  var de = deleted.filter(function (r) { return r.type === 'expense' && r.status === 'posted'; })
    .reduce(function (s, r) { return s + r.amount; }, 0);
  c = Math.round((c + di - de) * 100) / 100;
  autoBackup(); // Pre-cleanup snapshot: back up before deleting
  var oldRecords = records;
  var nextRecords = records.filter(keep);
  if (!saveRecords(nextRecords)) { toast('Cleanup save failed. Cleanup was not performed.', true); return 0; }
  records = nextRecords;
  carry = c;
  if (!saveCarry(c)) {
    if (saveRecords(oldRecords)) { records = oldRecords; carry = carryBefore; }
    toast('Cleanup save failed and was rolled back. Please try again.', true);
    return 0;
  }
  pushCleanLog({ at: new Date().toISOString(), delInc: delInc, delIncAmt: Math.round(delIncAmt * 100) / 100,
    delExp: delExp, delExpAmt: Math.round(delExpAmt * 100) / 100,
    carryBefore: carryBefore, carryAfter: c });
  if (showToast) toast('Cleaned up ' + delInc + ' income and ' + delExp + ' expense records. Balances carried forward.');
  return deleted.length;
}

/* ================= State: validated at startup, auto-restored from backup if damaged ================= */
function readRawPart(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function parsePart(raw, fallback) {
  if (raw === null || raw === undefined) return { missing: true, corrupt: false, value: fallback };
  try { return { missing: false, corrupt: false, value: JSON.parse(raw) }; }
  catch (e) { return { missing: false, corrupt: true, value: fallback }; }
}
var bootUsersP = parsePart(readRawPart(LS_USERS), null);
var bootRecordsP = parsePart(readRawPart(LS_RECORDS), []);
var bootNotesP = parsePart(readRawPart(LS_NOTES), []);
var bootCarryP = parsePart(readRawPart(LS_CARRY), null);
var bootInitialP = parsePart(readRawPart(LS_INITIAL), null);
var bootRet = parseInt(readRawPart(LS_RETENTION) || String(defaultRetention), 10);
var users = bootUsersP.value;
stripUserRoles(users);
var records = bootRecordsP.corrupt ? [] : normalizeRecords(bootRecordsP.value);
var notes = bootNotesP.value;
var carry = normalizeMoney(bootCarryP.value);
var initial = normalizeMoney(bootInitialP.value);
var dataBroken = false;
var recoveredFromBackup = false;
var recoveryInfo = '';
(function bootCheck() {
  var freshInstall = (users === null && records.length === 0 && !bootUsersP.corrupt && !bootRecordsP.corrupt);
  var usersOk = !bootUsersP.corrupt && (freshInstall || isValidUsers(users));
  var recordsOk = !bootRecordsP.corrupt && Array.isArray(bootRecordsP.value) && isValidRecords(records);
  var secondaryBad = bootNotesP.corrupt || bootCarryP.corrupt || bootInitialP.corrupt ||
    !isValidNotes(notes) || !isMoneyValue(carry) || !isMoneyValue(initial) ||
    isNaN(bootRet) || bootRet < 1 || bootRet > 12;
  if (usersOk && recordsOk && !secondaryBad) return;
  var snap = readAuto(LS_AUTO1) || readAuto(LS_AUTO2);
  if (snap) {
    users = snap.users; stripUserRoles(users); records = normalizeRecords(snap.records); notes = snap.notes;
    carry = normalizeMoney(snap.carry);
    initial = normalizeMoney(snap.initial);
    soundOn = snap.sound !== false;
    saveUsers(users); saveRecords(records); saveNotes(notes); saveCarry(carry); saveInitial(initial);
    saveRetention(snap.retention); saveSoundSetting();
    recoveredFromBackup = true;
    return;
  }
  if (!usersOk || !recordsOk) {
    dataBroken = true;
    var parts = [];
    if (!usersOk) parts.push('User data could not be read');
    if (!recordsOk) parts.push('Transaction records could not be read');
    if (secondaryBad) parts.push('Some settings data is abnormal');
    recoveryInfo = parts.join('；') + '。';
    users = Array.isArray(users) ? users : null;
    records = Array.isArray(records) ? records : [];
    return;
  }
  /* Only secondary data is abnormal and no backup exists: use defaults, leave main data alone */
  if (!isValidNotes(notes)) notes = [];
  if (!isMoneyValue(carry)) carry = 0;
  if (!isMoneyValue(initial)) initial = 0;
})();
var me = null;            // Currently signed-in user
var viewYear, viewMonth;  // Year and month being viewed
var tab = 'all';
var entryType = 'expense';
var pickerYear, pickerMonth;
var detailId = null;
var confirmAction = null; // Confirm dialog callback
var pendingLoginUser = null;
var lastTotals = null;    // Last total balance (for the fade-in animation on change)

function initViewMonth() {
  var d = new Date();
  viewYear = d.getFullYear();
  viewMonth = d.getMonth() + 1;
}
initViewMonth();

/* ================= View switching ================= */
function showView(id) {
  ['view-setup', 'view-claim', 'view-login', 'view-app', 'view-recovery'].forEach(function (v) {
    $(v).classList.toggle('active', v === id);
  });
  document.body.style.overflow = '';
}
function openModal(id) {
  $(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  $(id).classList.remove('open');
  if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
}
function askConfirm(title, text, yesLabel, cb) {
  $('confirm-title').textContent = title;
  $('confirm-text').textContent = text;
  $('btn-confirm-yes').textContent = yesLabel || 'OK';
  confirmAction = cb;
  openModal('modal-confirm');
}

/* ================= First-time setup: pick payer or payee, set a password ================= */
function setErr(id, msg) { $(id).textContent = msg || ''; }
var setupType = null;
function setSetupType(t) {
  setupType = t;
  $('setup-type-payer').className = t === 'payer' ? 'on' : '';
  $('setup-type-payee').className = t === 'payee' ? 'on' : '';
  setErr('setup-type-err', '');
}
$('setup-type-payer').addEventListener('click', function () { setSetupType('payer'); });
$('setup-type-payee').addEventListener('click', function () { setSetupType('payee'); });
function validSetup() {
  var p1 = $('setup-pw1').value;
  var ok = true;
  setErr('setup-pw1-err', ''); setErr('setup-type-err', '');
  if (!validPassword(p1)) { setErr('setup-pw1-err', PW_MSG); ok = false; }
  if (setupType !== 'payer' && setupType !== 'payee') { setErr('setup-type-err', 'Please select an account type'); ok = false; }
  return ok ? { name: setupType, p1: p1 } : null;
}
$('btn-setup-start').addEventListener('click', function () {
  var v = validSetup();
  if (!v) { toast('Please fix the highlighted fields', true); return; }
  var job = { n: v.name, p: v.p1, s: makeSalt() };
  hashBoth(job.s, job.p).then(function (h) {
    users = [{ name: job.n, salt: job.s, hash256: h.hash256, hashFallback: h.hashFallback }];
    records = [];
    if (!saveUsers(users) || !saveRecords(records)) { toast('Save failed. Please try again.', true); return; }
    autoBackup();
    toast('Setup complete. Please sign in.');
    sfxSuccess();
    renderLogin();
  });
});

/* ================= Account claim: rename legacy users + their records/notes ================= */
var claimSel = {};
function renderClaim() {
  showView('view-claim');
  var taken = {};
  users.forEach(function (u) {
    if (u.name === 'payer' || u.name === 'payee') taken[u.name] = true;
  });
  var legacy = users.filter(function (u) { return u.name !== 'payer' && u.name !== 'payee'; });
  claimSel = {};
  legacy.forEach(function (u) {
    var free = ['payer', 'payee'].filter(function (t) { return !taken[t]; });
    claimSel[u.name] = (legacy.length === 1 && free.length === 1) ? free[0] : null;
  });
  var wrap = $('claim-list');
  wrap.innerHTML = '';
  legacy.forEach(function (u) {
    var card = document.createElement('div');
    card.className = 'card';
    var seg = document.createElement('div');
    seg.className = 'seg';
    seg.setAttribute('role', 'group');
    var bp = document.createElement('button');
    bp.type = 'button'; bp.textContent = 'Payer';
    var bq = document.createElement('button');
    bq.type = 'button'; bq.textContent = 'Payee';
    bp.disabled = !!taken['payer'];
    bq.disabled = !!taken['payee'];
    bp.addEventListener('click', function () { pick('payer'); });
    bq.addEventListener('click', function () { pick('payee'); });
    function pick(r) {
      claimSel[u.name] = r;
      legacy.forEach(function (o) {
        if (o.name !== u.name && claimSel[o.name] === r) {
          claimSel[o.name] = (r === 'payer') ? 'payee' : 'payer';
        }
      });
      paintAll();
    }
    seg.appendChild(bp); seg.appendChild(bq);
    var lab = document.createElement('label');
    lab.textContent = u.name;
    card.appendChild(lab); card.appendChild(seg);
    wrap.appendChild(card);
  });
  function paintAll() {
    var cards = wrap.children;
    for (var i = 0; i < cards.length; i++) {
      var btns = cards[i].querySelectorAll('.seg button');
      var nm = legacy[i].name;
      if (btns[0]) btns[0].className = claimSel[nm] === 'payer' ? 'on' : '';
      if (btns[1]) btns[1].className = claimSel[nm] === 'payee' ? 'on' : '';
    }
    var all = legacy.every(function (x) { return !!claimSel[x.name]; });
    var vals = legacy.map(function (x) { return claimSel[x.name]; });
    var diff = vals[0] !== vals[1];
    var collision = legacy.some(function (x) { return !!taken[claimSel[x.name]]; });
    $('btn-claim-save').disabled = !(all && diff && !collision);
    setErr('claim-err', '');
  }
  paintAll();
}
$('btn-claim-save').addEventListener('click', function () {
  var legacy = users.filter(function (u) { return u.name !== 'payer' && u.name !== 'payee'; });
  var all = legacy.every(function (x) { return !!claimSel[x.name]; });
  if (!all) { setErr('claim-err', 'Please assign each account'); return; }
  var map = {};
  legacy.forEach(function (u) { map[u.name] = claimSel[u.name]; });
  users.forEach(function (u) {
    if (map[u.name]) u.name = map[u.name];
    delete u.role;
  });
  records.forEach(function (r) {
    if (map[r.by]) r.by = map[r.by];
    if (r.confirmedBy && map[r.confirmedBy]) r.confirmedBy = map[r.confirmedBy];
  });
  notes.forEach(function (n) {
    if (map[n.from]) n.from = map[n.from];
    if (map[n.to]) n.to = map[n.to];
  });
  if (!saveUsers(users) || !saveRecords(records) || !saveNotes(notes)) {
    toast('Save failed. Please try again.', true); return;
  }
  autoBackup();
  sfxSuccess();
  toast('Accounts assigned. Please sign in.');
  renderLogin();
});

/* ================= Sign in ================= */
function renderLogin() {
  showView('view-login');
  var wrap = $('login-cards');
  wrap.innerHTML = '';
  users.forEach(function (u) {
    var b = document.createElement('button');
    b.className = 'user-card';
    b.type = 'button';
    b.innerHTML = '<div class="avatar">' + esc(u.name.charAt(0).toUpperCase()) + '</div>' +
      '<div><div class="nm">' + esc(u.name) + '</div><div class="hint">Tap to sign in</div></div>';
    b.addEventListener('click', function () {
      pendingLoginUser = u;
      wrap.querySelectorAll('.user-card').forEach(function (c) { c.classList.remove('selected'); });
      b.classList.add('selected');
      $('login-form').style.display = 'block';
      $('login-who').textContent = u.name;
      $('login-pw').value = '';
      setErr('login-pw-err', '');
      $('login-pw').focus();
    });
    wrap.appendChild(b);
  });
  $('login-form').style.display = 'none';
  $('login-pw').value = '';
  /* Show "Add User" with one user; hide it with two */
  $('btn-adduser-login').style.display = (users.length < 2) ? 'block' : 'none';
}
function doLogin() {
  if (!pendingLoginUser) { toast('Please tap your account first.', true); return; }
  var pw = $('login-pw').value;
  setErr('login-pw-err', '');
  verifyPw(pendingLoginUser, pw).then(function (ok) {
    if (!ok) { setErr('login-pw-err', 'Incorrect password.'); return; }
    me = pendingLoginUser;
    pendingLoginUser = null;
    toast('Welcome back, ' + me.name);
    renderApp();
  });
}
$('btn-login').addEventListener('click', doLogin);
$('login-pw').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') doLogin();
});
$('login-pw').addEventListener('input', function () {
  this.value = this.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6);
});

/* ================= Main view rendering ================= */
function ymKey(y, m) { return y + '-' + pad(m); }
function monthRecords(y, m) {
  var k = ymKey(y, m);
  return records.filter(function (r) { return r.date.indexOf(k) === 0; });
}
function yearRecords(y) {
  return records.filter(function (r) { return r.date.indexOf(String(y) + '-') === 0; });
}
function sumPosted(list, type) {
  return list.filter(function (r) { return r.type === type && r.status === 'posted'; })
    .reduce(function (s, r) { return s + r.amount; }, 0);
}
function pendingOf(list) {
  return list.filter(function (r) { return r.type === 'expense' && r.status === 'pending'; });
}
function otherUser() {
  return users.filter(function (u) { return u.name !== me.name; })[0] || null;
}
function pendingForMe(list) {
  var other = otherUser();
  if (!other) return [];
  return list.filter(function (r) {
    return r.type === 'expense' && r.status === 'pending' && r.by === other.name;
  });
}
function statusLabel(r) {
  if (r.status === 'posted') return 'Posted';
  if (r.status === 'pending') return r.by === me.name ? 'Pending Approval' : 'Awaiting Your Approval';
  return 'Rejected';
}
function statusClass(r) {
  if (r.status === 'posted') return 'posted';
  if (r.status === 'pending') return 'pending';
  return 'rejected';
}
function renderApp() {
  showView('view-app');
  $('who-line').textContent = 'Signed in as ' + me.name;
  renderMonth();
}
function renderMonth() {
  $('btn-month-title').textContent = monthTitle(viewYear, viewMonth);
  var list = monthRecords(viewYear, viewMonth);
  var inc = sumPosted(list, 'income');
  var exp = sumPosted(list, 'expense');
  $('stat-income').textContent = fmtMoney(inc);
  $('stat-expense').textContent = fmtMoney(exp);
  $('stat-balance').textContent = fmtMoney(inc - exp);
  var pend = pendingOf(list);
  var pl = $('pending-line');
  if (pend.length) {
    var pendAmt = pend.reduce(function (s, r) { return s + r.amount; }, 0);
    pl.style.display = 'block';
    pl.textContent = 'Pending Approval: ' + pend.length + ' entries, ' + fmtMoney(pendAmt) +
      ' (not included in expense totals until approved)';
  } else {
    pl.style.display = 'none';
  }
  var yl = yearRecords(viewYear);
  var yInc = sumPosted(yl, 'income');
  var yExp = sumPosted(yl, 'expense');
  $('year-line').innerHTML = 'Income ' + fmtMoney(yInc) +
    '　Expenses ' + fmtMoney(yExp) +
    '　Balance ' + fmtMoney(yInc - yExp);
  var totInc = sumPosted(records, 'income');
  var totExp = sumPosted(records, 'expense');
  /* Total Balance = Opening Balance + Carried Forward + all posted net.
     This Month / This Year cover current-period activity only, excluding Opening Balance. */
  var bal = initial + carry + totInc - totExp;
  $('total-balance').textContent = fmtMoney(bal);
  $('initial-line').textContent = 'Of which Opening Balance ' + fmtMoney(initial);
  /* Brief fade-in when totals actually change */
  if (lastTotals === null || lastTotals !== bal) {
    lastTotals = bal;
    ['total-balance'].forEach(function (id) {
      var el = $(id);
      el.classList.remove('num-flash');
      void el.offsetWidth;
      el.classList.add('num-flash');
      setTimeout(function () { el.classList.remove('num-flash'); }, 500);
    });
  }
  var cl = $('carry-line');
  if (carry !== 0) {
    cl.style.display = 'block';
    cl.textContent = 'Of which Carried Forward ' + fmtMoney(carry) + ' (older transactions cleaned up)';
  } else {
    cl.style.display = 'none';
  }
  var badge = $('pending-badge');
  var forMe = pendingForMe(records);
  badge.style.display = forMe.length ? 'inline-flex' : 'none';
  badge.textContent = forMe.length;
  updateNotesBadge();
  renderList();
}
function txRow(r) {
  var b = document.createElement('button');
  b.className = 'tx';
  b.type = 'button';
  b.setAttribute('data-id', r.id);
  var amtCls = r.type === 'income' ? 'in' : 'out';
  var sign = r.type === 'income' ? '+' : '−';
  b.innerHTML = '<div><div class="cat">' + esc(catLabel(r.category)) + '</div>' +
    '<div class="meta">' + fmtDate(r.date) + ' · ' + esc(r.by) +
    (r.note ? ' · ' + esc(r.note) : '') + '</div></div>' +
    '<span class="pill ' + statusClass(r) + '">' + statusLabel(r) + '</span>' +
    '<span class="amt ' + amtCls + '">' + sign + fmtMoney(r.amount) + '</span>';
  b.addEventListener('click', function () { openDetail(r.id); });
  return b;
}
function pendingRow(r, withActions) {
  var row = document.createElement('div');
  row.className = 'card';
  row.style.marginBottom = '10px';
  var amtCls = 'out';
  var html = '<div style="display:flex; align-items:center; gap:12px;">' +
    '<div style="flex:1;"><div style="font-weight:700;">' + esc(catLabel(r.category)) + '</div>' +
    '<div style="font-size:13px; color:var(--text-sub); margin-top:3px;">' +
    fmtDate(r.date) + ' · Submitted by ' + esc(r.by) +
    (r.note ? ' · ' + esc(r.note) : '') + '</div></div>' +
    '<span class="amt ' + amtCls + '" style="font-weight:800;">−' + fmtMoney(r.amount) + '</span></div>';
  if (withActions) {
    html += '<div class="row" style="margin-top:12px;">' +
      '<button class="btn confirm" type="button" data-act="confirm" data-id="' + r.id + '">Approve</button>' +
      '<button class="btn reject" type="button" data-act="reject" data-id="' + r.id + '">Reject</button></div>';
  } else {
    html += '<div class="wait-note" style="margin:8px 0 0; text-align:right;">Awaiting approval</div>';
  }
  row.innerHTML = html;
  row.querySelectorAll('[data-act]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (btn.getAttribute('data-act') === 'confirm') confirmTx(r.id);
      else rejectTx(r.id);
    });
  });
  return row;
}
function emptyBlock(text) {
  var d = document.createElement('div');
  d.className = 'card empty';
  var src = '';
  var logo = document.querySelector('.logo-login');
  if (logo && logo.src) src = logo.src;
  d.innerHTML = (src ? '<img class="empty-cat" src="' + src + '" alt="">' : '') + '<div>' + text + '</div>';
  return d;
}
function renderList() {
  document.querySelectorAll('.tab').forEach(function (t) {
    t.classList.toggle('active', t.getAttribute('data-tab') === tab);
  });
  var pg = $('pending-group');
  pg.innerHTML = '';
  if (tab === 'notes') { renderNotes(); return; }
  var monthList = monthRecords(viewYear, viewMonth);
  if (tab === 'all') {
    var forMe = pendingForMe(monthList);
    if (forMe.length) {
      var gt = document.createElement('div');
      gt.className = 'group-title';
      gt.textContent = 'Awaiting Your Approval (' + forMe.length + ')';
      pg.appendChild(gt);
      forMe.forEach(function (r) { pg.appendChild(pendingRow(r, true)); });
    }
  }
  var list = monthList.slice();
  if (tab === 'income') list = list.filter(function (r) { return r.type === 'income'; });
  if (tab === 'expense') list = list.filter(function (r) { return r.type === 'expense'; });
  if (tab === 'pending') list = pendingOf(list);
  list.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
  var wrap = $('tx-list-wrap');
  wrap.innerHTML = '';
  if (!list.length && !(tab === 'all' && pendingForMe(monthList).length)) {
    var msg = tab === 'pending' ? 'No expenses pending approval' :
      tab === 'income' ? 'No income this month' :
      tab === 'expense' ? 'No expenses this month' : 'No transactions this month';
    wrap.appendChild(emptyBlock(msg));
    return;
  }
  if (tab === 'pending') {
    list.forEach(function (r) {
      wrap.appendChild(pendingRow(r, r.by !== me.name));
    });
    return;
  }
  var box = document.createElement('div');
  box.className = 'tx-list';
  list.forEach(function (r) { box.appendChild(txRow(r)); });
  wrap.appendChild(box);
}

/* ================= Notifications ================= */
/* Unread count: only messages from the other account that you have not read */
function unreadNotesCount() {
  if (!me) return 0;
  return notes.filter(function (n) { return n.from !== me.name && !n.readAt; }).length;
}
function updateNotesBadge() {
  var b = $('notes-badge');
  if (!b) return;
  var c = unreadNotesCount();
  b.style.display = c ? 'inline-flex' : 'none';
  b.textContent = c;
}
/* Read labels: received messages show read/unread; sent messages show whether the other account read them */
function noteTag(n) {
  if (n.from === me.name) {
    return n.readAt
      ? '<span class="pill rejected">Read by other · ' + fmtDateTime(n.readAt) + '</span>'
      : '<span class="pill pending">Unread by other</span>';
  }
  return n.readAt
    ? '<span class="pill rejected">Read · ' + fmtDateTime(n.readAt) + '</span>'
    : '<span class="pill pending">Unread</span>';
}
function renderNotes() {
  var draft = '';
  var old = $('note-input');
  if (old) draft = old.value;
  var wrap = $('tx-list-wrap');
  wrap.innerHTML = '';
  var comp = document.createElement('div');
  comp.className = 'card';
  comp.innerHTML = '<div class="field"><label for="note-input">Send a notification</label>' +
    '<textarea id="note-input" class="note-composer" maxlength="500" placeholder="e.g. This month’s property fee is paid. Please confirm."></textarea>' +
    '<div id="note-input-err" class="field-error"></div></div>' +
    '<div class="row"><button class="btn" type="button" id="btn-note-send">Send</button></div>';
  wrap.appendChild(comp);
  if (draft) $('note-input').value = draft;
  $('note-input').addEventListener('input', function () { setErr('note-input-err', ''); });
  $('btn-note-send').addEventListener('click', function () {
    var v = $('note-input').value.trim();
    if (!v) { setErr('note-input-err', 'Message cannot be empty.'); return; }
    setErr('note-input-err', '');
    notes.unshift({ id: uid(), from: me.name, content: v, createdAt: new Date().toISOString(), readAt: null });
    if (!saveNotes(notes)) { notes.shift(); toast('Save failed. Message was not sent. Please try again.', true); return; }
    autoBackup();
    renderNotes();
    sfxSuccess();
    toast('Message sent.');
  });
  var list = notes.slice().sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : -1; });
  if (!list.length) {
    wrap.appendChild(emptyBlock('No notifications.'));
    return;
  }
  var box = document.createElement('div');
  box.className = 'tx-list';
  list.forEach(function (n) {
    var row = document.createElement('button');
    row.className = 'tx';
    row.type = 'button';
    row.innerHTML = '<div style="flex:1; min-width:0;"><div class="cat">' + esc(n.from) + '</div>' +
      '<div class="meta">' + fmtDateTime(n.createdAt) + '</div>' +
      '<div class="note-content">' + esc(n.content) + '</div></div>' +
      noteTag(n);
    row.addEventListener('click', function () { openNoteDetail(n.id); });
    box.appendChild(row);
  });
  wrap.appendChild(box);
}
function openNoteDetail(id) {
  var n = null;
  for (var i = 0; i < notes.length; i++) if (notes[i].id === id) n = notes[i];
  if (!n) return;
  /* Only the recipient reading marks a message read; the sender viewing it changes nothing */
  if (n.from !== me.name && !n.readAt) {
    n.readAt = new Date().toISOString();
    if (saveNotes(notes)) { autoBackup(); updateNotesBadge(); }
    else { n.readAt = null; }
  }
  $('detail-body').innerHTML =
    '<div class="kv"><span class="k">From</span><span class="v">' + esc(n.from) + '</span></div>' +
    '<div class="kv"><span class="k">Sent At</span><span class="v">' + fmtDateTime(n.createdAt) + '</span></div>' +
    '<div class="kv"><span class="k">Content</span><span class="v note-content">' + esc(n.content) + '</span></div>' +
    '<div class="kv"><span class="k">Read Status</span><span class="v">' + noteTag(n) + '</span></div>';
  if (tab === 'notes') renderNotes();
  var foot = $('detail-foot');
  foot.innerHTML = '<button class="btn secondary" type="button" data-close="modal-detail">Close</button>';
  foot.querySelector('[data-close]').addEventListener('click', function () { closeModal('modal-detail'); });
  openModal('modal-detail');
}

/* ================= Month navigation and picker ================= */
function shiftMonth(d) {
  viewMonth += d;
  if (viewMonth < 1) { viewMonth = 12; viewYear -= 1; }
  if (viewMonth > 12) { viewMonth = 1; viewYear += 1; }
  renderMonth();
}
$('btn-prev-month').addEventListener('click', function () { shiftMonth(-1); });
$('btn-next-month').addEventListener('click', function () { shiftMonth(1); });
$('btn-month-title').addEventListener('click', function () {
  pickerYear = viewYear;
  pickerMonth = viewMonth;
  renderPicker();
  openModal('modal-picker');
});
function renderPicker() {
  $('picker-year').textContent = String(pickerYear);
  var g = $('picker-months');
  g.innerHTML = '';
  for (var m = 1; m <= 12; m++) {
    (function (mm) {
      var b = document.createElement('button');
      b.className = 'month-cell' + (mm === pickerMonth ? ' sel' : '');
      b.type = 'button';
      b.textContent = MONTHS_SHORT[mm - 1];
      b.addEventListener('click', function () {
        pickerMonth = mm;
        renderPicker();
      });
      g.appendChild(b);
    })(m);
  }
}
$('btn-year-prev').addEventListener('click', function () { pickerYear -= 1; renderPicker(); });
$('btn-year-next').addEventListener('click', function () { pickerYear += 1; renderPicker(); });
$('btn-picker-ok').addEventListener('click', function () {
  viewYear = pickerYear;
  viewMonth = pickerMonth;
  closeModal('modal-picker');
  renderMonth();
  toast('Switched to ' + monthTitle(viewYear, viewMonth));
});

/* ================= Tabs ================= */
document.querySelectorAll('.tab').forEach(function (t) {
  t.addEventListener('click', function () {
    tab = t.getAttribute('data-tab');
    renderList();
  });
});

/* ================= Add Entry ================= */
function refreshCats() {
  var sel = $('entry-cat');
  var cats = entryType === 'income' ? INCOME_CATS : EXPENSE_CATS;
  sel.innerHTML = '';
  cats.forEach(function (c) {
    var o = document.createElement('option');
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
  $('entry-hint').style.display = entryType === 'income' ? 'none' : 'block';
  if (entryType !== 'income') $('entry-hint').textContent = 'Expenses post only after approval.';
}
function setEntryType(t) {
  entryType = t;
  $('seg-income').className = t === 'income' ? 'on income' : '';
  $('seg-expense').className = t === 'expense' ? 'on expense' : '';
  refreshCats();
}
$('seg-income').addEventListener('click', function () { setEntryType('income'); });
$('seg-expense').addEventListener('click', function () { setEntryType('expense'); });
$('btn-add').addEventListener('click', function () {
  setEntryType('expense');
  $('entry-date').value = todayStr();
  $('entry-amount').value = '';
  $('entry-note').value = '';
  setErr('entry-amount-err', '');
  openModal('modal-entry');
});
var submittingEntry = false;
var lastEntrySubmit = null;
$('btn-entry-submit').addEventListener('click', function () {
  var btn = $('btn-entry-submit');
  if (submittingEntry) return;
  submittingEntry = true; btn.disabled = true;
  function done() { submittingEntry = false; btn.disabled = false; }
  var date = $('entry-date').value;
  var cat = $('entry-cat').value;
  var raw = $('entry-amount').value.trim();
  var amount = parseFloat(raw);
  if (!date) { toast('Please select a date.', true); done(); return; }
  if (isNaN(amount) || amount <= 0) {
    setErr('entry-amount-err', 'Amount must be greater than 0.');
    done(); return;
  }
  setErr('entry-amount-err', '');
  amount = Math.round(amount * 100) / 100;
  var note = $('entry-note').value.trim();
  var key = [me.name, entryType, cat, amount, date, note].join('|');
  var now = Date.now();
  if (lastEntrySubmit && lastEntrySubmit.key === key && now - lastEntrySubmit.t < 3000) {
    toast('This entry was just submitted. Please do not submit it again.', true); done(); return;
  }
  var rec = {
    id: uid(), type: entryType, date: date, category: cat, amount: amount,
    note: note, by: me.name, createdAt: new Date().toISOString(),
    status: entryType === 'income' ? 'posted' : 'pending',
    confirmedBy: null, confirmedAt: null
  };
  var next = records.concat([rec]);
  if (!saveRecords(next)) { toast('Save failed. Entry was not saved. Please try again.', true); done(); return; }
  records = next;
  lastEntrySubmit = { key: key, t: now };
  autoBackup();
  done();
  closeModal('modal-entry');
  viewYear = parseInt(date.slice(0, 4), 10);
  viewMonth = parseInt(date.slice(5, 7), 10);
  renderMonth();
  sfxSuccess();
  if (rec.type === 'income') {
    toast('Income posted.');
  } else {
    toast('Expense submitted. Pending approval.');
  }
  /* With one user there is nobody to notify, so no notification dialog pops up; after the other account joins, use "Notify Again" in the details. */
  if (users.length >= 2) openNotify(rec);
});

/* ================= Approve / Reject ================= */
function findTx(id) {
  for (var i = 0; i < records.length; i++) if (records[i].id === id) return records[i];
  return null;
}
function confirmTx(id) {
  var r = findTx(id);
  if (!r || r.status !== 'pending') return;
  if (r.by === me.name) { toast('You cannot approve your own expense.', true); return; }
  r.status = 'posted';
  r.confirmedBy = me.name;
  r.confirmedAt = new Date().toISOString();
  if (!saveRecords(records)) {
    r.status = 'pending'; r.confirmedBy = null; r.confirmedAt = null;
    toast('Save failed. Approval was not saved. Please try again.', true); return;
  }
  autoBackup();
  renderMonth();
  sfxSuccess();
  toast('Approved and posted.');
}
function rejectTx(id) {
  var r = findTx(id);
  if (!r || r.status !== 'pending') return;
  if (r.by === me.name) { toast('You cannot reject your own expense.', true); return; }
  askConfirm('Reject this expense', 'A rejected expense stays out of totals but remains in the list for audit (never deleted). Reject it?', 'Reject', function () {
    r.status = 'rejected';
    r.confirmedBy = me.name;
    r.confirmedAt = new Date().toISOString();
    if (!saveRecords(records)) {
      r.status = 'pending'; r.confirmedBy = null; r.confirmedAt = null;
      toast('Save failed. Rejection was not saved. Please try again.', true); return;
    }
    autoBackup();
    renderMonth();
    toast('Rejected.');
  });
}

/* ================= Details ================= */
function openDetail(id) {
  var r = findTx(id);
  if (!r) return;
  detailId = id;
  var amtCls = r.type === 'income' ? 'in' : 'out';
  var sign = r.type === 'income' ? '+' : '−';
  $('detail-body').innerHTML =
    '<div class="kv"><span class="k">Type</span><span class="v">' + (r.type === 'income' ? 'Income' : 'Expense') + '</span></div>' +
    '<div class="kv"><span class="k">Category</span><span class="v">' + esc(catLabel(r.category)) + '</span></div>' +
    '<div class="kv"><span class="k">Date</span><span class="v">' + fmtDate(r.date) + '</span></div>' +
    '<div class="kv"><span class="k">Amount</span><span class="v" style="color:var(--' + (r.type === 'income' ? 'income' : 'expense') + ');">' + sign + fmtMoney(r.amount) + '</span></div>' +
    '<div class="kv"><span class="k">Memo</span><span class="v">' + (r.note ? esc(r.note) : '—') + '</span></div>' +
    '<div class="kv"><span class="k">Status</span><span class="v"><span class="pill ' + statusClass(r) + '">' + statusLabel(r) + '</span></span></div>' +
    '<div class="kv"><span class="k">Submitted by</span><span class="v">' + esc(r.by) + '</span></div>' +
    '<div class="kv"><span class="k">Submitted At</span><span class="v">' + fmtDateTime(r.createdAt) + '</span></div>' +
    '<div class="kv"><span class="k">Approved By</span><span class="v">' + (r.confirmedBy ? esc(r.confirmedBy) : '—') + '</span></div>' +
    '<div class="kv"><span class="k">Approved At</span><span class="v">' + (r.confirmedAt ? fmtDateTime(r.confirmedAt) : '—') + '</span></div>';
  var foot = $('detail-foot');
  if (r.status === 'pending' && r.by !== me.name) {
    foot.innerHTML = '<div class="row">' +
      '<button class="btn confirm" type="button" id="detail-confirm">Approve</button>' +
      '<button class="btn reject" type="button" id="detail-reject">Reject</button></div>';
    $('detail-confirm').addEventListener('click', function () { closeModal('modal-detail'); confirmTx(id); });
    $('detail-reject').addEventListener('click', function () { closeModal('modal-detail'); rejectTx(id); });
  } else if (r.status === 'pending') {
    foot.innerHTML = '<p class="sub" style="margin:0 0 12px; text-align:center;">Pending Approval</p>' +
      '<button class="btn secondary" type="button" id="detail-renotify">Notify Again</button>';
    $('detail-renotify').addEventListener('click', function () { openNotify(r); });
  } else {
    foot.innerHTML = '<button class="btn secondary" type="button" data-close="modal-detail">Close</button>';
    foot.querySelector('[data-close]').addEventListener('click', function () { closeModal('modal-detail'); });
  }
  openModal('modal-detail');
}

/* ================= Add user: the remaining account type, read-only ================= */
function remainingAccountName() {
  var hasPayer = users.some(function (u) { return u.name === 'payer'; });
  var hasPayee = users.some(function (u) { return u.name === 'payee'; });
  if (hasPayer && !hasPayee) return 'payee';
  if (hasPayee && !hasPayer) return 'payer';
  return 'payer';
}
function openAddUser() {
  if (users.length >= 2) { toast('Add failed', true); return; }
  $('adduser-pw').value = '';
  setErr('adduser-pw-err', '');
  $('adduser-type-text').textContent = 'You will be added as ' + remainingAccountName();
  openModal('modal-adduser');
}
$('btn-adduser-login').addEventListener('click', openAddUser);
$('btn-adduser-settings').addEventListener('click', openAddUser);
$('btn-adduser-submit').addEventListener('click', function () {
  var p = $('adduser-pw').value;
  var nm = remainingAccountName();
  var ok = true;
  setErr('adduser-pw-err', '');
  if (!validPassword(p)) { setErr('adduser-pw-err', PW_MSG); ok = false; }
  if (users.some(function (u) { return u.name === nm; })) { ok = false; }
  if (!ok) return;
  var s = makeSalt();
  hashBoth(s, p).then(function (h) {
    users.push({ name: nm, salt: s, hash256: h.hash256, hashFallback: h.hashFallback });
    if (!saveUsers(users)) { users.pop(); toast('Save failed. Not added. Please try again.', true); return; }
    autoBackup();
    closeModal('modal-adduser');
    sfxSuccess();
    toast('Added. The other account can now sign in as ' + nm + '.');
    if (me) {
      $('btn-adduser-settings').style.display = (users.length < 2) ? 'block' : 'none';
    } else {
      renderLogin();
    }
  });
});
/* ================= Settings: change password / opening balance / export / import / clear / sign out ================= */
$('btn-gear').addEventListener('click', function () {
  var m = loadRetention();
  $('retention-range').value = String(m);
  $('retention-val').textContent = monthsLabel(m);
  var iv = loadInitial();
  $('initial-amount').value = iv ? String(iv) : '';
  $('pw-old').value = ''; $('pw-new').value = ''; $('pw-new2').value = '';
  setErr('pw-old-err', ''); setErr('pw-new-err', ''); setErr('pw-new2-err', '');
  $('btn-adduser-settings').style.display = (users.length < 2) ? 'block' : 'none';
  refreshSafetyStatus();
  refreshSoundToggle();
  openModal('modal-settings');
});
['pw-old', 'pw-new', 'pw-new2', 'setup-pw1', 'adduser-pw'].forEach(function (id) {
  var el = $(id);
  if (el) el.addEventListener('input', function () { this.value = this.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6); });
});
$('btn-change-pw').addEventListener('click', function () {
  var oldPw = $('pw-old').value, nw = $('pw-new').value, nw2 = $('pw-new2').value;
  setErr('pw-old-err', ''); setErr('pw-new-err', ''); setErr('pw-new2-err', '');
  var ok = true;
  if (!validPassword(nw)) { setErr('pw-new-err', PW_MSG); ok = false; }
  if (nw !== nw2) { setErr('pw-new2-err', 'New passwords do not match'); ok = false; }
  if (!ok) return;
  verifyPw(me, oldPw).then(function (good) {
    if (!good) { setErr('pw-old-err', 'Current password is incorrect'); return; }
    var salt = makeSalt();
    hashBoth(salt, nw).then(function (h) {
      var oldSalt = me.salt, old256 = me.hash256, oldFb = me.hashFallback;
      me.salt = salt; me.hash256 = h.hash256; me.hashFallback = h.hashFallback;
      if (!saveUsers(users)) {
        me.salt = oldSalt; me.hash256 = old256; me.hashFallback = oldFb;
        toast('Save failed. Password was not changed. Please try again.', true); return;
      }
      autoBackup();
      $('pw-old').value = ''; $('pw-new').value = ''; $('pw-new2').value = '';
      sfxSuccess();
      toast('Password changed.');
    });
  });
});
$('btn-export').addEventListener('click', function () {
  try {
    var data = { app: 'finance-audit', version: 1, exportedAt: new Date().toISOString(), users: users, records: records, notes: notes, carry: carry, initial: initial };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    var d = new Date();
    a.href = URL.createObjectURL(blob);
    a.download = 'finance-audit-backup-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Backup exported.');
  } catch (e) {
    toast('Export failed. Please try again.', true);
  }
});
$('btn-import').addEventListener('click', function () { $('import-file').click(); });
$('import-file').addEventListener('change', function () {
  var f = this.files && this.files[0];
  this.value = '';
  if (!f) return;
  var rd = new FileReader();
  rd.onload = function () {
    var data;
    try { data = JSON.parse(rd.result); } catch (e) { toast('Import failed: file is not valid JSON.', true); return; }
    if (!data || data.app !== 'finance-audit' || !Array.isArray(data.users) || data.users.length < 1 || data.users.length > 2 ||
        !Array.isArray(data.records)) {
      toast('Import failed: backup file format is incorrect.', true);
      return;
    }
    var badUser = data.users.some(function (u) {
      return !u || !NAME_RE.test(u.name) || !u.salt || (!u.hash256 && !u.hashFallback);
    });
    if (badUser) { toast('Import failed: user info in the backup is incorrect.', true); return; }
    var dupUser = data.users.some(function (u, i) {
      return data.users.findIndex(function (v) { return v.name === u.name; }) !== i;
    });
    if (dupUser) { toast('Import failed: duplicate usernames in the backup.', true); return; }
    var badRec = data.records.some(function (r) {
      return !r || (r.type !== 'income' && r.type !== 'expense') || !r.date ||
        typeof r.amount !== 'number' || !(r.amount > 0) ||
        (r.method !== undefined && r.method !== 'cash' && r.method !== 'book') ||
        ['posted', 'pending', 'rejected'].indexOf(r.status) < 0;
    });
    if (badRec) { toast('Import failed: records in the backup are incorrect.', true); return; }
    var badNote = data.notes !== undefined && (!Array.isArray(data.notes) || data.notes.some(function (n) {
      return !n || typeof n.id !== 'string' || typeof n.from !== 'string' || typeof n.content !== 'string' ||
        typeof n.createdAt !== 'string' || !(n.readAt === null || typeof n.readAt === 'string');
    }));
    if (badNote) { toast('Import failed: notifications in the backup are incorrect.', true); return; }
    var badInitial = data.initial !== undefined && !isMoneyValue(data.initial) && !isMoneyPairLegacy(data.initial);
    if (badInitial) { toast('Import failed: opening balance in the backup is incorrect.', true); return; }
    var badCarry = data.carry !== undefined && !isMoneyValue(data.carry) && !isMoneyPairLegacy(data.carry);
    if (badCarry) { toast('Import failed: carried-forward balance in the backup is incorrect.', true); return; }
    askConfirm('Import Backup', 'Current: ' + users.length + ' users, ' + records.length + ' records. File: ' +
      data.users.length + ' users, ' + data.records.length + ' records. Importing overwrites all current data; current state is saved to auto backup first. Continue?', 'Import', function () {
      autoBackup();
      users = data.users;
      stripUserRoles(users);
      records = normalizeRecords(data.records);
      notes = Array.isArray(data.notes) ? data.notes : [];
      carry = normalizeMoney(data.carry);
      initial = normalizeMoney(data.initial);
      var ok = saveUsers(users) && saveRecords(records) && saveNotes(notes) && saveCarry(carry) && saveInitial(initial);
      if (!ok) { toast('Save failed after import. Please try importing again.', true); return; }
      autoBackup();
      closeModal('modal-settings');
      me = null;
      sfxSuccess();
      toast('Backup imported. Please sign in again.');
      if (needsClaim()) { renderClaim(); } else { renderLogin(); }
    });
  };
  rd.onerror = function () { toast('Import failed: could not read file.', true); };
  rd.readAsText(f);
});
$('btn-wipe').addEventListener('click', function () {
  askConfirm('Clear All Data', 'This deletes all users, records, notifications, opening balance, and carried-forward balance, and returns to the setup screen. Clear everything?', 'Clear All', function () {
    localStorage.removeItem(LS_USERS);
    localStorage.removeItem(LS_RECORDS);
    localStorage.removeItem(LS_NOTES);
    localStorage.removeItem(LS_CARRY);
    localStorage.removeItem(LS_INITIAL);
    localStorage.removeItem(LS_RETENTION);
    localStorage.removeItem(LS_AUTO1);
    localStorage.removeItem(LS_AUTO2);
    localStorage.removeItem(LS_CLEANLOG);
    localStorage.removeItem(LS_SOUND);
    users = null;
    records = [];
    notes = [];
    carry = 0;
    initial = 0;
    me = null;
    soundOn = true;
    closeModal('modal-settings');
    showView('view-setup');
    toast('All data cleared.');
  });
});
$('btn-logout').addEventListener('click', function () {
  me = null;
  renderLogin();
  toast('Signed out.');
});

/* Retention slider: live display while dragging; save and clean up once on release */
$('retention-range').addEventListener('input', function () {
  $('retention-val').textContent = monthsLabel(this.value);
});
$('retention-range').addEventListener('change', function () {
  var m = parseInt(this.value, 10);
  if (isNaN(m) || m < 1 || m > 12) {
    this.value = String(loadRetention());
    $('retention-val').textContent = monthsLabel(this.value);
    toast('Retention must be between 1 and 12 months', true);
    return;
  }
  if (!saveRetention(m)) {
    this.value = String(loadRetention());
    $('retention-val').textContent = monthsLabel(this.value);
    toast('Save failed. Retention period was not changed.', true);
    return;
  }
  var cleaned = runRetentionCleanup(true);
  autoBackup();
  if (cleaned === 0) toast('Retention period changed to ' + monthsLabel(m));
  if (me) renderMonth();
});

/* Opening balance: editable anytime; Total Balance recalculates right after saving */
$('btn-save-initial').addEventListener('click', function () {
  function num(id) {
    var v = parseFloat($(id).value);
    if (isNaN(v) || !isFinite(v)) return 0;
    return Math.round(v * 100) / 100;
  }
  var nextInitial = num('initial-amount');
  if (!saveInitial(nextInitial)) { toast('Save failed. Opening balance was not saved.', true); return; }
  initial = nextInitial;
  autoBackup();
  if (me) renderMonth();
  sfxSuccess();
  toast('Opening balance saved.');
});

/* ================= Shared close and confirm dialog ================= */
document.querySelectorAll('[data-close]').forEach(function (el) {
  el.addEventListener('click', function () {
    closeModal(el.getAttribute('data-close'));
  });
});
document.querySelectorAll('.modal').forEach(function (m) {
  m.addEventListener('click', function (e) {
    if (e.target === m) closeModal(m.id);
  });
});
$('btn-confirm-no').addEventListener('click', function () { closeModal('modal-confirm'); confirmAction = null; });
$('btn-confirm-yes').addEventListener('click', function () {
  var cb = confirmAction;
  confirmAction = null;
  closeModal('modal-confirm');
  if (cb) cb();
});

/* ================= Notify ================= */
var notifyMsg = '';
function buildNotifyMsg(r) {
  var kind = r.type === 'income' ? 'Income' : 'Expense';
  var tail = r.type === 'income' ? ' Posted.' : ' Pending your approval.';
  var msg = '[Financial Audit] ' + r.by + ' added ' + kind + ': ' + catLabel(r.category) + ', ' +
    fmtMoney(r.amount) + ', ' + fmtDate(r.date) + '.';
  if (r.note) msg += ' Memo: ' + r.note + '.';
  msg += tail + '\nLedger URL: ' + window.location.href;
  return msg;
}
function openNotify(r) {
  notifyMsg = buildNotifyMsg(r);
  $('notify-text').value = notifyMsg;
  openModal('modal-notify');
}
function fallbackCopy(t) {
  var ta = document.createElement('textarea');
  ta.value = t;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    toast('Copied.');
  } catch (e) {
    toast('Copy failed. Please copy manually.', true);
  }
  ta.remove();
}
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(function () {
      toast('Copied.');
    }, function () { fallbackCopy(t); });
  } else {
    fallbackCopy(t);
  }
}
$('btn-notify-copy').addEventListener('click', function () { copyText(notifyMsg); });
$('btn-notify-sms').addEventListener('click', function () {
  window.location.href = 'sms:?body=' + encodeURIComponent(notifyMsg);
});
$('btn-notify-mail').addEventListener('click', function () {
  window.location.href = 'mailto:?subject=' + encodeURIComponent('Financial Audit Notification') +
    '&body=' + encodeURIComponent(notifyMsg);
});

/* ================= Invite (QR Code) ================= */
function openInvite() {
  var url = window.location.href;
  $('invite-url').textContent = url;
  var img = $('invite-qr');
  $('invite-qr-fail').style.display = 'none';
  img.style.display = 'block';
  img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=8&data=' +
    encodeURIComponent(url);
  openModal('modal-invite');
}
$('invite-qr').addEventListener('error', function () {
  this.style.display = 'none';
  $('invite-qr-fail').style.display = 'block';
});
$('btn-invite-login').addEventListener('click', openInvite);
$('btn-invite-settings').addEventListener('click', openInvite);
$('btn-help-login').addEventListener('click', function () { openModal('modal-help'); });
$('btn-help-settings').addEventListener('click', function () {
  closeModal('modal-settings');
  openModal('modal-help');
});
$('btn-invite-copy').addEventListener('click', function () { copyText(window.location.href); });

/* ================= Data security: auto backup restore and cleanup log ================= */
function refreshSafetyStatus() {
  var el = $('safety-status');
  if (!el) return;
  var b = readAuto(LS_AUTO1);
  if (b) el.textContent = 'Auto Backup: ' + fmtDateTime(b.savedAt) + ' · ' + b.records.length + ' records';
  else el.textContent = 'Auto Backup: None';
}
function refreshSoundToggle() {
  var b = $('btn-sound-toggle');
  if (b) b.textContent = soundOn ? 'Sound: On' : 'Sound: Off';
}
$('btn-sound-toggle').addEventListener('click', function () {
  soundOn = !soundOn;
  saveSoundSetting();
  autoBackup();
  refreshSoundToggle();
  if (soundOn) sfxSuccess();
  toast(soundOn ? 'Sound on.' : 'Sound off.');
});
$('btn-restore-auto').addEventListener('click', function () {
  var target = readAuto(LS_AUTO1);
  if (!target) { toast('No auto backup available.', true); return; }
  askConfirm('Restore Last Auto Backup',
    'Restore to ' + fmtDateTime(target.savedAt) + ' backup (' + target.records.length + ' records). Current state is saved as a new auto backup first, so you can restore once more to undo. Restore?',
    'Restore', function () {
      autoBackup();
      users = target.users; stripUserRoles(users); records = normalizeRecords(target.records); notes = target.notes;
      carry = normalizeMoney(target.carry);
      initial = normalizeMoney(target.initial);
      soundOn = target.sound !== false;
      saveUsers(users); saveRecords(records); saveNotes(notes); saveCarry(carry); saveInitial(initial);
      saveRetention(target.retention); saveSoundSetting();
      closeModal('modal-settings');
      me = null;
      toast('Restored from auto backup. Please sign in again.');
      if (needsClaim()) { renderClaim(); } else { renderLogin(); }
    });
});
$('btn-clean-log').addEventListener('click', function () {
  var log = loadCleanLog();
  var body = $('cleanlog-body');
  if (!log.length) { body.innerHTML = ''; body.appendChild(emptyBlock('No cleanup records.')); }
  else {
    body.innerHTML = log.map(function (e) {
      return '<div class="card" style="margin-bottom:10px;"><div style="font-weight:700;">' + fmtDateTime(e.at) + '</div>' +
        '<div style="font-size:13px; color:var(--text-sub); line-height:1.7; margin-top:4px;">' +
        'Deleted income ' + e.delInc + ' (' + fmtMoney(e.delIncAmt) + ') · Deleted expense ' + e.delExp + ' (' + fmtMoney(e.delExpAmt) + ')<br>' +
        'Carried forward ' + fmtMoney(normalizeMoney(e.carryBefore)) + ' → ' +
        fmtMoney(normalizeMoney(e.carryAfter)) + '</div></div>';
    }).join('');
  }
  closeModal('modal-settings');
  openModal('modal-cleanlog');
});

/* ================= Export statement: print / PDF / CSV ================= */
var stmtPeriod = 'month';
function setStmtPeriod(p) {
  stmtPeriod = p;
  ['month', 'year', 'all'].forEach(function (k) {
    $('seg-period-' + k).className = (k === p) ? 'on' : '';
  });
  refreshStmtSummary();
}
function stmtRange() {
  if (stmtPeriod === 'month') return { label: monthTitle(viewYear, viewMonth), list: monthRecords(viewYear, viewMonth) };
  if (stmtPeriod === 'year') return { label: String(viewYear), list: yearRecords(viewYear) };
  return { label: 'All', list: records.slice() };
}
function stmtSums(list) {
  return {
    inc: sumPosted(list, 'income'),
    exp: sumPosted(list, 'expense')
  };
}
function refreshStmtSummary() {
  var r = stmtRange(), s = stmtSums(r.list);
  $('stmt-summary').textContent = r.label + ': Posted Income ' + fmtMoney(s.inc) +
    ' · Posted Expenses ' + fmtMoney(s.exp);
}
$('btn-statement').addEventListener('click', function () {
  closeModal('modal-settings');
  setStmtPeriod('month');
  openModal('modal-statement');
});
['month', 'year', 'all'].forEach(function (k) {
  $('seg-period-' + k).addEventListener('click', function () { setStmtPeriod(k); });
});
function stmtRows(list, type, status) {
  return list.filter(function (r) { return r.type === type && r.status === status; })
    .sort(function (a, b) { if (a.date !== b.date) return a.date < b.date ? 1 : -1; return a.createdAt < b.createdAt ? 1 : -1; });
}
function stmtTableRow(r) {
  return '<tr><td>' + esc(fmtDate(r.date)) + '</td><td>' + esc(catLabel(r.category)) + '</td>' +
    '<td class="num">' + fmtMoney(r.amount) + '</td><td>' + esc(r.by) + '</td><td>' + esc(r.note || '') + '</td></tr>';
}
function stmtSection(title, rows, foot) {
  var h = '<h2>' + title + '</h2><table><tr><th>Date</th><th>Category</th><th class="num">Amount</th><th>Submitted By</th><th>Memo</th></tr>';
  h += rows.length ? rows.map(stmtTableRow).join('') : '<tr><td colspan="5">None</td></tr>';
  h += '</table>';
  if (foot) h += '<div class="foot">' + foot + '</div>';
  return h;
}
function buildStatementHTML() {
  var r = stmtRange(), s = stmtSums(r.list);
  var perWord = 'This Period';
  if (stmtPeriod === 'all') perWord = 'All';
  var totInc = sumPosted(records, 'income');
  var totExp = sumPosted(records, 'expense');
  var bal = initial + carry + totInc - totExp;
  var d = new Date();
  var html = '<div class="stmt"><h1>Financial Audit Statement</h1>' +
    '<div class="meta">Period: ' + r.label + '　Prepared: ' + fmtDateObj(d) + '</div>' +
    '<h2>Balances</h2><table>' +
    '<tr><th>Item</th><th class="num">Amount</th></tr>' +
    '<tr><td>Opening Balance</td><td class="num">' + fmtMoney(initial) + '</td></tr>' +
    '<tr><td>Carried Forward</td><td class="num">' + fmtMoney(carry) + '</td></tr>' +
    '<tr class="tot"><td>Ending Balance</td><td class="num">' + fmtMoney(bal) + '</td></tr></table>' +
    '<div class="foot">Ending Balance = Opening Balance + Carried Forward + all posted net. Cleaned-up older transactions are not listed, but are included in Carried Forward.</div>';
  html += stmtSection('Posted Income', stmtRows(r.list, 'income', 'posted'), null);
  html += stmtSection('Posted Expenses', stmtRows(r.list, 'expense', 'posted'), null);
  html += stmtSection('Pending Expenses', stmtRows(r.list, 'expense', 'pending'), 'Pending expenses are not included in totals.');
  var rej = stmtRows(r.list, 'expense', 'rejected');
  if (rej.length) html += stmtSection('Rejected Expenses', rej, 'Rejected expenses are not included in totals.');
  html += '<h2>Totals</h2><table>' +
    '<tr><th>Item</th><th class="num">Amount</th></tr>' +
    '<tr><td>' + perWord + ' Posted Income</td><td class="num">' + fmtMoney(s.inc) + '</td></tr>' +
    '<tr><td>' + perWord + ' Posted Expenses</td><td class="num">' + fmtMoney(s.exp) + '</td></tr>' +
    '<tr class="tot"><td>' + perWord + ' Posted Net</td><td class="num">' + fmtMoney(s.inc - s.exp) + '</td></tr></table></div>';
  return html;
}
$('btn-statement-print').addEventListener('click', function () {
  $('print-area').innerHTML = buildStatementHTML();
  closeModal('modal-statement');
  setTimeout(function () { window.print(); }, 60);
});
function csvEsc(v) {
  var s = String(v == null ? '' : v);
  return '"' + s.replace(/"/g, '""') + '"';
}
function fmtCSVTime(iso) {
  var dt = new Date(iso);
  if (isNaN(dt.getTime())) return '';
  return dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate()) + ' ' + pad(dt.getHours()) + ':' + pad(dt.getMinutes());
}
$('btn-statement-csv').addEventListener('click', function () {
  var r = stmtRange();
  var rows = r.list.slice().sort(function (a, b) { if (a.date !== b.date) return a.date < b.date ? 1 : -1; return a.createdAt < b.createdAt ? 1 : -1; });
  var head = ['Date', 'Type', 'Category', 'Amount', 'Memo', 'Submitted By', 'Status', 'Approved By', 'Approved At'];
  var lines = [head.map(csvEsc).join(',')];
  rows.forEach(function (rec) {
    var st = 'Rejected';
    if (rec.status === 'posted') st = 'Posted';
    if (rec.status === 'pending') st = 'Pending Approval';
    var ty = 'Expense';
    if (rec.type === 'income') ty = 'Income';
    lines.push([fmtDate(rec.date), ty, catLabel(rec.category),
      rec.amount.toFixed(2), rec.note || '', rec.by,
      st,
      rec.confirmedBy || '', rec.confirmedAt ? fmtDateTime(rec.confirmedAt) : ''].map(csvEsc).join(','));
  });
  var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  if (stmtPeriod === 'month') a.download = 'financial-audit-statement-' + viewYear + '-' + pad(viewMonth) + '.csv';
  else if (stmtPeriod === 'year') a.download = 'financial-audit-statement-' + viewYear + '.csv';
  else a.download = 'financial-audit-statement-all.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  toast('CSV exported.');
});

/* ================= Data recovery screen ================= */
function renderRecovery() {
  var d = $('recovery-detail');
  var lines = [];
  lines.push(recoveryInfo || 'Local data could not be read.');
  try {
    var rc = JSON.parse(readRawPart(LS_RECORDS) || 'null');
    if (Array.isArray(rc)) lines.push('Transaction records remaining: ' + rc.length + ' (can be exported).');
  } catch (e) {}
  d.innerHTML = lines.map(function (t) { return '<div>' + esc(t) + '</div>'; }).join('');
  showView('view-recovery');
}
$('btn-recovery-export').addEventListener('click', function () {
  try {
    var out = {};
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (k && k.indexOf('finance-audit-v1') === 0) out[k] = localStorage.getItem(k);
    }
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'finance-audit-residual.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('Residual data exported.');
  } catch (e) { toast('Export failed.', true); }
});
$('btn-recovery-reset').addEventListener('click', function () {
  askConfirm('Clear and Start Over', 'This deletes all local data (including auto backups and cleanup log) and returns to the setup screen. Continue?', 'Clear All', function () {
    [LS_USERS, LS_RECORDS, LS_NOTES, LS_CARRY, LS_INITIAL, LS_RETENTION, LS_AUTO1, LS_AUTO2, LS_CLEANLOG, LS_SOUND].forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    users = null; records = []; notes = []; carry = 0; initial = 0; me = null; soundOn = true;
    showView('view-setup');
    toast('Cleared. Please set up again.');
  });
});

/* ================= Tap sound: every button plays a soft click ================= */
document.addEventListener('click', function (e) {
  var t = e.target && e.target.closest ? e.target.closest('button') : null;
  if (t) sfxClick();
});

/* ================= Startup: recovery screen if damaged, otherwise clean up once, then sign-in or setup ================= */
if (dataBroken) {
  renderRecovery();
} else {
  runRetentionCleanup(true);
  if (users && users.length >= 1) {
    if (needsClaim()) { renderClaim(); } else { renderLogin(); }
    if (recoveredFromBackup) toast('Restored from auto backup. Please check your records.');
  } else {
    showView('view-setup');
  }
}
})();
