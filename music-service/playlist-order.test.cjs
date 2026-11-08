const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createRequire}=require('node:module');
const {createLibrary}=require('./library.cjs');
const sourcePath=path.join(__dirname,'auth-server.cjs'),load=createRequire(sourcePath);
const song=id=>({id,name:'Song '+id,ar:[{name:'Artist'}],al:{name:'Album'},dt:90000});
function fixture(call){
  const context={__dirname,URL,console:{log(){}},process:{exitCode:0},setInterval,clearInterval,require(name){
    if(name==='./bridge.cjs')return {call,prepareKey:async()=>{},errorSummary:e=>({message:e.message})};
    if(name==='node:http')return {createServer:()=>({listen(){}})};
    return load(name);
  }};
  vm.runInNewContext(fs.readFileSync(sourcePath,'utf8')+"\ncookie='fixture-session';snapshot={authenticated:true,userId:7};globalThis.api={tracks,playlists,switchSession(value){cookie=value;}};",context);
  return context.api;
}

test('playlist endpoint follows trackIds rather than the order of song detail objects',async()=>{
  const api=fixture(async name=>{assert.equal(name,'playlist_detail');return {body:{code:200,playlist:{id:88,name:'Playlist',trackCount:3,trackIds:[{id:31},{id:17},{id:9}],tracks:[song(17),song(9),song(31)]}}};});
  assert.deepEqual(Array.from((await api.tracks('88')).tracks,t=>t.id),[31,17,9]);
});

test('playlist pages keep a single saved sequence and refresh it when reopened',async()=>{
  const ids=Array.from({length:2003},(_,i)=>2003-i),calls=[];let saved=ids;
  const api=fixture(async(name,p)=>{calls.push(name);assert.equal(name,'playlist_detail');return {body:{code:200,playlist:{id:88,name:'Playlist',trackIds:saved.map(id=>({id})),tracks:ids.toReversed().map(song)}}};});
  const first=await api.tracks('88');saved=[9,31,17];const second=await api.tracks('88',first.nextOffset),last=await api.tracks('88',second.nextOffset);
  assert.deepEqual(Array.from([...first.tracks,...second.tracks,...last.tracks],t=>t.id),ids);assert.equal(calls.length,1);assert.equal(first.nextOffset,1000);assert.equal(first.more,true);assert.equal(last.more,false);assert.equal(last.nextOffset,2003);
  assert.deepEqual(Array.from((await api.tracks('88')).tracks,t=>t.id),saved);assert.equal(calls.length,2);
});

test('empty playlists stay empty, absent IDs retain upstream order and unavailable metadata keeps raw offsets',async()=>{
  for(const [trackIds,tracks,expected]of [[[],[song(9)],[]],[undefined,[song(9),song(3)],[9,3]],[[{id:3},{id:0},{id:-1},{id:2},{id:3},{id:1}],[],[3,1]]]){
    const api=fixture(async name=>name==='playlist_detail'?{body:{code:200,playlist:{id:88,trackIds,tracks}}}:{body:{code:200,songs:[song(1),song(999),song(3)]}});
    const page=await api.tracks('88');assert.deepEqual(Array.from(page.tracks,t=>t.id),expected);assert.equal(page.more,false);assert.equal(page.nextOffset,trackIds?.length===6?3:expected.length);
  }
});

test('failed metadata requests remain retryable without corrupting the saved order',async()=>{
  let offline=true;const api=fixture(async name=>{
    if(name==='playlist_detail')return {body:{code:200,playlist:{id:88,trackIds:[{id:3},{id:2},{id:1}],tracks:[]}}};
    if(offline)throw Error('offline');return {body:{code:200,songs:[song(1),song(2),song(3)]}};
  });
  await assert.rejects(api.tracks('88'),/offline/);offline=false;assert.deepEqual(Array.from((await api.tracks('88')).tracks,t=>t.id),[3,2,1]);
});

test('account changes fence both playlist details and later metadata responses',async()=>{
  for(const stage of ['playlist_detail','song_detail']){
    let finish,started;const ready=new Promise(resolve=>started=resolve),api=fixture(async name=>{
      if(name===stage){started();return new Promise(resolve=>finish=resolve);}
      return {body:{code:200,playlist:{id:88,trackIds:[{id:3}],tracks:[]}}};
    });
    const pending=api.tracks('88');await ready;api.switchSession('other-session');finish({body:{code:200,playlist:{id:88,trackIds:[{id:3}],tracks:[song(3)]},songs:[song(3)]}});await assert.rejects(pending,/账号已变化/);
  }
});

