const RAD = Math.PI / 180;
const wrap = angle => ((angle + 180) % 360 + 360) % 360 - 180;

// All sensor angles are degrees; the renderer receives radians. Alpha is
// deliberately unused: compass heading must not rotate the front view.
export const MOTION = Object.freeze({deadZone: 3, gain: .12, maxTilt: 2.2, smoothing: .55, speed: 1.8, calibrationMs: 450, staleMs: 1500});

export class QuietTilt {
  constructor() { this.reset(); }
  reset() {
    this.base = null; this.anchor = null; this.samples = 0; this.sumBeta = 0; this.sumGamma = 0;
    this.lastSample = null; this.angle = null; this.desired = {x: 0, y: 0}; this.output = {x: 0, y: 0};
  }
  push(beta, gamma, angle, now) {
    if (![beta, gamma, angle, now].every(Number.isFinite)) return false;
    angle = wrap(angle);
    if (this.angle !== null && (angle !== this.angle || now - this.lastSample > MOTION.staleMs)) this.reset();
    this.angle = angle; this.lastSample = now;
    if (!this.base) {
      // Restart a moving calibration window rather than accept a tilted pose.
      if (!this.anchor || Math.hypot(wrap(beta - this.anchor.beta), wrap(gamma - this.anchor.gamma)) > 2.5) {
        this.anchor = {beta, gamma, at: now}; this.samples = 0; this.sumBeta = 0; this.sumGamma = 0;
      }
      this.sumBeta += wrap(beta - this.anchor.beta); this.sumGamma += wrap(gamma - this.anchor.gamma); this.samples++;
      if (now - this.anchor.at >= MOTION.calibrationMs && this.samples >= 8) {
        this.base = {beta: wrap(this.anchor.beta + this.sumBeta / this.samples), gamma: wrap(this.anchor.gamma + this.sumGamma / this.samples)};
      }
      return true;
    }
    const betaDelta = wrap(beta - this.base.beta), gammaDelta = wrap(gamma - this.base.gamma), a = angle * RAD;
    // Rotate device axes into screen axes for portrait and both landscapes.
    const x = betaDelta * Math.cos(a) + gammaDelta * Math.sin(a);
    const y = gammaDelta * Math.cos(a) - betaDelta * Math.sin(a);
    const magnitude = Math.hypot(x, y);
    const amount = Math.min(MOTION.maxTilt, Math.max(0, magnitude - MOTION.deadZone) * MOTION.gain) * RAD;
    this.desired = magnitude ? {x: x / magnitude * amount, y: y / magnitude * amount} : {x: 0, y: 0};
    return true;
  }
  step(dt, now, frozen = false) {
    if (frozen) return {...this.output};
    const target = this.base && now - this.lastSample <= MOTION.staleMs ? this.desired : {x: 0, y: 0};
    dt = Math.max(0, Math.min(.05, dt));
    const ease = 1 - Math.exp(-dt / MOTION.smoothing);
    let dx = (target.x - this.output.x) * ease, dy = (target.y - this.output.y) * ease;
    const distance = Math.hypot(dx, dy), limit = MOTION.speed * RAD * dt;
    if (distance > limit) { dx *= limit / distance; dy *= limit / distance; }
    this.output.x += dx; this.output.y += dy;
    return {...this.output};
  }
}

export function createMotionControl({win = window, doc = document, source = null, onChange = () => {}} = {}) {
  const tilt = new QuietTilt();
  let enabled = false, pending = false, phase = 'off', generation = 0, watchdog, listening = false, unsubscribe, suspended=false;
  const messages = {
    off: '沿转轮画圈浏览 · 可开启低灵敏体感', permission: '请允许读取手机姿态',
    calibrating: '保持自然拿握，稍停片刻完成校准', active: '轻轻倾斜手机 · 低灵敏，最大偏转 2.2°',
    paused: '体感已暂停，返回后自动校准', insecure: '手机体感需要 HTTPS 安全页面',
    unsupported: source?'当前手机没有可用的姿态传感器':'当前浏览器不支持体感，仍可操作转轮', denied: '体感未获授权，可在浏览器设置中允许后重试',
    unavailable: source?'未收到手机姿态，请重新开启体感':'未收到手机姿态，请用支持体感的手机浏览器重试'
  };
  const view = () => ({enabled, pending, phase, message: messages[phase]});
  const setPhase = next => { if (phase !== next) { phase = next; onChange(view()); } };
  const angle = () => Number.isFinite(win.screen?.orientation?.angle) ? win.screen.orientation.angle : Number.isFinite(win.orientation) ? win.orientation : 0;
  const receive = event => {
    if (!enabled || doc.hidden || suspended) return;
    if (!tilt.push(event.beta, event.gamma, Number.isFinite(event.angle)?event.angle:angle(), win.performance.now())) return;
    win.clearTimeout(watchdog);
    setPhase(tilt.base ? 'active' : 'calibrating');
  };
  const detach = () => {
    win.removeEventListener('deviceorientation', receive); unsubscribe?.();unsubscribe=null;listening = false; win.clearTimeout(watchdog);
  };
  const stop = (reason = 'off') => {
    generation++; enabled = false; pending = false; detach(); tilt.reset(); phase = reason; onChange(view());
  };
  const attach = () => {
    detach(); tilt.reset();
    if (doc.hidden || suspended) { setPhase('paused'); return; }
    if(source)unsubscribe=source.subscribe(receive);else win.addEventListener('deviceorientation', receive, {passive: true}); listening = true;
    setPhase('calibrating'); watchdog = win.setTimeout(() => stop('unavailable'), 6000);
  };
  const start = async () => {
    if (enabled || pending) return;
    if (!source&&!win.isSecureContext) { stop('insecure'); return; }
    if (!source&&!win.DeviceOrientationEvent) { stop('unsupported'); return; }
    const attempt = ++generation;
    pending = true; phase = 'permission'; onChange(view());
    try {
      // Called directly from the enable button, preserving user activation.
      const permission = source ? await source.requestPermission() : typeof win.DeviceOrientationEvent.requestPermission === 'function'
        ? await win.DeviceOrientationEvent.requestPermission() : 'granted';
      if (attempt !== generation) return;
      if (permission !== 'granted') { stop(permission==='unsupported'?'unsupported':'denied'); return; }
      pending = false; enabled = true; attach();
    } catch { if (attempt === generation) stop('denied'); }
  };
  const recalibrate = () => { if (enabled) attach(); };
  const visibility = () => { if (enabled) { if (doc.hidden || suspended) { detach(); tilt.reset(); setPhase('paused'); } else attach(); } };
  const stopVisibility=source?.onVisibility?.(visible=>{suspended=!visible;visibility();});
  const orientation = () => { if (enabled) attach(); };
  doc.addEventListener('visibilitychange', visibility);
  win.screen?.orientation?.addEventListener('change', orientation);
  win.addEventListener('orientationchange', orientation);
  return {
    start, stop, recalibrate, get state() { return view(); },
    tick(dt, now, frozen = false) {
      if (enabled && listening && tilt.lastSample !== null && now - tilt.lastSample > 6000) stop('unavailable');
      return tilt.step(dt, now, frozen);
    },
    destroy() {
      stop(); stopVisibility?.();doc.removeEventListener('visibilitychange', visibility);
      win.screen?.orientation?.removeEventListener('change', orientation);
      win.removeEventListener('orientationchange', orientation);
    }
  };
}
