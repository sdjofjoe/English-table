import { kvGet, kvSet, getStore, addRec } from './db.js';

// ============ 同桌留言 · 鼓励语规则引擎 ============
// 风格：deskmate 同桌留言（默认，温柔但具体）/ monitor 课代表（严格）/ buddy 损友（毒舌）
// 所有话术以用户称呼开头，插入当天数据，模板去重（记录最近使用过的模板 id）

const POOLS = {
  deskmate: {
    success: [
      '{name}，Day {day} 写满啦。今天阅读错{err}道{errTrend}，我都替你记在手账上了。',
      '今天的两页都贴好照片了，连续{streak}天咯。错{err}道不算什么，错因写清楚就是在攒经验值呀。',
      '第{day}天打卡收到～阅读{err}道错题、错因是{errTypes}，这些坑我们都标出来了，下次绕着走。',
      '{name}，你又稳稳交上来一天。连续{streak}天了，这本手账一天比一天厚，都是你写出来的。',
      '两张照片都齐啦，Day {day} 完美收工。错{err}道别灰心，我翻了翻，比刚开始的你已经好多了。',
      '第{day}天，没断。{streak}天连着写下来了，我看着都替你骄傲，真的。'
    ],
    milestone: [
      '连续{streak}天了！{milestoneNote}最难的日子你已经亲手翻过去了。',
      '{name}，{streak}天整！这本手账的前{streak}页一页都没空着，说到做到，我服你。',
      'Day {day}，连续{streak}天。每一条横线都是你画的，下一个小目标{nextMilestone}天，我们慢慢写。',
      '连着{streak}天没断，70天已经写完{pct}%啦。你比你以为的更能坚持，我说真的。'
    ],
    late: [
      '压着{lateTime}才交上来，吓我一跳……还好卡没断。明天陪我早点写，好不好？',
      '{name}，{lateTime}交的，掐着最后一分钟。坚持住了很棒，但别这么惊险呀，心脏受不了。',
      'Day {day}保住了，虽然是踩点。已经很了不起了，但我想看你从容一点的样子，明天早一点点就好。',
      '踩点交卷大师……卡是没断，可我替你捏了把汗。今晚早点睡，明天我们提前搞定它。'
    ],
    quality: [
      '{qDays}天错题没涨，错因还都集中在{errTypes}——说明你真的一直在进步，我看得见。',
      '{name}，我翻了这几天的记录：{qDays}天错题稳在{err}道上下，而且全是{errTypes}。这不是你的问题，是单词的债，慢慢还就好。',
      '连续{qDays}天质量在线，错因越来越集中，说明你已经摸到自己的弱点了。剩下的就是把它一点点啃掉，来得及。'
    ]
  },
  monitor: {
    success: [
      'Day {day}，交齐了。阅读错{err}道{errTrend}，错因{errTypes}——下次考前把这类题再过一遍。',
      '{name}，第{day}天打卡合格。连续{streak}天，节奏立住了。保持，别松。',
      '第{day}天收讫。{err}道错题已登记，后天抽查重点抽它们。',
      '两张照片、错因记录，全都在。{streak}天连住了，这才是备考的样子。'
    ],
    milestone: [
      '连续{streak}天。{milestoneNote}数据不会说谎，这一段你是合格的。',
      '{name}，{streak}天整。70天完成{pct}%，下个节点{nextMilestone}天，继续。',
      'Day {day}，连续{streak}天，无缺勤记录。就这么走，考场上见真章。'
    ],
    late: [
      '{lateTime}提交，压线。卡算你过了，但压线不算体面。明天提前。',
      '第{day}天踩点交卷。侥幸不等于实力，明天给我留出余量。',
      '卡没断，时间管理有问题。连续{streak}天别毁在拖延上，明天早点。'
    ],
    quality: [
      '连续{qDays}天错题持平，错因集中在{errTypes}——病灶明确，专项补词即可。',
      '{qDays}天数据稳定，{err}道错题全是{errTypes}。理解没问题，词汇量问题，可解。',
      '错因连续{qDays}天指向同一处。别绕开它，正面刚，三天内我要看到变化。'
    ]
  },
  buddy: {
    success: [
      'Day {day}，行吧没断。阅读还错{err}道呢，就这？改天抽查给你上一课。',
      '打卡收到。连{streak}天了，可以可以。不过{err}道错题还搁那儿躺着呢，看啥看，背去。',
      '第{day}天，勉强及格。明天错题不降一个，我就把你的手账拿去当草稿纸。',
      '{streak}天了呀，有两下子。但你先别飘，六级又不会因为你打卡好看就放过你。'
    ],
    milestone: [
      '连续{streak}天，{milestoneNote}行，这次我承认你有点东西。下个{nextMilestone}天，别掉链子啊。',
      '{streak}天整，70天走完{pct}%。啧，还真让你坚持下来了，那我等着看你出分那天。',
      'Day {day}，连{streak}天。恭喜，你暂时摆脱了三分钟热度选手的称号，暂时。'
    ],
    late: [
      '{lateTime}交的？踩点大师是吧。卡是没断，主要是我心脏差点断了。',
      '压线过关还一脸得意？第{day}天算你赢，明天再掐点，错题本给你撕了（开玩笑，不敢）。',
      '又压线，又压线。{name}你这心脏比你的阅读正确率强多了。'
    ],
    quality: [
      '哟，{qDays}天错题没涨，还全是{errTypes}。进步了啊你，我收回上周说的一半难听话。',
      '连着{qDays}天稳住，错因就那几样。行，你确实是块料，就是懒。改了咱俩还能处。'
    ]
  }
};

