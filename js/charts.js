// 纯 SVG 图表
export function heatmap(dates, startDate, days, marks) {
  // dates: Set of ok dates; marks: {date: 'broken'|'late'}
  const cell = 14, gap = 4, cols = 10;
  const rows = Math.ceil(days / cols);
  const w = cols * (cell + gap) + 60, h = rows * (cell + gap) + 30;
  let cells = '';
  for (let i = 0; i < days; i++) {
    const d = offsetDate(startDate, i);
    const c = i % cols, r = Math.floor(i / cols);
    const x = 30 + c * (cell + gap), y = 14 + r * (cell + gap);
    const ok = dates.has(d);
    const broken = marks[d] === 'broken';
    const fill = ok ? '#2F5D50' : broken ? '#C98B7D' : '#EFE8DA';
    cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${fill}"><title>Day ${i + 1} · ${d} · ${ok ? '打卡成功' : broken ? '断卡' : '未打卡'}</title></rect>`;
  }
  let labels = '';
  for (let r = 0; r < rows; r++) {
    const dayNo = r * cols + 1;
    if (dayNo <= days) labels += `<text x="24" y="${14 + r * (cell + gap) + cell / 2 + 4}" font-size="9" fill="#888780" text-anchor="end">${dayNo}</text>`;
  }
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px">${cells}${labels}
    <rect x="30" y="${h - 12}" width="12" height="10" rx="2" fill="#2F5D50"/><text x="46" y="${h - 3}" font-size="10" fill="#888780">打卡</text>
    <rect x="80" y="${h - 12}" width="12" height="10" rx="2" fill="#C98B7D"/><text x="96" y="${h - 3}" font-size="10" fill="#888780">空页</text>
    <rect x="128" y="${h - 12}" width="12" height="10" rx="2" fill="#EFE8DA"/><text x="144" y="${h - 3}" font-size="10" fill="#888780">未写</text></svg>`;
}

export function lineChart(points, opts = {}) {
  // points: [{label, value}]
  const w = 640, h = 180, padL = 34, padB = 26, padT = 14, padR = 10;
  if (!points.length) return '<div class="muted center" style="padding:16px 0">暂无数据</div>';
  const vals = points.map((p) => p.value);
  const maxV = Math.max(...vals, 1), minV = Math.min(...vals, 0);
  const span = Math.max(maxV - minV, 1);
  const x = (i) => padL + (points.length === 1 ? 0 : (i * (w - padL - padR)) / (points.length - 1));
  const y = (v) => padT + (1 - (v - minV) / span) * (h - padT - padB);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const dots = points.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="#2F5D50"><title>${p.label}：${p.value}${opts.unit || ''}</title></circle>`).join('');
  const gridVals = [0, 0.5, 1].map((t) => minV + t * span);
  const grid = gridVals.map((v) => `<line x1="${padL}" y1="${y(v)}" x2="${w - padR}" y2="${y(v)}" stroke="#E4E2DB" stroke-width="0.5"/><text x="${padL - 6}" y="${y(v) + 3}" font-size="10" fill="#888780" text-anchor="end">${Math.round(v)}</text>`).join('');
  const step = Math.max(1, Math.ceil(points.length / 12));
  const xlabels = points.map((p, i) => i % step === 0 ? `<text x="${x(i)}" y="${h - 8}" font-size="10" fill="#888780" text-anchor="middle">${p.label}</text>` : '').join('');
  return `<svg viewBox="0 0 ${w} ${h}" width="100%">${grid}<path d="${path}" fill="none" stroke="#A67B5B" stroke-width="1.5"/>${dots}${xlabels}</svg>`;
}

export function barChart(items, opts = {}) {
  // items: [{label, value}]
  if (!items.length) return '<div class="muted center" style="padding:16px 0">暂无数据</div>';
  const maxV = Math.max(...items.map((i) => i.value), 1);
  return `<div>${items.map((i) => `
    <div style="display:flex;align-items:center;gap:10px;margin:6px 0">
      <span style="width:110px;font-size:12px;color:var(--ink-2);text-align:right;flex:none">${i.label}</span>
      <div style="flex:1;background:var(--bg);border-radius:6px;height:16px;overflow:hidden">
        <div style="width:${(i.value / maxV) * 100}%;height:100%;background:${opts.color || '#534AB7'};border-radius:6px"></div>
      </div>
      <span style="width:34px;font-size:12px;color:var(--ink-3);flex:none">${i.value}${opts.unit || ''}</span>
    </div>`).join('')}</div>`;
}

function offsetDate(base, n) {
  const [y, m, d] = base.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
