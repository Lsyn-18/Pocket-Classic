// Android keeps its exact trusted asset URL. Only browser previews use a query.
export const visualBaseline=globalThis.PocketClassicVisualProfile==='baseline'||(!globalThis.PocketNative&&typeof location!=='undefined'&&new URLSearchParams(location.search).get('visual')==='baseline');

export function screenQuality(capabilities={},device=globalThis.navigator||{}) {
  const constrained=(device.deviceMemory>0&&device.deviceMemory<4)||(device.hardwareConcurrency>0&&device.hardwareConcurrency<4)||(capabilities.maxTextureSize>0&&capabilities.maxTextureSize<2048);
  return {pixelScale:constrained?3:4,maxAnisotropy:Math.max(1,Math.min(8,capabilities.getMaxAnisotropy?.()||1))};
}

// Lower raster resolution only after a sustained slow foreground window.
// Never infer GPU quality from background/dialog throttling or startup work.
export function createRenderBudget(initialRatio){
  let ratio=initialRatio,previous=null,intervals=[];
  return {sample(now,{blocked=false}={}){
    if(blocked){previous=null;intervals=[];return null;}
    if(previous!==null)intervals.push(Math.max(0,now-previous));previous=now;
    if(intervals.length<45)return null;
    const slow=intervals.toSorted((a,b)=>a-b)[35]>50;intervals=[];
    if(!slow||ratio<=1)return null;
    ratio=ratio>1.5?1.5:1;return ratio;
  }};
}
