import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRoamStream} from './roam-stream.mjs';
import {createWheelInput} from './wheel-input.mjs';
import {createButtonPress} from './button-press.mjs';
import {coverUrl} from './artwork.mjs';
import {menuMarker,listWindow,emptyContent,qualityLabel,appearanceIsDark,canAdvance,playbackGlyph} from './presentation.mjs';
const source=fs.readFileSync(new URL('./player.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
const song=id=>({id,name:'Track '+id,artist:'Artist',durationMs:120000});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function choose(app,name){const index=app.entries().findIndex(e=>e.name===name);assert.ok(index>=0,'Missing menu '+name);app.state.selected=index;return app.select();}
function fixture(routes={},clock={},useNative=false){
  const elements=new Map(),listeners=new Map();let playCount=0;
  function element(id){if(elements.has(id))return elements.get(id);const classes=new Set();const el={id,textContent:'',innerHTML:'',style:{},clientHeight:190,hidden:false,open:false,dataset:{},
    classList:{toggle(name,value){if(value)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
    getBoundingClientRect:()=>({width:360}),querySelectorAll:()=>[],append(){},setPointerCapture(){},setAttribute(){},
    addEventListener(name,handler){listeners.set(id+':'+name,handler);},removeAttribute(){if(id==='audio')this.src='';},
    showModal(){this.open=true;},close(){this.open=false;}};elements.set(id,el);return el;}
  Object.assign(element('audio'),{paused:true,currentTime:0,duration:120,volume:.65,load(){},pause(){this.paused=true;},async play(){this.paused=false;playCount++;}});
  const document={getElementById:element,body:element('body'),querySelector:selector=>selector==='.device'?element('device'):null,querySelectorAll:()=>[],createElement:()=>element('spinner'),addEventListener(){}};
  const window={};const fetch=async(url,options)=>{const route=url.slice(5),handler=routes[route.split('?')[0]];const body=options?.body?JSON.parse(options.body):null;const result=handler?await handler(body,route):route==='resolve'?{url:'https://test.music.126.net/test.mp3',trial:null}:{playlists:[]};return {ok:!result.error,json:async()=>result};};
  const nativeCalls=[];
  const bridge={audio:element('audio'),ready:Promise.resolve(),syncPreferences(){},onConnection(){},onPlayback(){},onBattery(){},beginTransition(){},motion:{onVisibility(){}},vibrate(){},openConnection(){nativeCalls.push({method:'login'});},
    async api(route){const response=await fetch('/api/'+route);const value=await response.json();if(value.error)throw Error(value.error);return value;},
    async playQueue(tracks,index,mode){nativeCalls.push({method:'queue',tracks,index,mode});element('audio').paused=false;},async localAction(method,category){nativeCalls.push({method,category});return this.api('local');}};
  if(useNative)window.PocketNative={};
  vm.runInNewContext(source,{window,document,navigator:{},location:{protocol:'file:'},fetch,createNativePlatform:()=>bridge,createRoamStream,createWheelInput,createButtonPress,coverUrl,menuMarker,listWindow,emptyContent,qualityLabel,appearanceIsDark,canAdvance,playbackGlyph,console,setTimeout,clearTimeout,setInterval,clearInterval,MediaMetadata:class{},...clock});
  const app=window.PocketClassicContext;app.state.connected=true;
  return {app,elements,listeners,nativeCalls,get playCount(){return playCount;}};
}

test('liked songs have their own paged list and playback source',async()=>{
  const {app}=fixture({liked:(_,route)=>route.endsWith('=0')?{tracks:[song(3)],more:true,nextOffset:100}:{tracks:[song(4)],more:false,nextOffset:102}});
  await app.select();await choose(app,'喜欢的音乐');assert.equal(app.state.tracksSource,'liked');app.state.selected=1;await app.select();assert.deepEqual(Array.from(app.state.tracks,t=>t.id),[3,4]);app.state.selected=1;await app.select();assert.equal(app.state.queueMode,'liked');assert.equal(app.state.current.id,4);
});

test('local library keeps previously imported downloads playable without a cloud connection',async()=>{
  const tracks=[{...song(-1),category:'netease',local:true,format:'FLAC'},{...song(-2),category:'device',local:true,format:'WAV'}];
  const {app,nativeCalls}=fixture({status:()=>({error:'offline'}),local:()=>({tracks,permissionGranted:false})},{},true);await flush();assert.equal(app.state.connected,false);assert.equal(app.state.problem,null);
  await app.select();assert.equal(app.entries().some(e=>e.id==='netease'),false);await choose(app,'手机本地音乐');assert.deepEqual(Array.from(app.entries().slice(3),t=>t.id),[-1,-2]);
  app.state.selected=4;await app.select();assert.equal(app.state.queueMode,'local');assert.equal(nativeCalls.at(-1).mode,'local');assert.equal(nativeCalls.at(-1).index,1);assert.deepEqual(Array.from(nativeCalls.at(-1).tracks,t=>t.id),[-1,-2]);
  assert.equal(app.state.feedbackLevel,'state');assert.equal(app.state.feedback,'换曲');
  app.action('menu');app.state.selected=1;await app.select();assert.equal(nativeCalls.at(-1).category,'device');assert.equal(nativeCalls.some(c=>c.method==='login'),false);
});

test('top icon offers pause during playback and play when paused',async()=>{
  const {app,elements,listeners}=fixture();app.state.current=song(9);app.audio.paused=false;app.render();assert.match(elements.get('playIndicator').innerHTML,/M2 1H5/);
  app.audio.paused=true;listeners.get('audio:pause')();assert.match(elements.get('playIndicator').innerHTML,/M2 0 11/);assert.equal(elements.get('playIndicator').style.display,'block');
  app.state.current=null;app.render();assert.equal(elements.get('playIndicator').style.display,'none');
});

test('feedback levels restore the battery, protect warnings and expose keyboard dismissal',()=>{
  const timers=new Map();let id=0;
  const {app,elements,listeners}=fixture({}, {setTimeout:(fn,ms)=>(timers.set(++id,{fn,ms}),id),clearTimeout:key=>timers.delete(key)});
  app.feedback('VOL 62','state');assert.equal(app.state.feedbackLevel,'state');assert.equal([...timers.values()].at(-1).ms,1600);assert.equal(elements.get('feedbackDismiss').hidden,true);
  [...timers.values()].at(-1).fn();assert.equal(app.state.feedback,'');
  app.feedback('已导入');assert.equal([...timers.values()].at(-1).ms,1200);
  app.feedback('按键已锁定','warning');assert.equal([...timers.values()].at(-1).ms,2400);assert.equal(elements.get('feedbackDismiss').hidden,false);
  app.feedback('VOL 50','state');assert.equal(app.state.feedback,'按键已锁定');
  let stopped=false;listeners.get('feedbackDismiss:keydown')({key:'Escape',preventDefault(){},stopPropagation(){stopped=true;}});
  assert.equal(stopped,true);assert.equal(app.state.feedback,'');assert.equal(elements.get('feedbackDismiss').hidden,true);assert.equal(timers.size,0);
});
test('native Back dismisses a warning before navigating or exiting',()=>{
  const {app}=fixture({}, {},true);app.feedback('按键已锁定','warning');app.native.back();assert.equal(app.state.feedback,'');assert.equal(app.state.page,'home');
});
test('switching volume and progress updates inline guidance without a feedback overlay',()=>{
  const {app,elements}=fixture();Object.assign(app.state,{page:'playing',current:song(1),queue:[song(1)],queueIndex:0,mode:'volume'});
  app.audio.currentTime=32;app.feedback('旧提示');
  for(let i=0;i<4;i++){app.screenAction('mode');assert.equal(app.state.feedback,'');assert.equal(app.state.mode,i%2?'volume':'seek');assert.equal(elements.get('uiAnnouncement').textContent,i%2?'转动转轮调整音量':'转动转轮调整进度');assert.equal(app.audio.currentTime,32);assert.equal(app.audio.volume,.65);}
});
test('music menu contains playlists, daily recommendations, private roaming and followed artists',async()=>{
  const {app}=fixture();await app.select();assert.equal(app.state.page,'music');assert.deepEqual(Array.from(app.entries(),x=>x.name),['喜欢的音乐','我的歌单','手机本地音乐','每日推荐','私人漫游','关注的歌手']);
});

test('holding seek advances continuously, preserves pause, and release cancels further movement',()=>{
  let now=0,id=0;const intervals=new Map();
  const {app}=fixture({}, {Date:{now:()=>now},setInterval:fn=>(intervals.set(++id,fn),id),clearInterval:key=>intervals.delete(key)});
  Object.assign(app.state,{current:song(1),queue:[song(1)],queueIndex:0,page:'playing'});app.audio.currentTime=20;
  app.action('next',true);assert.equal(app.state.seeking,1);assert.equal(app.audio.paused,true);
  now=120;[...intervals.values()][0]();assert.equal(app.audio.currentTime,21.2);
  now=240;[...intervals.values()][0]();assert.equal(app.audio.currentTime,22.4);
  app.stopSeeking();assert.equal(app.state.seeking,0);assert.equal(intervals.size,0);assert.equal(app.state.queueIndex,0);assert.equal(app.audio.paused,true);
  app.action('previous',true);now=360;[...intervals.values()][0]();assert.ok(app.audio.currentTime<22.4);
  app.state.hold=true;now=480;[...intervals.values()][0]();assert.equal(intervals.size,0);
});

test('seek stays in the current track and cancels on a track change',()=>{
  let now=0,id=0;const intervals=new Map();const {app}=fixture({}, {Date:{now:()=>now},setInterval:fn=>(intervals.set(++id,fn),id),clearInterval:key=>intervals.delete(key)});
  Object.assign(app.state,{current:song(1),queue:[song(1),song(2)],page:'playing'});app.audio.currentTime=119.7;app.action('next',true);now=240;[...intervals.values()][0]();assert.equal(app.audio.currentTime,119.75);assert.equal(app.state.current.id,1);
  app.state.current=song(2);now=360;[...intervals.values()][0]();assert.equal(app.state.seeking,0);assert.equal(intervals.size,0);
});
test('daily tracks can be selected and remain a normal finite playback queue',async()=>{
  const {app}=fixture({daily:()=>({tracks:[song(10),song(11)]})});await app.select();await choose(app,'每日推荐');assert.equal(app.state.title,'每日推荐');
  await app.select();assert.equal(app.state.queueMode,'daily');assert.equal(app.state.current.id,10);await app.action('next');assert.equal(app.state.current.id,11);await app.action('next');assert.equal(app.state.current.id,11);
});

test('quality selection reaches resolution requests and can fall back without mislabelling playback',async()=>{
  let requested;const {app}=fixture({daily:()=>({tracks:[song(7)]}),resolve:body=>{requested=body;return {url:'https://test.music.126.net/song.mp3',level:'standard'};}});
  app.state.selected=3;await app.select();app.state.selected=5;await app.select();assert.equal(app.state.page,'quality');app.state.selected=3;await app.select();assert.equal(app.state.quality,'hires');
  app.action('menu',true);await app.select();await choose(app,'每日推荐');await app.select();assert.equal(requested.quality,'hires');assert.equal(app.state.current.id,7);
});

test('followed singers and their songs paginate, deduplicate and form a finite artist queue',async()=>{
  const {app}=fixture({artists:(_,route)=>route.endsWith('=0')?{artists:[{id:1,name:'Singer A',songCount:3}],more:true,nextOffset:50}:{artists:[{id:1,name:'duplicate'},{id:2,name:'Singer B'}],more:false,nextOffset:51},'artist-tracks':(_,route)=>route.endsWith('offset=0')?{tracks:[song(10)],more:true,nextOffset:100}:{tracks:[song(10),song(11)],more:false,nextOffset:102}});
  await app.select();await choose(app,'关注的歌手');assert.equal(app.state.page,'artists');app.state.selected=1;await app.select();assert.deepEqual(Array.from(app.state.artists,a=>a.id),[1,2]);
  app.state.selected=0;await app.select();assert.equal(app.state.title,'Singer A');app.state.selected=1;await app.select();assert.deepEqual(Array.from(app.state.tracks,t=>t.id),[10,11]);app.state.selected=1;await app.select();assert.equal(app.state.queueMode,'artist');assert.equal(app.state.current.id,11);
});

test('leaving singer pagination discards its response and errors keep retry possible',async()=>{
  let finish;const {app,elements}=fixture({artists:(_,route)=>route.endsWith('=0')?{artists:[{id:1,name:'Singer'}],more:true,nextOffset:50}:new Promise(r=>{finish=r;})});
  await app.select();await choose(app,'关注的歌手');app.state.selected=1;const pending=app.select();app.action('menu');finish({artists:[{id:2}],more:false,nextOffset:51});await pending;assert.equal(app.state.page,'music');assert.equal(app.state.artists.length,1);
  const failure=fixture({artists:()=>({error:'歌手服务暂不可用'})});await failure.app.select();await choose(failure.app,'关注的歌手');assert.equal(failure.app.state.noticeError,true);assert.match(failure.elements.get('lcdFooter').textContent,/歌手服务/);
});
test('private roaming refills across the initial batch and supports previous',async()=>{
  let calls=0;const f=fixture({roam:()=>({tracks:(++calls===1?[1,2,3]:[4,5,6]).map(song)})});const {app}=f;
  await app.select();await choose(app,'私人漫游');assert.equal(app.state.queueMode,'roam');assert.equal(app.state.title,'私人漫游');
  await app.action('next');await flush();assert.ok(app.state.queue.length>=6);await app.action('next');await app.action('next');assert.equal(app.state.current.id,4);
  await app.action('previous');assert.equal(app.state.current.id,3);
});
test('a late roaming refill cannot enter the daily recommendation queue',async()=>{
  let calls=0,finish;const {app}=fixture({roam:()=>++calls===1?{tracks:[1,2,3].map(song)}:new Promise(r=>{finish=r;}),daily:()=>({tracks:[song(90),song(91)]})});
  await app.select();await choose(app,'私人漫游');await app.action('next');assert.ok(finish);
  app.action('menu');await choose(app,'每日推荐');await app.select();assert.equal(app.state.queueMode,'daily');
  finish({tracks:[4,5,6].map(song)});await flush();assert.deepEqual(Array.from(app.state.queue,t=>t.id),[90,91]);assert.equal(app.state.current.id,90);
});
test('rapid next presses at the end share a refill without skipping two tracks',async()=>{
  let calls=0,finish;const f=fixture({roam:()=>++calls===1?{tracks:[song(1)]}:new Promise(r=>{finish=r;})});const {app}=f;
  await app.select();await choose(app,'私人漫游');const a=app.action('next'),b=app.action('next');assert.equal(calls,2);
  finish({tracks:[song(2),song(3)]});await Promise.all([a,b]);assert.equal(app.state.current.id,2);assert.equal(f.playCount,2);
});
test('navigation cancels stale daily data before it can replace playlist tracks',async()=>{
  let finish;const {app}=fixture({daily:()=>new Promise(r=>{finish=r;}),playlists:()=>({playlists:[{id:1,name:'Library'}]}),tracks:()=>({tracks:[song(99)]})});
  await app.select();const daily=choose(app,'每日推荐');app.action('menu');await choose(app,'我的歌单');await app.select();
  finish({tracks:[song(40)]});await daily;assert.equal(app.state.tracksSource,'playlist');assert.equal(app.state.tracks[0].id,99);
});
test('daily API failure stays visible and does not invent fallback songs',async()=>{
  const {app,elements}=fixture({daily:()=>({error:'请先连接网易云音乐'})});await app.select();await choose(app,'每日推荐');
  assert.equal(app.state.tracks.length,0);assert.equal(app.state.noticeError,true);assert.match(elements.get('lcdFooter').textContent,/请先连接/);
});
test('ended event advances private roaming and normal tracks still respect repeat',async()=>{
  const {app,listeners}=fixture({roam:()=>({tracks:[1,2,3].map(song)})});await app.select();await choose(app,'私人漫游');listeners.get('audio:ended')();await flush();assert.equal(app.state.current.id,2);
});

test('long centre press opens the actual queue and selecting a queued song preserves its source',async()=>{
  const {app}=fixture({daily:()=>({tracks:[song(41),song(42)]})});
  await app.select();await choose(app,'每日推荐');await app.select();
  app.action('select',true);assert.equal(app.state.page,'queue');assert.equal(app.entries()[0].id,41);
  app.state.selected=1;await app.select();assert.equal(app.state.current.id,42);assert.equal(app.state.queueMode,'daily');
});

test('environment appearance and larger menus never change the device finish',async()=>{
  const {app}=fixture();app.state.selected=3;await app.select();app.state.selected=4;await app.select();assert.equal(app.state.dark,true);
  app.state.selected=6;await app.select();assert.equal(app.state.page,'appearance');await app.select();assert.equal(app.state.theme,'light');
  app.state.selected=1;await app.select();assert.equal(app.state.largeText,true);assert.equal(app.state.dark,true);
  app.state.selected=2;await app.select();assert.equal(app.state.reducedMotion,true);
});

test('a failed list exposes a recoverable error and centre press retries the same request',async()=>{
  let attempts=0;const {app}=fixture({daily:()=>++attempts===1?{error:'网络暂时不可用'}:{tracks:[song(77)]}});
  await app.select();await choose(app,'每日推荐');assert.equal(app.state.problem.message,'网络暂时不可用');
  await app.select();assert.equal(attempts,2);assert.equal(app.state.problem,null);assert.equal(app.state.tracks[0].id,77);assert.equal(app.state.history.length,2);
});

test('requested quality and actual downgraded audio quality remain distinct',async()=>{
  const {app}=fixture({daily:()=>({tracks:[song(7)]}),resolve:()=>({url:'https://test.music.126.net/song.mp3',level:'standard'})});
  app.state.quality='hires';await app.select();await choose(app,'每日推荐');await app.select();assert.equal(app.state.actualQuality,'standard');assert.equal(app.state.quality,'hires');assert.equal(app.state.buffering,false);
});

test('the wheel uses at least one real phone volume step while browser audio keeps four percent steps',()=>{
  const {app}=fixture({}, {},true);app.state.page='playing';app.state.mode='volume';app.audio.volume=0;app.audio.volumeStep=1/7;
  app.rotate(1);assert.equal(app.audio.volume,1/7);app.rotate(-1);assert.equal(app.audio.volume,0);
  const browser=fixture().app;browser.state.page='playing';browser.audio.volume=0;browser.rotate(1);assert.equal(browser.audio.volume,.04);
});
