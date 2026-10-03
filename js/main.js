import { getSettings, getStore, todayStr } from './db.js';
import { currentDay } from './plan.js';
import { buildBrokenMessage } from './encourage.js';
import { initSfx } from './sfx.js';
import * as today from './pages/today.js';
import * as checkin from './pages/checkin.js';
import * as words from './pages/words.js';
import * as quiz from './pages/quiz.js';
import * as stats from './pages/stats.js';
import * as settings from './pages/settings.js';

const PAGES = { today, checkin, words, quiz, stats, settings };
const pageEl = document.getElementById('page');
const tabsEl = document.getElementById('tabs');

const ctx = {
  go: (name) => show(name),
  toast: (t) => showToast(t),
  refreshBrand: () => refreshBrand(),
};

async function show(name) {
  tabsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.page === name));
  pageEl.innerHTML = '';
  await PAGES[name].render(pageEl, ctx);
  // 刷新消息缓存（供打卡页显示）
  window.__msgCache = await getStore('messages');
}

function showToast(t) {
  const el = document.getElementById('toast');
  el.textContent = t;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2400);
}

async function refreshBrand() {
  const s = await getSettings();
  const day = currentDay(s.startDate);
  document.getElementById('brandDay').textContent =
    day >= 1 && day <= 70 ? `Day ${day} / 70` : day > 70 ? '已完赛' : '';
}

// 断卡检测：打开应用时，检查昨天及更早是否有漏打卡（且未提醒过）
async function checkMissed() {
  const s = await getSettings();
  const today = todayStr();
  const checkins = await getStore('checkins');
  const has = (d) => checkins.some((c) => c.date === d && (c.success || c.submittedAt));
  let missed = 0;
  let d = today;
  // 从昨天往回数（今天还没打不算）
  for (let i = 1; i <= 7; i++) {
    const prev = shiftStr(s.startDate, dayOffset(s.startDate, today) - i);
    if (prev < s.startDate) break;
    if (has(prev)) break;
    missed++;
  }
  if (missed >= 1) {
    const lastNotified = s.lastMissNotified;
    const yesterday = shiftStr(s.startDate, dayOffset(s.startDate, today) - 1);
    if (lastNotified !== yesterday) {
      await buildBrokenMessage({ name: s.name, missed, style: s.style, today });
      const { saveSettings } = await import('./db.js');
      await saveSettings({ lastMissNotified: yesterday });
    }
  }
}

function dayOffset(base, dateStr) {
  const [by, bm, bd] = base.split('-').map(Number);
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.round((new Date(y, m - 1, d) - new Date(by, bm - 1, bd)) / 86400000);
}
function shiftStr(base, n) {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

tabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-page]');
  if (b) show(b.dataset.page);
});

(async function init() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try { navigator.serviceWorker.register('./sw.js'); } catch { /* ignore */ }
  }
  await initSfx();
  await refreshBrand();
  await checkMissed();
  window.__msgCache = await getStore('messages');
  await show('today');
})();
