const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createDiscovery, normalizeTracks} = require('./discovery.cjs');
const song = (id = 1) => ({id, name: 'Test song', ar: [{name: 'Artist'}], dt: 120000, fee: 0, cookie: 'never-export', privilege: {}});

test('both recommendation routes require an authenticated session', async () => {
  let called = 0;
  const service = createDiscovery({call: async () => {called++;}, getSession: () => ({authenticated:false,cookie:''})});
  await assert.rejects(service.daily(), {status:401}); await assert.rejects(service.roam(), {status:401}); assert.equal(called,0);
});
test('normalizes both NetEase song formats and excludes private/upstream fields', () => {
  const list = normalizeTracks([song(), {...song(2),ar:undefined,artists:[{name:'Other'}],dt:undefined,duration:150000}, song(), {id:'bad',name:'x'}, null]);
  assert.equal(list.length,2); assert.equal(list[1].artist,'Other'); assert.equal(list[1].durationMs,150000);
  assert.deepEqual(Object.keys(list[0]).sort(),['id','name','artist','durationMs','fee'].sort());
});
test('daily requests coalesce and use a short session-specific cache', async () => {
  let called=0,clock=100,session={authenticated:true,cookie:'private-A'};
  const service=createDiscovery({now:()=>clock,getSession:()=>session,call:async (name,params,cookie)=>{called++;assert.equal(name,'recommend_songs');assert.equal(params.afresh,false);assert.equal(cookie,session.cookie);return {body:{code:200,data:{dailySongs:[song()]}}};}});
  const [a,b]=await Promise.all([service.daily(),service.daily()]); assert.deepEqual(a,b); assert.equal(called,1);
  assert.equal(a.name,'每日推荐'); assert.equal(a.trackCount,1); assert.equal(JSON.stringify(a).includes('private-A'),false);
  await service.daily(); assert.equal(called,1);
  clock+=61000; await service.daily(); assert.equal(called,2);
  session={authenticated:true,cookie:'private-B'}; await service.daily(); assert.equal(called,3);
});
test('logout clears cache and a late response cannot restore it', async () => {
  let finish,called=0,session={authenticated:true,cookie:'A'};
  const service=createDiscovery({getSession:()=>session,call:()=>{called++;return new Promise(resolve=>{finish=resolve;});}});
  const pending=service.daily(); service.clear(); session={authenticated:false,cookie:''};
  finish({body:{code:200,data:{dailySongs:[song()]}}}); await pending;
  await assert.rejects(service.daily(),{status:401}); session={authenticated:true,cookie:'A'};
  const another=service.daily(); assert.equal(called,2); finish({body:{code:200,data:{dailySongs:[]}}}); await another;
});
test('daily errors propagate and are not cached; older recommend format is supported', async () => {
  let count=0;
  const service=createDiscovery({getSession:()=>({authenticated:true,cookie:'A'}),call:async()=>{if(!count++)return {body:{code:460,message:'unavailable'}};return {body:{code:200,recommend:[song()]}};}});
  await assert.rejects(service.daily(),error=>error.body.code===460);
  assert.equal((await service.daily()).tracks.length,1);
});
test('roaming fetches a fresh private FM batch every time without changing preferences', async () => {
  let called=0;
  const service=createDiscovery({getSession:()=>({authenticated:true,cookie:'A'}),call:async (name,params)=>{assert.equal(name,'personal_fm');assert.deepEqual(params,{});return {body:{code:200,data:[song(++called)]}};}});
  assert.equal((await service.roam()).tracks[0].id,1); assert.equal((await service.roam()).tracks[0].id,2);
});
test('malformed upstream recommendation payloads fail explicitly', async () => {
  const service=createDiscovery({getSession:()=>({authenticated:true,cookie:'A'}),call:async()=>({body:{code:200,data:{cookie:'private'}}})});
  await assert.rejects(service.daily(),/无法识别/); await assert.rejects(service.roam(),/无法识别/);
});
