import test from 'node:test';
import assert from 'node:assert/strict';
import {problemFrom,recoveryActions} from './problems.mjs';

test('structured failures select useful recovery without guessing from misleading text',()=>{
  const typed=problemFrom({message:'授权服务暂时无法连接',reason:'network'});
  assert.equal(typed.reason,'network');assert.equal(typed.login,false);
  assert.deepEqual(recoveryActions(typed,{native:true}).map(value=>value.id),['retry','local']);
  assert.equal(problemFrom({message:'会话过期',status:401}).reason,'auth');
  assert.deepEqual(recoveryActions(problemFrom({message:'文件不可读',reason:'local-access'}),{native:true}).map(value=>value.id),['import','back']);
  assert.deepEqual(recoveryActions(problemFrom({message:'暂无音源',reason:'unavailable'}),{advance:true}).map(value=>value.id),['next','retry']);
  assert.deepEqual(recoveryActions({reason:'storage'},{native:true}).map(value=>value.id),['manage','back']);
  assert.equal(recoveryActions({reason:'unavailable'},{advance:false})[0].id,'back');
});
