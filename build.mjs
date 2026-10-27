// 零依赖构建脚本：读取 content/*.md，生成 dist/ 静态站点
import fs from 'node:fs'; import path from 'node:path';
const SRC='content', OUT='dist';
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const TYPE={cn:'国内',intl:'国际',builders:'Builders'};
const NAV={cn:'国内动态',intl:'国际动态',builders:'Builders'};
function parse(file){
  const raw=fs.readFileSync(path.join(SRC,file),'utf8');
  const m=raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/); if(!m) throw new Error('缺少 frontmatter: '+file);
  const fm={}; for(const l of m[1].split('\n')){const i=l.indexOf(':'); if(i<0)continue;
    let v=l.slice(i+1).trim(); if(v.startsWith('"')) v=JSON.parse(v); fm[l.slice(0,i).trim()]=v;}
  for(const k of ['date','slot','type','headline','summary']) if(!fm[k]) throw new Error(`${file} 缺少字段 ${k}`);
  fm.items=Number(fm.items||0); fm.slug=file.replace(/\.md$/,''); fm.body=m[2].trim();
  fm.time=fm.time||`${fm.slot.slice(0,2)}:${fm.slot.slice(2)}`;
  fm.title=fm.title||`${TYPE[fm.type]} AI 动态简报｜${fm.date} ${fm.time}`; return fm;
}
const linkify=s=>esc(s).replace(/(https?:\/\/[^\s<，。）)]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
function renderBody(t){
  return t.split(/\n/).map(l=>l.trim()).filter(Boolean).map(l=>{
    if(/^#{1,3}\s/.test(l)) return `<h3>${linkify(l.replace(/^#+\s/,''))}</h3>`;
    if(/^(来源|官方博客|仓库|中文报道|转载|路透)[：:]|^https?:\/\//.test(l)) return `<p class="src">${linkify(l)}</p>`;
    if(/^【.*】$/.test(l)||/^[一二三四五六七八九十]+、/.test(l)||(l.length<=24&&!/[。；，]/.test(l))) return `<h3>${linkify(l)}</h3>`;
    if(l.length<=60&&!/。$/.test(l)&&!/[。]/.test(l)) return `<h4>${linkify(l)}</h4>`;
    return `<p>${linkify(l)}</p>`;}).join('\n');
}
const fmtDate=d=>{const [y,m,dd]=d.split('-');return `${y}年${+m}月${+dd}日`};
const CSS=fs.readFileSync('src/style.css','utf8');
const page=(title,active,inner,root='')=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="${root}style.css"></head><body>
<header class="top"><div class="wrap nav"><a class="brand" href="${root}index.html">AI 日报</a><nav>
<a href="${root}index.html" class="${active==='home'?'on':''}">首页</a><a href="${root}cn.html" class="${active==='cn'?'on':''}">${NAV.cn}</a><a href="${root}intl.html" class="${active==='intl'?'on':''}">${NAV.intl}</a><a href="${root}builders.html" class="${active==='builders'?'on':''}">${NAV.builders}</a></nav></div></header>
<main class="wrap">${inner}</main><footer class="wrap foot">每日更新（上海时间）：国际约 09:00，国内约 21:00，Builders 约 09:00 与 21:00 · 内容由亦菲整理</footer></body></html>`;
const fmtMD=d=>{const [,m,dd]=d.split('-');return `${+m}月${+dd}日`;};
// withDate：没有日分组标题时必须带月日。只写 09:00 时，昨天的国际晨报会被看成今天早上那期。
const card=(p,withDate=false)=>`<a class="card" href="${p.root||''}p/${p.slug}.html"><div class="meta"><span class="tag ${p.type}">${TYPE[p.type]}</span><span class="when">${withDate?fmtMD(p.date)+' ':''}${p.time}</span></div><h3>${esc(p.headline)}</h3><p>${esc(p.summary)}</p><div class="cf"><span>${p.items} 条</span><span class="read">阅读 →</span></div></a>`;
function grouped(list){const g={};for(const p of list)(g[p.date]??=[]).push(p);
  return Object.keys(g).sort().reverse().map(d=>`<section class="day"><h2 class="dh">${fmtDate(d)}</h2><div class="grid">${g[d].map(p=>card(p,false)).join('')}</div></section>`).join('');}
const posts=fs.readdirSync(SRC).filter(f=>f.endsWith('.md')).map(parse)
  .sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT+'/p',{recursive:true});
fs.writeFileSync(OUT+'/style.css',CSS);
// 首页
const [top,...rest]=posts; const subs=rest.slice(0,2);
const L=top.body.split('\n').map(s=>s.trim());
let points=L.filter(l=>/^\d+\.\s*/.test(l)).map(l=>l.replace(/^\d+\.\s*/,'').split('。')[0]);
if(!points.length) points=L.filter(l=>l.length>8&&l.length<=60&&!/[。：:]/.test(l)&&!/^https?:/.test(l));
points=points.slice(0,6);
const home=`<section class="hero"><div class="kicker">今日头条 · ${fmtDate(top.date)} ${top.time} · ${TYPE[top.type]}</div>
<h1><a href="p/${top.slug}.html">${esc(top.headline)}</a></h1><p class="lede">${esc(top.summary)}</p>
${points.length?`<div class="points"><div class="ph">要点</div><ul>${points.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}</section>
<div class="subs">${subs.map(p=>card(p,true)).join('')}</div><h2 class="sec">最新报告</h2>${grouped(posts)}`;
fs.writeFileSync(OUT+'/index.html',page('AI 日报','home',home));
for(const t of ['cn','intl','builders']) fs.writeFileSync(`${OUT}/${t}.html`,page(`${NAV[t]} · AI 日报`,t,`<h1 class="ph1">${NAV[t]}</h1>${grouped(posts.filter(p=>p.type===t))}`));
for(const p of posts) fs.writeFileSync(`${OUT}/p/${p.slug}.html`,page(p.title,p.type,`<article class="post"><div class="meta"><span class="tag ${p.type}">${TYPE[p.type]}</span><span>${fmtDate(p.date)} ${p.time}（上海时间）</span><span>${p.items} 条</span></div><h1>${esc(p.headline)}</h1><div class="sub">${esc(p.title)}</div><p class="lede">${esc(p.summary)}</p><div class="body">${renderBody(p.body)}</div><a class="back" href="../index.html">← 返回首页</a></article>`,'../'));
console.log(`构建完成：${posts.length} 期 → ${OUT}/`);
