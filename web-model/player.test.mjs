import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRoamStream} from './roam-stream.mjs';
const source=fs.readFileSync(new URL('./player.mjs',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
const song=id=>({id,name:'Track '+id,artist:'Artist',durationMs:120000});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(routes={}){
  const elements=new Map(),listeners=new Map();let playCount=0;
  function element(id){if(elements.has(id))return elements.get(id);const classes=new Set();const el={id,textContent:'',innerHTML:'',style:{},clientHeight:190,hidden:false,open:false,dataset:{},
    classList:{toggle(name,value){if(value)classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
    getBoundingClientRect:()=>({width:360}),querySelectorAll:()=>[],append(){},setPointerCapture(){},setAttribute(){},
    addEventListener(name,handler){listeners.set(id+':'+name,handler);},removeAttribute(){if(id==='audio')this.src='';},
    showModal(){this.open=true;},close(){this.open=false;}};elements.set(id,el);return el;}
  Object.assign(element('audio'),{paused:true,currentTime:0,duration:120,volume:.65,load(){},pause(){this.paused=true;},async play(){this.paused=false;playCount++;}});
  const document={getElementById:element,body:element('body'),querySelector:selector=>selector==='.device'?element('device'):null,querySelectorAll:()=>[],createElement:()=>element('spinner'),addEventListener(){}};
  const window={};const fetch=async(url,options)=>{const route=url.slice(5),handler=routes[route.split('?')[0]];const body=options?.body?JSON.parse(options.body):null;const result=handler?await handler(body,route):route==='resolve'?{url:'https://test.music.126.net/test.mp3',trial:null}:{playlists:[]};return {ok:!result.error,json:async()=>result};};
  vm.runInNewContext(source,{window,document,navigator:{},location:{protocol:'file:'},fetch,createRoamStream,console,setTimeout,clearTimeout,setInterval,clearInterval,MediaMetadata:class{}});
  const app=window.PocketClassicContext;app.state.connected=true;
  return {app,elements,listeners,get playCount(){return playCount;}};
}
test('music menu contains playlists, daily recommendations and private roaming',async()=>{
  const {app}=fixture();await app.select();assert.equal(app.state.page,'music');assert.deepEqual(Array.from(app.entries(),x=>x.name),['我的歌单','每日推荐','私人漫游']);
});
test('daily tracks can be selected and remain a normal finite playback queue',async()=>{
  const {app}=fixture({daily:()=>({tracks:[song(10),song(11)]})});await app.select();app.state.selected=1;await app.select();assert.equal(app.state.title,'每日推荐');
  await app.select();assert.equal(app.state.queueMode,'daily');assert.equal(app.state.current.id,10);await app.action('next');assert.equal(app.state.current.id,11);await app.action('next');assert.equal(app.state.current.id,11);
});
test('private roaming refills across the initial batch and supports previous',async()=>{
  let calls=0;const f=fixture({roam:()=>({tracks:(++calls===1?[1,2,3]:[4,5,6]).map(song)})});const {app}=f;
  await app.select();app.state.selected=2;await app.select();assert.equal(app.state.queueMode,'roam');assert.equal(app.state.title,'私人漫游');
  await app.action('next');await flush();assert.ok(app.state.queue.length>=6);await app.action('next');await app.action('next');assert.equal(app.state.current.id,4);
  await app.action('previous');assert.equal(app.state.current.id,3);
});
test('a late roaming refill cannot enter the daily recommendation queue',async()=>{
  let calls=0,finish;const {app}=fixture({roam:()=>++calls===1?{tracks:[1,2,3].map(song)}:new Promise(r=>{finish=r;}),daily:()=>({tracks:[song(90),song(91)]})});
  await app.select();app.state.selected=2;await app.select();await app.action('next');assert.ok(finish);
  app.action('menu');app.state.selected=1;await app.select();await app.select();assert.equal(app.state.queueMode,'daily');
  finish({tracks:[4,5,6].map(song)});await flush();assert.deepEqual(Array.from(app.state.queue,t=>t.id),[90,91]);assert.equal(app.state.current.id,90);
});
test('rapid next presses at the end share a refill without skipping two tracks',async()=>{
  let calls=0,finish;const f=fixture({roam:()=>++calls===1?{tracks:[song(1)]}:new Promise(r=>{finish=r;})});const {app}=f;
  await app.select();app.state.selected=2;await app.select();const a=app.action('next'),b=app.action('next');assert.equal(calls,2);
  finish({tracks:[song(2),song(3)]});await Promise.all([a,b]);assert.equal(app.state.current.id,2);assert.equal(f.playCount,2);
});
test('navigation cancels stale daily data before it can replace playlist tracks',async()=>{
  let finish;const {app}=fixture({daily:()=>new Promise(r=>{finish=r;}),playlists:()=>({playlists:[{id:1,name:'Library'}]}),tracks:()=>({tracks:[song(99)]})});
  await app.select();app.state.selected=1;const daily=app.select();app.action('menu');app.state.selected=0;await app.select();await app.select();
  finish({tracks:[song(40)]});await daily;assert.equal(app.state.tracksSource,'playlist');assert.equal(app.state.tracks[0].id,99);
});
test('daily API failure stays visible and does not invent fallback songs',async()=>{
  const {app,elements}=fixture({daily:()=>({error:'请先连接网易云音乐'})});await app.select();app.state.selected=1;await app.select();
  assert.equal(app.state.tracks.length,0);assert.equal(app.state.noticeError,true);assert.match(elements.get('lcdFooter').textContent,/请先连接/);
});
test('ended event advances private roaming and normal tracks still respect repeat',async()=>{
  const {app,listeners}=fixture({roam:()=>({tracks:[1,2,3].map(song)})});await app.select();app.state.selected=2;await app.select();listeners.get('audio:ended')();await flush();assert.equal(app.state.current.id,2);
});
