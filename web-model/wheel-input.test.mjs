import test from 'node:test';
import assert from 'node:assert/strict';
import {createWheelInput} from './wheel-input.mjs';

test('a deliberate quarter turn moves three options instead of ten',()=>{
  const wheel=createWheelInput();let steps=0;
  for(let i=0;i<30;i++)steps+=wheel.move(Math.PI/60,i*30);
  assert.equal(steps,3);
});
test('fast or sparse pointer events cannot jump options or leave a movement backlog',()=>{
  const wheel=createWheelInput();assert.equal(wheel.move(2,0),1);
  assert.equal(wheel.move(2,20),0);assert.equal(wheel.move(0,200),0);
  assert.equal(wheel.move(-.42,300),-1);
});
test('small hand jitter and each new gesture begin without an accidental selection',()=>{
  const wheel=createWheelInput();for(let i=0;i<10;i++)assert.equal(wheel.move(i%2?.08:-.08,i*30),0);
  assert.equal(wheel.move(.30,500),0);assert.equal(createWheelInput().move(.39,600),0);
});
