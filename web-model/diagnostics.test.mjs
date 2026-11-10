import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnostics} from './diagnostics.mjs';

test('session diagnostics require opt in, discard content, and erase on disable',()=>{
  let time=0;const diagnostics=createDiagnostics({now:()=>time});
  diagnostics.begin('play');time=1000;diagnostics.end('play');assert.equal(diagnostics.snapshot().flows[0].attempts,0);
  diagnostics.setEnabled(true);diagnostics.begin('play');time+=320;diagnostics.end('play');
  diagnostics.begin('find',{query:'private query'});time+=100;diagnostics.begin('find',{restart:false});time+=200;diagnostics.end('find');
  diagnostics.begin('private song');diagnostics.end('private song');const report=diagnostics.snapshot();
  assert.equal(report.flows[0].meanMs,320);assert.equal(report.flows[2].meanMs,300);assert.ok(!JSON.stringify(report).includes('private'));
  diagnostics.frame(0);diagnostics.frame(16);diagnostics.frame(32,{hidden:true});diagnostics.frame(10000);diagnostics.frame(10017);assert.equal(diagnostics.snapshot().frames.meanMs,17);
  diagnostics.setEnabled(false);assert.equal(diagnostics.snapshot().frames.count,0);assert.equal(diagnostics.snapshot().flows[0].attempts,0);
});

test('timings separate superseded, failed and successful attempts with bounded records',()=>{
  let time=0;const diagnostics=createDiagnostics({now:()=>time});diagnostics.setEnabled(true);
  diagnostics.begin('play');time=10;diagnostics.begin('play');time=20;diagnostics.end('play','failed');
  let result=diagnostics.snapshot().flows[0];assert.equal(result.cancelled,1);assert.equal(result.failed,1);assert.equal(result.meanMs,null);
  for(let i=0;i<150;i++){diagnostics.begin('play');time+=50;diagnostics.end('play');}result=diagnostics.snapshot().flows[0];assert.equal(result.attempts,120);assert.equal(result.meanMs,50);
});
