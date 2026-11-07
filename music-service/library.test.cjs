const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLibrary,validQuality}=require('./library.cjs');
const session={cookie:'test-session',authenticated:true};
test('followed artists use paged subscriptions and return only display data',async()=>{
  const calls=[];const library=createLibrary({getSession:()=>session,call:async(name,params,cookie)=>{calls.push({name,params,cookie});return {body:{code:200,hasMore:true,data:[{id:7,name:'Singer',musicSize:80,private:'hidden'},{id:7,name:'duplicate'},{id:0}]}}}});
  const r=await library.artists(50);assert.deepEqual(r,{artists:[{id:7,name:'Singer',songCount:80}],more:true,nextOffset:53});assert.deepEqual(calls[0],{name:'artist_sublist',params:{limit:50,offset:50},cookie:session.cookie});
});
test('artist song pages retain album metadata and raw offsets despite duplicates',async()=>{
  const library=createLibrary({getSession:()=>session,call:async(name,p)=>{assert.equal(name,'artist_songs');assert.deepEqual(p,{id:7,offset:100,limit:100,order:'hot'});return {body:{code:200,more:false,songs:[{id:9,name:'Song',ar:[{name:'Singer'}],al:{name:'Album',picUrl:'https://p1.music.126.net/a.jpg'},dt:90000},{id:9,name:'Duplicate'}]}}}});
  const r=await library.artistTracks(7,100);assert.equal(r.nextOffset,102);assert.equal(r.more,false);assert.equal(r.tracks.length,1);assert.equal(r.tracks[0].album,'Album');
});
test('invalid routes and anonymous sessions never reach upstream',async()=>{
  let calls=0;const library=createLibrary({getSession:()=>session,call:async()=>{calls++;}});
  for(const offset of [-1,'00','1&cookie=x',100000,1.5])await assert.rejects(library.artists(offset));
  await assert.rejects(library.artistTracks(0));await assert.rejects(library.resolve(1,'unlimited'));
  const anonymous=createLibrary({getSession:()=>({authenticated:false}),call:async()=>{calls++;}});await assert.rejects(anonymous.artists(),/请先连接/);assert.equal(calls,0);
});
test('old account responses are discarded and empty pages terminate pagination',async()=>{
  let current=session,finish;const library=createLibrary({getSession:()=>current,call:()=>new Promise(r=>{finish=r;})});const pending=library.artists();current={cookie:'new',authenticated:true};finish({body:{code:200,data:[]}});await assert.rejects(pending,/账号已变化/);
  const empty=createLibrary({getSession:()=>session,call:async()=>({body:{code:200,data:[],hasMore:true}})});assert.equal((await empty.artists()).more,false);
});
test('selected quality is sent upstream while actual downgraded quality remains honest',async()=>{
  const library=createLibrary({getSession:()=>session,call:async(name,p)=>{assert.equal(name,'song_url_v1');assert.deepEqual(p,{id:9,level:'hires',unblock:'false'});return {body:{code:200,data:[{url:'https://test.music.126.net/song.mp3',level:'standard',br:128000}]}}}});
  const r=await library.resolve(9,'hires');assert.equal(r.level,'standard');assert.equal(r.bitrate,128000);
  for(const q of ['standard','exhigh','lossless','hires'])assert.equal(validQuality(q),true);assert.equal(validQuality('unknown'),false);
});
