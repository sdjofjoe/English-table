import { getSettings, getStore, putRec, todayStr, fmtDate, parseDate } from '../db.js';
import { currentDay, computeStreak } from '../plan.js';
import { buildCheckinMessage } from '../encourage.js';
import { recognizeWords } from '../ocr.js';
import { addWordBatch, ERROR_TYPES } from './words.js';
import { sfxStamp, sfxLate, sfxMilestone, sfxAdd } from '../sfx.js';

export async function render(page, ctx) {
  const s = await getSettings();
  const today = todayStr();
  const checkins = await getStore('checkins');
  const existing = checkins.find((c) => c.date === today);
  const day = currentDay(s.startDate);

  page.innerHTML = `
  <div class="card">
    <h2>📸 今日打卡 <span class="muted">第 ${day} 天 · 两张缺一不可 · 22:00 截止</span></h2>
    <div id="doneBox" style="${existing ? '' : 'display:none'}">
      <div class="stamp"><span class="big">${existing?.success === false ? '迟 交' : '打卡 ✓'}</span><span class="small">Day ${day}</span></div>
      <div class="coach"><div class="who">同桌的小纸条</div><div class="msg" id="doneMsg"></div></div>
      <div class="flexrow" id="donePhotos" style="margin:12px 0"></div>
      <button class="btn ghost" id="recheckinBtn">重新贴一次</button>
    </div>
    <div id="formBox" style="${existing ? 'display:none' : ''}">
      <div class="flexrow" style="margin-bottom:14px">
        <div class="photo-slot">
          <h3>照片 1 · 百词斩完成截图<span class="pill r-soft">必填</span></h3>
          <div class="dropzone" id="dz1">点击选择 / 拖入图片<br><span class="muted">新词 + 复习完成页面</span></div>
        </div>
        <div class="photo-slot">
          <h3>照片 2 · 做题错因标注<span class="pill r-soft">必填</span></h3>
          <div class="dropzone" id="dz2">点击选择 / 拖入图片<br><span class="muted">阅读错题与错因标注</span></div>
        </div>
      </div>
      <div class="grid2">
        <div>
          <label class="fld"><span>今天阅读错了几道？</span><input type="number" id="errCount" min="0" max="25" value="0" placeholder="如 3"></label>
          <label class="fld"><span>错因类型（可多选）</span>
            <div id="errTypes" style="display:flex;gap:8px;flex-wrap:wrap">${ERROR_TYPES.map((t) => `<label class="pill p-soft" style="cursor:pointer"><input type="checkbox" value="${t}" style="width:auto;margin-right:4px">${t}</label>`).join('')}</div>
          </label>
        </div>
        <div>
          <h3 style="font-size:13px;color:var(--ink-2);margin-bottom:6px">附加 · 手写单词照片 <span class="pill t-soft">选填</span></h3>
          <div class="dropzone" id="dz3">点击选择 / 拖入平板手写单词照片</div>
          <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
            <button class="btn ghost sm" id="ocrBtn" ${existing?.photo3 ? '' : 'disabled'}>🔍 识别这张照片的单词</button>
            <span class="muted" id="ocrHint" style="font-size:12px">选好照片后点它，识别结果会进词库（需勾选确认）</span>
          </div>
        </div>
      </div>
      <button class="btn" id="submitBtn" style="margin-top:14px" ${existing ? 'disabled' : ''}>${existing ? '今日已提交' : '提交打卡'}</button>
      <span class="muted" id="hint" style="margin-left:10px"></span>
    </div>
  </div>
  <div class="card">
    <h2>📖 手账规则</h2>
    <div class="muted">每天 22:00 前往这一页贴两张照片：① 百词斩截图（新词+复习完成）② 做题错因标注。少一张算空页（断卡）。21:30 后贴算「压线」，过了 22:00 记空页。平板手写的单词照片可选，贴上来识别后进单词库，三天抽查时考的就是它们。</div>
  </div>`;

  if (existing) {
    showDone(existing);
    document.getElementById('recheckinBtn').addEventListener('click', () => {
      document.getElementById('doneBox').style.display = 'none';
      document.getElementById('formBox').style.display = '';
      document.getElementById('submitBtn').disabled = false;
      document.getElementById('submitBtn').textContent = '重新提交打卡';
    });
  }

  const state = { photo1: existing?.photo1 || null, photo2: existing?.photo2 || null, photo3: existing?.photo3 || null };
  setupDropzone('dz1', (dataUrl) => { state.photo1 = dataUrl; });
  setupDropzone('dz2', (dataUrl) => { state.photo2 = dataUrl; });
  setupDropzone('dz3', (dataUrl) => {
    state.photo3 = dataUrl;
    const ob = document.getElementById('ocrBtn');
    const oh = document.getElementById('ocrHint');
    if (ob) { ob.disabled = false; }
    if (oh) { oh.textContent = '照片已就位，点「识别」→ 结果进词库'; }
  });

  // 手写单词识别：独立按钮触发，与打卡提交解耦
  document.getElementById('ocrBtn')?.addEventListener('click', async () => {
    const ob = document.getElementById('ocrBtn');
    const oh = document.getElementById('ocrHint');
    if (!state.photo3) { if (oh) oh.textContent = '先选一张手写单词照片～'; return; }
    ob.disabled = true; ob.textContent = '识别中…（首次需联网加载引擎）';
    try {
      const words = await recognizeWords(state.photo3);
      const added = await addWordBatch(words, 'ocr', today);
      sfxAdd();
      if (oh) oh.textContent = `识别到 ${words.length} 个词，新增 ${added} 个到词库，去「单词库」勾选确认`;
      ctx.toast(`识别完成：${words.length} 个词`);
    } catch (e) {
      if (oh) oh.textContent = '识别失败：首次使用需联网加载 OCR 引擎，或换个光线好点的照片';
    }
    ob.disabled = false; ob.textContent = '🔍 识别这张照片的单词';
  });

  document.getElementById('submitBtn').addEventListener('click', async () => {
    const btn = document.getElementById('submitBtn');
    const hint = document.getElementById('hint');
    if (!state.photo1 || !state.photo2) { hint.textContent = '两张照片缺一不可，先补齐再提交。'; return; }
    const now = new Date();
    const err = parseInt(document.getElementById('errCount').value || '0', 10);
    const errTypes = [...document.querySelectorAll('#errTypes input:checked')].map((i) => i.value);
    if (err > 0 && errTypes.length === 0) { hint.textContent = '有错题的话顺手选一下错因类型，同桌要帮你记小本本哒。'; return; }

    btn.disabled = true; btn.textContent = '提交中…';
    let rec = existing || { date: today };
    rec.photo1 = state.photo1; rec.photo2 = state.photo2; rec.photo3 = state.photo3;
    rec.readingErrors = err; rec.errorTypes = errTypes;
    rec.submittedAt = now.getTime();
    rec.timeText = fmtTime(now);
    const minutes = now.getHours() * 60 + now.getMinutes();
    rec.success = minutes <= 22 * 60;
    rec.late = rec.success && minutes >= 21 * 60 + 30;
    await putRec('checkins', rec);

    // 鼓励语
    const checkins2 = await getStore('checkins');
    const streak = computeStreak(checkins2, today);
    const sorted = checkins2.filter((c) => c.date < today && c.success).sort((a, b) => a.date < b.date ? 1 : -1);
    const prevErr = sorted.length ? sorted[0].readingErrors : null;
    let qualityStreak = 0;
    for (const c of sorted) { if (c.readingErrors !== undefined && c.readingErrors <= (prevErr ?? c.readingErrors)) qualityStreak++; else break; }
    const msg = await buildCheckinMessage({
      name: s.name, dayNumber: day, streak, readingErrors: err, prevReadingErrors: prevErr,
      errorTypes: errTypes, submittedAt: now, style: s.style, today,
      milestone: [3, 7, 15, 30].includes(streak), qualityStreak,
      apiKey: s.apiKey, apiBase: s.apiBase, apiModel: s.apiModel,
    });
    ctx.toast(rec.success ? '打卡成功' : '已记录（超时，记断卡）');
    if (rec.success) {
      if ([3, 7, 15, 30].includes(streak)) sfxMilestone(); else sfxStamp();
    } else {
      sfxLate();
    }
    showMsgPop(msg, rec.success, day);
    showDone({ ...rec, message: msg });
    document.getElementById('doneBox').style.display = '';
    document.getElementById('formBox').style.display = 'none';
    ctx.refreshBrand();
  });

  function showDone(rec) {
    document.getElementById('doneBox').style.display = '';
    document.getElementById('formBox').style.display = 'none';
    const msgs = window.__msgCache || [];
    const box = document.getElementById('doneMsg');
    const m = msgs.filter((x) => x.date === today).pop() || rec.message;
    box.textContent = m ? (typeof m === 'string' ? m : m.text) : '打卡已记录。';
    const photos = document.getElementById('donePhotos');
    photos.innerHTML = [rec.photo1, rec.photo2, rec.photo3].filter(Boolean)
      .map((p) => `<img src="${p}" class="preview" style="max-height:140px;border-radius:8px;border:1px solid var(--border)">`).join('');
  }
}

