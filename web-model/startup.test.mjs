import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {dimensions as D} from './geometry.mjs';
import {sampleOpening,createOpeningPlayback,openingTiming} from './startup.mjs';
import {createStartupView} from './startup-view.mjs';
import {createStartupRenderer} from './startup-renderer.mjs';

function view(width,height,padding={}){
  const {left=4,right=4,top=8,bottom=76}=padding,w=width-left-right,h=height-top-bottom;
  const units=Math.max(11.38,6.34/(w/h))/h,cx=(left+width-right)/2,cy=(top+height-bottom)/2;
  return {width,height,contentHeight:h,centerX:cx,centerY:cy,frustum:{left:-cx*units,right:(width-cx)*units,top:cy*units-.28,bottom:-(height-cy)*units-.28}};
}
function project(x,y,frame,v){const b=frame.bounds,camera=new THREE.OrthographicCamera(b.left,b.right,b.top,b.bottom,.1,60);camera.position.z=20;camera.updateMatrixWorld();const p=new THREE.Vector3(x,y,.507).project(camera);return {x:(p.x*.5+.5)*v.width,y:(.5-p.y*.5)*v.height};}

test('two outlines match the new model at all sizes and stay fixed throughout handoff',()=>{
  for(const v of [view(320,480),view(420,820),view(736,510),view(844,390,{left:6,right:90,top:6,bottom:6})]){
    const first=sampleOpening(.1,v,D);
    for(const t of [.7,1,1.5,1.8]){
      const frame=sampleOpening(t,v,D),outer=project(D.wheelRadius+.011,D.wheelY,frame,v),inner=project(D.centerRadius+.012,D.wheelY,frame,v),center=project(0,D.wheelY,frame,v);
      assert.deepEqual(frame.bounds,first.bounds);
      assert.ok(Math.abs(outer.x-center.x-frame.outerDiameter/2)<1e-9);
      assert.ok(Math.abs(inner.x-center.x-frame.innerDiameter/2)<1e-9);
      assert.ok(Math.abs(center.x-frame.centerX)<1e-9);assert.ok(Math.abs(center.y-frame.centerY)<1e-9);
      assert.ok(frame.centerY-frame.outerDiameter/2>=0);assert.ok(frame.centerY+frame.outerDiameter/2<=v.height);
    }
  }
});

test('pull-back is continuous, monotonically smaller and lands on the actual fitted camera',()=>{
  for(const v of [view(320,480),view(420,820),view(844,390,{left:6,right:90,top:6,bottom:6})]){
    let previous=sampleOpening(1.8,v,D);
    for(let t=1.81;t<=3.7;t+=.01){const frame=sampleOpening(t,v,D);assert.ok(frame.outerDiameter<=previous.outerDiameter+1e-9);assert.ok(Math.abs(frame.centerY-previous.centerY)<v.height*.02);previous=frame;}
    const end=sampleOpening(3.7,v,D);assert.deepEqual(end.bounds,v.frustum);
    for(const x of [-D.width/2,D.width/2])for(const y of [-D.height/2,D.height/2]){const p=project(x,y,end,v);assert.ok(p.x>=0&&p.x<=v.width);assert.ok(p.y>=0&&p.y<=v.height);}
    assert.equal(sampleOpening(1.8,v,D).wheelAlpha,1);assert.equal(sampleOpening(1.5,v,D).ringAlpha,0);
  }
});

test('LCD reaches full brightness and the camera and pose stay still for the final 0.8 seconds',()=>{
  assert.ok(Math.abs(openingTiming.end-openingTiming.lcdEnd-.8)<1e-9);
  const v=view(420,820),lit=sampleOpening(4.2,v,D);
  for(const t of [4.2,4.5,4.9,5,6]){const frame=sampleOpening(t,v,D);assert.equal(frame.lcdLevel,1);assert.equal(frame.pose,1);assert.deepEqual(frame.bounds,lit.bounds);assert.equal(frame.stage,'hold');}
  assert.equal(sampleOpening(3.6,v,D).lcdLevel,0);
  // Zero first and second derivatives avoid a kick at either end of the zoom.
  const a=sampleOpening(1.8,v,D),b=sampleOpening(1.8001,v,D);assert.ok(Math.abs(a.outerDiameter-b.outerDiameter)<1e-7);
});

test('shader warmup and preferences do not consume the animation, and finish never replays',()=>{
  for(const readyFirst of [true,false]){
    const clock=createOpeningPlayback();if(readyFirst)clock.ready();else clock.warm();
    assert.equal(clock.tick(25000),0);if(readyFirst)clock.warm();else clock.ready();
    assert.equal(clock.tick(30000),0);assert.equal(clock.tick(34200),4.2);assert.equal(clock.tick(35000),5);assert.equal(clock.active,false);assert.equal(clock.reason,'complete');
    clock.ready();clock.warm();assert.equal(clock.tick(50000),5);
  }
  for(const reason of ['skip','background','reduced-motion','timeout']){const clock=createOpeningPlayback();clock.finish(reason);clock.ready();clock.warm();assert.equal(clock.tick(0),5);assert.equal(clock.reason,reason);}
});

