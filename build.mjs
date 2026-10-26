// 零依赖构建：content/*.md → dist/。版式为已定稿的 A「Playbook 红墨」。
import fs from 'node:fs';
import path from 'node:path';

const SRC = 'content';
const OUT = 'dist';
const TYPE = { cn: '国内', intl: '国际' };
const KICKER = { cn: 'DOMESTIC', intl: 'INTERNATIONAL' };
const BLURB = {
  cn: '大模型产品、开源权重、融资与监管相关更新，按日归档。',
  intl: 'OpenAI、Anthropic、xAI、Google、Meta 等海外一线动态。',
};
const FOOT = '每日国内（北京时间 9:00/21:00）与国际（美东 9:00/21:00）两次更新 · 内容由亦菲整理';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function shortUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    const seg = u.pathname.split('/').filter(Boolean);
    if (host === 'x.com' || host === 'twitter.com') return seg[0] ? `${host}/${seg[0]}/…` : host;
    return seg.length ? `${host}/…` : host;
  } catch {
    return url.length > 42 ? `${url.slice(0, 28)}…` : url;
  }
}

function linkify(s) {
  const urls = [];
  const token = String(s).replace(/(https?:\/\/[^\s<，。）)]+)/g, (u) => {
    urls.push(u);
    return `\u0000${urls.length - 1}\u0000`;
  });
  return esc(token).replace(/\u0000(\d+)\u0000/g, (_, i) => {
    const u = urls[+i];
    return `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(shortUrl(u))}</a>`;
  });
}

function parse(file) {
  const raw = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\r\n/g, '\n');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error('缺少 frontmatter: ' + file);
  const fm = {};
  for (const l of m[1].split('\n')) {
    const i = l.indexOf(':');
    if (i < 0) continue;
    let v = l.slice(i + 1).trim();
    if (v.startsWith('"')) v = JSON.parse(v);
    fm[l.slice(0, i).trim()] = v;
  }
  for (const k of ['date', 'slot', 'type', 'headline', 'summary']) {
    if (!fm[k]) throw new Error(`${file} 缺少字段 ${k}`);
  }
  fm.items = Number(fm.items || 0);
  fm.slug = file.replace(/\.md$/, '');
  fm.body = m[2].trim();
  fm.slot = String(fm.slot);
  fm.time = fm.time || `${fm.slot.slice(0, 2)}:${fm.slot.slice(2)}`;
  fm.title = fm.title || `${TYPE[fm.type]} AI 动态简报｜${fm.date} ${fm.time}`;
  fm.parsed = parseBody(fm.body);
  return fm;
}

const cjkCount = (s) => (String(s).match(/[\u4e00-\u9fff]/g) || []).length;

function isSourceLine(l) {
  const t = l.trim();
  if (/^https?:\/\/\S+(\s+https?:\/\/\S+)*$/.test(t)) return true;
  return /^.{1,16}[：:]\s*https?:\/\/\S+\s*$/.test(t);
}

function isNoteLine(l) {
  return /无新增|没有新增|没有新消息|没有新动作|没有实质新增|均无官方|都没有新增|都没有可报|无官方新增|官方账号无新增|除闲聊/.test(l);
}

function bracketOf(l) {
  const m = l.match(/^【([^】]+)】$/);
  if (!m) return null;
  if (/其余|无新增|没有|盯盘/.test(m[1])) return { note: m[1].trim() };
  return { company: m[1].trim() };
}

function cnSection(l) {
  const m = l.match(/^[一二三四五六七八九十]+、\s*(.+)$/);
  if (!m) return null;
  const name = m[1].trim();
  if (/其余|无新增|没有|盯盘/.test(name) && name.length <= 16) return { note: name };
  if (name.length <= 20 && cjkCount(name) <= 8 && !/[。，；]/.test(name)) return { company: name };
  return { item: name };
}

function isNameLine(l) {
  if (!l || l.length > 36) return false;
  if (/[。；：:]/.test(l) || /[，,]/.test(l)) return false;
  if (cjkCount(l) > 8) return false;
  if (/发布|上线|下线|确认|宣布|推出|开源|融资|升级|重置|披露|收购|起诉|合并|延迟|推迟|完成|停止|禁用/.test(l)) return false;
  return /[A-Za-z\u4e00-\u9fff]/.test(l);
}

