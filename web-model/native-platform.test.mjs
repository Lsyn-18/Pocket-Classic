import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativePlatform} from './native-platform.mjs';

async function fixture(){
  const messages=[],timers=new Map();let timer=0;
  const host={setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)};
  const platform=createNativePlatform({postMessage:raw=>messages.push(JSON.parse(raw))},host);
  function respond(message,result={},error){platform.receive({type:'response',id:message.id,ok:!error,result,error});}
  respond(messages[0],{positionMs:0,durationMs:0,playing:false,count:0,tracks:[],index:0,dark:false,haptics:true});await platform.ready;
  return {platform,messages,timers,host,respond};
}
test('native API requests carry only a route and propagate errors',async()=>{
  const f=await fixture();const result=f.platform.api('daily');const message=f.messages.at(-1);
  assert.deepEqual(message.args,{route:'daily'});f.respond(message,{tracks:[{id:1}]});assert.deepEqual(await result,{tracks:[{id:1}]});
  const failure=f.platform.api('roam');f.respond(f.messages.at(-1),{},'连接已失效');await assert.rejects(failure,/连接已失效/);
});
test('native audio state follows Media3 without generating browser ended events',async()=>{
  const f=await fixture();let ended=0;f.platform.audio.addEventListener('ended',()=>ended++);
  f.platform.receive({type:'playback',value:{playing:true,ready:true,positionMs:12345,durationMs:120000,volume:.4,count:3,index:1}});
  assert.equal(f.platform.audio.currentTime,12.345);assert.equal(f.platform.audio.duration,120);assert.equal(f.platform.audio.paused,false);assert.equal(f.platform.audio.readyState,4);
  f.platform.receive({type:'playback',value:{playing:true,ready:true,positionMs:0,durationMs:150000,count:3,index:2}});assert.equal(ended,0);
});
test('a queue transition ignores old snapshots until the new native queue is acknowledged',async()=>{
  const f=await fixture(),snapshots=[];f.platform.onPlayback(value=>snapshots.push(value));snapshots.length=0;
  f.platform.beginTransition();f.platform.receive({type:'playback',value:{current:{id:1},tracks:[{id:1}],index:0,count:1}});assert.equal(snapshots.length,0);
  const pending=f.platform.playQueue([{id:9}],0,'daily',{volume:.65});const message=f.messages.at(-1);assert.equal(message.method,'queue');
  f.respond(message,{current:{id:9},tracks:[{id:9}],index:0,count:1,mode:'daily'});await pending;assert.equal(snapshots.at(-1).current.id,9);assert.equal(f.platform.transitioning,false);
});
test('failed native queue changes release the transition fence',async()=>{
  const f=await fixture();const task=f.platform.playQueue([{id:2}],0,'roam',{});f.respond(f.messages.at(-1),{},'播放器未启动');await assert.rejects(task,/播放器未启动/);assert.equal(f.platform.transitioning,false);
});
test('seek, volume, pause and next become native commands',async()=>{
  const f=await fixture();f.platform.audio.currentTime=15;assert.deepEqual(f.messages.at(-1).args,{positionMs:15000});
  f.platform.audio.volume=5;assert.deepEqual(f.messages.at(-1).args,{value:1});f.platform.audio.pause();assert.equal(f.messages.at(-1).method,'pause');
  const next=f.platform.next();f.respond(f.messages.at(-1));await next;assert.equal(f.messages.at(-1).method,'next');
});
test('motion subscriptions and lifecycle are opt in and removable',async()=>{
  const f=await fixture(),samples=[],visibility=[];const off=f.platform.motion.subscribe(value=>samples.push(value));
  assert.deepEqual(f.messages.at(-1).args,{enabled:true});
  const stopVisibility=f.platform.motion.onVisibility(value=>visibility.push(value));
  f.platform.receive({type:'orientation',value:{beta:45,gamma:3,angle:90}});assert.equal(samples.length,1);
  f.platform.receive({type:'lifecycle',visible:false});assert.deepEqual(visibility,[false]);off();stopVisibility();
  assert.deepEqual(f.messages.at(-1).args,{enabled:false});f.platform.receive({type:'orientation',value:{beta:0,gamma:0}});assert.equal(samples.length,1);
});
test('preferences synchronize only after boot and are deduplicated',async()=>{
  const f=await fixture();f.platform.syncPreferences({dark:true,haptics:false});const count=f.messages.length;f.platform.syncPreferences({dark:true,haptics:false});assert.equal(f.messages.length,count);
  assert.equal(f.messages.at(-1).method,'preferences');
});

test('battery events retain the latest real device value and artwork uses a native request',async()=>{
  const f=await fixture(),values=[];
  f.platform.receive({type:'battery',value:{level:.37,charging:false}});f.platform.onBattery(value=>values.push(value));
  f.platform.receive({type:'battery',value:{level:.38,charging:true}});assert.deepEqual(values,[{level:.37,charging:false},{level:.38,charging:true}]);
  const task=f.platform.artwork('https://p1.music.126.net/test.jpg');assert.equal(f.messages.at(-1).method,'artwork');
  f.respond(f.messages.at(-1),{dataUrl:'data:image/jpeg;base64,test'});assert.equal(await task,'data:image/jpeg;base64,test');
  f.platform.vibrate();assert.equal(f.messages.at(-1).method,'haptic');
});
test('oversized bridge messages fail locally and timeouts release pending requests',async()=>{
  const f=await fixture(),count=f.messages.length;await assert.rejects(f.platform.request('queue',{name:'x'.repeat(1_900_000)}),/歌单过大/);assert.equal(f.messages.length,count);
  const request=f.platform.api('daily');[...f.timers.values()].at(-1)();await assert.rejects(request,/响应超时/);
});