const BROKEN = {
  deskmate: [
    '{name}，昨天那一页空着……是太忙了，还是太累了？今天补上就好，别自责，我在旁边陪你写。',
    '咦，昨天的照片没交。没关系，断一天不算什么，今天两张照片贴上来，我们接着写。',
    '昨天空页了。我跟你说哦，手账最怕的不是空一页，是空了之后就不写了。今天还来得及。'
  ],
  monitor: [
    '{name}，昨天无打卡记录。说明原因：没学，还是学了没交？今天22:00前补齐。',
    '昨日空白。提醒一次：一次是意外，两次是趋势。别让今天成为第二次。',
    '断卡已登记。今天的两张照片，22:00前，交。'
  ],
  buddy: [
    '昨天呢？照片呢？你人呢？我盯着空页看了一天了啊喂。',
    '行，昨天空着是吧。今天要是不交两张，你就是三分钟热度本热度。',
    '断一天了啊。我倒要看看今天你是补上，还是接着装死。'
  ]
};

const BROKEN2 = {
  deskmate: [
    '{name}，连着{missed}天空页了，我有点担心你。是不是最近太累了？要不我们把量减一减，新词砍一半，先回到节奏——能坚持下来比什么都重要，好吗？',
    '连着{missed}天没写了。别慌，也别说算了。我们重新来：明天只背15个新词、做半篇阅读，先把「每天写一点」找回来，剩下的慢慢加。我陪你。'
  ],
  monitor: [
    '{name}，连续{missed}天无记录。建议：新词降为15个，目标改为连续打卡5天，先恢复节奏再谈进度。执行。',
    '连续{missed}天空白。目标不等人，但逞强也没意义。降量、重启、连续5天，这是止损方案，照做。'
  ],
  buddy: [
    '连断{missed}天，啧啧。当初计划表写得挺美啊？听劝：砍到15个词，先把脸捡回来再说。',
    '{missed}天空页，你是备考还是给我表演行为艺术呢？降量，今晚交卡，不然趁早承认不想考。'
  ]
};

const MILESTONE_NOTES = {
  3: '头3天是最容易放弃的，',
  7: '前7天是最难的，',
  15: '阶段A结束、明天开始加听力的，',
  30: '70天快过半的，'
};

const SIGNATURES = {
  deskmate: '——你的同桌',
  monitor: '——课代表',
  buddy: '——你的损友',
};

function fill(tpl, ctx) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (ctx[k] !== undefined && ctx[k] !== '' ? ctx[k] : ''));
}

function errTrendText(cur, prev) {
  if (prev === null || prev === undefined) return '';
  if (cur < prev) return `，比昨天少${prev - cur}道`;
  if (cur > prev) return `，比昨天多${cur - prev}道`;
  return '，跟昨天持平';
}

async function recentTemplateIds() {
  const msgs = (await getStore('messages')).slice(-12);
  return new Set(msgs.map((m) => m.tplId).filter(Boolean));
}