function splitLead(s) {
  const idx = s.indexOf('。');
  if (idx <= 0) return { title: s.trim(), body: '' };
  return { title: s.slice(0, idx).trim(), body: s.slice(idx + 1).trim() };
}

const PULL = /^(路透社?|彭博社?|证券时报|英国《金融时报》|《金融时报》|The Information|Axios)/;

function blocksFromParas(paras) {
  const blocks = [];
  let used = false;
  for (const p of paras) {
    if (!p) continue;
    if (used) {
      blocks.push({ type: 'p', text: p });
      continue;
    }
    const sents = p.split(/(?<=。)/).map((x) => x.trim()).filter(Boolean);
    const idx = sents.findIndex((s, i) => i > 0 && s.length >= 16 && s.length <= 72 && PULL.test(s));
    if (idx === -1) {
      blocks.push({ type: 'p', text: p });
      continue;
    }
    used = true;
    const before = sents.slice(0, idx).join('');
    const after = sents.slice(idx + 1).join('');
    if (before) blocks.push({ type: 'p', text: before });
    blocks.push({ type: 'q', text: sents[idx].replace(/。$/, '') + '。' });
    if (after) blocks.push({ type: 'p', text: after });
  }
  return blocks;
}

function parseBody(text) {
  let lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
  if (lines.length && /^今日要点[：:]\S/.test(lines[0])) lines = lines.slice(1);
  else if (lines.length && /^今日要点$/.test(lines[0])) {
    lines = lines.slice(1);
    if (lines[0] && /[。]/.test(lines[0]) && !/^\d+\.\s/.test(lines[0]) && !bracketOf(lines[0]) && !cnSection(lines[0])) {
      lines = lines.slice(1);
    }
  }

  const items = [];
  const notes = [];
  let company = '';
  let cur = null;
  let noting = false;
  const close = () => {
    if (!cur) return;
    if (cur.title || cur.paras.length) items.push(cur);
    cur = null;
  };
  const start = (title, para) => {
    noting = false;
    cur = { company, title: title.trim(), paras: para ? [para] : [], sources: [] };
  };

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const next = lines[i + 1] || '';
    const bracket = bracketOf(l);
    if (bracket) {
      close();
      if (bracket.note) noting = true;
      else {
        company = bracket.company;
        noting = false;
      }
      continue;
    }
    const cn = cnSection(l);
    if (cn?.note) {
      close();
      noting = true;
      if (cn.note.length > 12) notes.push(cn.note);
      continue;
    }
    if (cn?.company) {
      close();
      company = cn.company;
      noting = false;
      continue;
    }
    if (isSourceLine(l)) {
      if (cur) cur.sources.push(l);
      else notes.push(l);
      continue;
    }
    const boundary = !cur || cur.sources.length > 0;
    if (boundary && isNoteLine(l)) {
      close();
      noting = true;
      notes.push(l);
      continue;
    }
    if (noting && !/^\d+\.\s/.test(l) && !cn?.item) {
      if (isNameLine(l) && next && !isSourceLine(next)) {
        company = l;
        noting = false;
        continue;
      }
      notes.push(l);
      continue;
    }
    if (isNameLine(l) && next && !isSourceLine(next) && boundary) {
      close();
      company = l;
      noting = false;
      continue;
    }
    if (/^\d+\.\s+/.test(l)) {
      close();
      const { title, body } = splitLead(l.replace(/^\d+\.\s+/, ''));
      start(title, body);
      continue;
    }
    if (cn?.item) {
      close();
      const { title, body } = splitLead(cn.item);
      start(title, body);
      continue;
    }
    if (!cur || cur.sources.length) {
      close();
      if (/[。]/.test(l)) {
        const { title, body } = splitLead(l);
        start(title, body);
      } else start(l, '');
    } else cur.paras.push(l);
  }
  close();
  items.forEach((it, idx) => {
    it.n = String(idx + 1).padStart(2, '0');
    it.blocks = blocksFromParas(it.paras);
  });
  return { items, notes };
}

function renderSource(line) {
  const t = line.trim();
  let label = '来源';
  let rest = t;
  const lm = t.match(/^(.{1,16})[：:]\s*(https?:\/\/[\s\S]+)$/);
  if (lm) {
    label = lm[1].trim();
    rest = lm[2];
  }
  const urls = rest.match(/https?:\/\/[^\s<，。）)]+/g) || [];
  if (!urls.length) return `<p class="src">${linkify(line)}</p>`;
  return urls
    .map((u) => `<p class="src">${esc(label)}：<a href="${esc(u)}" target="_blank" rel="noopener">${esc(shortUrl(u))}</a></p>`)
    .join('\n');
}