test('my playlists retain upstream order while own liked music remains separate',async()=>{
  const api=fixture(async name=>({body:{code:200,data:{playlist:name==='user_playlist_create'?[{id:8,name:'Pinned',userId:7},{id:9,name:'Likes',specialType:5,userId:7},{id:3,name:'Created',userId:7}]:[{id:1,name:'Collected',userId:8}],more:false}}}));
  assert.deepEqual(Array.from(await api.playlists(),p=>p.id),[8,3,1]);
});

test('mobile playlist groups read later pages without repeating pinned entries or dropping custom order',async()=>{
  const ids=Array.from({length:200},(_,i)=>200-i),calls=[],api=fixture(async(name,p)=>{
    calls.push([name,p.offset]);
    if(name==='user_playlist_collect')return {body:{code:200,data:{playlist:[{id:8888,userId:8}],more:false}}};
    assert.equal(name,'user_playlist_create');return {body:{code:200,data:{playlist:[{id:9999,userId:7},...ids.slice(p.offset,p.offset+100).map(id=>({id,userId:7}))],more:p.offset===0,count:200}}};
  });
  assert.deepEqual(Array.from(await api.playlists(),p=>p.id),[9999,...ids,8888]);assert.equal(calls.filter(x=>x[0]==='user_playlist_create').length,2);
});

test('empty mobile groups stay empty and malformed ordering responses are retryable errors',async()=>{
  const empty=fixture(async()=>({body:{code:200,data:{playlist:[],more:false}}}));assert.deepEqual(Array.from(await empty.playlists()),[]);
  const malformed=fixture(async()=>({body:{code:200,data:{playlist:'invalid'}}}));await assert.rejects(malformed.playlists(),/歌单顺序/);
});

test('account changes discard a pending mobile playlist group',async()=>{
  let finish,started;const ready=new Promise(resolve=>started=resolve),api=fixture(async name=>{
    if(name==='user_playlist_create'){started();return new Promise(resolve=>finish=resolve);}
    return {body:{code:200,data:{playlist:[],more:false}}};
  });
  const pending=api.playlists();await ready;api.switchSession('new-session');finish({body:{code:200,data:{playlist:[{id:8,userId:7}],more:false}}});await assert.rejects(pending,/账号已变化/);
});

test('my playlists use the mobile saved groups and retain pinned order without duplicates',async()=>{
  const api=fixture(async(name,p)=>{
    if(name==='user_playlist')return {body:{code:200,playlist:[{id:1,userId:7},{id:9,userId:7},{id:3,userId:8}]}};
    assert.equal(p.uid,7);assert.equal(p.limit,100);assert.equal(p.offset,0);assert.equal(p.crypto,'eapi');
    if(name==='user_playlist_create')return {body:{code:200,data:{playlist:[{id:8,name:'Pinned collection',userId:8,subscribed:true},{id:9,name:'Created second',userId:7},{id:7,name:'Likes',specialType:5,userId:7},{id:1,name:'Created first',userId:7}],more:false}}};
    assert.equal(name,'user_playlist_collect');return {body:{code:200,data:{playlist:[{id:8,name:'Pinned collection',userId:8},{id:3,name:'Collected',userId:8}],more:false}}};
  });
  assert.deepEqual(Array.from(await api.playlists(),p=>p.id),[8,9,1,3]);
});

test('invalid playlist IDs and offsets never reach upstream',async()=>{
  let calls=0;const library=createLibrary({getSession:()=>({authenticated:true,cookie:'fixture-session'}),call:async()=>{calls++;}});
  for(const id of [0,-1,'x',1.5])await assert.rejects(library.tracks(id));
  for(const offset of [-1,'00','100000','1&cookie=x'])await assert.rejects(library.tracks(88,offset));assert.equal(calls,0);
});

test('playlist endpoint fills omitted metadata and places detail responses back in saved order',async()=>{
  const calls=[],api=fixture(async(name,params)=>{
    calls.push({name,params});
    if(name==='playlist_detail')return {body:{code:200,playlist:{id:88,name:'Playlist',trackCount:4,trackIds:[{id:31},{id:17},{id:9},{id:6}],tracks:[song(17),song(31)]}}};
    assert.equal(name,'song_detail');assert.equal(params.ids,'9,6');return {body:{code:200,songs:[song(6),song(999),song(9)]}};
  });
  assert.deepEqual(Array.from((await api.tracks('88')).tracks,t=>t.id),[31,17,9,6]);assert.equal(calls.length,2);
});