test('GPU reveal restores scene and renderer state on failure, and releases its temporary target',async()=>{
  const model=new THREE.Group(),floor=new THREE.Group(),atmosphere=new THREE.Group(),source=new THREE.Scene();source.add(model,floor,atmosphere);
  const calls=[];let current=null,fail=false;
  const renderer={capabilities:{maxSamples:4},autoClear:true,info:{autoReset:true,reset(){}},
    getRenderTarget:()=>current,setRenderTarget(value){current=value;},getDrawingBufferSize(value){return value.set(840,1640);},
    compileAsync:async()=>{},render(scene){calls.push({scene,target:current});if(fail)throw Error('context lost');}};
  const gpu=createStartupRenderer(renderer,{model,floor,atmosphere});await gpu.warm(source,new THREE.Camera());
  const v=view(420,820),frame={...sampleOpening(2,v,D),maskFeather:20};
  gpu.render(source,new THREE.Camera(),frame,v);
  const target=calls[0].target;assert.equal(target.width,840);assert.equal(target.height,1640);assert.equal(target.texture.type,THREE.HalfFloatType);
  assert.equal(current,null);assert.ok(model.visible&&floor.visible&&atmosphere.visible);assert.equal(renderer.autoClear,true);assert.equal(renderer.info.autoReset,true);
  fail=true;assert.throws(()=>gpu.render(source,new THREE.Camera(),frame,v),/context lost/);
  assert.equal(current,null);assert.ok(model.visible&&floor.visible&&atmosphere.visible);assert.equal(renderer.autoClear,true);
  let disposals=0;target.addEventListener('dispose',()=>disposals++);gpu.dispose();gpu.dispose();assert.equal(disposals,1);
  const count=calls.length;gpu.render(source,new THREE.Camera(),frame,v);assert.equal(calls.length,count);
});

// Exercise the real input/lifecycle controller without creating a WebGL context.
class Element extends EventTarget {
  constructor(){super();this.style={removeProperty(key){delete this[key.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())];}};this.children=[];this.dataset={};this.inert=false;this.classes=new Set();this.classList={add:value=>this.classes.add(value),remove:value=>this.classes.delete(value)};}
  setAttribute(){} append(...items){for(const item of items){item.parent=this;this.children.push(item);}} contains(item){return item===this||this.children.includes(item);} remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);} focus(){document.activeElement=this;}
}
test('skip, native back, reduced motion and background release input and all presentation styles',async()=>{
  const original={document:globalThis.document,window:globalThis.window,matchMedia:globalThis.matchMedia};
  try{
    for(const mode of ['skip','back','background','reduced','restored','unavailable']){
      const body=new Element(),host=new Element(),canvas=new Element(),lcd=new Element(),tools=new Element(),controls=new Element();controls.inert=true;
      const doc=new EventTarget(),win=new EventTarget(),query=new EventTarget();query.matches=false;
      Object.assign(doc,{body,hidden:false,activeElement:body,createElement:()=>new Element(),querySelectorAll:()=>[tools,controls]});
      globalThis.document=doc;globalThis.window=win;globalThis.matchMedia=()=>query;
      let backCalls=0,finished=0,visibility;
      const back=()=>backCalls++,app={state:{},native:{ready:mode==='unavailable'?Promise.reject(Error('offline')):Promise.resolve({opening:mode!=='restored'}),back,motion:{onVisibility(fn){visibility=fn;return()=>{visibility=null;};}}}};
      const startup=createStartupView({app,host,canvas,lcd,dimensions:D,onFinish(){finished++;}});
      await Promise.resolve();
      if(['restored','unavailable'].includes(mode)){assert.equal(startup.active,false);}else{
        startup.update(0,view(420,820));startup.warm();startup.update(10,view(420,820));assert.equal(tools.inert,true);
        const shortcut=new Event('keydown',{cancelable:true});Object.defineProperty(shortcut,'key',{value:'F5'});doc.dispatchEvent(shortcut);assert.equal(shortcut.defaultPrevented,false);
        if(mode==='skip'){const key=new Event('keydown',{cancelable:true});Object.defineProperty(key,'key',{value:'Enter'});doc.dispatchEvent(key);assert.equal(key.defaultPrevented,true);}
        if(mode==='back')app.native.back();
        if(mode==='background')visibility(false);
        if(mode==='reduced'){query.matches=true;query.dispatchEvent(new Event('change'));}
      }
      assert.equal(startup.active,false);assert.equal(body.classes.has('startup-playing'),false);assert.equal(body.children.length,0);assert.equal(host.children.length,0);
      assert.equal(tools.inert,false);assert.equal(controls.inert,true);assert.equal(app.native.back,back);assert.equal(backCalls,0);assert.equal(finished,1);assert.equal(visibility,null);
      assert.equal(canvas.style.maskImage,undefined);assert.equal(lcd.style.opacity,undefined);
      assert.equal(startup.update(100000,view(420,820)),null);
    }
  }finally{Object.assign(globalThis,original);}
});
