import test from 'node:test';
import assert from 'node:assert/strict';
import {createButtonPress} from './button-press.mjs';

function fixture(){
  let callback;const events=[];
  const press=createButtonPress({shortPress:a=>events.push('short:'+a),longPress:a=>events.push('long:'+a),stop:()=>events.push('stop'),timers:{setTimeout:fn=>(callback=fn,1),clearTimeout:()=>{callback=null;}}});
  return {press,events,hold:()=>callback?.()};
}
test('short press switches once while hold stops on release without a trailing skip',()=>{
  const f=fixture();f.press.start('next');f.press.release();assert.deepEqual(f.events,['stop','stop','short:next']);
  f.events.length=0;f.press.start('previous');f.hold();f.press.release();assert.deepEqual(f.events,['stop','long:previous','stop']);
});
test('cancelled gestures and lost capture cannot trigger a late hold or click',()=>{
  const f=fixture();f.press.start('next');f.press.cancel();f.hold();f.press.release();assert.equal(f.events.some(e=>e.startsWith('long:')||e.startsWith('short:')),false);
});