function renderItem(it, index) {
  let dropped = false;
  const body = it.blocks
    .map((b) => {
      if (b.type === 'q') return `<blockquote class="pull">${linkify(b.text)}</blockquote>`;
      const drop = index === 0 && !dropped && /^[\u4e00-\u9fffA-Za-z]/.test(b.text);
      if (drop) dropped = true;
      return `<p class="body-text${drop ? ' drop' : ''}">${linkify(b.text)}</p>`;
    })
    .join('\n');
  const company = it.company ? `<div class="company">${esc(it.company)}</div>` : '';
  const sources = it.sources.map(renderSource).join('\n');
  return `<section class="item" id="item-${it.n}">
<div class="item-head"><span class="item-num">${it.n}</span><div><h2>${esc(it.title)}</h2>${company}</div></div>
${body}
${sources}
</section>`;
}

const fmtDate = (d) => {
  const [y, m, dd] = d.split('-');
  return `${y}年${+m}月${+dd}日`;
};
const dotDate = (d) => d.replace(/-/g, '.');
const md = (d) => d.slice(5);

function stats(count, countLabel, kind, kindLabel, time, timeLabel) {
  return `<div class="stats">
<div class="stat"><div class="n">${esc(count)}</div><div class="l">${esc(countLabel)}</div></div>
<div class="stat"><div class="n ink">${esc(kind)}</div><div class="l">${esc(kindLabel)}</div></div>
<div class="stat"><div class="n ink">${esc(time)}</div><div class="l">${esc(timeLabel)}</div></div>
</div>`;
}

const CSS = fs.readFileSync('src/style.css', 'utf8');

