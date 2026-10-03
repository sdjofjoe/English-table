import { getSettings, getStore, addRec, todayStr } from '../db.js';
import { currentDay, isQuizDay } from '../plan.js';
import { speak } from '../ocr.js';
import { markWord, STATUS } from './words.js';
import { sfxCorrect, sfxWrong, sfxFinish, sfxMilestone } from '../sfx.js';

const QUIZ_SIZE = 10;

export async function render(page, ctx) {
  const s = await getSettings();
  const day = currentDay(s.startDate);
  const quizzes = await getStore('quizzes');
  const quizNo = quizzes.length + 1;
  const type = quizNo % 3 === 0 ? 'choice' : 'write'; // 每3次抽查里1次选择题
  const words = await getStore('words');
  const ready = words.filter((w) => w.meaning || true); // 全部可用
  const dueToday = isQuizDay(day);

  page.innerHTML = `
  <div class="card">
    <h2>🎯 三天抽查 <span class="muted">第 ${quizNo} 次 · ${type === 'write' ? '默写模式（听发音 / 看释义拼写）' : '选择题模式（听发音选单词）'} ${dueToday ? '· 今天是抽查日' : ''}</span></h2>
    ${ready.length < 4
      ? '<div class="muted">词库里的词还不够（至少 4 个）。先去「单词库」加词——打卡时传手写照片识别，或手动添加。</div>'
      : `<div class="muted" style="margin-bottom:12px">从手账词库随机抽 ${Math.min(QUIZ_SIZE, ready.length)} 个词。错词会自动写进明天的复习清单。<b>抽查不及格不算空页</b>，它只是帮我们找到漏洞的小镜子。</div>
         <button class="btn" id="startQuiz">开始抽查</button>`}
  </div>
  <div class="card">
    <h2>🗂 抽查记录</h2>
    <div id="quizLog">${quizLogHtml(quizzes)}</div>
  </div>`;

  const startBtn = document.getElementById('startQuiz');
  if (startBtn) startBtn.addEventListener('click', () => runQuiz(page, ctx, words, type, day));
}

async function runQuiz(page, ctx, words, type, day) {
  // 优先抽 模糊/不认识 的词
  const pool = [...words.filter((w) => w.status !== 'known'), ...words.filter((w) => w.status === 'known')];
  const picked = shuffle(pool).slice(0, QUIZ_SIZE);
  const results = [];

  for (let i = 0; i < picked.length; i++) {
    const correct = await askOne(page, picked[i], i, picked.length, type, words);
    results.push({ wordId: picked[i].id, text: picked[i].text, correct });
  }

  const score = results.filter((r) => r.correct).length;
  await addRec('quizzes', {
    date: todayStr(), day, type, score, total: results.length,
    items: results.map((r) => ({ wordId: r.wordId, text: r.text, correct: r.correct })),
    createdAt: Date.now(),
  });

  // 错词滚入明天复习；对的延长复习间隔
  for (const r of results) await markWord(r.wordId, r.correct ? 'known' : 'unknown');

  const wrong = results.filter((r) => !r.correct);
  page.innerHTML = `
  <div class="card center">
    <h2>抽查结果</h2>
    <div style="font-size:40px;font-weight:700;font-family:Georgia,serif;color:${score / results.length >= 0.6 ? 'var(--teal)' : 'var(--red)'}">${score} / ${results.length}</div>
    <div class="muted" style="margin:8px 0 16px">${score / results.length >= 0.6 ? '及格线以上，这个阶段的词算是你的了。' : '不及格没关系（不算断卡），但错词已全部排进明天复习，跑不掉的。'}</div>
    ${wrong.length ? `<div class="muted" style="margin-bottom:6px">错词（明天复习清单已安排）：</div><div>${wrong.map((w) => `<span class="pill r-soft" style="margin:2px">${esc(w.text)}</span>`).join('')}</div>` : '<span class="pill t-soft">全对</span>'}
    <div style="margin-top:18px"><button class="btn" id="backQuiz">返回</button></div>
  </div>`;
  score === results.length ? sfxMilestone() : sfxFinish();
  document.getElementById('backQuiz').addEventListener('click', () => { page.innerHTML = ''; render(page, ctx); });
}

