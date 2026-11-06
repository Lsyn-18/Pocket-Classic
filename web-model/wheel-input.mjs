// One deliberate detent, with no acceleration or queued movement after release.
export function createWheelInput({stepRadians=.40,minIntervalMs=110}={}) {
  let sum=0,lastStep=-Infinity;
  return {move(delta,time){
    if(!Number.isFinite(delta)||!Number.isFinite(time))return 0;
    if(delta&&sum&&Math.sign(delta)!==Math.sign(sum))sum=0;
    sum+=delta;
    if(Math.abs(sum)+1e-9<stepRadians)return 0;
    const direction=Math.sign(sum);
    // Keep only the fractional movement: a fast swipe never accumulates jumps.
    sum=direction*Math.max(0,Math.abs(sum)-Math.floor(Math.abs(sum)/stepRadians+1e-9)*stepRadians);
    if(time-lastStep<minIntervalMs)return 0;
    lastStep=time;return direction;
  }};
}
