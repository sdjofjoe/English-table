import { getSettings, getStore, getRec, putRec, todayStr } from '../db.js';
import { currentDay, phaseOf, phaseDesc, tasksFor, computeStreak, isQuizDay, TOTAL_DAYS } from '../plan.js';
import { speak } from '../ocr.js';
import { sfxTick, sfxUntick, sfxAdd } from '../sfx.js';

export async function render(page, ctx) {
  const s = await getSettings();
  const day = currentDay(s.startDate);
  const checkins = await getStore('checkins');
  const today = todayStr();
  const todayCheckin = checkins.find((c) => c.date === today);
  const streak = computeStreak(checkins, today);
  const messages = await getStore('messages');
  const latestMsg = messages[messages.length - 1];
  const taskRec = (await getRec('tasks', today)) || { date: today, done: [], extras: [] };
  if (!taskRec.extras) taskRec.extras = [];
  const quizCount = (await getStore('quizzes')).length;
  const words = await getStore('words');
  const dueWords = words.filter((w) => w.nextReview && w.nextReview <= today).length;

  const phase = phaseOf(day);
  const html = `
  <div class="card hero">
    <div>
      <div class="daynum">${phase === 'pre' ? '待开始' : phase === 'done' ? '已完成' : 'Day ' + day} <small>/ ${TOTAL_DAYS}</small></div>
      <div class="muted">${phaseDesc(day)}${phase === 'A' || phase === 'B' ? ` · 距考试周期结束还有 ${Math.max(0, TOTAL_DAYS - day)} 天` : ''}</div>
    </div>
    <div class="stat-row" style="min-width:280px">
      <div class="stat-box"><div class="v">${streak}</div><div class="k">连续打卡</div></div>
      <div class="stat-box"><div class="v">${checkins.filter((c) => c.success).length}</div><div class="k">累计打卡</div></div>
      <div class="stat-box"><div class="v">${words.length}</div><div class="k">词库单词</div></div>
    </div>
  </div>

  ${latestMsg ? coachCard(latestMsg) : ''}
  ${todayCheckin
    ? `<div class="card tape-green" style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div class="stamp" style="margin:0;flex:none"><span class="big">${todayCheckin.success ? '打卡 ✓' : '迟交'}</span><span class="small">Day ${day} · ${todayCheckin.timeText}</span></div>
        <div><span class="pill ${todayCheckin.success ? 't-soft' : 'r-soft'}">${todayCheckin.success ? '今天的两页都贴好啦' : '过了22点才交，这页记为空页'}</span> <span class="muted">提交于 ${todayCheckin.timeText}</span></div>
      </div>`
    : `<div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div class="blank-page" style="flex:1;min-width:220px">今天这一页还空着……<div class="tiny">22:00 前把两张照片贴进来</div></div>
        <button class="btn" data-nav="checkin">去打卡</button>
      </div>`}
  ${isQuizDay(day) ? `<div class="card" style="background:var(--amber-soft);border-color:#EF9F27"><b>今天是抽查日</b> <span class="muted" style="color:var(--amber)">第 ${day} 天 · 每 3 天一次 · 已完成 ${quizCount} 次</span> <button class="btn ghost sm" data-nav="quiz" style="margin-left:10px">开始抽查</button></div>` : ''}
  ${dueWords > 0 ? `<div class="card" style="background:var(--teal-soft);border-color:#5DCAA5"><b>今日应复习：${dueWords} 个词</b> <span class="muted" style="color:var(--teal)">去单词库页查看复习清单</span> <button class="btn ghost sm" data-nav="words" style="margin-left:10px">去复习</button></div>` : ''}

  <div class="grid2">
    <div class="card">
      <h2>☀️ 早间任务 <span class="muted">${phase === 'A' ? '约 40 分钟' : '约 30 分钟'}</span></h2>
      ${taskListHtml(tasksFor(day).filter((t) => t.period === 'am'), taskRec.done)}
    </div>
    <div class="card">
      <h2>🌙 睡前任务 <span class="muted">${phase === 'A' ? '约 30 分钟' : '约 35 分钟'}</span></h2>
      ${taskListHtml(tasksFor(day).filter((t) => t.period === 'pm'), taskRec.done)}
    </div>
  </div>
  <div class="card tape-brick">
    <h2>📌 我们的作战节奏</h2>
    <div class="muted">
      Day 1–15：每天 50 新词 + 1 篇阅读，把词汇缺口补上；Day 16 起：新词降到 30，加入 5 分钟听力（盲听 → 看原文标出没听出的 → 再听一遍）。
      听力 92 分的目标是让它不再是短板——第一遍跟不上很正常，三步法练的就是这个。
    </div>
  </div>
  <div class="card tape-green">
    <h2>✍️ 今天还想做的别的事 <span class="muted">写在这一行，别让它们溜走</span></h2>
    <div class="extra-input-row">
      <input type="text" id="extraInput" placeholder="比如：交作业 / 取快递 / 给家里打电话…" maxlength="60">
      <button class="btn ghost sm" id="extraAdd">记下</button>
    </div>
    <ul class="task-list" id="extraList">${extrasHtml(taskRec.extras)}</ul>
  </div>`;
  page.innerHTML = html;
  bindTaskToggle(page, taskRec);
  bindExtras(page, taskRec);
  page.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => ctx.go(b.dataset.nav)));
}