export async function buildCheckinMessage(ctx) {
  // ctx: {name, dayNumber, streak, readingErrors, prevReadingErrors, errorTypes, submittedAt(Date), style, apiKey...}
  const pool = POOLS[ctx.style] || POOLS.deskmate;
  const used = await recentTemplateIds();
  const hour = ctx.submittedAt.getHours(), minute = ctx.submittedAt.getMinutes();
  const late = (hour * 60 + minute) >= 21 * 60 + 30 && (hour * 60 + minute) <= 22 * 60;
  const errTrend = errTrendText(ctx.readingErrors, ctx.prevReadingErrors);

  let type = 'success';
  if (ctx.qualityStreak >= 3) type = 'quality';
  if (late) type = 'late';
  if (ctx.milestone) type = 'milestone';

  let llmMsg = null;
  if (ctx.apiKey && ctx.apiBase) {
    llmMsg = await tryLLM(ctx, type, late);
  }

  const templates = pool[type];
  let tplId = null, text = null;
  for (let i = 0; i < templates.length; i++) {
    const id = `${ctx.style}:${type}:${i}`;
    if (!used.has(id)) { tplId = id; text = templates[i]; break; }
  }
  if (!text) { tplId = `${ctx.style}:${type}:r`; text = templates[Math.floor(Math.random() * templates.length)]; }

  const nextMilestone = [3, 7, 15, 30].find((m) => m > ctx.streak) || 70;
  const data = {
    ...ctx,
    day: ctx.dayNumber,
    err: ctx.readingErrors,
    errTypes: (ctx.errorTypes || []).join('、') || '暂无记录',
    errTrend,
    lateTime: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    milestoneNote: ctx.milestone ? (MILESTONE_NOTES[ctx.streak] || '') : '',
    nextMilestone,
    pct: Math.round((ctx.dayNumber / 70) * 100),
    qDays: ctx.qualityStreak,
  };
  let body = llmMsg ? llmMsg.trim() : fill(text, data);
  // 保证每条留言都以称呼开头
  const name = ctx.name || '同学';
  if (!body.startsWith(name)) body = `${name}，${body}`;
  if (type === 'milestone' && late) body += ' 虽然是踩着点交的，但也是交了。';
  if (type === 'quality' && late) body += ' 压线归压线，质量我认。';
  const sig = SIGNATURES[ctx.style] || SIGNATURES.deskmate;
  const finalText = body + '\n' + sig;

  await addRec('messages', { date: ctx.today, type: llmMsg ? `llm-${type}` : type, text: finalText, tplId: llmMsg ? null : tplId, createdAt: Date.now() });
  return finalText;
}

export async function buildBrokenMessage(ctx) {
  // ctx: {name, missed, style, today}
  const pool = ctx.missed >= 2 ? BROKEN2 : BROKEN;
  const set = pool[ctx.style] || pool.deskmate;
  const idx = Math.floor(Math.random() * set.length);
  let body = fill(set[idx], ctx);
  const bName = ctx.name || '同学';
  if (!body.startsWith(bName)) body = `${bName}，${body}`;
  const text = body + '\n' + (SIGNATURES[ctx.style] || SIGNATURES.deskmate);
  await addRec('messages', { date: ctx.today, type: ctx.missed >= 2 ? 'broken-serious' : 'broken', text, createdAt: Date.now() });
  return text;
}

async function tryLLM(ctx, type, late) {
  try {
    const persona = ctx.style === 'monitor' ? '严格的课代表' : ctx.style === 'buddy' ? '毒舌但关系好的损友' : '温柔但说话具体的同桌';
    const sys = `你是用户的六级备考监督者，人设：${persona}。要求：称呼用户${ctx.name}开头；话术具体不空泛，必须结合数据（第几天、连续天数、错题数、错因类型）；一两句话；不用空泛的「加油」。`;
    const user = `触发场景：${type === 'milestone' ? '连续打卡里程碑' : type === 'late' ? '压线完成打卡' : type === 'quality' ? '连续多天质量好' : '打卡成功'}。数据：第${ctx.dayNumber}天，连续打卡${ctx.streak}天，今天阅读错${ctx.readingErrors}道，昨天错${ctx.prevReadingErrors ?? '?'}道，错因类型：${(ctx.errorTypes || []).join('、')}${late ? '，本次为21:30后压线提交' : ''}。生成一句留言。`;
    const res = await fetch(ctx.apiBase.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ctx.apiKey}` },
      body: JSON.stringify({
        model: ctx.apiModel || 'gpt-4o-mini',
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
        temperature: 0.9, max_tokens: 120,
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const t = j.choices?.[0]?.message?.content?.trim();
    return t && t.length < 200 ? t : null;
  } catch { return null; }
}
