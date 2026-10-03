import { getSettings, getStore, todayStr } from '../db.js';
import { currentDay, computeStreak, bestStreak, MILESTONES, TOTAL_DAYS, shift } from '../plan.js';
import { heatmap, lineChart, barChart } from '../charts.js';
import { ERROR_TYPES } from './words.js';

export async function render(page, ctx) {
  const s = await getSettings();
  const day = currentDay(s.startDate);
  const checkins = await getStore('checkins');
  const quizzes = await getStore('quizzes');
  const words = await getStore('words');
  const messages = await getStore('messages');
  const today = todayStr();

  const okDates = new Set(checkins.filter((c) => c.success).map((c) => c.date));
  const marks = {};
  for (let i = 0; i < Math.min(day, TOTAL_DAYS); i++) {
    const d = shift(s.startDate, i);
    if (d >= today) continue;
    if (!checkins.find((c) => c.date === d && (c.success || c.submittedAt))) marks[d] = 'broken';
    else if (checkins.find((c) => c.date === d && !c.success)) marks[d] = 'broken';
  }
  const streak = computeStreak(checkins, today);
  const best = bestStreak(checkins);
  const total = checkins.filter((c) => c.success).length;

  // 阅读错题趋势（最近 20 次）
  const errPoints = checkins.filter((c) => c.success && c.readingErrors !== undefined)
    .sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-20)
    .map((c) => ({ label: c.date.slice(5), value: c.readingErrors }));

  // 错因分布
  const errTypeCount = {};
  for (const c of checkins) for (const t of c.errorTypes || []) errTypeCount[t] = (errTypeCount[t] || 0) + 1;
  const errItems = Object.entries(errTypeCount).map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  // 抽查成绩趋势
  const quizPoints = quizzes.map((q) => ({ label: q.date.slice(5), value: Math.round((q.score / q.total) * 100) }));

  const html = `
  <div class="card">
    <h2>📊 总览 <span class="muted">第 ${day} 天 / 共 ${TOTAL_DAYS} 天</span></h2>
    <div class="stat-row">
      <div class="stat-box"><div class="v">${streak}</div><div class="k">当前连续</div></div>
      <div class="stat-box"><div class="v">${best}</div><div class="k">最长连续</div></div>
      <div class="stat-box"><div class="v">${total}</div><div class="k">累计打卡</div></div>
      <div class="stat-box"><div class="v">${Math.round((total / Math.max(Math.min(day, TOTAL_DAYS), 1)) * 100)}%</div><div class="k">打卡率</div></div>
      <div class="stat-box"><div class="v">${quizzes.length}</div><div class="k">抽查次数</div></div>
      <div class="stat-box"><div class="v">${words.filter((w) => w.status === 'known').length}</div><div class="k">已拿下词数</div></div>
    </div>
  </div>

  <div class="card">
    <h2>📅 70 天打卡热图</h2>
    ${heatmap(okDates, s.startDate, Math.min(TOTAL_DAYS, Math.max(day, 1)), marks)}
  </div>

  <div class="card">
    <h2>🏅 里程碑</h2>
    <div class="badges">
      ${MILESTONES.map((m) => `<span class="badge ${best >= m ? 'got' : ''}">连续 ${m} 天${best >= m ? ' ✓' : ''}</span>`).join('')}
      <span class="badge ${best >= 70 ? 'got' : ''}">连续 70 天${best >= 70 ? ' ✓' : ''}</span>
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <h2>📉 阅读错题趋势</h2>
      ${lineChart(errPoints)}
    </div>
    <div class="card">
      <h2>🧩 错因分布</h2>
      ${errItems.length ? barChart(errItems) : '<div class="muted center" style="padding:16px 0">打卡时填了错因类型才会显示</div>'}
    </div>
  </div>

  <div class="grid2">
    <div class="card">
      <h2>🎯 抽查成绩（%）</h2>
      ${lineChart(quizPoints, { unit: '%' })}
    </div>
    <div class="card">
      <h2>💬 同桌留言（最近）</h2>
      <div class="msglog">
        ${messages.slice(-15).reverse().map((m) => `<div class="m"><span class="d">${m.date}${m.type ? ' · ' + typeText(m.type) : ''}</span><br>${esc(m.text)}</div>`).join('') || '<div class="muted center">暂无</div>'}
      </div>
    </div>
  </div>`;
  page.innerHTML = html;
}

function typeText(t) {
  const map = { success: '打卡', milestone: '里程碑', late: '压线', quality: '高质量', broken: '断卡', 'broken-serious': '连续断卡' };
  if (t.startsWith('llm-')) return 'AI·' + (map[t.slice(4)] || '');
  return map[t] || '';
}
function esc(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
