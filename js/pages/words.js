import { getStore, putRec, addRec, delRec, todayStr, dateOffset } from '../db.js';
import { recognizeWords, speak } from '../ocr.js';

export const ERROR_TYPES = ['单词不认识', '句子看不懂', '定位错误', '粗心', '时间不够', '其他'];
export const STATUS = { known: '认识', fuzzy: '模糊', unknown: '不认识' };
const INTERVALS = [1, 2, 4, 7, 15, 30];

export async function addWordBatch(words, source, today) {
  const existing = await getStore('words');
  const set = new Set(existing.map((w) => w.text));
  let added = 0;
  for (const text of words) {
    if (set.has(text) || text.length < 2) continue;
    set.add(text);
    await addRec('words', {
      text, meaning: '', status: 'unknown', source,
      addedDate: today, nextReview: dateOffset(today, 1),
      goodCount: 0, wrongCount: 0,
    });
    added++;
  }
  return added;
}

export async function render(page, ctx) {
  const today = todayStr();
  const words = await getStore('words');
  const due = words.filter((w) => w.nextReview && w.nextReview <= today)
    .sort((a, b) => (a.nextReview < b.nextReview ? -1 : 1));
  const filter = { status: 'all', kw: '' };

  page.innerHTML = `
  <div class="card">
    <h2>🔁 今日复习清单 <span class="muted">${due.length} 个待复习</span></h2>
    <div id="reviewBox"></div>
  </div>
  <div class="grid2">
    <div class="card">
      <h2>✍️ 手动加词</h2>
      <textarea id="manualWords" rows="3" placeholder="输入单词，用空格、逗号或换行分隔&#10;如：ambiguous, compensate, deteriorate"></textarea>
      <button class="btn sm" id="addManual" style="margin-top:10px">加入词库</button>
    </div>
    <div class="card">
      <h2>🤖 手写照片识别加词</h2>
      <div class="dropzone" id="ocrDz">点击选择平板手写单词照片<br><span class="muted">本地 OCR（首次使用需联网），识别后勾选入库</span></div>
      <div id="ocrResult" style="margin-top:10px"></div>
    </div>
  </div>
  <div class="card">
    <h2>📚 词库 <span class="muted">共 ${words.length} 词 · 认识 ${words.filter((w) => w.status === 'known').length} / 模糊 ${words.filter((w) => w.status === 'fuzzy').length} / 不认识 ${words.filter((w) => w.status === 'unknown').length}</span></h2>
    <div class="flexrow" style="margin-bottom:10px">
      <select id="statusFilter" style="width:auto">
        <option value="all">全部状态</option>
        <option value="known">认识</option><option value="fuzzy">模糊</option><option value="unknown">不认识</option>
      </select>
      <input type="text" id="kwFilter" placeholder="搜索单词…" style="max-width:220px">
    </div>
    <div id="wordList"></div>
  </div>`;

  renderReview(due.slice(0, 30));
  renderList();

  function renderReview(items) {
    const box = document.getElementById('reviewBox');
    if (!items.length) { box.innerHTML = '<div class="muted center" style="padding:14px 0">今天没有待复习的词，或词库还是空的</div>'; return; }
    box.innerHTML = items.map((w) => `
      <div class="word-row" data-wid="${w.id}">
        <span class="w">${esc(w.text)} <span class="muted" style="cursor:pointer" data-speak="${w.id}">🔊</span></span>
        <span class="m">${esc(w.meaning || '')}</span>
        <button class="btn sm ghost" data-mark="known">认识</button>
        <button class="btn sm ghost" data-mark="fuzzy">模糊</button>
        <button class="btn sm warn" data-mark="unknown">不认识</button>
      </div>`).join('');
    box.querySelectorAll('[data-mark]').forEach((b) => b.addEventListener('click', async (e) => {
      const id = Number(e.target.closest('[data-wid]').dataset.wid);
      await markWord(id, b.dataset.mark);
      const w = words.find((x) => x.id === id);
      const idx = items.findIndex((x) => x.id === id);
      if (idx >= 0) items.splice(idx, 1);
      renderReview(items);
      renderList();
    }));
    box.querySelectorAll('[data-speak]').forEach((el) => el.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(el.dataset.speak);
      const w = words.find((x) => x.id === id);
      if (w) speak(w.text);
    }));
  }

  function renderList() {
    const list = document.getElementById('wordList');
    let ws = words.slice().sort((a, b) => (a.text < b.text ? -1 : 1));
    if (filter.status !== 'all') ws = ws.filter((w) => w.status === filter.status);
    if (filter.kw) ws = ws.filter((w) => w.text.includes(filter.kw) || (w.meaning || '').includes(filter.kw));
    list.innerHTML = ws.length ? ws.slice(0, 200).map((w) => `
      <div class="word-row">
        <span class="w">${esc(w.text)}</span>
        <input type="text" class="m" data-meaning="${w.id}" value="${escAttr(w.meaning || '')}" placeholder="释义（选填，抽查时显示）">
        <select data-status="${w.id}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${w.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <span class="muted" style="font-size:11px;min-width:56px">${w.nextReview && w.nextReview > today ? w.nextReview.slice(5) + ' 复习' : '待复习'}</span>
        <button class="btn sm ghost" data-del="${w.id}">删</button>
      </div>`).join('') + (ws.length > 200 ? `<div class="muted center" style="padding:8px">仅显示前 200 个，共 ${ws.length} 个</div>` : '') : '<div class="muted center" style="padding:14px 0">词库为空，先手动加词或用手写照片识别</div>';

    list.querySelectorAll('[data-meaning]').forEach((inp) => inp.addEventListener('change', async () => {
      const w = words.find((x) => x.id === Number(inp.dataset.meaning));
      if (w) { w.meaning = inp.value.trim(); await putRec('words', w); }
    }));
    list.querySelectorAll('[data-status]').forEach((sel) => sel.addEventListener('change', async () => {
      const w = words.find((x) => x.id === Number(sel.dataset.status));
      if (w) { w.status = sel.value; await putRec('words', w); ctx.toast('已更新'); }
    }));
    list.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.del);
      await delRec('words', id);
      const i = words.findIndex((x) => x.id === id);
      if (i >= 0) words.splice(i, 1);
      renderList();
    }));
  }

  document.getElementById('statusFilter').addEventListener('change', (e) => { filter.status = e.target.value; renderList(); });
  document.getElementById('kwFilter').addEventListener('input', (e) => { filter.kw = e.target.value.trim().toLowerCase(); renderList(); });

  document.getElementById('addManual').addEventListener('click', async () => {
    const raw = document.getElementById('manualWords').value;
    const ws = raw.split(/[\s,;，、\n]+/).map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z][a-z'-]+$/.test(x));
    if (!ws.length) { ctx.toast('没解析出有效单词'); return; }
    const added = await addWordBatch(ws, 'manual', today);
    ctx.toast(`新增 ${added} 个（重复 ${ws.length - added} 个已跳过）`);
    page.innerHTML = ''; render(page, ctx);
  });

  // OCR 区
  const dz = document.getElementById('ocrDz');
  const fileInput = document.createElement('input');
  fileInput.type = 'file'; fileInput.accept = 'image/*';
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) runOcr(fileInput.files[0]); });
  dz.addEventListener('click', () => fileInput.click());
  async function runOcr(f) {
    const box = document.getElementById('ocrResult');
    box.innerHTML = '<span class="spin">⏳</span> 识别中，首次使用需下载引擎（约 5–20 秒）…';
    try {
      const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
      const words = await recognizeWords(dataUrl);
      if (!words.length) { box.innerHTML = '<span class="pill r-soft">没识别到英文单词</span> 照片再拍清楚些（光线、字距）'; return; }
      box.innerHTML = `<div class="muted" style="margin-bottom:8px">识别到 ${words.length} 个词，勾选要入库的：</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">${words.map((w, i) => `<label class="pill p-soft" style="cursor:pointer"><input type="checkbox" value="${escAttr(w)}" checked style="width:auto;margin-right:4px">${esc(w)}</label>`).join('')}</div>
        <button class="btn sm" id="ocrAdd" style="margin-top:10px">入库所选（去重后）</button>`;
      document.getElementById('ocrAdd').addEventListener('click', async () => {
        const sel = [...box.querySelectorAll('input:checked')].map((i) => i.value);
        const added = await addWordBatch(sel, 'ocr', today);
        ctx.toast(`新增 ${added} 个`);
        page.innerHTML = ''; render(page, ctx);
      });
    } catch (e) {
      box.innerHTML = '<span class="pill r-soft">识别失败</span> 请确认网络可用（首次加载 OCR 引擎需联网），或先手动加词';
    }
  }
}

export async function markWord(id, mark) {
  const words = await getStore('words');
  const w = words.find((x) => x.id === id);
  if (!w) return;
  w.status = mark;
  if (mark === 'known') {
    w.goodCount = (w.goodCount || 0) + 1;
    w.nextReview = dateOffset(todayStr(), INTERVALS[Math.min(w.goodCount - 1, INTERVALS.length - 1)]);
  } else if (mark === 'fuzzy') {
    w.goodCount = 0;
    w.nextReview = dateOffset(todayStr(), 1);
  } else {
    w.goodCount = 0;
    w.wrongCount = (w.wrongCount || 0) + 1;
    w.nextReview = dateOffset(todayStr(), 1);
  }
  await putRec('words', w);
}

function esc(t) { const d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; }
function escAttr(t) { return String(t == null ? '' : t).replace(/"/g, '&quot;'); }
