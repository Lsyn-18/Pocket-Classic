// Android keeps its exact trusted asset URL. Only browser previews use a query.
export const visualBaseline=globalThis.PocketClassicVisualProfile==='baseline'||(!globalThis.PocketNative&&typeof location!=='undefined'&&new URLSearchParams(location.search).get('visual')==='baseline');

export function screenQuality(capabilities={},device=globalThis.navigator||{}) {
  const constrained=(device.deviceMemory>0&&device.deviceMemory<4)||(device.hardwareConcurrency>0&&device.hardwareConcurrency<4)||(capabilities.maxTextureSize>0&&capabilities.maxTextureSize<2048);
  return {pixelScale:constrained?3:4,maxAnisotropy:Math.max(1,Math.min(8,capabilities.getMaxAnisotropy?.()||1))};
}
