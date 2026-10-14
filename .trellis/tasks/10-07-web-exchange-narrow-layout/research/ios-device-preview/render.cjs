const fs = require('node:fs');
const path = require('node:path');
const webWorkspace = process.argv[2] || '/Users/texas/Workspace/IMSWeb/.worktrees/exchange-ios-polish/apps/web';
const {chromium} = require(require.resolve('@playwright/test', {paths:[webWorkspace]}));
const out = __dirname;
const C = {ink:'#202126', sub:'#777b84', brand:'#f52663', action:'#cc2556', line:'#e0e3e8'};
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const t = (x,y,s,size=17,col=C.ink,weight=400,anchor='start') => `<text x="${x}" y="${y}" fill="${col}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${esc(s)}</text>`;
const r = (x,y,w,h,rx,fill,extra='') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;
const paths = {
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  refresh:'<path d="M20 9a8 8 0 1 0 0 7M20 3v6h-6"/>',
  locate:'<circle cx="12" cy="12" r="6"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/>',
  home:'<path d="m3 11 9-8 9 8v10h-7v-7h-4v7H3Z"/>',
  users:'<circle cx="9" cy="7" r="4"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8M22 21v-3a6 6 0 0 0-4-5"/>',
  pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  book:'<path d="M12 5v16M12 5C8 2 3 4 3 4v16s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  sliders:'<path d="M4 4v16M12 4v16M20 4v16M1 8h6M9 16h6M17 10h6"/>',
  building:'<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M10 21v-5h4v5"/>',
  card:'<rect x="2" y="5" width="20" height="15" rx="3"/><circle cx="8" cy="11" r="2"/><path d="M5 17c0-4 6-4 6 0M14 10h5M14 14h4"/>',
  arrow:'<path d="m7 17 10-10M7 7h10v10"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
};
const ic = (name,x,y,size=22,col=C.ink) => `<g transform="translate(${x} ${y}) scale(${size/24})" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</g>`;
const dots = (x,y) => `<g fill="${C.ink}">${[0,7,14].map(dx=>`<circle cx="${x+dx}" cy="${y}" r="1.9"/>`).join('')}</g>`;
function spinner(cx,cy,animated=false) {
  let body = '';
  for(let i=0;i<12;i++) body += `<path d="M0-9V-6" transform="rotate(${i*30})" stroke="${C.sub}" stroke-width="2.1" stroke-linecap="round" opacity="${.15+i*.07}"/>`;
  return `<g transform="translate(${cx} ${cy})"><g>${body}${animated?'<animateTransform attributeName="transform" type="rotate" from="0" to="360" dur=".9s" repeatCount="indefinite"/>':''}</g></g>`;
}
function status(W,H) {
  const right = W-28;
  return t(31,39,'9:41',16.5,C.ink,650)+r(W/2-56,11,112,35,18,'#101115')+
    `<g fill="${C.ink}">${[0,1,2,3].map(i=>r(right-62+i*4.6,33-i*2.3,3,5+i*2.3,.9,C.ink)).join('')}</g>`+
    `<path d="M${right-38} 26q7-7 14 0M${right-35} 30q4-4 8 0" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round"/><circle cx="${right-31}" cy="34" r="1.3" fill="${C.ink}"/>`+
    r(right-15,24,23,12,3,'none',`stroke="${C.ink}" stroke-width="1.1"`)+r(right-12,27,16,6,1,C.ink)+r(right+9.5,28,2,4,1,C.ink);
}
function map(W,H) {
  let s=r(0,0,W,H,0,'#edf2f5');
  s+=`<path d="M0 0H${W}V138l-88 27-71-55-49 42-37-66-81 26L0 72Z" fill="#e0eee5"/><path d="M0 ${H*.51}l80 22 23 82-75 121L0 ${H*.73}Z" fill="#deebe2"/><path d="M${W*.78} 312l${W*.22} 33v270l-35-17-65-63 13-116-43-45Z" fill="#dfede3"/>`;
  s+=`<path d="M${W*.67}-25c-71 119 60 180-16 280S110 392 194 477s99 146 11 242-116 112-99 ${H}" fill="none" stroke="#badbe9" stroke-width="11"/>`;
  const routes=[`M-30 183 ${W+25} 549`,`M56-20 ${W-62} ${H+30}`,`M-30 679 ${W+30} 218`,`M-20 354 ${W+20} 291`,`M-20 513 ${W+20} 516`,`M21 ${H+25} 194 12`,`M-20 736 ${W+20} 717`,`M${W-63}-20 38 596`];
  for(const [i,d] of routes.entries()) s+=`<path d="${d}" fill="none" stroke="#cbd7e2" stroke-width="${i<3?5.8:3.6}"/><path d="${d}" fill="none" stroke="#fff" stroke-width="${i<3?2.6:1.5}"/>`;
  for(let i=0;i<12;i++) s+=`<path d="M${i*37-90} 129q80 64 35 191t85 222t-17 345" fill="none" stroke="#dbe4ea" stroke-width="1.2"/>`;
  s+=t(W*.54,359,'成都',24,'#617086',550)+t(W*.54,380,'Chengdu',12.5,'#8793a4');
  s+=t(79,254,'青羊区',14,'#8b98a9')+t(W*.67,489,'锦江区',14,'#8b98a9')+t(W*.45,589,'武侯区',14,'#8b98a9')+t(W*.72,219,'成华区',14,'#8b98a9');
  s+=r(98,328,37,20,4,'#fff',`stroke="#b8c4d0"`)+t(116.5,342,'G5',11.5,'#728295',500,'middle');
  return s;
}
function defs(W,H) {
  const navY=H-122,dockY=navY-160;
  return `<defs><filter id="shadow" x="-25%" y="-40%" width="150%" height="180%"><feDropShadow dx="0" dy="3" stdDeviation="7" flood-color="#708094" flood-opacity=".16"/></filter><filter id="blur"><feGaussianBlur stdDeviation="9"/></filter><linearGradient id="glass" x1="0" y1="0" x2=".18" y2="1"><stop stop-color="#fff" stop-opacity=".93"/><stop offset="1" stop-color="#f8fbff" stop-opacity=".76"/></linearGradient><clipPath id="screen"><rect width="${W}" height="${H}" rx="62"/></clipPath><clipPath id="nav"><rect x="16" y="${navY}" width="${W-32}" height="76" rx="38"/></clipPath><clipPath id="dock"><rect x="16" y="${dockY}" width="${W-32}" height="144" rx="28"/></clipPath><g id="map">${map(W,H)}</g></defs>`;
}
function nav(W,H) {
  const y=H-122,pitch=(W-40)/5;
  let s=`<g filter="url(#shadow)">${r(16,y,W-32,76,38,'url(#glass)')}</g><g clip-path="url(#nav)" opacity=".18" filter="url(#blur)"><use href="#map"/></g>`+r(16,y,W-32,76,38,'url(#glass)',`stroke="#fff" stroke-width="1.15"`);
  const tabs=[['home','首页'],['users','社区'],['pin','交换地图'],['book','资料'],['user','我的']];
  tabs.forEach(([name,label],i)=>{const cx=20+pitch*(i+.5);if(i===2)s+=r(cx-pitch/2+3,y+6,pitch-6,63,31,'#d9dfe6',`fill-opacity=".82"`);s+=ic(name,cx-11.5,y+17,23,i===2?C.brand:C.ink)+t(cx,y+58,label,11.5,i===2?C.action:C.ink,600,'middle');});
  return s;
}
const home = (W,H)=>r(W/2-68,H-18,136,5,3,C.ink);
function browse(W,H,busy=false,animated=false) {
  const y=H-282,fieldW=W-144,refX=W-116,moreX=W-64;
  let s='<use href="#map"/>'+status(W,H);
  s+=r(20,88,busy?184:262,36,18,'#fff',`fill-opacity=".95"`)+(busy?ic('refresh',32,98,17,C.sub):ic('pin',32,97,18,C.brand))+t(58,111,busy?'正在刷新名录…':'当前范围暂无公开事务所',14,C.sub);
  s+=r(W-62,y-64,46,46,23,'url(#glass)',`filter="url(#shadow)" stroke="#fff" stroke-width="1.1"`)+ic('locate',W-50,y-52,22);
  s+=`<g filter="url(#shadow)">${r(16,y,W-32,144,28,'url(#glass)')}</g><g clip-path="url(#dock)" opacity=".15" filter="url(#blur)"><use href="#map"/></g>`+r(16,y,W-32,144,28,'url(#glass)',`stroke="#fff" stroke-opacity=".93" stroke-width="1.1"`)+r(W/2-17,y+11,34,4,2,'#c4c8cf');
  s+=r(28,y+30,fieldW,48,24,'#edf0f4',`fill-opacity=".84"`)+ic('search',43,y+44,21,'#828994')+t(73,y+61,'查找地点',17,'#7b828c');
  s+=busy?spinner(refX+22,y+54,animated):ic('refresh',refX+11,y+43,22);
  s+=dots(moreX+15,y+54);
  const unit=(W-56)/3;
  [['sliders','筛选'],['building','事务所'],['card','名片']].forEach(([name,label],i)=>{const cx=28+unit*(i+.5),tw=label.length*16; s+=ic(name,cx-(tw+27)/2,y+101,18,'#555d68')+t(cx-(tw+27)/2+27,y+116,label,16,C.ink,500);});
  s+=nav(W,H)+home(W,H);
  return s;
}
function results(W,H) {
  const y=Math.round(H*.445),fieldW=W-196;
  let s='<use href="#map"/>'+status(W,H)+r(0,y,W,H-y,31,'#fafbfd')+r(W/2-17,y+11,34,4,2,'#c5c9d0');
  s+=r(20,y+35,fieldW,48,24,'#eef0f4')+ic('search',34,y+49,20,'#818894')+t(64,y+66,'成都',17);
  const ref=20+fieldW+8,more=ref+52,fold=more+52;
  s+=ic('refresh',ref+11,y+48,22)+dots(more+15,y+59)+t(fold+22,y+65,'收起',15,C.action,500,'middle');
  s+=t(24,y+120,'地点',23,C.ink,650)+t(24,y+146,'搜索结果',14,C.sub);
  const rows=[['天府广场','四川省 · 成都市 · 青羊区'],['春熙路','四川省 · 成都市 · 锦江区'],['宽窄巷子','四川省 · 成都市 · 青羊区']];
  rows.forEach(([title,caption],i)=>{const ry=y+172+i*84;s+=ic('pin',24,ry+7,22,'#858d99')+t(61,ry+23,title,18,C.ink,550)+t(61,ry+46,caption,14,C.sub)+ic('arrow',W-40,ry+17,17,'#8b939e');if(i<2)s+=`<path d="M61 ${ry+67}H${W-20}" stroke="${C.line}" stroke-width=".7"/>`;});
  return s+home(W,H);
}
function sources(W,H) {
  let s=browse(W,H)+r(0,0,W,H,0,'#242a35',`fill-opacity=".31"`);
  const x=24,y=Math.round(H/2-157),w=W-48;
  s+=r(x,y,w,314,25,'#fafbfd',`filter="url(#shadow)"`);
  s+=r(x+w-46,y+5,40,40,20,'#ebedf1')+ic('close',x+w-37,y+14,22,'#79818c');
  s+=t(W/2,y+50,'地图数据来源',20,C.ink,650,'middle');
  s+=t(x+24,y+85,'地图数据来自 OpenFreeMap、OpenMapTiles',13.5,C.sub)+t(x+24,y+106,'与 OpenStreetMap。以下授权信息按许可要求保留。',13.5,C.sub);
  s+=t(x+24,y+151,'OpenFreeMap · OpenMapTiles',15,'#66717f');
  s+=`<path d="M${x+24} ${y+155}H${x+228}" stroke="#66717f" stroke-width=".6"/>`;
  s+=t(x+24,y+176,'© OpenStreetMap contributors',14,C.sub);
  s+=`<path d="M${x+24} ${y+199}H${x+w-24}" stroke="${C.line}" stroke-width=".7"/>`;
  s+=t(x+24,y+230,'地点搜索',14,C.sub,500)+t(x+24,y+255,'© OpenStreetMap contributors',14,C.sub);
  return s;
}
function svg(W,H,body) {return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><style>text{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Helvetica Neue",sans-serif}</style>${defs(W,H)}${r(0,0,W,H,0,'#101115')}<g clip-path="url(#screen)">${body}</g></svg>`;}
const sizes=[{id:'iphone-17-18-pro',W:402,H:874,label:'iPhone 17 / 17 Pro / 18 Pro',pixels:'1206 × 2622 px'},{id:'iphone-17-18-pro-max',W:440,H:956,label:'iPhone 17 Pro Max / 18 Pro Max',pixels:'1320 × 2868 px'}];
const scenes=[['01-map','地图 · 待机',(W,H)=>browse(W,H)],['02-refresh','刷新 · 加载中',(W,H)=>browse(W,H,true)],['03-search','地点 · 搜索展开',results],['04-source-dialog','来源 · 已有授权 Dialog',sources]];
function board(size) {
  const columns=scenes.map(([name,label])=>`<section><div class="frame"><img src="./${size.id}/${name}.png" width="${size.W}" height="${size.H}"/></div><div class="caption">${label}</div></section>`).join('');
  return `<html lang="zh-CN"><meta charset="UTF-8"><style>*{box-sizing:border-box}body{margin:0;background:#e9ecf0;color:#292c33;font-family:-apple-system,"PingFang SC",sans-serif;padding:36px 32px 28px}h1{font-size:27px;line-height:1.3;margin:0 0 9px;font-weight:650}.sub{font-size:16px;color:#777f8c;margin:0 0 31px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:26px;align-items:start}.frame{background:#202227;border:1.5px solid #6a6d75;padding:5px;border-radius:51px;box-shadow:0 6px 18px #626f8220}.frame img{width:100%;height:auto;display:block;border-radius:46px}.caption{font-size:16px;font-weight:550;text-align:center;margin-top:19px}.note{text-align:center;font-size:14px;color:#858c98;margin-top:26px}</style><h1>IMSWeb · iOS Liquid Glass 最新预览</h1><p class="sub">${size.label} · ${size.W} × ${size.H} pt · @3x · 原图 ${size.pixels}</p><div class="grid">${columns}</div><p class="note">设计示意，非运行截图。来源统一进入已有 Dialog；刷新帧展示加载状态，原生动效另行实测。</p></html>`;
}
(async()=>{
  const browser=await chromium.launch({headless:true});
  const artifacts=[],checks=[];
  for(const size of sizes){
    const dir=path.join(out,size.id);fs.mkdirSync(dir,{recursive:true});
    const page=await browser.newPage({viewport:{width:size.W,height:size.H},deviceScaleFactor:3});
    for(const [name,label,draw] of scenes){
      const filename=path.join(dir,name+'.svg');fs.writeFileSync(filename,svg(size.W,size.H,draw(size.W,size.H)));
      await page.goto('file://'+filename);await page.evaluate(()=>document.fonts.ready);
      const overflow=await page.evaluate(()=>Array.from(document.querySelectorAll('text')).filter(e=>{const b=e.getBoundingClientRect();return b.left < 0 || b.right > innerWidth || b.bottom > innerHeight;}).map(e=>({text:e.textContent,rect:e.getBoundingClientRect().toJSON()})));
      const png=path.join(dir,name+'.png');await page.screenshot({path:png});
      const bytes=fs.readFileSync(png),pixels=[bytes.readUInt32BE(16),bytes.readUInt32BE(20)];
      if(pixels[0]!==size.W*3||pixels[1]!==size.H*3)throw Error('Wrong device pixel canvas');
      if(overflow.length)throw Error('Text overflows: '+JSON.stringify(overflow));
      checks.push({deviceGroup:size.id,scene:name,pixels,overflow});artifacts.push({deviceGroup:size.id,scene:name,label,png:png,svg:filename,pixels,points:[size.W,size.H]});
    }
    fs.writeFileSync(path.join(dir,'refresh-motion-design.svg'),svg(size.W,size.H,browse(size.W,size.H,true,true)));
    await page.close();
    const html=path.join(out,size.id+'-overview.html');fs.writeFileSync(html,board(size));
    const overview=await browser.newPage({viewport:{width:1600,height:size.H===874?1110:1128},deviceScaleFactor:2});
    await overview.goto('file://'+html);await overview.evaluate(()=>document.fonts.ready);await overview.screenshot({path:path.join(out,size.id+'-overview.png'),fullPage:true});await overview.close();
    console.log(size.id+': '+size.W*3+'×'+size.H*3+' · four fresh screen renders');
  }
  await browser.close();
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({kind:'authored device-size visual preview',nativeRuntimeProof:false,illustrativeContent:true,sourceDialogOwner:'ExchangeMapAttributionDialog',devices:JSON.parse(fs.readFileSync(path.join(out,'device-metrics.json'),'utf8')),canvasChecks:checks,artifacts,cutoutAndGlass:'Illustrative styling; screen pixel/point dimensions and scale are verified from official specs and installed CoreSimulator capabilities. Full native material, safe-area and motion validation is a separate gate.'},null,2)+'\n');
})().catch(e=>{console.error(e.message);process.exitCode=1});
