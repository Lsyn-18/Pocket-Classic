import test from 'node:test';
import assert from 'node:assert/strict';
import {QuietTilt, MOTION, createMotionControl} from './motion.mjs';

const degrees = pose => Math.hypot(pose.x, pose.y) * 180 / Math.PI;
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
test('a 15 degree physical tilt gives a restrained 1.44 degree model tilt', () => {
  const pose = settle(calibrated(), 60, 5);
  assert.ok(Math.abs(degrees(pose) - 1.44) < .002);
});
test('large diagonal movement stays inside the combined 2.2 degree limit', () => {
  const pose = settle(calibrated(), 140, 80);
  assert.ok(degrees(pose) <= MOTION.maxTilt + 1e-10);
  assert.ok(degrees(pose) > 2.19);
});
test('sudden sensor spike is rate limited, then settles without persistent drift', () => {
  const tilt = calibrated();
  tilt.push(140, 80, 0, 616);
  assert.ok(degrees(tilt.step(.016, 616)) <= MOTION.speed * .016 + 1e-10);
  const pose = settle(tilt, 45, 5, 0, 3);
  assert.ok(degrees(pose) < .001);
});
test('time based filtering gives the same movement at 30 and 120 Hz', () => {
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
  assert.ok(Math.abs(portrait.x + landscape.y) < 1e-8);
  assert.ok(Math.abs(landscape.x) < 1e-8);
  const tilt = calibrated(); tilt.push(45, 5, 90, 650);
  assert.equal(tilt.base, null);
  assert.equal(degrees(tilt.step(.016, 650)), 0);
});
test('wheel interaction freezes the filtered pose until released', () => {
  const tilt = calibrated(), before = settle(tilt, 60, 5, 0, 1);
  tilt.push(20, -30, 0, 1616);
  assert.deepEqual(tilt.step(.016, 1616, true), before);
  const after = tilt.step(.016, 1632);
  assert.ok(Math.hypot(after.x - before.x, after.y - before.y) * 180 / Math.PI <= MOTION.speed * .016 + 1e-8);
});
test('invalid readings are ignored; stale data decays to neutral and resumes with calibration', () => {
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
