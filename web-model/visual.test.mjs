import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createClassic,dimensions} from './geometry.mjs';
import {makeScreen} from './screen.mjs';
import {screenQuality,createRenderBudget} from './visual-profile.mjs';
import {createAtmosphere,trackAccent,trackLight} from './atmosphere.mjs';
import {createStudioFloor} from './studio-floor.mjs';
import {menuMarker,appearanceIsDark,canAdvance} from './presentation.mjs';
import {lcdPalette} from './design-tokens.mjs';
import {createFinishTransition} from './finish-transition.mjs';
import {createCoverFlow,coverPose} from './cover-flow.mjs';

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

test('white selected text meets AA throughout the menu gradient',()=>{
  const luminance=color=>{const channels=new THREE.Color(color).toArray();return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
  const top=new THREE.Color(lcdPalette.selectionTop),bottom=new THREE.Color(lcdPalette.selectionBottom),text=new THREE.Color(lcdPalette.onSelectionMuted);
  for(let step=0;step<=20;step++){const background=top.clone().lerp(bottom,step/20);assert.ok((luminance(text)+.05)/(luminance(background)+.05)>=4.5);}
});

test('large home rows retain all four actions and menu transitions never delay hit testing',()=>{
  const state={page:'home',title:'iPod',selected:0,largeText:true},app={state,audio:{paused:true,volume:.5},entries:()=>Array.from({length:4},(_,i)=>({name:'选项 '+i})),footerText:()=>''};
  const screen=makeScreen(app);assert.equal(screen.hit(10,150),3);
  Object.assign(state,{page:'tracks',title:'歌曲',selected:0,largeText:false,navigationDirection:1});screen.draw(true);assert.equal(screen.hit(240,36),0);assert.equal(screen.hit(240,75),1);
  state.page='home';state.title='iPod';state.navigationDirection=-1;screen.draw(true);assert.equal(screen.hit(240,36),null);screen.dispose();
});

test('list hit targets exclude blank rows and remain aligned in large-text mode',()=>{
  const state={page:'tracks',selected:8,largeText:true};
  const app={state,audio:{paused:true,currentTime:0,volume:.5},entries:()=>Array.from({length:9},(_,id)=>({id,name:'歌曲 '+id})),footerText:()=>''};
  const screen=makeScreen(app);assert.equal(screen.hit(10,24),5);assert.equal(screen.hit(10,180),8);assert.equal(screen.hit(10,211),null);assert.equal(screen.hit(-1,32),null);screen.dispose();
});

test('LCD errors and playback expose actions rather than stale list hit targets',()=>{
  const state={page:'tracks',selected:0,problem:{message:'网络暂时不可用'},feedback:'网络暂时不可用',feedbackLevel:'warning',feedbackAt:Date.now(),current:null};
  const app={state,audio:{paused:true,currentTime:0,volume:.5},entries:()=>[{name:'旧歌曲'}],footerText:()=>''};
  const screen=makeScreen(app);assert.equal(screen.hit(30,188),'retry');assert.equal(screen.hit(210,188),'back');assert.equal(screen.hit(270,115),null);assert.equal(screen.hit(10,60),null);assert.equal(screen.hit(10,232),'retry');
  Object.assign(state,{page:'playing',problem:null,feedback:'',current:{id:1,name:'当前歌曲'},queue:[{id:1}],queueIndex:0});app.format=()=> '0:00';screen.draw(true);
  assert.equal(screen.hit(260,207),'queue');assert.equal(screen.hit(130,160),'seekMode');assert.equal(screen.hit(120,70),'details');screen.dispose();
});

test('enlarged cover remains a details target above the progress and volume controls',()=>{
  const state={page:'playing',mode:'volume',current:{id:1,name:'封面',artist:'音乐'},queue:[{id:1}],queueIndex:0};
  const app={state,audio:{paused:true,currentTime:20,duration:120,volume:.6},entries:()=>[],format:()=> '0:20',footerText:()=>''},screen=makeScreen(app);
  for(const mode of ['volume','seek']){state.mode=mode;screen.draw(true);assert.equal(screen.hit(115,144),'details');assert.equal(screen.hit(80,162),'seekMode');assert.equal(screen.hit(150,207),'volumeMode');assert.equal(screen.hit(260,207),'queue');}
  screen.dispose();
});

test('markers distinguish navigation, playing tracks, quality and boolean settings',()=>{
  const state={current:{id:5},quality:'hires',haptics:false,repeat:2};
  assert.equal(menuMarker('tracks',{id:5},0,state),'▶');assert.equal(menuMarker('tracks',{id:6},1,state),'');assert.equal(menuMarker('quality',{id:'hires'},0,state),'✓');assert.equal(menuMarker('settings',{},1,state),'关');
  assert.equal(appearanceIsDark('light',true),false);assert.equal(appearanceIsDark('dark',false),true);assert.equal(appearanceIsDark('auto',true),true);
});

test('a failed final song offers return instead of an unavailable next action',()=>{
  const state={page:'playing',current:{id:1,name:'最后一首'},queue:[{id:1}],queueIndex:0,problem:{message:'暂不可播放'},feedback:'暂不可播放',feedbackLevel:'warning',feedbackAt:Date.now()};
  const app={state,audio:{paused:true,currentTime:0,volume:.5},entries:()=>[],format:()=> '0:00',footerText:()=>''};const screen=makeScreen(app);
  assert.equal(canAdvance(state),false);assert.equal(screen.hit(180,188),'back');
  state.repeat=2;screen.draw(true);assert.equal(canAdvance(state),true);assert.equal(screen.hit(180,188),'next');
  state.feedback='';screen.draw(true);assert.equal(screen.hit(10,232),'retry');assert.equal(screen.hit(180,188),'next');assert.equal(screen.hit(130,160),null);screen.dispose();
});

test('decorations stay outside picking and total model triangles stay within twenty percent',()=>{
  const base=createClassic(new THREE.Texture(),{baseline:true}),next=createClassic(new THREE.Texture(),{baseline:false});
  const count=model=>{let n=0;model.traverse(o=>{if(o.isMesh)n+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return n;};
  assert.ok(count(next.model)<=count(base.model)*1.2);
  next.model.traverse(o=>{if(o.userData.decorative){const hits=[];o.raycast({},hits);assert.equal(hits.length,0);}});
  next.model.updateMatrixWorld(true);
  for(const [x,y,zone]of [[0,dimensions.screenY,'screen'],[1,dimensions.wheelY,'wheel']]){
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y,10),new THREE.Vector3(0,0,-1));assert.equal(ray.intersectObject(next.model,true)[0]?.object.userData.zone,zone);
  }
  const hold=next.parts.Independent_hold_slider.position;
  const holdRay=new THREE.Raycaster(new THREE.Vector3(hold.x,10,hold.z),new THREE.Vector3(0,-1,0));assert.equal(holdRay.intersectObject(next.model,true)[0]?.object.userData.zone,'hold');
  assert.equal(next.center.position.z,base.center.position.z);
});

test('five-view body dimensions, shell seam and top controls match the supplied drawing',()=>{
  const c=createClassic(new THREE.Texture(),{baseline:false}),d=dimensions;
  const front=new THREE.Box3().setFromBufferAttribute(c.parts.Continuous_rounded_front_lip.geometry.attributes.position),back=new THREE.Box3().setFromBufferAttribute(c.parts.Polished_stainless_rear_shell.geometry.attributes.position);
  for(const box of [front,back]){assert.ok(Math.abs(box.max.x-box.min.x-6.18)<1e-5);assert.ok(Math.abs(box.max.y-box.min.y-10.35)<1e-5)}
  assert.ok(Math.abs(front.max.z-.525)<1e-5);assert.ok(Math.abs(back.min.z+.525)<1e-5);assert.ok(Math.abs(back.max.z-d.seamZ)<1e-5);
  assert.ok(c.parts.Independent_hold_slider.position.x<0);assert.ok(c.parts.Headphone_socket_rim.position.x>0);
  assert.equal(c.parts.Live_LCD_320x240.position.y,d.screenY);assert.equal(c.center.position.y,d.wheelY);assert.ok(Math.abs(d.screenWidth/d.screenHeight-4/3)<1e-10);
  assert.equal(Object.keys(c.parts).filter(name=>name.startsWith('Dock_contact_')).length,30);assert.ok(!c.parts.Fastener_slot_left);
  c.setHold(true);assert.ok(c.parts.Independent_hold_slider.position.x<0);assert.equal(c.parts.Hold_orange_indicator.visible,true);
});

test('frosted roughness is not accidentally multiplied into a polished surface',()=>{
  const classic=createClassic(new THREE.Texture(),{baseline:false}),front=classic.materials.front;
  const pixels=front.roughnessMap.image.data,levels=[];for(let i=1;i<pixels.length;i+=4)levels.push(pixels[i]/255*front.roughness);
  assert.ok(Math.min(...levels)>=.26);assert.ok(Math.max(...levels)<=.38);assert.ok(front.metalness>=.94);assert.ok(front.clearcoat<=.05);
  assert.equal(front.map.generateMipmaps,true);assert.equal(front.map.minFilter,THREE.LinearMipmapLinearFilter);
  assert.ok(front.anisotropy>=.25,'Brushed metal needs a directional highlight');
  classic.setDark(true);assert.ok(front.roughness>=.34&&front.roughness<=.45);assert.ok(front.metalness>=.88);
  classic.setDark(false);assert.equal(front.metalness,.96);
});

test('graphite wheel recess and seams follow the finish instead of retaining silver edges',()=>{
  const classic=createClassic(new THREE.Texture(),{baseline:false}),names=['Click_wheel_recess','Center_button_seam','Wheel_inner_satin_lip','Wheel_rounded_outer_lip'];
  const silver=names.map(name=>classic.parts[name].material.color.clone());classic.setDark(true);
  for(const [i,name]of names.entries()){
    const material=classic.parts[name].material;
    assert.ok(!material.color.equals(silver[i]),name+' must change with the finish');
    assert.ok(Math.max(material.color.r,material.color.g,material.color.b)<.08,name+' retains a bright silver edge');
    assert.ok(material.roughness>=.65,name+' has a sharp grazing highlight');
  }
  const face=classic.parts.Flat_anodized_face_with_cutouts;
  assert.ok(Array.isArray(face.material),'Cutout walls need their own finish');
  assert.ok(face.material[1]===classic.materials.wheelRecess,'Cutout walls must use the matte recess finish');
});

test('finish changes reuse printing and metal textures without shader or texture churn',()=>{
  const classic=createClassic(new THREE.Texture(),{baseline:false}),front=classic.materials.front,printing=classic.parts.Printed_click_wheel_symbols.material;
  const map=front.map,letters=printing.map,frontVersion=front.version,printingVersion=printing.version;let disposals=0;letters.addEventListener('dispose',()=>disposals++);
  for(let i=0;i<12;i++){
    classic.setDark(i%2===0);assert.ok(front.map===map,'Metal coating must stay bound');assert.ok(printing.map===letters,'Printed symbols must reuse their texture');
    assert.equal(front.version,frontVersion);assert.equal(printing.version,printingVersion);
  }
  assert.equal(disposals,0);
});

test('finish interpolation reverses from its current pose, synchronizes the reflection and respects reduced motion',()=>{
  const classic=createClassic(new THREE.Texture(),{baseline:false}),finish=createFinishTransition(classic),front=classic.materials.front,map=front.map,version=front.version;
  const floor=createStudioFloor(classic.model,-5.2),reflected=floor.group.getObjectByName('Flat_anodized_face_with_cutouts').material[0];
  finish.update(false,0);const silver=front.color.clone();finish.update(true,10);finish.update(true,160);assert.ok(finish.mix>0&&finish.mix<1);assert.equal(front.color.equals(silver),false);
  floor.update(false,null,1,finish.mix);assert.ok(reflected.color.equals(front.color));const midway=front.color.clone();finish.update(false,160);assert.ok(front.color.equals(midway),'A reversed transition must not jump');
  finish.update(false,500);assert.equal(finish.mix,0);assert.ok(front.color.equals(silver));finish.update(true,510,{immediate:true});assert.equal(finish.mix,1);assert.equal(finish.active,false);assert.equal(front.map,map);assert.equal(front.version,version);floor.dispose();
});

test('3D cover browsing uses five reusable cards, latest selection and bounded texture resources',()=>{
  const model=new THREE.Group(),flow=createCoverFlow(model,dimensions,{get:()=>null}),state={page:'covers',selected:0,coverCollection:{tracks:Array.from({length:100},(_,id)=>({id}))}};
  flow.update(state,.016);assert.equal(flow.group.children.filter(card=>card.visible).length,3);const geometries=flow.group.children.map(card=>card.children[0].geometry);
  state.selected=50;flow.update(state,.016);assert.equal(flow.group.children.filter(card=>card.visible).length,5);assert.ok(flow.group.children.some(card=>card.children[0].userData.index===50));
  state.selected=99;flow.update(state,.016,{reducedMotion:true});const centre=flow.group.children.find(card=>card.children[0].userData.index===99);assert.equal(centre.position.x,0);assert.equal(centre.rotation.y,0);
  assert.deepEqual(flow.group.children.map(card=>card.children[0].geometry),geometries);assert.equal(coverPose(-1).x,-coverPose(1).x);assert.ok(coverPose(0).z>coverPose(1).z);
  state.page='playing';flow.update(state,.016);assert.equal(flow.group.visible,false);flow.dispose();assert.equal(model.children.length,0);
});

test('the wheel well covers the opening so the chrome rear cannot flash through its perimeter',()=>{
  const classic=createClassic(new THREE.Texture(),{baseline:false});classic.model.updateMatrixWorld(true);
  // Avoid triangle-fan seams where exact-axis CPU rays are numerically ambiguous.
  for(const angle of [.02,.8,1.6,3.2,4.8]){
    const radius=1.942,x=radius*Math.cos(angle),y=dimensions.wheelY+radius*Math.sin(angle);
    const ray=new THREE.Raycaster(new THREE.Vector3(x,y,10),new THREE.Vector3(0,0,-1));
    const hit=ray.intersectObject(classic.model,true).find(h=>!h.object.userData.decorative&&h.object.name!=='Printed_click_wheel_symbols');
    assert.equal(hit?.object.name,'Click_wheel_recess','Chrome shows through the wheel opening at '+angle);
  }
});

test('reduced motion freezes particles and breathing; track accent is deterministic',()=>{
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-4,4,6,-6,.1,60),atmosphere=createAtmosphere({scene,camera,native:true});
  assert.equal(atmosphere.count,76);assert.equal(trackAccent(123).getHex(),trackAccent(123).getHex());
  atmosphere.update(.1,{trackId:123,playing:true});const particles=atmosphere.group.children[1],time=particles.material.uniforms.uTime.value;
  atmosphere.update(.1,{trackId:123,playing:true,reducedMotion:true});assert.equal(particles.visible,false);assert.equal(particles.material.uniforms.uTime.value,time);
  assert.equal(atmosphere.group.children[0].material.depthTest,true);atmosphere.dispose();assert.equal(scene.children.length,0);
});

