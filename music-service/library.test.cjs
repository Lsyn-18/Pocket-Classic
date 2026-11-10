const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createLibrary,validQuality,ordinaryPlaylists}=require('./library.cjs');
const session={cookie:'test-session',authenticated:true};
const song=id=>({id,name:'Song '+id,ar:[],dt:5000});

test('a pinned playback snapshot survives browsing other playlists and rejects another account',async()=>{
  let current={...session,userId:7};const library=createLibrary({getSession:()=>current,call:async(name,p)=>({body:{code:200,playlist:{id:p.id,name:'List '+p.id,trackIds:Array.from({length:1100},(_,i)=>({id:i+1})),tracks:Array.from({length:1100},(_,i)=>song(i+1))}}})});
  const first=await library.tracks(1);library.pinSnapshot(first.snapshot);for(let id=2;id<18;id++)await library.tracks(id);
  const continuation=await library.queuePage(first.snapshot,1000);assert.deepEqual(continuation.tracks.map(track=>track.id),Array.from({length:100},(_,i)=>1001+i));assert.equal(continuation.more,false);
  current={...current,cookie:'different-account'};await assert.rejects(library.queuePage(first.snapshot,1000),/失效/);await assert.rejects(library.queuePage('../private',0),/无效/);
});

test('own liked playlist is independent of its name and other users liked playlists remain normal',()=>{
  const rows=[{id:1,name:'renamed',specialType:5,userId:7},{id:2,name:'喜欢的音乐',specialType:0,userId:7},{id:3,name:'other likes',specialType:5,creator:{userId:8}}];
  assert.deepEqual(ordinaryPlaylists(rows,7).map(p=>p.id),[2,3]);
});

test('liked songs follow the saved red-heart playlist instead of the unordered like set',async()=>{
  const calls=[],s={...session,userId:7};const ids=Array.from({length:102},(_,i)=>102-i);
  const library=createLibrary({getSession:()=>s,call:async(name,p)=>{
    calls.push(name);if(name==='likelist')return {body:{code:200,ids:ids.toReversed()}};
    if(name==='user_playlist_create')return {body:{code:200,data:{playlist:[{id:80,name:'Other likes',specialType:5,userId:8},{id:81,name:'喜欢的音乐',specialType:0,userId:7},{id:88,name:'Renamed heart',specialType:5,userId:7}],more:false}}};
    if(name==='playlist_detail'){assert.equal(p.id,88);return {body:{code:200,playlist:{id:88,name:'Renamed heart',trackIds:ids.map(id=>({id})),tracks:[]}}};}
    assert.equal(name,'song_detail');return {body:{code:200,songs:p.ids.split(',').map(Number).filter(id=>id!==50).reverse().map(id=>({id,name:'Song '+id,ar:[],dt:5000}))}};
  }});
  const a=await library.liked(0),b=await library.liked(a.nextOffset);assert.equal(a.tracks[0].id,102);assert.equal(a.nextOffset,100);assert.equal(a.more,true);assert.deepEqual(b.tracks.map(t=>t.id),[2,1]);assert.equal(b.more,false);assert.equal(calls.includes('likelist'),false);assert.equal(calls.filter(c=>c==='playlist_detail').length,1);
  let current=s,finish;const late=createLibrary({getSession:()=>current,call:()=>new Promise(resolve=>finish=resolve)});const pending=late.liked();current={...s,cookie:'new'};finish({body:{code:200,ids:[1]}});await assert.rejects(pending,/账号已变化/);
});

test('liked pagination holds its saved snapshot and reopening refreshes the red-heart order immediately',async()=>{
  let saved=Array.from({length:205},(_,i)=>205-i);const s={...session,userId:7},calls=[];
  const library=createLibrary({getSession:()=>s,call:async name=>{
    calls.push(name);
    if(name==='user_playlist_create')return {body:{code:200,data:{playlist:[{id:88,specialType:5,userId:7}],more:false}}};
    assert.equal(name,'playlist_detail');return {body:{code:200,playlist:{id:88,trackIds:saved.map(id=>({id})),tracks:saved.toReversed().map(song)}}};
  }});
  const first=await library.liked(0);saved=[6,2,9,1];const second=await library.liked(first.nextOffset),last=await library.liked(second.nextOffset);
  assert.deepEqual([...first.tracks,...second.tracks,...last.tracks].map(t=>t.id),Array.from({length:205},(_,i)=>205-i));assert.equal(first.nextOffset,100);assert.equal(last.more,false);assert.equal(calls.length,2);
  const refreshed=await library.liked(0);assert.deepEqual(refreshed.tracks.map(t=>t.id),saved);assert.equal(refreshed.trackCount,4);assert.equal(calls.length,4);
});

test('missing own red-heart identity or saved IDs produces an error instead of unordered fallback',async()=>{
  for(const own of [false,true]){
    const library=createLibrary({getSession:()=>({...session,userId:7}),call:async name=>{
      if(name==='user_playlist_create')return {body:{code:200,data:{playlist:[{id:88,specialType:5,userId:own?7:8}],more:false}}};
      assert.equal(name,'playlist_detail');return {body:{code:200,playlist:{id:88,tracks:[song(9)]}}};
    }});
    await assert.rejects(library.liked(0),own?/顺序/:/歌单/);
  }
});

test('an empty saved red-heart playlist ignores stale detail rows',async()=>{
  const library=createLibrary({getSession:()=>({...session,userId:7}),call:async name=>name==='user_playlist_create'?{body:{code:200,data:{playlist:[{id:88,specialType:5,userId:7}],more:false}}}:{body:{code:200,playlist:{id:88,trackIds:[],tracks:[song(9)]}}}});
  const page=await library.liked(0);assert.deepEqual(page.tracks,[]);assert.equal(page.trackCount,0);assert.equal(page.more,false);
});

test('account changes fence both red-heart details and missing-song responses',async()=>{
  for(const stage of ['playlist_detail','song_detail']){
    let current={...session,userId:7},finish,started;const ready=new Promise(resolve=>started=resolve);
    const library=createLibrary({getSession:()=>current,call:async name=>{
      if(name==='user_playlist_create')return {body:{code:200,data:{playlist:[{id:88,specialType:5,userId:7}],more:false}}};
      if(name===stage){started();return new Promise(resolve=>finish=resolve);}
      return {body:{code:200,playlist:{id:88,trackIds:[{id:3}],tracks:[]}}};
    }});
    const pending=library.liked(0);await ready;current={...current,cookie:'new-session'};finish({body:{code:200,playlist:{id:88,trackIds:[{id:3}],tracks:[song(3)]},songs:[song(3)]}});await assert.rejects(pending,/账号已变化/);
  }
});

test('failed red-heart metadata loads remain retryable in saved order',async()=>{
  let offline=true;const library=createLibrary({getSession:()=>({...session,userId:7}),call:async name=>{
    if(name==='user_playlist_create')return {body:{code:200,data:{playlist:[{id:88,specialType:5,userId:7}],more:false}}};
    if(name==='playlist_detail')return {body:{code:200,playlist:{id:88,trackIds:[{id:3},{id:2},{id:1}],tracks:[]}}};
    assert.equal(name,'song_detail');if(offline)throw Error('offline');return {body:{code:200,songs:[1,2,3].map(song)}};
  }});
  await assert.rejects(library.liked(0),/offline/);offline=false;assert.deepEqual((await library.liked(0)).tracks.map(t=>t.id),[3,2,1]);
});
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
