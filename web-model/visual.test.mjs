import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createClassic,dimensions} from './geometry.mjs';
import {makeScreen} from './screen.mjs';
import {screenQuality} from './visual-profile.mjs';
import {createAtmosphere,trackAccent} from './atmosphere.mjs';

function canvas(){
  const gradient={addColorStop(){}};
  const c=new Proxy({measureText:text=>({width:String(text).length*7}),createLinearGradient:()=>gradient,createRadialGradient:()=>gradient},{get:(o,k)=>k in o?o[k]:()=>{}});
  return {width:0,height:0,getContext:()=>c};
}
globalThis.document={createElement:canvas,querySelector:()=>({style:{setProperty(){}}})};

test('LCD quality changes the backing pixels without changing logical row hit targets',()=>{
  const app={state:{page:'home',selected:0,title:'iPod',battery:{level:.7}},audio:{paused:true,currentTime:0,volume:.5},entries:()=>['音乐','正在播放','随机播放歌曲','设置'].map(name=>({name})),footerText:()=>''};
  for(const [options,width]of [[{pixelScale:4,maxAnisotropy:16},1280],[{pixelScale:3},960],[{baseline:true},640]]){
    const screen=makeScreen(app,options);assert.equal(screen.canvas.width,width);assert.equal(screen.canvas.height,width*.75);
    assert.equal(screen.hit(10,24),0);assert.equal(screen.hit(10,88),2);assert.equal(screen.hit(200,32),null);assert.equal(screen.hit(10,230),null);
    assert.equal(screen.texture.generateMipmaps,!options.baseline);assert.ok(screen.texture.anisotropy<=8);screen.dispose();
  }
});

test('low-memory devices reduce only LCD backing quality',()=>{
  const capabilities={getMaxAnisotropy:()=>16,maxTextureSize:8192};
  assert.deepEqual(screenQuality(capabilities,{deviceMemory:8,hardwareConcurrency:8}),{pixelScale:4,maxAnisotropy:8});
  assert.equal(screenQuality(capabilities,{deviceMemory:2,hardwareConcurrency:8}).pixelScale,3);
  assert.equal(screenQuality({...capabilities,maxTextureSize:1024},{}).pixelScale,3);
});

test('decorations stay outside picking and total model triangles stay within twenty percent',()=>{
  const base=createClassic(new THREE.Texture(),{baseline:true}),next=createClassic(new THREE.Texture(),{baseline:false});
  const count=model=>{let n=0;model.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;};
  assert.ok(count(next.model)<=count(base.model)*1.2);
  next.model.traverse(o=>{if(o.userData.decorative){const hits=[];o.raycast({},hits);assert.equal(hits.length,0);}});
  next.model.updateMatrixWorld(true);
  for(const [x,y,zone]of [[0,dimensions.screenY,'screen'],[1,dimensions.wheelY,'wheel'],[1.79,5.213,'hold']]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y,10),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(next.model,true)[0]?.object.userData.zone,zone);
  }
  assert.equal(next.center.position.z,base.center.position.z);
  const idle=next.materials.center.roughness;next.setPressed(true);assert.ok(next.materials.center.roughness<idle);next.setPressed(false);assert.equal(next.materials.center.roughness,idle);
});

test('frosted roughness is not accidentally multiplied into a polished surface',()=>{
  const classic=createClassic(new THREE.Texture(),{baseline:false}),front=classic.materials.front;
  const pixels=front.roughnessMap.image.data,levels=[];for(let i=1;i<pixels.length;i+=4)levels.push(pixels[i]/255*front.roughness);
  assert.ok(Math.min(...levels)>=.38);assert.ok(Math.max(...levels)<=.48);assert.ok(front.metalness>=.94);assert.ok(front.clearcoat<=.05);
  classic.setDark(true);assert.ok(front.roughness>=.42&&front.roughness<=.55);assert.ok(front.metalness>=.88);
  classic.setDark(false);assert.equal(front.metalness,.96);
});

test('reduced motion freezes particles and breathing; track accent is deterministic',()=>{
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4,4,6,-6,.1,60),atmosphere=createAtmosphere({scene,camera,native:true});
  assert.equal(atmosphere.count,60);assert.equal(trackAccent(123).getHex(),trackAccent(123).getHex());
  atmosphere.update(.1,{trackId:123,playing:true});const particles=atmosphere.group.children[1],time=particles.material.uniforms.uTime.value;
  atmosphere.update(.1,{trackId:123,playing:true,reducedMotion:true});assert.equal(particles.visible,false);assert.equal(particles.material.uniforms.uTime.value,time);
  assert.equal(atmosphere.group.children[0].material.depthTest,true);atmosphere.dispose();assert.equal(scene.children.length,0);
});
