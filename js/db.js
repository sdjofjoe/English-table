// IndexedDB 封装
const DB_NAME = 'cet6-monitor';
const DB_VER = 1;

let _db = null;
export function db() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('checkins')) d.createObjectStore('checkins', { keyPath: 'date' });
      if (!d.objectStoreNames.contains('words')) d.createObjectStore('words', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('quizzes')) d.createObjectStore('quizzes', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('messages')) d.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
      if (!d.objectStoreNames.contains('tasks')) d.createObjectStore('tasks', { keyPath: 'date' });
    };
    req.onsuccess = () => { _db = req.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return db().then((d) => new Promise((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out && out._req ? out._req.result : out);
    t.onerror = () => reject(t.error);
  }));
}

export function kvGet(key) {
  return db().then((d) => new Promise((res, rej) => {
    const r = d.transaction('kv').objectStore('kv').get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
export function kvSet(key, value) {
  return db().then((d) => new Promise((res, rej) => {
    const r = d.transaction('kv', 'readwrite').objectStore('kv').put(value, key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  }));
}

export async function getStore(name) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(name).objectStore(name).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function putRec(name, rec) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(name, 'readwrite').objectStore(name).put(rec);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function addRec(name, rec) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(name, 'readwrite').objectStore(name).add(rec);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function getRec(name, key) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(name).objectStore(name).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function delRec(name, key) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(name, 'readwrite').objectStore(name).delete(key);
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}
export async function clearStore(name) {
  const d = await db();
  return new Promise((res, rej) => {
    const r = d.transaction(name, 'readwrite').objectStore(name).clear();
    r.onsuccess = () => res();
    r.onerror = () => rej(r.error);
  });
}

// ---------- 设置 ----------
const DEFAULT_SETTINGS = {
  name: '谭文霞',
  startDate: null,          // YYYY-MM-DD，首次使用时初始化为当天
  style: 'deskmate',        // deskmate 同桌留言 | monitor 课代表 | buddy 损友
  apiKey: '', apiBase: '', apiModel: '',
  lastMissNotified: null,   // 上次已提醒过的断卡日期
  sound: true,               // 音效开关
};
export async function getSettings() {
  const s = (await kvGet('settings')) || {};
  const merged = { ...DEFAULT_SETTINGS, ...s };
  if (!merged.startDate) {
    merged.startDate = fmtDate(new Date());
    await kvSet('settings', merged);
  }
  return merged;
}
export async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await kvSet('settings', next);
  return next;
}

// ---------- 日期工具 ----------
export function fmtDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function todayStr() { return fmtDate(new Date()); }
export function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function daysBetween(a, b) { // b - a，整天数
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
export function dateOffset(baseStr, offset) {
  const d = parseDate(baseStr);
  d.setDate(d.getDate() + offset);
  return fmtDate(d);
}