test('studio light stays within two hue anchors and daylight temperature bounds',()=>{
  for(const id of [0,1,2,20,345,-983]){const hsl=trackAccent(id).getHSL({}),light=trackLight(id);assert.ok(hsl.h*360>=200&&hsl.h*360<=215);assert.ok(Math.abs(hsl.s-.20)<1e-8);assert.ok(light.kelvin>=6200&&light.kelvin<=6800);}
});

test('floor updates retain soft reflection roughness and reuse textures across finishes',()=>{
  const model=new THREE.Group(),source=new THREE.MeshStandardMaterial({roughness:.30});model.add(new THREE.Mesh(new THREE.PlaneGeometry(1,1),source));
  const floor=createStudioFloor(model,-5),mirror=floor.group.children[0],material=mirror.children[0].material;
  for(const dark of [false,true,false]){floor.update(dark,trackAccent(1));assert.equal(material.roughness,.74);assert.equal(material.opacity,.13);}
  assert.equal(floor.group.children.length,6);floor.dispose();model.children[0].geometry.dispose();source.dispose();
});

test('raster quality ignores blocked gaps and single stalls but reduces sustained slow frames',()=>{
 const budget=createRenderBudget(2);let now=0;for(let i=0;i<200;i++){now+=1000;assert.equal(budget.sample(now,{blocked:true}),null);}
 for(let i=0;i<46;i++){now+=i===20?200:16;assert.equal(budget.sample(now),null);}
 let changed=null;for(let i=0;i<45;i++){now+=80;changed=budget.sample(now)||changed;}assert.equal(changed,1.5);
 changed=null;for(let i=0;i<45;i++){now+=80;changed=budget.sample(now)||changed;}assert.equal(changed,1);
 for(let i=0;i<90;i++){now+=80;assert.equal(budget.sample(now),null);}
});