function fmtTime(d) {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 打卡后弹出的小纸条：盖章 + 同桌留言，必须看到才关得掉
function showMsgPop(text, success, day) {
  document.querySelector('.msg-overlay')?.remove();
  const ov = document.createElement('div');
  ov.className = 'msg-overlay';
  const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  ov.innerHTML = `
  <div class="msg-pop">
    <div class="pop-tape"></div>
    <div class="stamp pop-stamp ${success ? '' : 'late'}"><span class="big">${success ? '打卡 ✓' : '迟 交'}</span><span class="small">Day ${day}</span></div>
    <div class="pop-note">
      <div class="who">✉️ 同桌的小纸条</div>
      <div class="msg">${esc(text).replace(/\n/g, '<br>')}</div>
    </div>
    <button class="btn" id="popClose">收好这张纸条</button>
  </div>`;
  document.body.appendChild(ov);
  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.id === 'popClose') {
      ov.classList.add('closing');
      setTimeout(() => ov.remove(), 180);
    }
  });
}

function setupDropzone(id, onPick) {
  const dz = document.getElementById(id);
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.addEventListener('change', () => { if (input.files[0]) handleFile(input.files[0]); });
  dz.addEventListener('click', () => input.click());
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.background = 'var(--primary-soft)'; });
  dz.addEventListener('dragleave', () => { dz.style.background = ''; });
  dz.addEventListener('drop', (e) => {
    e.preventDefault(); dz.style.background = '';
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('image/')) handleFile(f);
  });
  function handleFile(f) {
    const reader = new FileReader();
    reader.onload = () => {
      compress(reader.result).then((dataUrl) => {
        onPick(dataUrl);
        dz.innerHTML = `<img src="${dataUrl}" class="preview"><div class="muted" style="margin-top:6px">点击更换</div>`;
      });
    };
    reader.readAsDataURL(f);
  }
}

// 压缩大图，避免 IndexedDB 膨胀
function compress(dataUrl, maxW = 1200, quality = 0.8) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      try { resolve(c.toDataURL('image/jpeg', quality)); } catch { resolve(dataUrl); }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
