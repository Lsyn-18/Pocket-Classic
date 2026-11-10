import {motionTiming} from './design-tokens.mjs';

// Interpolate uniforms on existing materials; maps and shader layouts stay bound.
export function createFinishTransition(classic,{baseline=false}={}){
  const materials=new Set();classic.model.traverse(object=>{if(object.isMesh)for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);});
  const capture=()=>new Map(Array.from(materials,material=>[material,{color:material.color?.clone(),roughness:material.roughness,metalness:material.metalness}]));
  classic.setDark(false);const silver=capture();classic.setDark(true);const graphite=capture();classic.setDark(false);
  const changing=Array.from(materials).filter(material=>{const a=silver.get(material),b=graphite.get(material);return a.color&&!a.color.equals(b.color)||a.roughness!==b.roughness||a.metalness!==b.metalness;});
  let initialized=false,current=0,from=0,target=0,started=0,duration=motionTiming.finish;
  function sample(now){const u=Math.max(0,Math.min(1,(now-started)/duration));return from+(target-from)*(u*u*(3-2*u));}
  return {get mix(){return current;},get active(){return current!==target;},update(dark,now,{immediate=false}={}){
    const next=Number(!!dark);
    if(baseline){classic.setDark(!!dark);current=target=next;return current;}
    if(!initialized||immediate){initialized=true;current=from=target=next;started=now;}
    else {current=sample(now);if(next!==target){from=current;target=next;started=now;duration=Math.max(1,motionTiming.finish*Math.abs(target-from));}}
    for(const material of changing){const a=silver.get(material),b=graphite.get(material);if(a.color)material.color.lerpColors(a.color,b.color,current);for(const field of ['roughness','metalness'])if(Number.isFinite(a[field]))material[field]=a[field]+(b[field]-a[field])*current;}
    return current;
  }};
}
