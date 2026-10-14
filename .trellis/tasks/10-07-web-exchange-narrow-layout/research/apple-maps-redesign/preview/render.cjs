const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(require.resolve('@playwright/test', { paths: ['/Users/texas/Workspace/IMSWeb/.worktrees/exchange-ios-polish/apps/web'] }));
const W = 402, H = 874;
const out = __dirname;
const ink = '#1c1c1e', secondary = '#797982', accent = '#cc2556';
const rect = (x,y,w,h,r,c,a='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${c}" ${a}/>`;
const text = (x,y,s,n=17,c=ink,b=400,align='start') => `<text x="${x}" y="${y}" font-size="${n}" fill="${c}" font-weight="${b}" text-anchor="${align}">${s}</text>`;
const symbols = {
  search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  refresh:'<path d="M20 9a8 8 0 1 0 0 7M20 3v6h-6"/>',
  locate:'<path d="m3 11 18-8-8 18-2-8Z"/>',
  home:'<path d="m3 11 9-8 9 8v10h-7v-7h-4v7H3Z"/>',
  community:'<circle cx="9" cy="7" r="4"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M18 4a4 4 0 0 1 0 8M22 21v-3a6 6 0 0 0-3-5"/>',
  pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  book:'<path d="M12 5v16M12 5C8 2 3 4 3 4v16s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  filter:'<path d="M4 4v16M12 4v16M20 4v16M1 8h6M9 16h6M17 10h6"/>',
  office:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-5h4v5"/>',
  card:'<rect x="2" y="5" width="20" height="15" rx="3"/><circle cx="8" cy="11" r="2"/><path d="M5 17c0-4 6-4 6 0M14 10h5M14 14h4"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>'
};
const icon = (id,x,y,n=22,c=ink) => `<g transform="translate(${x} ${y}) scale(${n/24})" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${symbols[id]}</g>`;
const more = (x,y) => `<g fill="${ink}">${[-7,0,7].map(d=>`<circle cx="${x+d}" cy="${y}" r="2"/>`).join('')}</g>`;
const glass = (x,y,w,h,r) => rect(x,y,w,h,r,'#fcfcfa','fill-opacity=".86" stroke="#fff" stroke-width=".8" filter="url(#shadow)"');
function map() {
  let body=rect(0,0,W,H,0,'#f5f2e9')+`<path d="M-30 290Q145 250 162 440T460 500" fill="none" stroke="#a7dce8" stroke-width="22"/>`;
  body+=`<path d="M0 138h112v125H0ZM305 370h97v129h-97ZM30 505h81v95H30Z" fill="#d9e7c9"/>`;
  for(let i=0;i<11;i++) body+=`<path d="M${i*51-160} -20L${i*51+145} 900" stroke="#d3d2cd" stroke-width="9"/><path d="M${i*51-160} -20L${i*51+145} 900" stroke="#fff" stroke-width="6"/>`;
  for(let i=0;i<10;i++) body+=`<path d="M-20 ${i*86+40}L450 ${i*86-105}" stroke="#d3d2cd" stroke-width="9"/><path d="M-20 ${i*86+40}L450 ${i*86-105}" stroke="#fff" stroke-width="6"/>`;
  body+=text(72,230,'人民公园',14,'#70986a',550)+text(273,351,'锦江',15,'#67aabd')+text(113,323,'天府广场',18,'#5c5b58',600)+text(259,189,'春熙路',14,'#7f7d76');
  body+=`<circle cx="${201}" cy="290" r="12" fill="${accent}" stroke="#fff" stroke-width="4"/>`;
  return body;
}
function status() {
  return text(35,39,'9:41',17,ink,650)+rect(145,11,112,35,18,'#101115')+text(318,37,'▰',18)+rect(350,25,23,12,3,'none',`stroke="${ink}"`)+rect(353,28,16,6,1,ink)+rect(374,29,2,4,1,ink)+rect(133,857,136,5,3,ink);
}
function tabs() {
  let s=glass(8,786,386,60,30);const items=[['home','首页'],['community','社区'],['pin','交换地图'],['book','资料'],['user','我的']];
  items.forEach(([id,label],i)=>{const x=47+i*77;if(i===2)s+=rect(x-35,791,70,50,25,'#e8e4e6');s+=icon(id,x-11,796,22,i===2?accent:ink)+text(x,831,label,11.5,i===2?accent:ink,550,'middle');});return s;
}
function pole(top) {return glass(334,top,48,104,24)+icon('refresh',347,top+13)+icon('locate',347,top+67,22,accent);}
function search(x,y,w,value='查找地点') {return rect(x,y,w,44,22,'#fff','fill-opacity=".74" stroke="#e1e1e5" stroke-width=".6"')+icon('search',x+13,y+11,21,value==='查找地点'?secondary:ink)+text(x+43,y+29,value,17,value==='查找地点'?secondary:ink);}
function tools(y) {
  let s=glass(8,y,386,44,22);
  [['filter','筛选'],['office','事务所'],['card','名片']].forEach(([id,label],i)=>{let x=24+i*118;s+=icon(id,x+14,y+13,18,'#55555b')+text(x+43,y+28,label,16,ink,500);});return s;
}
function collapsed(immersive=false,split=false) {
  if(split){const top=650;return map()+pole(top-116)+glass(8,top,386,68,34)+rect(177,top+8,48,4,2,'#a6a6a9')+search(24,top+18,302)+glass(334,top+18,44,44,22)+more(356,top+40)+tools(730)+tabs()+status();}
  const top=immersive?704:632;let s=map()+pole(top-116);
  if(immersive)s+=glass(16,62,88,44,22)+icon('menu',29,74,20)+text(54,90,'导航',15);
  s+=glass(8,top,386,142,36)+rect(177,top+10,48,4,2,'#a6a6a9')+search(24,top+28,302)+glass(334,top+28,44,44,22)+more(356,top+50);
  [['filter','筛选'],['office','事务所'],['card','名片']].forEach(([id,label],i)=>{let x=24+i*118;s+=rect(x,top+84,112,44,22,'#fff','fill-opacity=".42"')+icon(id,x+14,top+97,18,'#55555b')+text(x+43,top+112,label,16,ink,500);});
  if(!immersive)s+=tabs();return s+status();
}
function editing() {
  let s=map()+rect(0,144,W,430,38,'#f2f2f7')+rect(177,154,48,4,2,'#b3b3b8')+search(16,173,315,'天府广场');
  s+=glass(342,173,44,44,22)+icon('close',353,184,22)+rect(24,237,354,48,24,accent)+text(201,268,'查找',17,'#fff',600,'middle');
  s+=text(24,323,'查找地点，不改变城市筛选',16,secondary)+text(24,349,'选择结果后回到地图',16,secondary);
  s+=rect(0,574,W,300,0,'#d8d9df')+text(23,608,'拼音',16,'#55555b')+text(359,608,'⌄',22,'#55555b');
  const rows=['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'];rows.forEach((row,i)=>{let width=33,gap=5,x=(402-row.length*(width+gap)+gap)/2;[...row].forEach((v,j)=>{s+=rect(x+j*(width+gap),626+i*53,width,44,6,'#fff')+text(x+j*(width+gap)+width/2,655+i*53,v,20,ink,400,'middle');});});
  s+=rect(16,791,56,44,6,'#b9bcc5')+text(44,820,'123',16,ink,400,'middle')+rect(81,791,220,44,6,'#fff')+text(191,820,'空格',16,ink,400,'middle')+rect(310,791,76,44,6,accent)+text(348,820,'查找',16,'#fff',500,'middle');return s+status();
}
function results() {
  const y=418;let s=map()+pole(302)+rect(8,y,386,448,38,'#f2f2f7')+rect(177,y+10,48,4,2,'#b3b3b8')+search(24,y+28,302,'天府广场')+glass(334,y+28,44,44,22)+icon('close',345,y+39,22);
  s+=rect(24,y+94,354,234,26,'#fff');const rows=[['天府广场','成都市 · 青羊区 · 人民中路'],['天府广场地铁站','成都市 · 青羊区 · 地铁 1 / 2 号线'],['天府广场东站','成都市 · 青羊区 · 公交站']];
  rows.forEach(([name,address],i)=>{let top=y+94+i*78;s+=rect(40,top+19,38,38,19,'#f5e8ed')+icon('pin',49,top+27,20,accent)+text(92,top+35,name,18,ink,550)+text(92,top+59,address,14,secondary);if(i<2)s+=`<path d="M92 ${top+78}H362" stroke="#e8e8ec" stroke-width=".7"/>`;});
  s+=rect(24,y+374,106,44,22,'#fff')+text(77,y+402,'展开结果',16,accent,550,'middle')+rect(142,y+374,106,44,22,'#fff')+text(195,y+402,'更多',16,ink,500,'middle')+rect(260,y+374,118,44,22,'#fff')+text(319,y+402,'收起',16,ink,500,'middle');return s+status();
}
function selected() {
  let s=map()+pole(522)+glass(8,638,386,74,37);
  s+=icon('pin',26,661,22,accent)+text(61,669,'天府广场',17,ink,550)+text(61,690,'成都市 · 青羊区',14,secondary)+glass(286,653,44,44,22)+icon('close',297,664,22)+glass(334,653,44,44,22)+more(356,675);return s+tools(730)+tabs()+status();
}
function svg(body) {return `<svg xmlns="http://www.w3.org/2000/svg" width="402" height="874" viewBox="0 0 402 874"><style>text{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}</style><defs><filter id="shadow" x="-20%" y="-30%" width="140%" height="160%"><feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#555" flood-opacity=".10"/></filter><clipPath id="screen"><rect width="402" height="874" rx="62"/></clipPath></defs><g clip-path="url(#screen)">${body}</g></svg>`;}
const scenes=[['a-browse','A · 搜索胶囊与工具分组',()=>collapsed(false,true)],['a-edit','A · 输入与键盘',editing],['a-results','A · 地点结果',results],['a-selected','A · 已选地点',selected],['b-browse','B · 搜索与工具合成宽卡',()=>collapsed(false)],['c-browse','导航对照 · 浏览态收起底栏',()=>collapsed(true)]];
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:3});const artifacts=[];
  for(const [id,label,draw] of scenes){let file=path.join(out,id+'.svg');fs.writeFileSync(file,svg(draw()));await page.goto('file://'+file);await page.evaluate(()=>document.fonts.ready);let errors=await page.evaluate(()=>[...document.querySelectorAll('text')].filter(e=>{let b=e.getBoundingClientRect();return b.left<0||b.right>innerWidth||b.bottom>innerHeight;}).map(e=>e.textContent));if(errors.length)throw Error(JSON.stringify(errors));await page.screenshot({path:path.join(out,id+'.png')});artifacts.push({id,label,points:[W,H],pixels:[W*3,H*3],kind:'authored proposal',nativeRuntimeProof:false,textOverflow:errors});}
  await page.close();let html='<html lang="zh-CN"><meta charset="UTF-8"><style>body{margin:0;background:#e9e9ec;color:#1c1c1e;font-family:-apple-system,"PingFang SC",sans-serif;padding:36px}h1{margin:0;font-size:28px}p{color:#6a6a74;font-size:16px}.grid{display:flex;gap:25px}.phone{padding:5px;background:#252527;border-radius:48px;width:294px}.phone img{display:block;width:100%;border-radius:43px}.caption{font-size:16px;margin-top:18px;text-align:center}</style><h1>IMSWeb · Apple Maps 参考方案</h1><p>新设计提案，等待审阅 · 全幅画布 402 × 874pt · 地图、地名、键盘与材质均为绘制示意</p><div class="grid">'+scenes.map(([id,label])=>'<section><div class="phone"><img src="./'+id+'.png"></div><div class="caption">'+label+'</div></section>').join('')+'</div></html>';fs.writeFileSync(path.join(out,'overview.html'),html);const board=await browser.newPage({viewport:{width:2040,height:890},deviceScaleFactor:2});await board.goto('file://'+path.join(out,'overview.html'));await board.evaluate(()=>document.fonts.ready);await board.screenshot({path:path.join(out,'overview.png'),fullPage:true});await board.close();await browser.close();fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({kind:'unapproved authored design proposal',illustrativeContent:true,nativeRuntimeProof:false,observedReference:'owned iOS27 Maps: 386pt half / 402pt expanded / 346pt selected minimum; candidate widths deliberately differ by product state',artifacts},null,2)+'\n');console.log('6 fresh 1206×2622 proposals; text bounds passed; overview rendered.');})().catch(e=>{console.error(e.message);process.exitCode=1});
