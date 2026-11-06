import test from 'node:test';
import assert from 'node:assert/strict';
import {coverUrl,createArtworkStore} from './artwork.mjs';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const song=id=>({id,cover:`http://p1.music.126.net/test/${id}.jpg`});
test('cover sources are upgraded and constrained to the image CDN',()=>{
  assert.equal(coverUrl(song(1).cover),'https://p1.music.126.net/test/1.jpg?param=320y320');
  for(const url of ['javascript:alert(1)','http://127.0.0.1/a','https://p1.music.126.net.evil.example/a','https://name:secret@p1.music.126.net/a'])assert.equal(coverUrl(url),'');
});
test('late cover A cannot replace cover B; paused pages repaint when B loads',async()=>{
  const pending=new Map(),images=[],store=createArtworkStore({resolve:url=>new Promise(r=>pending.set(url,r)),imageFactory:()=>{const image={};images.push(image);return image;}});
  assert.equal(store.get(song(1)),null);assert.equal(store.get(song(2)),null);await flush();
  pending.get(coverUrl(song(2).cover))('data:image/jpeg;base64,B');await flush();images[0].onload();
  assert.equal(store.get(song(2)),images[0]);assert.equal(store.revision,1);
  pending.get(coverUrl(song(1).cover))('data:image/jpeg;base64,A');await flush();images[1].onload();
  assert.equal(store.get(song(2)),images[0]);assert.equal(store.get(song(1)),images[1]);assert.equal(store.revision,2);
});
test('failed cover requests remain a placeholder and do not retry every frame',async()=>{
  let calls=0;const store=createArtworkStore({resolve:()=>{calls++;throw Error('offline');}});
  store.get(song(1));await flush();for(let i=0;i<50;i++)assert.equal(store.get(song(1)),null);assert.equal(calls,1);
});
