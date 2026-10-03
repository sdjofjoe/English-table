import { daysBetween, todayStr } from './db.js';

export const TOTAL_DAYS = 70;
export const MILESTONES = [3, 7, 15, 30];

// 今天是第几天（1 起）。未开始返回 0；已结束返回 > 70
export function currentDay(startDate) {
  return daysBetween(startDate, todayStr()) + 1;
}

export function phaseOf(day) {
  if (day < 1) return 'pre';
  if (day <= 15) return 'A';
  if (day <= TOTAL_DAYS) return 'B';
  return 'done';
}

export function phaseDesc(day) {
  const p = phaseOf(day);
  if (p === 'A') return '阶段A · 单词攻坚（Day 1–15）';
  if (p === 'B') return '阶段B · 单词+听力（Day 16–70）';
  if (p === 'done') return '备考周期已结束';
  return '未开始';
}

// 某天的任务清单
export function tasksFor(day) {
  if (day < 1 || day > TOTAL_DAYS) return [];
  const isB = day > 15;
  const newCount = isB ? 30 : 50;
  const am = [
    { id: 'am-new', text: `百词斩 ${newCount} 个新词（关图片 · 拼写模式）`, min: isB ? 25 : 35 },
    { id: 'am-rev', text: '快速过一遍昨天的词', min: 5 },
  ];
  const pm = [
    { id: 'pm-rev', text: '复习前 1 天 + 前 2 天的词', min: 10 },
    { id: 'pm-read', text: '做 1 篇阅读（掐表 12 分钟）', min: 12 },
    { id: 'pm-why', text: '核对答案 + 写错因（8 分钟）', min: 8 },
  ];
  if (isB) pm.push({ id: 'pm-listen', text: '听力 5 分钟：盲听 1 遍 → 看原文标出没听出的 → 再听 1 遍', min: 5 });
  return [...am.map((t) => ({ ...t, period: 'am' })), ...pm.map((t) => ({ ...t, period: 'pm' }))];
}

// 今日是否为抽查日（第 3、6、9…天）
export function isQuizDay(day) {
  return day >= 3 && day <= TOTAL_DAYS && day % 3 === 0;
}

// 由打卡记录计算连续天数（含今天或截至最近一次打卡）
export function computeStreak(checkins, endDate) {
  // checkins: 已成功打卡的日期集合
  const ok = new Set(checkins.filter((c) => c.success).map((c) => c.date));
  let streak = 0;
  let cursor = endDate;
  if (!ok.has(cursor)) cursor = shift(cursor, -1); // 今天还没打，从昨天数
  while (ok.has(cursor)) { streak++; cursor = shift(cursor, -1); }
  return streak;
}

export function bestStreak(checkins) {
  const dates = checkins.filter((c) => c.success).map((c) => c.date).sort();
  let best = 0, cur = 0, prev = null;
  for (const d of dates) {
    cur = prev && shift(prev, 1) === d ? cur + 1 : 1;
    best = Math.max(best, cur);
    prev = d;
  }
  return best;
}

export function shift(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
