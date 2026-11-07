import test from 'node:test';
import assert from 'node:assert/strict';
import {QuietTilt, MOTION, createMotionControl} from './motion.mjs';

const degrees = pose => Math.hypot(pose.x, pose.y) * 180 / Math.PI;
const product=(a,b)=>[a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]];
const axis=(x,y,z,degrees)=>{const a=degrees*Math.PI/360;return [x*Math.sin(a),y*Math.sin(a),z*Math.sin(a),Math.cos(a)]};
function quaternionCalibration(q){const tilt=new QuietTilt();for(let t=0;t<=600;t+=50)tilt.push(89,0,0,t,q);return tilt;}

test('native orientation near upright uses continuous rotation even when equivalent Euler angles flip',()=>{
  const base=axis(1,0,0,89),tilt=quaternionCalibration(base);
  const q=product(base,axis(0,1,0,15));tilt.push(89,15,0,616,q);const before=tilt.step(.016,616);
  tilt.push(91,-165,0,632,q);const after=tilt.step(.016,632);
  assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<1e-10,'Equivalent Euler representations must not move the model');
  assert.ok(Math.abs(after.y*180/Math.PI-8.64)<.002);
});
test('native quaternion sign changes and upright crossing have no one-frame flash',()=>{
  const base=axis(1,0,0,89),tilt=quaternionCalibration(base);let last={x:0,y:0};
  for(let i=1;i<=80;i++){const q=product(base,axis(1,0,0,i*.1));const signed=i%2?q:q.map(v=>-v);tilt.push(i%2?89:91,i%2?0:180,0,600+i*10,signed);const pose=tilt.step(.01,600+i*10);assert.ok(Math.hypot(pose.x-last.x,pose.y-last.y)*180/Math.PI<.1);last=pose;}
});
function calibrated(beta = 45, gamma = 5, angle = 0) {
  const tilt = new QuietTilt();
  for (let t = 0; t <= 600; t += 50) tilt.push(beta, gamma, angle, t);
  assert.ok(tilt.base);
  return tilt;
}
function settle(tilt, beta, gamma, angle = 0, seconds = 5, fps = 60) {
  let pose;
  for (let i = 1; i <= seconds * fps; i++) {
    const now = 600 + i * 1000 / fps;
    tilt.push(beta, gamma, angle, now); pose = tilt.step(1 / fps, now);
  }
  return pose;
}

