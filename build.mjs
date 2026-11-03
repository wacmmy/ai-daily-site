// 零依赖构建脚本：读取 content/*.md，生成 dist/ 静态站点
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
const CALLOUTS=['背景','实际影响','社区讨论'];
const SRC_LINE=/^(来源|官方博客|仓库|中文报道|转载|路透)[：:]|^https?:\/\//;
const NUM_LINE=/^\d+[.、．]\s/;
const CN_LINE=/^[一二三四五六七八九十]+、/;
// 公司/人物名，不是一条新闻标题。标题里常见动词，人名没有。
const NAME_VERB=/(发布|推出|上线|开源|宣布|确认|停止|更新|公开|披露|下线|收紧|完成|启动|提交|公布|开放|停服|融资|致歉|收费|接入|改为|收购|暂停|修复|合并|曝光|预热|签约|签署|调用|计费)/;
function tagFor(line){
  if(/^#{1,3}\s/.test(line)) return 'h3';
  if(SRC_LINE.test(line)) return 'src';
  if(/^【.*】$/.test(line)||CN_LINE.test(line)||(line.length<=24&&!/[。；，]/.test(line))) return 'h3';
  if(line.length<=60&&!/。$/.test(line)&&!/[。]/.test(line)) return 'h4';
  if(NUM_LINE.test(line)) return 'item';
  return 'p';
}
function headingText(line){return line.replace(/^#{1,3}\s/,'');}
function calloutOf(line){
  const t=headingText(line).trim();
  for(const name of CALLOUTS){
    if(t===name) return {name,rest:''};
    if(t.startsWith(name+'：')||t.startsWith(name+':')) return {name,rest:t.slice(name.length+1).trim()};
  }
  return null;
}
function looksLikeSource(line){
  return SRC_LINE.test(line)||/^(官方文档)[：:]/.test(line);
}
function isSkipHeading(text){return text==='今日要点'||/^今日要点[：:]$/.test(text);}
function isExplicitSection(text){
  if(/^【[^】]+】$/.test(text)) return true;
  if(!CN_LINE.test(text)) return false;
  const rest=text.replace(CN_LINE,'').trim();
  return [...rest].length<=20&&!/[：:]/.test(rest);
}
function isNameLike(text){
  if(NUM_LINE.test(text)||CN_LINE.test(text)||text.startsWith('【')) return false;
  if([...text].length>40) return false;
  if(/[。；，：:]/.test(text)||/https?:\/\//.test(text)) return false;
  if(NAME_VERB.test(text)) return false;
  return true;
}
function roleOf(text,current){
  if(NUM_LINE.test(text)) return 'item';
  if(isExplicitSection(text)||isNameLike(text)) return 'section';
  if(CN_LINE.test(text)) return 'item';
  if(!current) return 'section';
  return 'item';
}
function anchorFrom(text){
  const num=text.match(/^(\d+)[.、．]\s*/);
  const cn=text.match(/^([一二三四五六七八九十]+)、\s*/);
  let base=text;
  if(num) base=text.slice(num[0].length);
  else if(cn) base=text.slice(cn[0].length);
  base=base.replace(/^【/,'').replace(/】$/,'');
  const dot=base.search(/[。！？]/);
  if(dot>0) base=base.slice(0,dot);
  base=base.toLowerCase().trim().replace(/\s+/g,'-').replace(/[^\p{L}\p{N}]+/gu,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
  base=[...base].slice(0,36).join('');
  if(num) base=base?num[1]+'-'+base:num[1];
  else if(cn) base=base?cn[1]+'-'+base:cn[1];
  return base||'section';
}
function makeIds(){
  const used=new Set();
  return text=>{
    const base=anchorFrom(text)||'section';
    let id=base, n=2;
    while(used.has(id)) id=base+'-'+(n++);
    used.add(id);
    return id;
  };
}
function tocLabel(text,truncate){
  let s=text.replace(/\s+/g,' ').trim();
  if(!truncate) return s;
  const cut=s.search(/[。！？]/);
  if(cut>8) s=s.slice(0,cut);
  const chars=[...s];
  if(chars.length>46) s=chars.slice(0,46).join('')+'…';
  return s;
}
function renderToc(toc){
  const n=toc.reduce((a,node)=>a+1+(node.children?node.children.length:0),0);
  if(n<2) return '';
  const lis=toc.map(node=>{
    const kids=node.children&&node.children.length
      ?`<ul>${node.children.map(c=>`<li><a href="#${c.id}">${esc(c.label)}</a></li>`).join('')}</ul>`:'';
    return `<li><a href="#${node.id}">${esc(node.label)}</a>${kids}</li>`;
  }).join('');
  return `<nav class="toc" aria-label="本期目录"><div class="toc-h">本期目录</div><ul>${lis}</ul></nav>`;
}
function blockHtml(line,tag){
  const text=headingText(line);
  if(tag==='src'||(looksLikeSource(line)&&tag!=='h3'&&tag!=='h4')) return `<p class="src">${linkify(line)}</p>`;
  if(tag==='h3') return `<h3>${linkify(text)}</h3>`;
  if(tag==='h4') return `<h4>${linkify(text)}</h4>`;
  return `<p>${linkify(line)}</p>`;
}
function isStructural(line,tag){
  if(looksLikeSource(line)) return false;
  if(calloutOf(line)) return true;
  return tag==='h3'||tag==='h4'||tag==='item';
}
// 从正文现有标题和编号条目生成目录与锚点，不改写简报原文。
export function renderBody(t){
  const lines=t.split(/\n/).map(l=>l.trim()).filter(Boolean);
  const tags=lines.map(tagFor);
  const uniqueId=makeIds();
  const toc=[];
  let current=null;
  const html=[];
  const addSection=text=>{
    const id=uniqueId(text);
    const node={id,label:text,children:[]};
    toc.push(node); current=node; return id;
  };
  const addItem=(text,truncate)=>{
    const id=uniqueId(text);
    const node={id,label:tocLabel(text,truncate)};
    if(current) current.children.push(node);
    else toc.push(node);
    return id;
  };
  let i=0;
  while(i<lines.length){
    const line=lines[i], tag=tags[i], co=calloutOf(line);
    if(co){
      const id=addSection(co.name);
      const parts=[];
      if(co.rest) parts.push(`<p>${linkify(co.rest)}</p>`);
      i++;
      while(i<lines.length&&!isStructural(lines[i],tags[i])){
        parts.push(blockHtml(lines[i],tags[i]));
        i++;
      }
      html.push(`<aside class="callout jump" id="${id}"><div class="k">${esc(co.name)}</div>${parts.join('\n')}</aside>`);
      continue;
    }
    if(looksLikeSource(line)||tag==='src'){html.push(blockHtml(line,tag)); i++; continue;}
    if(tag==='h3'||tag==='h4'){
      const text=headingText(line);
      if(isSkipHeading(text)){html.push(blockHtml(line,tag)); i++; continue;}
      const role=roleOf(text,current);
      const id=role==='section'?addSection(text):addItem(text,false);
      const el=tag==='h4'?'h4':'h3';
      html.push(`<${el} id="${id}" class="jump">${linkify(text)}</${el}>`);
      i++; continue;
    }
    if(tag==='item'){
      const id=addItem(line,true);
      html.push(`<p id="${id}" class="jump">${linkify(line)}</p>`);
      i++; continue;
    }
    html.push(`<p>${linkify(line)}</p>`);
    i++;
  }
  return {html:html.join('\n'),toc:renderToc(toc)};
}
const fmtDate=d=>{const [y,m,dd]=d.split('-');return `${y}年${+m}月${+dd}日`};
const CSS=fs.readFileSync('src/style.css','utf8');
const page=(title,active,inner,root='')=>`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="${root}style.css"></head><body>
<header class="top"><div class="wrap nav"><a class="brand" href="${root}index.html">AI 日报</a><nav>
<a href="${root}index.html" class="${active==='home'?'on':''}">首页</a><a href="${root}cn.html" class="${active==='cn'?'on':''}">${NAV.cn}</a><a href="${root}intl.html" class="${active==='intl'?'on':''}">${NAV.intl}</a><a href="${root}builders.html" class="${active==='builders'?'on':''}">${NAV.builders}</a></nav></div></header>
<main class="wrap">${inner}</main><footer class="wrap foot">每日更新（上海时间）：国际约 09:00，国内约 21:00，Builders 约 09:00 · 内容由亦菲整理</footer></body></html>`;
const fmtMD=d=>{const [,m,dd]=d.split('-');return `${+m}月${+dd}日`;};
// withDate：没有日分组标题时必须带月日。只写 09:00 时，昨天的国际晨报会被看成今天早上那期。
const card=(p,withDate=false)=>`<a class="card" href="${p.root||''}p/${p.slug}.html"><div class="meta"><span class="tag ${p.type}">${TYPE[p.type]}</span><span class="when">${withDate?fmtMD(p.date)+' ':''}${p.time}</span></div><h3>${esc(p.headline)}</h3><p>${esc(p.summary)}</p><div class="cf"><span>${p.items} 条</span><span class="read">阅读 →</span></div></a>`;
function grouped(list){const g={};for(const p of list)(g[p.date]??=[]).push(p);
  return Object.keys(g).sort().reverse().map(d=>`<section class="day"><h2 class="dh">${fmtDate(d)}</h2><div class="grid">${g[d].map(p=>card(p,false)).join('')}</div></section>`).join('');}
function build(){
  const posts=fs.readdirSync(SRC).filter(f=>f.endsWith('.md')).map(parse)
    .sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(OUT+'/p',{recursive:true});
  fs.writeFileSync(OUT+'/style.css',CSS);
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
  for(const p of posts){
    const body=renderBody(p.body);
    fs.writeFileSync(`${OUT}/p/${p.slug}.html`,page(p.title,p.type,`<article class="post"><div class="meta"><span class="tag ${p.type}">${TYPE[p.type]}</span><span>${fmtDate(p.date)} ${p.time}（上海时间）</span><span>${p.items} 条</span></div><h1>${esc(p.headline)}</h1><div class="sub">${esc(p.title)}</div><p class="lede">${esc(p.summary)}</p>${body.toc}<div class="body">${body.html}</div><a class="back" href="../index.html">← 返回首页</a></article>`,'../'));
  }
  console.log(`构建完成：${posts.length} 期 → ${OUT}/`);
}
const isDirect=process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url));
if(isDirect) build();