function askOne(page, word, idx, total, type, allWords) {
  return new Promise((resolve) => {
    const hasMeaning = !!word.meaning;
    const promptHtml = hasMeaning
      ? `<div class="prompt">${esc(word.meaning)}</div><div class="muted">释义 → 写出对应单词</div>`
      : `<div class="prompt">🔊 <button class="btn ghost sm" id="playBtn">播放发音</button></div><div class="muted">听发音 → 拼写单词（可反复播放）</div>`;

    if (type === 'write') {
      page.innerHTML = `
      <div class="card quiz-item">
        <h2>默写 ${idx + 1} / ${total} <span class="muted">当前词库标记：${STATUS[word.status]}</span></h2>
        ${promptHtml}
        <input type="text" id="answer" placeholder="输入英文单词" autocomplete="off" style="max-width:300px;margin:14px auto;display:block">
        <button class="btn" id="nextBtn">确认</button>
      </div>`;
      if (!hasMeaning) speak(word.text);
      const ans = document.getElementById('answer');
      ans.focus();
      document.getElementById('playBtn')?.addEventListener('click', () => speak(word.text));
      const submit = () => {
        const val = ans.value.trim().toLowerCase();
        if (!val) return;
        const correct = val === word.text.toLowerCase();
        feedback(page, word, correct, resolve);
      };
      document.getElementById('nextBtn').addEventListener('click', submit);
      ans.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    } else {
      const options = shuffle([word, ...shuffle(allWords.filter((w) => w.id !== word.id)).slice(0, 3)]);
      page.innerHTML = `
      <div class="card quiz-item">
        <h2>选择题 ${idx + 1} / ${total}</h2>
        ${hasMeaning ? `<div class="prompt">${esc(word.meaning)}</div><div class="muted">选出对应单词</div>` : `<div class="prompt">🔊 <button class="btn ghost sm" id="playBtn">播放发音</button></div><div class="muted">听发音选出单词</div>`}
        <div style="margin-top:12px">
          ${options.map((o) => `<button class="opt-btn" data-opt="${o.id}">${esc(o.text)}</button>`).join('')}
        </div>
      </div>`;
      if (!hasMeaning) speak(word.text);
      document.getElementById('playBtn')?.addEventListener('click', () => speak(word.text));
      page.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
        const correct = Number(b.dataset.opt) === word.id;
        page.querySelectorAll('[data-opt]').forEach((x) => {
          x.disabled = true;
          if (Number(x.dataset.opt) === word.id) x.classList.add('right');
        });
        if (!correct) b.classList.add('wrong');
        setTimeout(() => feedback(page, word, correct, resolve), 900);
      }));
    }
  });
}

function feedback(page, word, correct, resolve) {
  page.innerHTML = `
  <div class="card quiz-item">
    <div style="font-size:34px">${correct ? '✅' : '❌'}</div>
    <div class="prompt">${esc(word.text)}</div>
    ${word.meaning ? `<div class="muted">${esc(word.meaning)}</div>` : ''}
    <div class="muted" style="margin-top:6px">${correct ? '正确' : '错了，排进明天复习'}</div>
    <button class="btn" id="fbNext" style="margin-top:14px">下一个</button>
  </div>`;
  correct ? sfxCorrect() : sfxWrong();
  if (!correct) speak(word.text);
  document.getElementById('fbNext').addEventListener('click', () => resolve(correct));
}

function quizLogHtml(quizzes) {
  if (!quizzes.length) return '<div class="muted center" style="padding:10px 0">还没有抽查记录</div>';
  return `<table class="simple"><tr><th>日期</th><th>第N天</th><th>类型</th><th>成绩</th><th>错词</th></tr>
    ${quizzes.slice().reverse().map((q) => `<tr>
      <td>${q.date}</td><td>Day ${q.day}</td>
      <td>${q.type === 'write' ? '默写' : '选择题'}</td>
      <td><b style="color:${q.score / q.total >= 0.6 ? 'var(--teal)' : 'var(--red)'}">${q.score}/${q.total}</b></td>
      <td class="muted">${q.items.filter((i) => !i.correct).map((i) => esc(i.text)).join(', ') || '—'}</td>
    </tr>`).join('')}</table>`;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function esc(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