test('natural holding position becomes neutral and a moving calibration restarts', () => {
  const tilt = new QuietTilt();
  for (let t = 0; t < 500; t += 50) tilt.push(t / 10, 0, 0, t);
  assert.equal(tilt.base, null);
  for (let t = 500; t <= 1100; t += 50) tilt.push(67, -12, 0, t);
  assert.ok(tilt.base);
  assert.equal(degrees(tilt.step(.016, 1100)), 0);
});
test('hand tremor inside three degrees produces no tilt', () => {
  const tilt = calibrated();
  for (let i = 1; i < 300; i++) {
    tilt.push(45 + Math.sin(i) * 1.9, 5 + Math.cos(i) * 1.9, 0, 600 + i * 16);
    assert.equal(degrees(tilt.step(.016, 600 + i * 16)), 0);
  }
});
test('a 15 degree physical tilt gives a clearly visible 5.76 degree model tilt', () => {
  const pose = settle(calibrated(), 60, 5);
  assert.ok(Math.abs(degrees(pose) - 5.76) < .002);
});
test('horizontal movement reaches 8.64 degrees at a natural 15 degree phone tilt and caps at 12', () => {
  const pose = settle(calibrated(), 45, 20);
  assert.ok(Math.abs(pose.y * 180 / Math.PI - 8.64) < .002);
  assert.ok(Math.abs(pose.x) < 1e-10);
  for (const gamma of [-80, 80]) {
    const extreme = settle(calibrated(), 45, gamma);
    assert.ok(Math.abs(Math.abs(extreme.y) * 180 / Math.PI - 12) < .002);
  }
});
test('the first frame presents the latest sensor pose without a catch-up tail', () => {
  const tilt=calibrated();tilt.push(60,5,0,616);
  assert.ok(Math.abs(degrees(tilt.step(.016,616))-5.76)<.002);
  tilt.push(45,20,0,632);const pose=tilt.step(.016,632);
  assert.ok(Math.abs(pose.x)<1e-10);assert.ok(Math.abs(pose.y*180/Math.PI-8.64)<.002);
  assert.ok(Math.abs(degrees(settle(calibrated(),140,5))-8)<.002);
});
test('large diagonal movement stays inside the horizontal-expanded tilt envelope', () => {
  const pose = settle(calibrated(), 140, 80);
  assert.ok(Math.hypot(pose.x,pose.y/MOTION.horizontalScale)*180/Math.PI <= MOTION.maxTilt + 1e-10);
  assert.ok(degrees(pose) <= MOTION.maxTilt*MOTION.horizontalScale + 1e-10);
  assert.ok(degrees(pose) > MOTION.maxTilt);
});
test('large abrupt readings stay bounded and returning to neutral has no delayed drift', () => {
  const tilt = calibrated();
  tilt.push(140, 80, 0, 616);
  const poseAtSpike=tilt.step(.016,616);
  assert.ok(Math.hypot(poseAtSpike.x,poseAtSpike.y/MOTION.horizontalScale)*180/Math.PI<=MOTION.maxTilt+1e-10);
  const pose = settle(tilt, 45, 5, 0, 3);
  assert.ok(degrees(pose) < .001);
});
test('direct following gives the same movement at 30 and 120 Hz', () => {
  const a = settle(calibrated(), 65, 5, 0, 1, 30);
  const b = settle(calibrated(), 65, 5, 0, 1, 120);
  assert.ok(Math.abs(degrees(a) - degrees(b)) < .015);
});
test('beta wrap through 180 degrees does not cause a full turn', () => {
  const tilt = calibrated(179, 0);
  assert.equal(degrees(settle(tilt, -179, 0)), 0);
});
test('landscape rotates the axes and turning the screen resets the reference', () => {
  const portrait = settle(calibrated(45, 0, 0), 60, 0, 0);
  const landscape = settle(calibrated(45, 0, 90), 60, 0, 90);
  // Compare screen-relative axes after applying the horizontal scale.
  assert.ok(Math.abs(portrait.x + landscape.y/MOTION.horizontalScale)*180/Math.PI < .002);
  assert.ok(Math.abs(landscape.x) < 1e-8);
  for (const angle of [-90,90]) {
    const horizontal=settle(calibrated(45,0,angle),60,0,angle);
    const vertical=settle(calibrated(45,0,angle),45,15,angle);
    assert.ok(Math.abs(Math.abs(horizontal.y)*180/Math.PI-8.64)<.002);
    assert.ok(Math.abs(Math.abs(vertical.x)*180/Math.PI-5.76)<.002);
  }
  const tilt = calibrated(); tilt.push(45, 5, 90, 650);
  assert.equal(tilt.base, null);
  assert.equal(degrees(tilt.step(.016, 650)), 0);
});
test('wheel interaction freezes the pose and release uses the newest sensor reading', () => {
  const tilt = calibrated(), before = settle(tilt, 60, 5, 0, 1);
  tilt.push(20, -30, 0, 1616);
  assert.deepEqual(tilt.step(.016, 1616, true), before);
  const after = tilt.step(.016, 1632);
  assert.deepEqual(after,tilt.desired);
});
test('invalid readings are ignored; stale data returns to neutral and resumes with calibration', () => {
  const tilt = calibrated(); const before = settle(tilt, 65, 5, 0, 1);
  assert.equal(tilt.push(null, null, 0, 1620), false);
  assert.equal(tilt.push(NaN, 0, 0, 1620), false);
  let after;
  for (let t = 3200; t < 6200; t += 16) after = tilt.step(.016, t);
  assert.ok(degrees(after) < degrees(before) * .01);
  tilt.push(50, 0, 0, 6300);
  assert.equal(tilt.base, null);
});

