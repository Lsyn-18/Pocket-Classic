import {createDiagnostics} from './diagnostics.mjs';
import {problemFrom,recoveryActions} from './problems.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRoamStream} from './roam-stream.mjs';
import {createWheelInput} from './wheel-input.mjs';
import {createButtonPress} from './button-press.mjs';
import libraryModule from '../music-service/library.cjs';
import {coverUrl} from './artwork.mjs';
import {motionTiming} from './design-tokens.mjs';
import {menuMarker,listWindow,emptyContent,qualityLabel,appearanceIsDark,canAdvance,playbackGlyph,collectionScope,matchingEntries} from './presentation.mjs';
const source=fs.readFileSync(new URL('./player.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
const song=id=>({id,name:'Track '+id,artist:'Artist',durationMs:120000});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function choose(app,name){const index=app.entries().findIndex(e=>e.name===name);assert.ok(index>=0,'Missing menu '+name);app.state.selected=index;return app.select();}
function fixture(routes={},clock={},useNative=false){
  const elements=new Map(),listeners=new Map();let playCount=0;
  function element(id){if(elements.has(id))return elements.get(id);const classes=new Set();const el={id,textContent:'',innerHTML:'',value:'',style:{},attributes:{},clientHeight:190,hidden:false,open:false,dataset:{},
    classList:{toggle(name,value){if(value)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
    getBoundingClientRect:()=>({width:360}),querySelectorAll(selector){const attribute=selector.match(/^\[([a-z-]+)\]$/)?.[1];if(!attribute)return [];const pattern=new RegExp('<button\\b[^>]*\\b'+attribute+'="([^"]*)"[^>]*>','g');return Array.from(this.innerHTML.matchAll(pattern),match=>{const child=element(id+':'+attribute+':'+match[1]);child.dataset[attribute.slice(5).replace(/-([a-z])/g,(_,char)=>char.toUpperCase())]=match[1];return child;});},querySelector(){return null;},append(){},setPointerCapture(){},setAttribute(name,value){this.attributes[name]=String(value);},
    addEventListener(name,handler){const previous=listeners.get(id+':'+name);listeners.set(id+':'+name,previous?event=>{previous(event);handler(event);}:handler);},removeAttribute(){if(id==='audio')this.src='';},
    focus(){document.activeElement=this;},showModal(){this.open=true;},close(){this.open=false;}};elements.set(id,el);return el;}
  Object.assign(element('audio'),{paused:true,currentTime:0,duration:120,volume:.65,load(){},pause(){this.paused=true;},async play(){this.paused=false;playCount++;}});
  const document={getElementById:element,body:element('body'),querySelector:selector=>selector==='.device'?element('device'):null,querySelectorAll:()=>[],createElement:()=>element('spinner'),addEventListener(){}};
  const window={};const fetch=async(url,options)=>{const route=url.slice(5),handler=routes[route.split('?')[0]];const body=options?.body?JSON.parse(options.body):null;const result=handler?await handler(body,route):route==='resolve'?{url:'https://test.music.126.net/test.mp3',trial:null}:{playlists:[]};return {ok:!result.error,json:async()=>result};};
  const nativeCalls=[];
  const bridge={audio:element('audio'),ready:Promise.resolve(),syncPreferences(){},onConnection(handler){listeners.set('native:connection',handler);},onPlayback(handler){listeners.set('native:playback',handler);},onLocalProgress(handler){listeners.set('native:localProgress',handler);},onBattery(){},beginTransition(){},motion:{onVisibility(){}},vibrate(){},openConnection(){nativeCalls.push({method:'login'});},
    async api(route){const response=await fetch('/api/'+route);const value=await response.json();if(value.error)throw Error(value.error);return value;},
    async playQueue(tracks,index,mode,options){nativeCalls.push({method:'queue',tracks,index,mode,options});element('audio').paused=false;},async selectQueue(index,session){nativeCalls.push({method:'queueSelect',index,session});},async retryQueue(){nativeCalls.push({method:'queueRetry'});},async localManage(method,args){nativeCalls.push({method,args});return routes[method]?.(args)||this.api('local');},async localAction(method,category){nativeCalls.push({method,category});return this.api('local');}};
  if(useNative)window.PocketNative={};
  vm.runInNewContext(source,{window,document,navigator:{},location:{protocol:'file:'},fetch,createDiagnostics,problemFrom,recoveryActions,createNativePlatform:()=>bridge,createRoamStream,createWheelInput,createButtonPress,coverUrl,motionTiming,menuMarker,listWindow,emptyContent,qualityLabel,appearanceIsDark,canAdvance,playbackGlyph,collectionScope,matchingEntries,console,setTimeout,clearTimeout,setInterval,clearInterval,MediaMetadata:class{},...clock});
  const app=window.PocketClassicContext;app.state.connected=true;
  return {app,elements,listeners,nativeCalls,document,get playCount(){return playCount;}};
}

test('liked songs have their own paged list and playback source',async()=>{
  const {app}=fixture({liked:(_,route)=>route.endsWith('=0')?{tracks:[song(3)],more:true,nextOffset:100}:{tracks:[song(4)],more:false,nextOffset:102}});
  await app.select();await choose(app,'喜欢的音乐');assert.equal(app.state.tracksSource,'liked');app.state.selected=1;await app.select();assert.deepEqual(Array.from(app.state.tracks,t=>t.id),[3,4]);app.state.selected=1;await app.select();assert.equal(app.state.queueMode,'liked');assert.equal(app.state.current.id,4);
});

test('red-heart order reaches browser and native liked queues across hundred-song pages',async()=>{
  for(const useNative of [false,true]){
    const ids=Array.from({length:205},(_,i)=>205-i),routes=[];
    const library=libraryModule.createLibrary({getSession:()=>({authenticated:true,cookie:'fixture-session',userId:7}),call:async name=>{
      if(name==='user_playlist_create')return {body:{code:200,data:{playlist:[{id:88,name:'Renamed heart',specialType:5,userId:7}],more:false}}};
      assert.equal(name,'playlist_detail');return {body:{code:200,playlist:{id:88,trackIds:ids.map(id=>({id})),tracks:ids.toReversed().map(id=>({id,name:'Track '+id,ar:[],dt:120000}))}}};
    }});
    const f=fixture({status:()=>({authenticated:true,nickname:'Fixture'}),liked:(_,route)=>{routes.push(route);return library.liked(new URLSearchParams(route.split('?')[1]).get('offset'));}},{},useNative),{app}=f;
    await app.select();await choose(app,'喜欢的音乐');assert.equal(app.state.tracks[0].id,205);
    for(let i=0;i<2;i++){app.state.selected=app.state.tracks.length;await app.select();}
    assert.deepEqual(Array.from(app.state.tracks,t=>t.id),ids);assert.equal(app.state.tracksMore,false);assert.deepEqual(routes,['liked?offset=0','liked?offset=100','liked?offset=200']);
    app.state.selected=203;await app.select();assert.equal(app.state.current.id,2);assert.equal(app.state.queueMode,'liked');assert.deepEqual(Array.from(app.state.queue,t=>t.id),ids);
    if(useNative){assert.equal(f.nativeCalls.at(-1).mode,'liked');assert.deepEqual(Array.from(f.nativeCalls.at(-1).tracks,t=>t.id),ids);}
  }
});

test('playlist pages reach the browser and native queue in saved order despite shuffled metadata',async()=>{
  for(const useNative of [false,true]){
    const ids=Array.from({length:2003},(_,i)=>2003-i),routes=[];
    const library=libraryModule.createLibrary({getSession:()=>({authenticated:true,cookie:'fixture-session',userId:7}),call:async name=>{
      if(name==='user_playlist_create')return {body:{code:200,data:{playlist:[{id:88,name:'Playlist',userId:8,subscribed:true},{id:9,name:'Likes',userId:7,specialType:5},{id:3,name:'Created',userId:7}],more:false}}};
      if(name==='user_playlist_collect')return {body:{code:200,data:{playlist:[{id:88,name:'Playlist',userId:8},{id:7,name:'Collected',userId:8}],more:false}}};
      assert.equal(name,'playlist_detail');return {body:{code:200,playlist:{id:88,name:'Playlist',trackIds:ids.map(id=>({id})),tracks:ids.toReversed().map(id=>({id,name:'Track '+id,ar:[],dt:120000}))}}};
    }});
    const f=fixture({status:()=>({authenticated:true,nickname:'Fixture'}),playlists:async()=>({playlists:await library.playlists()}),tracks:(_,route)=>{routes.push(route);const query=new URLSearchParams(route.split('?')[1]);return library.tracks(query.get('id'),query.get('offset')??0);}},{},useNative),{app}=f;
    await app.select();await choose(app,'我的歌单');assert.deepEqual(Array.from(app.state.playlists,p=>p.id),[88,3,7]);await app.select();assert.equal(app.state.tracks[0].id,2003);assert.equal(app.state.tracksMore,true);
    for(let i=0;i<2;i++){app.state.selected=app.state.tracks.length;await app.select();}
    assert.deepEqual(Array.from(app.state.tracks,t=>t.id),ids);assert.equal(app.state.tracksMore,false);assert.deepEqual(routes,['tracks?id=88','tracks?id=88&offset=1000','tracks?id=88&offset=2000']);
    app.state.selected=2001;await app.select();assert.equal(app.state.current.id,2);assert.deepEqual(Array.from(app.state.queue,t=>t.id),ids);
    if(useNative){assert.deepEqual(Array.from(f.nativeCalls.at(-1).tracks,t=>t.id),ids);assert.equal(f.nativeCalls.at(-1).index,2001);}
  }
});

test('local library keeps previously imported downloads playable without a cloud connection',async()=>{
  const tracks=[{...song(-1),category:'netease',local:true,format:'FLAC'},{...song(-2),category:'device',local:true,format:'WAV'}];
  const {app,nativeCalls,elements}=fixture({status:()=>({error:'offline'}),local:()=>({tracks,permissionGranted:false})},{},true);await flush();assert.equal(app.state.connected,false);assert.equal(app.state.problem,null);
  await app.select();assert.equal(app.entries().some(e=>e.id==='netease'),false);await choose(app,'手机本地音乐');assert.deepEqual(Array.from(app.entries().filter(item=>item.id),t=>t.id),[-1,-2]);
  app.state.selected=1;await app.select();assert.equal(app.state.queueMode,'local');assert.equal(nativeCalls.at(-1).mode,'local');assert.equal(nativeCalls.at(-1).index,1);assert.deepEqual(Array.from(nativeCalls.at(-1).tracks,t=>t.id),[-1,-2]);
  assert.equal(app.state.feedbackLevel,'state');assert.equal(app.state.feedback,'换曲');
  app.action('menu');await app.openLocalManager();const importing=elements.get('readerContent').querySelectorAll('[data-local-action]').find(button=>button.dataset.localAction==='localImport');await importing.onclick();assert.equal(nativeCalls.at(-1).category,'device');assert.equal(nativeCalls.some(c=>c.method==='login'),false);
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
  const {app}=fixture();await app.select();assert.equal(app.state.page,'music');assert.deepEqual(Array.from(app.entries(),x=>x.name),['喜欢的音乐','我的歌单','手机本地音乐','每日推荐','私人漫游','收藏的歌手']);
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
  await app.select();await choose(app,'收藏的歌手');assert.equal(app.state.page,'artists');app.state.selected=1;await app.select();assert.deepEqual(Array.from(app.state.artists,a=>a.id),[1,2]);
  app.state.selected=0;await app.select();assert.equal(app.state.title,'Singer A');app.state.selected=1;await app.select();assert.deepEqual(Array.from(app.state.tracks,t=>t.id),[10,11]);app.state.selected=1;await app.select();assert.equal(app.state.queueMode,'artist');assert.equal(app.state.current.id,11);
});

test('leaving singer pagination discards its response and errors keep retry possible',async()=>{
  let finish;const {app,elements}=fixture({artists:(_,route)=>route.endsWith('=0')?{artists:[{id:1,name:'Singer'}],more:true,nextOffset:50}:new Promise(r=>{finish=r;})});
  await app.select();await choose(app,'收藏的歌手');app.state.selected=1;const pending=app.select();app.action('menu');finish({artists:[{id:2}],more:false,nextOffset:51});await pending;assert.equal(app.state.page,'music');assert.equal(app.state.artists.length,1);
  const failure=fixture({artists:()=>({error:'歌手服务暂不可用'})});await failure.app.select();await choose(failure.app,'收藏的歌手');assert.equal(failure.app.state.noticeError,true);assert.match(failure.elements.get('lcdFooter').textContent,/歌手服务/);
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

test('an empty random source never starts login and a local shortcut stays offline',async()=>{
  const {app,elements,nativeCalls}=fixture({status:()=>({authenticated:false}),local:()=>({tracks:[{...song(-8),local:true}],permissionGranted:false})},{},true);await flush();
  app.state.selected=2;await app.select();assert.equal(app.state.page,'home');assert.equal(nativeCalls.some(call=>call.method==='login'),false);assert.equal(app.state.shuffle,false);
  await elements.get('localShortcut').onclick();assert.equal(app.state.page,'local');app.action('menu',true);app.state.selected=2;await app.select();
  assert.equal(app.state.current.id,-8);assert.equal(nativeCalls.at(-1).mode,'local');assert.equal(nativeCalls.some(call=>call.method==='login'),false);
});

test('native authorization resumes the original liked task and later navigation cancels it',async()=>{
  let connected=false;const {app,listeners,nativeCalls,elements}=fixture({status:()=>({authenticated:connected,nickname:connected?'Listener':''}),liked:()=>({tracks:[song(12)],more:false})},{},true);await flush();
  await app.select();await choose(app,'喜欢的音乐');assert.equal(nativeCalls.at(-1).method,'login');connected=true;listeners.get('native:connection')();await flush();await flush();
  assert.equal(app.state.page,'tracks');assert.equal(app.state.title,'喜欢的音乐');assert.equal(app.state.tracks[0].id,12);
  connected=false;listeners.get('native:connection')();await flush();await app.select();await choose(app,'喜欢的音乐');await elements.get('localShortcut').onclick();
  connected=true;listeners.get('native:connection')();await flush();assert.equal(app.state.page,'local');
});

test('search preserves original indexes and selecting a result plays that exact track',async()=>{
  const {app,elements,document}=fixture({daily:()=>({tracks:[song(11),song(22),{...song(33),album:'Evening'}]})});await app.select();await choose(app,'每日推荐');elements.get('openList').onclick();elements.get('readerQuery').focus();
  elements.get('readerQuery').oninput({target:{value:'track 22'}});const panel=elements.get('readerContent'),buttons=panel.querySelectorAll('[data-reader-index]');assert.equal(buttons.length,1);assert.equal(buttons[0].dataset.readerIndex,'1');
  assert.equal(document.activeElement,elements.get('readerQuery'),'Typing must keep focus in search');
  await buttons[0].onclick();assert.equal(app.state.current.id,22);assert.equal(app.state.queue.length,3);
  app.action('menu');elements.get('readerQuery').oninput({target:{value:'Evening'}});assert.match(panel.innerHTML,/data-reader-index="2"/);
  elements.get('readerQuery').oninput({target:{value:'not present'}});assert.match(panel.innerHTML,/已加载内容中没有匹配项/);assert.equal(app.state.tracks.length,3);
});

test('blocking failures outlive transient timers and expose recovery in semantic navigation',async()=>{
  const timers=new Map();let id=0;const {app,elements}=fixture({daily:()=>({error:'网络连接失败'})},{setTimeout:(fn,ms)=>(timers.set(++id,{fn,ms}),id),clearTimeout:key=>timers.delete(key)});
  await app.select();await choose(app,'每日推荐');for(const timer of timers.values())timer.fn();assert.equal(app.state.problem.message,'网络连接失败');assert.equal(app.state.feedback,'网络连接失败');assert.equal(elements.get('feedbackDismiss').hidden,true);assert.match(elements.get('accessibleMenu').innerHTML,/data-screen-action="retry"/);
});

test('explicit mode targets select only the intended control without changing media values',()=>{
  const {app}=fixture();Object.assign(app.state,{page:'playing',current:song(1),queue:[song(1)]});app.audio.currentTime=48;
  app.screenAction('seekMode');app.screenAction('seekMode');assert.equal(app.state.mode,'seek');assert.equal(app.audio.currentTime,48);
  app.screenAction('volumeMode');app.screenAction('volumeMode');assert.equal(app.state.mode,'volume');assert.equal(app.audio.volume,.65);
});

test('paged songs disclose the loaded search and playback scope',async()=>{
  const {app,elements}=fixture({liked:()=>({tracks:[song(1)],more:true,nextOffset:100,trackCount:205})});await app.select();await choose(app,'喜欢的音乐');elements.get('openList').onclick();assert.match(elements.get('readerScope').textContent,/已加载的 1 首.*205 首/);
  await app.select();app.action('select',true);assert.match(elements.get('lcdFooter').textContent,/喜欢的音乐.*仅含已加载歌曲/);
});

test('cover browsing follows wheel selection and centre plays the selected source track',async()=>{
  const {app}=fixture({daily:()=>({tracks:[song(10),song(20),song(30)]})});app.openCovers();assert.equal(app.state.page,'home');
  await app.select();await choose(app,'每日推荐');app.openCovers();assert.equal(app.state.page,'covers');app.rotate(2);assert.equal(app.state.selected,2);await app.select();assert.equal(app.state.current.id,30);assert.equal(app.state.queueMode,'daily');assert.equal(app.state.queue.length,3);
});

test('failed roaming preserves current music and retry resumes roaming without adding a history level',async()=>{
  let attempts=0;const {app}=fixture({daily:()=>({tracks:[song(1),song(2)]}),roam:()=>++attempts===1?{error:'网络暂不可用'}:{tracks:[song(3),song(4),song(5)]}});
  await app.select();await choose(app,'每日推荐');await app.select();assert.equal(app.audio.paused,false);app.action('menu',true);await app.select();await choose(app,'私人漫游');
  assert.equal(app.state.current.id,1);assert.equal(app.state.queueMode,'daily');assert.equal(app.audio.paused,false);const depth=app.state.history.length;
  await app.select();assert.equal(attempts,2);assert.equal(app.state.current.id,3);assert.equal(app.state.queueMode,'roam');assert.equal(app.state.history.length,depth);
});

test('logging out clears old cloud collections and their random playback source',async()=>{
  const {app,elements}=fixture({daily:()=>({tracks:[song(1)]}),status:()=>({authenticated:false}),logout:()=>({})});await app.select();await choose(app,'每日推荐');assert.ok(app.state.lastCollection);
  await elements.get('clearSession').onclick();assert.equal(app.state.lastCollection,null);assert.equal(app.state.tracks.length,0);app.state.selected=2;await app.select();assert.equal(app.state.current,null);assert.equal(app.state.page,'home');
});

test('browser playback appends the captured playlist page and preserves its saved order',async()=>{
  const token='00000000-0000-4000-8000-000000000000',calls=[];
  const {app}=fixture({liked:()=>({tracks:[song(8),song(6)],more:true,nextOffset:2,trackCount:4,snapshot:token}),'queue-pin':()=>({pinned:true}),'queue-page':(_,route)=>{calls.push(route);return {tracks:[song(6),song(4),song(2)],nextOffset:4,more:false};}});
  await app.select();await choose(app,'喜欢的音乐');await app.select();await flush();assert.deepEqual(Array.from(app.state.queue,track=>track.id),[8,6,4,2]);assert.equal(app.state.queueHasMore,false);assert.equal(app.state.tracksMore,false);assert.equal(app.state.queueLoading,false);assert.equal(calls.length,1);assert.match(calls[0],/offset=2/);
});

test('failed browser prefetch keeps playing and stale pages cannot contaminate a replacement queue',async()=>{
  let finish;const {app,elements}=fixture({liked:()=>({tracks:[song(1),song(2)],more:true,nextOffset:2,snapshot:'00000000-0000-4000-8000-000000000000'}),'queue-pin':()=>({pinned:true}),'queue-page':()=>new Promise(resolve=>finish=resolve),daily:()=>({tracks:[song(9)]})});
  await app.select();await choose(app,'喜欢的音乐');await app.select();assert.equal(app.audio.paused,false);app.action('menu',true);await app.select();await choose(app,'每日推荐');await app.select();finish({tracks:[song(3)],nextOffset:3,more:false});await flush();assert.deepEqual(Array.from(app.state.queue,track=>track.id),[9]);assert.equal(app.state.current.id,9);assert.equal(app.state.queueError,'');
  app.action('menu',true);await app.select();await choose(app,'喜欢的音乐');await app.select();finish({error:'续载暂不可用'});await flush();assert.equal(app.audio.paused,false);assert.equal(app.state.problem,null);assert.equal(app.state.queueError,'续载暂不可用');elements.get('openList').onclick();assert.match(elements.get('readerContent').innerHTML,/重试续载/);
});

test('native queue selection retains its continuation and sends the initial snapshot only once',async()=>{
  const token='00000000-0000-4000-8000-000000000000',f=fixture({status:()=>({authenticated:true}),liked:()=>({tracks:[song(1),song(2)],snapshot:token,nextOffset:2,trackCount:205,more:true})},{},true),{app}=f;await flush();await app.select();await choose(app,'喜欢的音乐');await app.select();assert.equal(f.nativeCalls.at(-1).options.source.snapshot,token);
  f.listeners.get('native:playback')({tracks:[song(1),song(2)],current:song(1),mode:'liked',index:0,count:2,queueSession:'native-session',queueMore:true,queueTitle:'喜欢的音乐',queueTotal:205});
  app.action('select',true);app.state.selected=1;await app.select();assert.equal(f.nativeCalls.at(-1).method,'queueSelect');assert.equal(f.nativeCalls.at(-1).session,'native-session');assert.equal(f.nativeCalls.filter(call=>call.method==='queue').length,1);
});

test('five-thousand-song readers bound rendered rows while searching the full loaded collection',async()=>{
  const {app,elements}=fixture({daily:()=>({tracks:Array.from({length:5000},(_,id)=>song(id))})});await app.select();await choose(app,'每日推荐');app.openReader();const panel=elements.get('readerContent');assert.equal(panel.querySelectorAll('[data-reader-index]').length,200);
  elements.get('readerNextResults').onclick();assert.equal(panel.querySelectorAll('[data-reader-index]')[0].dataset.readerIndex,'200');elements.get('readerQuery').oninput({target:{value:'Track 4999'}});const results=panel.querySelectorAll('[data-reader-index]');assert.equal(results.length,1);assert.equal(results[0].dataset.readerIndex,'4999');results[0].onclick();assert.equal(app.state.current.id,4999);
});

test('local management shows ownership and space, protects the current track and supports undo',async()=>{
  const tracks=[{...song(-1),local:true,sourceKind:'copy',bytes:1048576},{...song(-2),local:true,sourceKind:'scan'}],token='00000000-0000-4000-8000-000000000000';let pending=false;
  const catalog=()=>({tracks:pending?[tracks[0]]:tracks,permissionGranted:true,storage:{copies:1,importedBytes:1048576,cacheBytes:0,availableBytes:1073741824},pendingRemovals:pending?[{token,count:1,until:Date.now()+10000}]:[]});
  const {app,elements,nativeCalls}=fixture({status:()=>({authenticated:false}),local:catalog,localRemove:args=>{assert.deepEqual(Array.from(args.ids),[-2]);pending=true;return catalog();},localUndo:args=>{assert.equal(args.token,token);pending=false;return catalog();}},{setTimeout:()=>0,clearTimeout(){}},true);await flush();await app.openLocalManager();app.state.current=tracks[0];app.state.selected=0;await app.select();assert.equal(app.state.localSelection.length,0);
  app.state.selected=1;await app.select();assert.deepEqual(Array.from(app.state.localSelection),[-2]);assert.match(elements.get('readerContent').innerHTML,/应用内副本.*1.0 MB/);await elements.get('readerRemoveLocal').onclick();assert.equal(app.state.localTracks.length,1);const undo=elements.get('readerContent').querySelectorAll('[data-undo-token]')[0];await undo.onclick();assert.equal(app.state.localTracks.length,2);assert.equal(nativeCalls.some(call=>call.method==='login'),false);
});

test('import progress stays visible and partial failures retain their individual reasons',async()=>{
  let finish,loading=false;const report={added:1,updated:0,skipped:1,failed:1,total:3,failures:[{file:'note.txt',reason:'不支持的音频格式'},{file:'broken.mp3',reason:'文件为空'}]};
  const {app,elements,listeners}=fixture({status:()=>({authenticated:false}),local:()=>loading?new Promise(resolve=>finish=resolve):{tracks:[],permissionGranted:false}},{},true);await flush();await app.openLocalManager();loading=true;const button=elements.get('readerContent').querySelectorAll('[data-local-action]').find(item=>item.dataset.localAction==='localImport'),task=button.onclick();listeners.get('native:localProgress')({processed:2,total:3,added:1,failed:0});assert.match(elements.get('readerContent').innerHTML,/2 \/ 3/);
  finish({tracks:[{...song(-3),local:true,sourceKind:'copy'}],report});await task;assert.match(elements.get('readerContent').innerHTML,/note.txt/);assert.match(elements.get('readerContent').innerHTML,/broken.mp3/);assert.equal(app.state.busy,false);
});

test('unavailable songs use the next song action and local diagnostics stay opt in',async()=>{
 const f=fixture({resolve:({id})=>id===1?{error:'服务暂不可用',errorReason:'unavailable'}:{url:'https://test.music.126.net/test.mp3'}}),{app}=f;
 Object.assign(app.state,{page:'tracks',tracks:[song(1),song(2)],title:'Fixture'});await app.select();
 assert.equal(app.state.problem.reason,'unavailable');await app.select();assert.equal(app.state.current.id,2);assert.equal(app.state.problem,null);assert.equal(f.playCount,1);
 assert.equal(app.diagnostics.enabled,false);app.action('menu',true);app.state.selected=3;await app.select();await choose(app,'本地体验诊断');
 assert.equal(f.elements.get('readerDialog').open,true);assert.match(f.elements.get('readerContent').innerHTML,/不会记录歌名/);assert.equal(app.diagnostics.enabled,false);
 f.elements.get('diagnosticsToggle').onclick();assert.equal(app.diagnostics.enabled,true);f.elements.get('diagnosticsToggle').onclick();assert.equal(app.diagnostics.enabled,false);
});

test('system large text applies even when playback arrives before the ready preferences',async()=>{
 const f=fixture({}, {},true),receive=f.listeners.get('native:playback');
 receive({current:null,index:0,count:0,tracks:[],playing:false});assert.equal(f.app.state.largeText,false);
 receive({current:null,index:0,count:0,tracks:[],playing:false,fontScale:1.5});
 assert.equal(f.app.state.systemLargeText,true);assert.equal(f.document.body.classList.contains('large-text'),true);assert.equal(f.app.state.largeText,false);
 receive({current:null,index:0,count:0,tracks:[],playing:false,fontScale:1});assert.equal(f.document.body.classList.contains('large-text'),false);
});
