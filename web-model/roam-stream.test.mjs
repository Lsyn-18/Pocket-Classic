import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoamStream} from './roam-stream.mjs';
const tracks = (...ids) => ({tracks:ids.map(id=>({id,name:'Track '+id}))});
test('deduplicates within and between roaming batches',async()=>{
  const batches=[tracks(1,1,2),tracks(2,3)];const stream=createRoamStream(async()=>batches.shift());
  assert.deepEqual((await stream.nextBatch()).map(t=>t.id),[1,2]);assert.deepEqual((await stream.nextBatch()).map(t=>t.id),[3]);
});
test('concurrent refill calls share one in-flight request',async()=>{
  let finish,count=0;const stream=createRoamStream(()=>{count++;return new Promise(r=>{finish=r;});});
  const a=stream.nextBatch(),b=stream.nextBatch();assert.equal(a,b);assert.equal(count,1);finish(tracks(1));await a;
});
test('source/account changes discard old responses without polluting the new stream',async()=>{
  let finish,count=0;const stream=createRoamStream(async()=>{if(!count++)return new Promise(r=>{finish=r;});return tracks(1);});
  const old=stream.nextBatch();stream.reset();finish(tracks(1));assert.deepEqual(await old,[]);assert.equal((await stream.nextBatch()).length,1);
});
test('duplicate-only responses have bounded retries',async()=>{
  let calls=0;const stream=createRoamStream(async()=>{calls++;return tracks(1);});await stream.nextBatch();assert.deepEqual(await stream.nextBatch(),[]);assert.equal(calls,4);
});
test('an empty batch does not cause repeated automatic calls',async()=>{
  let count=0;const stream=createRoamStream(async()=>{count++;return tracks();});assert.deepEqual(await stream.nextBatch(),[]);assert.equal(count,1);
});
test('network failures can be retried and malformed payloads are surfaced',async()=>{
  let calls=0;const stream=createRoamStream(async()=>{if(!calls++)throw Error('offline');return tracks(2);});await assert.rejects(stream.nextBatch(),/offline/);assert.equal((await stream.nextBatch())[0].id,2);
  await assert.rejects(createRoamStream(async()=>({})).nextBatch(),/无法识别/);
});
