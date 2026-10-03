import { getSettings, saveSettings, getStore, kvSet, clearStore, db, todayStr } from '../db.js';
import { setSfxEnabled } from '../sfx.js';

const STORES = ['checkins', 'words', 'quizzes', 'messages', 'tasks'];

export async function render(page, ctx) {
  const s = await getSettings();
  page.innerHTML = `
  <div class="card">
    <h2>⚙️ 基本设置</h2>
    <div class="grid2">
      <div>
        <label class="fld"><span>你的称呼（教练喊你用）</span><input type="text" id="setName" value="${escAttr(s.name)}"></label>
        <label class="fld"><span>备考起始日（Day 1）</span><input type="date" id="setStart" value="${s.startDate}"></label>
        <label class="fld" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" id="setSound" style="width:auto" ${s.sound !== false ? 'checked' : ''}><span style="margin:0">音效（勾选任务、盖章、抽查对错的声音）</span></label>
      </div>
      <div>
        <label class="fld"><span>留言人风格</span>
          <select id="setStyle">
            <option value="deskmate" ${s.style === 'deskmate' ? 'selected' : ''}>同桌留言 · 温柔但具体（推荐）</option>
            <option value="monitor" ${s.style === 'monitor' ? 'selected' : ''}>课代表 · 严格</option>
            <option value="buddy" ${s.style === 'buddy' ? 'selected' : ''}>损友 · 毒舌</option>
          </select>
        </label>
        <div class="muted" style="margin-top:4px">断卡留言不受风格影响：断 1 天追问，连断 2 天毒舌提醒 + 建议降量。</div>
      </div>
    </div>
    <button class="btn" id="saveBasic">保存</button>
  </div>

  <div class="card">
    <h2>🤖 AI 增强（选填）</h2>
    <div class="muted" style="margin-bottom:10px">不填也完全能用：留言由内置规则引擎生成。填了 OpenAI 兼容接口的 key，留言升级为 AI 实时生成（失败自动回退规则引擎）。</div>
    <div class="grid2">
      <div>
        <label class="fld"><span>API Base（如 https://api.deepseek.com/v1）</span><input type="text" id="setApiBase" value="${escAttr(s.apiBase)}" placeholder="https://api.deepseek.com/v1"></label>
      </div>
      <div>
        <label class="fld"><span>API Key</span><input type="password" id="setApiKey" value="${escAttr(s.apiKey)}" placeholder="sk-…"></label>
        <label class="fld"><span>模型名（如 deepseek-chat）</span><input type="text" id="setApiModel" value="${escAttr(s.apiModel)}" placeholder="deepseek-chat"></label>
      </div>
    </div>
    <button class="btn" id="saveApi">保存 AI 配置</button>
  </div>

  <div class="card">
    <h2>💾 数据备份</h2>
    <div class="muted" style="margin-bottom:10px">数据都在这台电脑这个浏览器里。换电脑 / 重装浏览器前，先导出。导入会覆盖当前数据。</div>
    <button class="btn ghost" id="exportBtn">导出全部数据（JSON）</button>
    <button class="btn ghost" id="importBtn" style="margin-left:8px">导入数据</button>
    <input type="file" id="importFile" accept=".json" style="display:none">
  </div>

  <div class="card">
    <h2>🖥 放到桌面</h2>
    <div class="muted">用 Chrome / Edge 打开本页面，地址栏右侧会出现「安装」图标，点它即可变成独立桌面应用（支持离线，OCR 首次使用需联网）。</div>
  </div>

  <div class="card">
    <h2>⚠️ 危险区</h2>
    <button class="btn warn" id="resetBtn">清空全部数据</button>
  </div>`;

  document.getElementById('saveBasic').addEventListener('click', async () => {
    await saveSettings({
      name: document.getElementById('setName').value.trim() || '同学',
      startDate: document.getElementById('setStart').value || todayStr(),
      style: document.getElementById('setStyle').value,
      sound: document.getElementById('setSound').checked,
    });
    setSfxEnabled(document.getElementById('setSound').checked);
    ctx.toast('已保存'); ctx.refreshBrand();
  });

  document.getElementById('saveApi').addEventListener('click', async () => {
    await saveSettings({
      apiBase: document.getElementById('setApiBase').value.trim(),
      apiKey: document.getElementById('setApiKey').value.trim(),
      apiModel: document.getElementById('setApiModel').value.trim(),
    });
    ctx.toast('AI 配置已保存');
  });

  document.getElementById('exportBtn').addEventListener('click', async () => {
    const data = { version: 1, exportedAt: new Date().toISOString(), settings: await getSettings() };
    for (const st of STORES) data[st] = await getStore(st);
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cet6-backup-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.version) throw new Error('bad file');
      for (const st of STORES) {
        await clearStore(st);
        const d = await db();
        await new Promise((res, rej) => {
          const t = d.transaction(st, 'readwrite');
          for (const rec of data[st] || []) t.objectStore(st).put(rec);
          t.oncomplete = res; t.onerror = () => rej(t.error);
        });
      }
      if (data.settings) await kvSet('settings', data.settings);
      ctx.toast('导入完成');
      ctx.go('today'); ctx.refreshBrand();
    } catch {
      ctx.toast('导入失败：文件格式不对');
    }
  });

  document.getElementById('resetBtn').addEventListener('click', async () => {
    if (!confirm('确定清空全部数据？打卡记录、词库、统计都会消失，无法恢复。建议先导出备份。')) return;
    if (!confirm('再确认一次：真的全部清空？')) return;
    for (const st of STORES) await clearStore(st);
    ctx.toast('已清空'); ctx.go('today'); ctx.refreshBrand();
  });
}

function escAttr(t) { return String(t == null ? '' : t).replace(/"/g, '&quot;'); }
