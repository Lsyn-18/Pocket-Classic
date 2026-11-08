import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createHeadphoneMotion,headphoneFrustum,MAX_CABLE_SWAY} from './headphone-motion.mjs';
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

test('cable sway stays bounded under extreme tilt, freezes during input and settles without idle oscillation',()=>{
  const m=createHeadphoneMotion();m.setConnected(true);m.snap();let p;
  for(let i=0;i<900;i++){
    p=m.step([0,.008,.05,.016][i%4],{tiltX:Math.sin(i)*10,tiltY:Math.cos(i)*30});
    assert.ok(Math.hypot(p.sway,p.swayDepth)<=MAX_CABLE_SWAY+1e-9);
  }
  const held=m.step(.05,{paused:true,tiltX:30,tiltY:-30});assert.equal(held.sway,p.sway);assert.equal(held.swayDepth,p.swayDepth);
  p=advance(m,100);assert.ok(Math.hypot(p.sway,p.swayDepth)<1e-6);
  m.step(.05,{tiltX:5,tiltY:5});p=m.step(.05,{reducedMotion:true});assert.equal(p.sway,0);assert.equal(p.swayDepth,0);
});

test('mirrored upright earpieces remain fixed while cable endpoints follow their actual connectors',()=>{
  const model=new THREE.Group(),h=createHeadphones(model,D),l=h.group.getObjectByName('EarPod_L'),r=h.group.getObjectByName('EarPod_R');model.updateMatrixWorld(true);
  const lPose=l.matrixWorld.clone(),rPose=r.matrixWorld.clone(),lb=new THREE.Box3().setFromObject(l),rb=new THREE.Box3().setFromObject(r);
  assert.ok(Math.abs(lb.min.x+rb.max.x)<1e-8);assert.ok(Math.abs(lb.max.x+rb.min.x)<1e-8);assert.equal(lb.min.y,rb.min.y);assert.equal(lb.max.y,rb.max.y);assert.equal(lb.min.z,rb.min.z);assert.equal(lb.max.z,rb.max.z);
  assert.ok(rb.min.x-lb.max.x>.1&&rb.min.x-lb.max.x<.35,'The earpieces should sit close together without touching');
  assert.ok(l.localToWorld(new THREE.Vector3(.539,.04,.025)).x<l.position.x);assert.ok(r.localToWorld(new THREE.Vector3(.539,.04,.025)).x>r.position.x);
  const ringCenter=(mesh,end)=>{const a=mesh.geometry.attributes.position,count=a.count/9,center=new THREE.Vector3(),ring=typeof end==='number'?end:end?count-1:0;for(let j=0;j<8;j++)center.add(new THREE.Vector3().fromBufferAttribute(a,ring*9+j));return center.multiplyScalar(1/8);};
  h.setConnected(true);
  for(let i=0;i<100;i++){
    h.update(.016,{tiltX:Math.sin(i)*4,tiltY:Math.cos(i)*4});model.updateMatrixWorld(true);
    assert.deepEqual(l.matrixWorld,lPose);assert.deepEqual(r.matrixWorld,rPose);
    for(const [bud,name]of [[l,'Headphone_left_cable'],[r,'Headphone_right_cable']]){
      const connector=bud.getObjectByName('Cable_anchor').getWorldPosition(new THREE.Vector3()),wireEnd=ringCenter(h.group.getObjectByName(name),true);
      assert.ok(connector.distanceTo(wireEnd)<1e-6,'Cable must stay attached to its fixed stem');
      const cable=h.group.getObjectByName(name),rows=cable.geometry.attributes.position.count/9;
      for(let ring=rows-9;ring<rows;ring++){const center=ringCenter(cable,ring);assert.ok(Math.abs(center.x-connector.x)<1e-6);assert.ok(Math.abs(center.z-connector.z)<1e-6);assert.ok(center.y<=connector.y+1e-6);}
      assert.ok(connector.y-ringCenter(cable,rows-9).y>.2199,'Leave a visible vertical drop before the rear bend');
      const {position,normal}=cable.geometry.attributes,index=cable.geometry.index,face=[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(position,index.getX(index.count-3+offset)));
      const outward=new THREE.Vector3().fromBufferAttribute(normal,index.getX(index.count-3));assert.ok(face[1].sub(face[0]).cross(face[2].sub(face[0])).dot(outward)>0,'Tube faces must follow their outward shading normals');
    }
    const plug=h.group.getObjectByName('Straight_TRRS_plug'),start=ringCenter(h.group.getObjectByName('Headphone_main_cable'),false);
    assert.ok(start.distanceTo(plug.localToWorld(new THREE.Vector3(0,1.20,0)))<1e-6);
  }
  h.dispose();
});
test('accessory framing fits the model and upper cable inside the usable content area at all sizes',()=>{
  for(const [width,height,left,right,top,bottom]of [[430,932,4,4,8,76],[320,480,4,4,8,66],[932,430,6,76,6,6],[440,690,0,0,0,65]]){
    const contentHeight=height-top-bottom,cx=(left+width-right)/2,cy=(top+height-bottom)/2,u=Math.max(11.9,6.95/((width-left-right)/contentHeight))/contentHeight;
    const view={width,height,contentHeight,centerX:cx,centerY:cy,frustum:{left:-cx*u,right:(width-cx)*u,top:cy*u-.28,bottom:-(height-cy)*u-.28}};
    assert.deepEqual(headphoneFrustum(view,0),view.frustum);const b=headphoneFrustum(view,1),unit=(b.top-b.bottom)/height;
    assert.ok(b.top-top*unit>7.35);assert.ok(b.top-(height-bottom)*unit<-5.5);assert.ok(b.left+left*unit<=-D.width/2);assert.ok(b.right-right*unit>=D.width/2);
  }
});
test('plug seats on the actual socket and repeated connections reuse finite decorative geometry',()=>{
  const model=new THREE.Group(),h=createHeadphones(model,D),geometries=[];h.group.traverse(o=>{if(o.geometry)geometries.push(o.geometry);});assert.ok(geometries.length<=16);
  h.setConnected(true);for(let i=0;i<30;i++)h.update(.05);const plug=h.group.getObjectByName('Straight_TRRS_plug');assert.ok(Math.abs(plug.position.x-D.jackX)<1e-8);assert.ok(Math.abs(plug.position.y-5.210)<1e-8);assert.ok(Math.abs(plug.position.z-D.portZ)<1e-8);
  for(const name of ['Headphone_main_cable','Headphone_left_cable','Headphone_right_cable']){
    const a=h.group.getObjectByName(name).geometry.attributes.position;let rear=0;
    for(let i=0;i<a.count;i++)if(a.getY(i)<5){assert.ok(a.getZ(i)<-D.depth/2-.05,'The cable junction must stay behind the case');rear++;}
    assert.ok(rear>8);
  }
  assert.ok(h.group.getObjectByName('Inline_remote').position.z<-D.depth/2-.08);
  for(let i=0;i<8;i++){h.setConnected(!!(i%2));for(let j=0;j<24;j++)h.update(.05);}
  const after=[];h.group.traverse(o=>{if(o.geometry){after.push(o.geometry);assert.ok(Array.from(o.geometry.attributes.position.array).every(Number.isFinite));const hits=[];o.raycast({},hits);assert.equal(hits.length,0);}});assert.deepEqual(after,geometries);
  h.dispose();h.dispose();assert.equal(model.children.length,0);
});
