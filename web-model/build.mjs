import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
const here=path.dirname(fileURLToPath(import.meta.url));const root=path.resolve(here,'..');
const template=path.join(here,'player-template.html');
if(!fs.existsSync(template))fs.copyFileSync(path.join(root,'music-service/index.html'),template);
let html=fs.readFileSync(template,'utf8');
html=html.replace('width=device-width,initial-scale=1','width=device-width,initial-scale=1,viewport-fit=cover');
const accountMarkup=html.match(/<button class="quiet" id="account">[\s\S]*?<\/button>/)?.[0];
if(!accountMarkup)throw new Error('Missing music connection control');
html=html.replace(accountMarkup,'<div id="desktopAccountSlot"></div>');
const result=await build({absWorkingDir:here,entryPoints:['./main.mjs'],tsconfigRaw:{compilerOptions:{}},bundle:true,minify:true,format:'iife',platform:'browser',target:['chrome110','safari16'],write:false,legalComments:'inline'});
const js=result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');
const css=fs.readFileSync(path.join(here,'front.css'),'utf8');
html=html.replace('</style>',css+'\n</style>');
const ui=`<div id="modelViewport" aria-label="iPod Classic 正面三维播放器" tabindex="0"></div><div id="modelStatus" role="status">正在加载播放器…</div><div id="playerTools" class="player-tools" role="group" aria-label="播放器工具"><div id="playerAccountSlot">${accountMarkup}</div><div class="motion-controls"><button id="motionToggle" type="button" aria-pressed="false">开启体感</button></div><button id="playerOptionsToggle" type="button" aria-label="播放器选项" aria-expanded="false" aria-controls="playerOptionsPanel"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg></button><div id="playerOptionsPanel" class="player-options-panel"><button id="motionCalibrate" type="button" hidden>重新校准</button><button id="frontColor" type="button" aria-label="切换黑色机身"><span class="tool-label">切换机身颜色</span></button><button id="fullscreenToggle" type="button" hidden>全屏显示</button></div></div>`;
html=html.replace('<div class="device-wrap">','<div class="device-wrap model-wrap">'+ui);
html=html.replace('INSPIRED BY THE 2009 CLASSIC','IPOD CLASSIC / 2009');
html=html.replace('熟悉的轮廓。<br>久违的<em>手感。</em>','iPod classic.<br>熟悉的<em>样子。</em>');
html=html.replace('细腻铝壳，嵌入式彩色屏幕。<br>从转轮开始，重新听一首歌。','细腻的银色面板，纯白转轮。<br>轻轻倾斜，光线自然流过。');
html=html.replace(/<aside class="notes">[\s\S]*?<\/aside>/,`<aside class="notes"><div class="note"><div class="number">01</div><b>光，跟着手走。</b><p>轻移鼠标，或开启手机体感。<br>低灵敏的倾斜，细微的反光。</p></div><div class="note"><div class="number">02</div><b>熟悉的转轮。</b><p>沿圆环画圈浏览菜单，<br>轻按中央键进入歌单。</p></div><div class="note"><div class="number">03</div><b>继续听歌。</b><p>网易云音乐歌单与播放，<br>都留在这个小小屏幕里。</p></div></aside>`);
html=html.replace('</body>',()=>`<script>${js}</script></body>`);
if(process.argv.includes('--visual-baseline'))html=html.replace('<script>'+js,()=>'<script>window.PocketClassicVisualProfile="baseline";</script><script>'+js);
const thirdPartyLicense=fs.readFileSync(path.join(here,'node_modules/three/LICENSE'),'utf8');
html=html.replace('</head>',()=>`<!--\nThree.js license\n${thirdPartyLicense}\n-->\n</head>`);
fs.writeFileSync(path.join(here,'THREE-LICENSE.txt'),thirdPartyLicense);
for(const script of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(script[1]);
fs.mkdirSync(path.join(here,'dist'),{recursive:true});fs.writeFileSync(path.join(here,'dist/preview.html'),html);
const offline=html;
if(process.argv.includes('--publish')){
  fs.writeFileSync(path.join(root,'music-service/index.html'),html);
  const legacyPreview=path.join(root,'work/netease-probe');
  if(fs.existsSync(legacyPreview))fs.writeFileSync(path.join(legacyPreview,'index.html'),html);
  fs.mkdirSync(path.join(root,'outputs'),{recursive:true});
  fs.writeFileSync(path.join(root,'outputs/Pocket-Classic-3D.html'),offline);
}
if(process.argv.includes('--android')){
  const assets=path.join(root,'android-player/app/src/main/assets');fs.mkdirSync(assets,{recursive:true});
  const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; media-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'";
  const android=html.replace('<html lang="zh-CN">','<html lang="zh-CN" class="compact-player">').replace('<body>','<body class="compact-player native-app">').replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="'+policy+'">');
  fs.writeFileSync(path.join(assets,'player.html'),android);
}
console.log(JSON.stringify({built:true,published:process.argv.includes('--publish'),bundleBytes:js.length,htmlBytes:Buffer.byteLength(html)}));
