import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHeadphoneMotion,headphoneFrustum} from './headphone-motion.mjs';
import {createHeadphones} from './headphones.mjs';
import {dimensions as D} from './geometry.mjs';
const advance=(m,n=30,options={})=>{let p;for(let i=0;i<n;i++)p=m.step(.05,options);return p;};

test('headphone edges animate once and reverse continuously without restarting on duplicate callbacks',()=>{
  const m=createHeadphoneMotion();m.setConnected(true);let p=advance(m,8);assert.ok(p.progress>0&&p.progress<1);const midway=p.progress;
  m.setConnected(true);assert.equal(m.step(0).progress,midway);m.setConnected(false);assert.equal(m.step(0).progress,midway);
  p=advance(m);assert.equal(p.progress,0);assert.equal(p.visible,false);
  m.setConnected(true);p=advance(m);assert.equal(p.progress,1);assert.equal(p.insert,1);m.setConnected(true);assert.equal(advance(m).progress,1);
});
test('startup defers insertion and wheel gestures pause its camera framing without hiding the cable',()=>{
  const m=createHeadphoneMotion();m.setConnected(true);assert.equal(advance(m,100,{blocked:true}).progress,0);
  const moving=advance(m,8);const held=advance(m,30,{paused:true});assert.equal(held.progress,moving.progress);assert.equal(held.framing,moving.framing);assert.equal(held.visible,true);
  assert.equal(advance(m).progress,1);
});
test('reduced motion, previews and background settling preserve the real connection state',()=>{
  const m=createHeadphoneMotion();m.preview();assert.equal(advance(m,1,{reducedMotion:true}).progress,1);let p=advance(m,150);assert.equal(p.connected,false);assert.equal(p.progress,0);
  m.setConnected(true);assert.equal(advance(m,1,{reducedMotion:true}).progress,1);m.preview();m.snap();p=m.step(0);assert.equal(p.progress,1);assert.equal(p.preview,false);
});
test('accessory framing fits the model and upper cable inside the usable content area at all sizes',()=>{
  for(const [width,height,left,right,top,bottom]of [[430,932,4,4,8,76],[320,480,4,4,8,66],[932,430,6,76,6,6],[440,690,0,0,0,65]]){
    const contentHeight=height-top-bottom,cx=(left+width-right)/2,cy=(top+height-bottom)/2,u=Math.max(11.9,6.95/((width-left-right)/contentHeight))/contentHeight;
    const view={width,height,contentHeight,centerX:cx,centerY:cy,frustum:{left:-cx*u,right:(width-cx)*u,top:cy*u-.28,bottom:-(height-cy)*u-.28}};
    assert.deepEqual(headphoneFrustum(view,0),view.frustum);const b=headphoneFrustum(view,1),unit=(b.top-b.bottom)/height;
    assert.ok(b.top-top*unit>7.15);assert.ok(b.top-(height-bottom)*unit<-5.5);assert.ok(b.left+left*unit<=-D.width/2);assert.ok(b.right-right*unit>=D.width/2);
  }
});
test('plug seats on the actual socket and repeated connections reuse finite decorative geometry',()=>{
  const model=new THREE.Group(),h=createHeadphones(model,D),geometries=[];h.group.traverse(o=>{if(o.geometry)geometries.push(o.geometry);});assert.ok(geometries.length<=12);
  h.setConnected(true);for(let i=0;i<30;i++)h.update(.05);const plug=h.group.getObjectByName('Straight_TRRS_plug');assert.ok(Math.abs(plug.position.x-D.jackX)<1e-8);assert.ok(Math.abs(plug.position.y-5.210)<1e-8);assert.ok(Math.abs(plug.position.z-D.portZ)<1e-8);
  for(let i=0;i<8;i++){h.setConnected(!!(i%2));for(let j=0;j<24;j++)h.update(.05);}
  const after=[];h.group.traverse(o=>{if(o.geometry){after.push(o.geometry);assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));const hits=[];o.raycast({},hits);assert.equal(hits.length,0);}});assert.deepEqual(after,geometries);
  h.dispose();h.dispose();assert.equal(model.children.length,0);
});