function extrasHtml(extras) {
  if (!extras || !extras.length) return '<li class="muted" style="list-style:none;padding:6px 0">（今天暂时没有别的安排，那就专心背词 🌿）</li>';
  return extras.map((x, i) => `
    <li class="${x.done ? 'done' : ''}" data-extra="${i}">
      <span class="tick">${x.done ? '✓' : ''}</span>
      <span class="txt">${esc(x.text)}</span>
      <span class="min del" data-del="${i}" title="划掉不记了">✕</span>
    </li>`).join('');
}

function coachCard(m) {
  const bad = m.type && m.type.startsWith('broken');
  return `<div class="coach ${bad ? 'bad' : ''}"><div class="who">${bad ? '同桌的小纸条 · 追问' : '同桌的小纸条'}</div><div class="msg">${esc(m.text)}</div></div>`;
}

function taskListHtml(tasks, done) {
  if (!tasks.length) return '<div class="muted center" style="padding:20px 0">当前阶段无任务</div>';
  return `<ul class="task-list">${tasks.map((t) => `
    <li class="${done.includes(t.id) ? 'done' : ''}" data-task="${t.id}">
      <span class="tick">${done.includes(t.id) ? '✓' : ''}</span>
      <span class="txt">${esc(t.text)}</span>
      <span class="min">${t.min}′</span>
    </li>`).join('')}</ul>`;
}

function bindTaskToggle(page, taskRec) {
  page.querySelectorAll('[data-task]').forEach((li) => {
    li.addEventListener('click', async () => {
      const id = li.dataset.task;
      const done = new Set(taskRec.done);
      const turningOn = !done.has(id);
      if (turningOn) done.add(id); else done.delete(id);
      taskRec.done = [...done];
      await putRec('tasks', taskRec);
      li.classList.toggle('done');
      li.querySelector('.tick').textContent = turningOn ? '✓' : '';
      turningOn ? sfxTick() : sfxUntick();
    });
  });
}

function bindExtras(page, taskRec) {
  const input = page.querySelector('#extraInput');
  const addBtn = page.querySelector('#extraAdd');
  const list = page.querySelector('#extraList');
  if (!input || !list) return;

  const save = async () => {
    await putRec('tasks', taskRec);
    list.innerHTML = extrasHtml(taskRec.extras);
    rebind();
  };
  const rebind = () => {
    list.querySelectorAll('[data-extra]').forEach((li) => {
      li.addEventListener('click', async (e) => {
        if (e.target.dataset.del !== undefined) return;
        const i = Number(li.dataset.extra);
        taskRec.extras[i].done = !taskRec.extras[i].done;
        taskRec.extras[i].done ? sfxTick() : sfxUntick();
        await save();
      });
    });
    list.querySelectorAll('[data-del]').forEach((x) => {
      x.addEventListener('click', async (e) => {
        e.stopPropagation();
        taskRec.extras.splice(Number(x.dataset.del), 1);
        await save();
      });
    });
  };
  rebind();

  const add = async () => {
    const text = input.value.trim();
    if (!text) return;
    taskRec.extras.push({ text, done: false });
    input.value = '';
    sfxAdd();
    await save();
  };
  addBtn.addEventListener('click', add);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
}

function esc(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