function page(title, active, inner, root, stripL, stripR) {
  const on = (k) => (active === k ? ' class="on"' : '');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="${root}style.css"></head><body>
<div class="meta-strip"><div class="inner"><div>${stripL}</div><div>${stripR}</div></div></div>
<header class="top"><div class="wrap nav"><a class="brand" href="${root}index.html">AI <span>日报</span></a><nav>
<a href="${root}index.html"${on('home')}>首页</a><a href="${root}cn.html"${on('cn')}>国内动态</a><a href="${root}intl.html"${on('intl')}>国际动态</a>
</nav></div></header>
<main>${inner}</main>
<footer class="foot"><div class="wrap">${FOOT}</div></footer>
</body></html>`;
}

function card(p) {
  return `<a class="card" href="${p.root || ''}p/${p.slug}.html"><div class="meta"><span class="tag ${p.type}">${TYPE[p.type]}</span><span>${md(p.date)} · ${esc(p.time)}</span></div><h3>${esc(p.headline)}</h3><p>${esc(p.summary)}</p><div class="cf"><span>${p.items} 条</span><span class="read">阅读全文 →</span></div></a>`;
}

function grouped(list) {
  const g = {};
  for (const p of list) (g[p.date] ??= []).push(p);
  return Object.keys(g)
    .sort()
    .reverse()
    .map((d) => `<section class="day"><h3 class="dh">${fmtDate(d)}</h3><div class="grid">${g[d].map(card).join('')}</div></section>`)
    .join('');
}

function pointsHtml(p) {
  const rows = p.parsed.items.slice(0, 6);
  if (!rows.length) return '';
  const lis = rows
    .map((it) => `<li><a href="p/${p.slug}.html#item-${it.n}"><span class="num">${it.n}</span><span>${esc(it.title)}</span></a></li>`)
    .join('');
  return `<div class="points"><div class="points-label">要点</div><ul>${lis}</ul></div>`;
}

const posts = fs
  .readdirSync(SRC)
  .filter((f) => f.endsWith('.md'))
  .map(parse)
  .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));

for (const p of posts) {
  const n = p.parsed.items.length;
  if (!n) throw new Error(`${p.slug} 没有解析出条目`);
  if (n !== p.items) console.warn(`条目数与 frontmatter 不一致 ${p.slug}: 标明 ${p.items}，解析 ${n}`);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT + '/p', { recursive: true });
fs.writeFileSync(OUT + '/style.css', CSS);

const top = posts[0];
const home = `<section class="hero"><div class="wrap">
<div class="badges"><span class="badge red">今日头条</span><span class="badge outline">${TYPE[top.type]}</span><span class="badge soft">${top.items} 条本期</span></div>
<div class="kicker">${KICKER[top.type]} · ${dotDate(top.date)}</div>
<h1><a href="p/${top.slug}.html">${esc(top.headline)}</a></h1>
<p class="lede">${esc(top.summary)}</p>
<div class="hero-meta"><span><strong>发布</strong> ${esc(top.time)}（上海）</span><span class="sep">·</span><span><strong>栏目</strong> ${TYPE[top.type]}动态</span><a class="hero-read" href="p/${top.slug}.html">阅读全文 →</a></div>
${stats(top.items, '条本期', TYPE[top.type], '本轮焦点栏目', top.time, '上海时间发布')}
${pointsHtml(top)}
</div></section>
<div class="wrap">
<section class="section"><div class="sec-head"><span class="sec-num">01</span><h2 class="sec-title">往期简报</h2></div>
${grouped(posts.slice(1))}
</section>
<section class="section"><div class="sec-head"><span class="sec-num">02</span><h2 class="sec-title">分栏入口</h2></div>
<div class="grid">
<a class="card" href="cn.html"><div class="meta"><span class="tag cn">国内</span></div><h3>国内动态</h3><p>${BLURB.cn}</p><div class="cf"><span>进入栏目</span><span class="read">→</span></div></a>
<a class="card" href="intl.html"><div class="meta"><span class="tag intl">国际</span></div><h3>国际动态</h3><p>${BLURB.intl}</p><div class="cf"><span>进入栏目</span><span class="read">→</span></div></a>
</div></section>
</div>`;

fs.writeFileSync(
  OUT + '/index.html',
  page('AI 日报', 'home', home, '', `AI 日报 · ${TYPE[top.type]}动态简报`, `${top.date} · ${esc(top.time)} 上海`),
);

for (const t of ['cn', 'intl']) {
  const list = posts.filter((p) => p.type === t);
  const latest = list[0];
  const inner = `<section class="hero hero-list"><div class="wrap">
<div class="badges"><span class="badge red">${TYPE[t]}</span><span class="badge outline">${list.length} 期</span></div>
<h1>${TYPE[t]}动态</h1>
<p class="lede">${BLURB[t]}</p>
${latest ? stats(list.length, '期归档', TYPE[t], '栏目', latest.time, '最近更新') : ''}
</div></section>
<div class="wrap"><section class="section"><div class="sec-head"><span class="sec-num">01</span><h2 class="sec-title">按日归档</h2></div>
${grouped(list)}
</section></div>`;
  fs.writeFileSync(
    OUT + `/${t}.html`,
    page(`${TYPE[t]}动态 · AI 日报`, t, inner, '', `AI 日报 · ${TYPE[t]}动态`, `共 ${list.length} 期`),
  );
}

for (const p of posts) {
  const col = p.type === 'cn' ? 'cn.html' : 'intl.html';
  const notes = p.parsed.notes.length ? `<div class="notes">${p.parsed.notes.map((n) => `<p>${linkify(n)}</p>`).join('')}</div>` : '';
  const inner = `<article class="post">
<p class="crumbs"><a href="../index.html">首页</a><span>/</span><a href="../${col}">${TYPE[p.type]}动态</a><span>/</span>${esc(p.date)}</p>
<div class="badges"><span class="badge red">${TYPE[p.type]}</span><span class="badge outline">${p.items} 条本期</span></div>
<h1>${esc(p.headline)}</h1>
<div class="sub"><span>${fmtDate(p.date)} ${esc(p.time)}（上海）</span><span class="sep">·</span><span>${TYPE[p.type]}动态</span></div>
<div class="lede-box"><p>${esc(p.summary)}</p></div>
${stats(p.items, '条本期', TYPE[p.type], '栏目', p.time, '上海发布')}
${p.parsed.items.map(renderItem).join('\n')}
${notes}
<a class="back" href="../${col}">← 返回${TYPE[p.type]}动态</a>
</article>`;
  fs.writeFileSync(
    OUT + `/p/${p.slug}.html`,
    page(p.title, p.type, inner, '../', `AI 日报 · ${TYPE[p.type]}动态`, `${p.date} · ${esc(p.time)} 上海`),
  );
}

console.log(`构建完成：${posts.length} 期 → ${OUT}/`);