function environment({secure = true, supported = true, permission} = {}) {
  const win = new EventTarget(), doc = new EventTarget(), timers = new Map(); let clock = 0, timerId = 0;
  Object.assign(win, {isSecureContext: secure, performance: {now: () => clock}, screen: {orientation: new EventTarget()},
    setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); }});
  win.screen.orientation.angle = 0; doc.hidden = false;
  if (supported) win.DeviceOrientationEvent = permission ? {requestPermission: permission} : {};
  const snapshots = [], control = createMotionControl({win, doc, onChange: s => snapshots.push(s)});
  return {win, doc, timers, control, snapshots, emit(beta = 45, gamma = 0, time = clock + 50, alpha = 0) {
    clock = time; const event = new Event('deviceorientation'); Object.assign(event, {beta, gamma, alpha}); win.dispatchEvent(event);
  }, calibrate() { for (let i = 0; i <= 12; i++) this.emit(); }};
}
test('sensor access is opt in and a desktop with no readings exits cleanly', async () => {
  const e = environment(); e.emit(); assert.equal(e.control.state.phase, 'off');
  assert.equal(e.timers.size, 0);
  await e.control.start(); assert.equal(e.control.state.phase, 'calibrating');
  [...e.timers.values()][0]();
  assert.equal(e.control.state.phase, 'unavailable'); assert.equal(e.control.state.enabled, false);
});
test('insecure HTTP and unsupported browsers fail without requesting permission', async () => {
  let calls = 0;
  const e = environment({secure: false, permission: () => { calls++; return 'granted'; }});
  await e.control.start(); assert.equal(e.control.state.phase, 'insecure'); assert.equal(calls, 0);
  const other = environment({supported: false}); await other.control.start();
  assert.equal(other.control.state.phase, 'unsupported');
});
test('permission denial and rejection are handled without enabling the sensor', async () => {
  for (const permission of [async () => 'denied', async () => { throw new Error('blocked'); }]) {
    const e = environment({permission}); await e.control.start(); e.calibrate();
    assert.equal(e.control.state.phase, 'denied'); assert.equal(e.control.state.enabled, false);
  }
});
test('cancelled permission request cannot enable sensors after its result arrives', async () => {
  let resolve;
  const e = environment({permission: () => new Promise(done => { resolve = done; })});
  const pending = e.control.start(); assert.equal(e.control.state.pending, true);
  e.control.stop(); resolve('granted'); await pending;
  assert.equal(e.control.state.phase, 'off'); assert.equal(e.timers.size, 0);
});
test('grant, heading changes, recalibration, visibility, and disable respect lifecycle', async () => {
  const e = environment({permission: async () => 'granted'}); await e.control.start(); e.calibrate();
  assert.equal(e.control.state.phase, 'active'); assert.equal(e.timers.size, 0);
  e.emit(45, 0, 800, 270); assert.equal(degrees(e.control.tick(.016, 800)), 0);
  e.control.recalibrate(); assert.equal(e.control.state.phase, 'calibrating'); e.calibrate();
  e.doc.hidden = true; e.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(e.control.state.phase, 'paused'); assert.equal(e.timers.size, 0);
  e.emit(90, 40); assert.equal(e.control.state.phase, 'paused');
  e.doc.hidden = false; e.doc.dispatchEvent(new Event('visibilitychange')); e.calibrate();
  assert.equal(e.control.state.phase, 'active');
  e.win.screen.orientation.angle = 90; e.win.screen.orientation.dispatchEvent(new Event('change'));
  assert.equal(e.control.state.phase, 'calibrating');
  e.control.destroy(); e.emit();
  assert.equal(e.control.state.phase, 'off'); assert.equal(e.control.state.enabled, false); assert.equal(e.timers.size, 0);
});
test('a stopped sensor stream eventually disables and recenters', async () => {
  const e = environment(); await e.control.start(); e.calibrate();
  e.control.tick(.016, 8000);
  assert.equal(e.control.state.phase, 'unavailable'); assert.equal(degrees(e.control.tick(.016, 8000)), 0);
});
test('native sensor source works without browser sensor APIs and recalibrates after backgrounding', async () => {
  const e=environment({secure:false,supported:false});let receive,visibility,unsubscribed=0;
  const control=createMotionControl({win:e.win,doc:e.doc,source:{
    requestPermission:async()=> 'granted',
    subscribe(fn){receive=fn;return()=>{receive=null;unsubscribed++;};},
    onVisibility(fn){visibility=fn;return()=>{visibility=null;};}
  }});
  await control.start();assert.equal(control.state.phase,'calibrating');
  for(let time=0;time<=600;time+=50){e.emit(0,0,time);receive({beta:45,gamma:5,angle:0});}
  assert.equal(control.state.phase,'active');visibility(false);assert.equal(control.state.phase,'paused');assert.equal(receive,null);
  visibility(true);assert.equal(control.state.phase,'calibrating');assert.ok(receive);control.destroy();assert.equal(visibility,null);assert.ok(unsubscribed>=2);
});

test('the native event path forwards quaternions and stays continuous across Euler flips',async()=>{
  const e=environment({secure:false,supported:false});let receive;
  const control=createMotionControl({win:e.win,doc:e.doc,source:{requestPermission:async()=>'granted',subscribe(fn){receive=fn;return()=>{receive=null}}}});
  const base=axis(1,0,0,89);await control.start();
  for(let t=0;t<=600;t+=50){e.emit(0,0,t);receive({beta:89,gamma:0,angle:0,quaternion:base})}
  assert.equal(control.state.phase,'active');
  const q=product(base,axis(0,1,0,15));receive({beta:89,gamma:15,angle:0,quaternion:q});const before=control.tick(.016,616);
  receive({beta:91,gamma:-165,angle:0,quaternion:q.map(v=>-v)});assert.deepEqual(control.tick(.016,632),before);control.destroy();
});
