import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { createClassic, dimensions as D } from './geometry.mjs';
import { makeScreen } from './screen.mjs';

const app=window.PocketClassicContext;
const host=document.getElementById('modelViewport');
const status=document.getElementById('modelStatus');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
renderer.setClearColor(0x000000,0);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.88;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;
host.append(renderer.domElement);renderer.domElement.setAttribute('aria-label','可旋转的 iPod Classic 三维模型');
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(33,1,.1,100);camera.position.set(6.2,3.0,17.5);
const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();
const environment=pmrem.fromScene(room,.035);scene.environment=environment.texture;scene.environmentIntensity=.8;scene.environmentRotation.y=.48;room.dispose();
const ambient=new THREE.HemisphereLight(0xf3f7ff,0x828896,.35);scene.add(ambient);
const key=new THREE.DirectionalLight(0xfff9ed,1.7);key.position.set(-5,16,10);key.castShadow=true;
key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:1,far:40});key.shadow.bias=-.0003;key.shadow.normalBias=.025;key.shadow.radius=5;key.shadow.blurSamples=8;scene.add(key);
const fill=new THREE.DirectionalLight(0xc9ddff,.65);fill.position.set(6,2,-4);scene.add(fill);
const screen=makeScreen(app);const classic=createClassic(screen.texture);scene.add(classic.model);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(30,30),new THREE.ShadowMaterial({color:0x344259,opacity:.12,depthWrite:false}));floor.rotation.x=-Math.PI/2;floor.position.y=-5.33;floor.receiveShadow=true;scene.add(floor);
const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.05,0);controls.enableDamping=true;controls.dampingFactor=.08;controls.enablePan=false;controls.minDistance=12.5;controls.maxDistance=29;controls.minPolarAngle=.12;controls.maxPolarAngle=Math.PI-.12;controls.rotateSpeed=.58;controls.zoomSpeed=.7;controls.update();
const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let inspect=false;let gesture=null;let holdTimer;let seekTimer;let viewTarget=null;let lastFrame=performance.now();
function measure(){const r=host.getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix()}
new ResizeObserver(measure).observe(host);measure();
const preset={front:[0,.05,19.2],back:[0,.05,-19.2],side:[19.2,.8,2],threequarter:[6.2,3,17.5]};
function setView(name){viewTarget=new THREE.Vector3(...preset[name]);document.querySelectorAll('[data-model-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.modelView===name));}
document.querySelectorAll('[data-model-view]').forEach(b=>b.onclick=()=>setView(b.dataset.modelView));
document.getElementById('inspectMode').onclick=()=>{inspect=!inspect;document.getElementById('inspectMode').classList.toggle('is-active',inspect);document.getElementById('inspectMode').textContent=inspect?'完成旋转':'旋转查看';status.textContent=inspect?'拖动任意位置旋转 · 滚轮缩放':'拖动机身旋转 · 转轮与屏幕可操作'};
for(const color of ['silver','black'])document.getElementById(`color-${color}`).onclick=()=>{app.state.dark=color==='black';app.render();document.getElementById('color-silver').classList.toggle('is-active',!app.state.dark);document.getElementById('color-black').classList.toggle('is-active',app.state.dark)};
document.querySelectorAll('[data-player-action]').forEach(b=>b.onclick=()=>app.action(b.dataset.playerAction));
document.getElementById('modelHold').onclick=()=>{app.state.hold=!app.state.hold;app.render()};
function pick(event){
  const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
  for(const hit of raycaster.intersectObject(classic.model,true)){
    const p=classic.model.worldToLocal(hit.point.clone());const zone=hit.object.userData.zone;
    if(zone==='wheel'&&Math.hypot(p.x,p.y-D.wheelY)>D.wheelRadius+.035)continue;
    return {zone:zone||'case',point:p};
  }return null;
}
function wheelAction(p){const x=p.x,y=p.y-D.wheelY;if(Math.hypot(x,y)<.70)return 'select';if(Math.abs(y)>Math.abs(x))return y>0?'menu':'play';return x<0?'previous':'next'}
function clearPress(){clearTimeout(holdTimer);clearInterval(seekTimer);classic.center.position.z=.493}
renderer.domElement.addEventListener('pointerdown',event=>{
  if(event.button!==0)return;viewTarget=null;const hit=pick(event);
  if(inspect||!hit||hit.zone==='case'){controls.enabled=true;gesture=null;return}
  controls.enabled=false;const p=hit.point;gesture={id:event.pointerId,zone:hit.zone,startX:event.clientX,startY:event.clientY,point:p.clone(),angle:Math.atan2(p.y-D.wheelY,p.x),sum:0,moved:false,held:false,action:hit.zone==='wheel'?wheelAction(p):null};
  if(hit.zone==='wheel'&&gesture.action==='select')classic.center.position.z=.469;
  renderer.domElement.setPointerCapture(event.pointerId);
  if(hit.zone==='wheel')holdTimer=setTimeout(()=>{if(gesture&&!gesture.moved){gesture.held=true;app.action(gesture.action,true);if(['previous','next'].includes(gesture.action))seekTimer=setInterval(()=>app.action(gesture?.action,true),180)}},480);
},true);
renderer.domElement.addEventListener('pointermove',event=>{
  if(!gesture||gesture.id!==event.pointerId)return;
  if(gesture.zone!=='wheel')return;
  if(app.state.hold)return;
  const hit=pick(event);if(!hit||hit.zone!=='wheel')return;
  const p=hit.point;if(Math.hypot(gesture.point.x,gesture.point.y-D.wheelY)<.70)return;
  const angle=Math.atan2(p.y-D.wheelY,p.x);let delta=angle-gesture.angle;while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;
  gesture.angle=angle;gesture.sum-=delta;
  if(Math.abs(gesture.sum)>.065){gesture.moved=true;clearPress()}
  const steps=Math.trunc(gesture.sum/.15);if(steps){gesture.sum-=steps*.15;app.rotate(Math.max(-4,Math.min(4,steps)))}
},true);
renderer.domElement.addEventListener('pointerup',event=>{
  const g=gesture;clearPress();gesture=null;controls.enabled=true;if(!g||g.id!==event.pointerId||g.moved||g.held)return;
  if(g.zone==='hold'){app.state.hold=!app.state.hold;app.render();return}
  if(g.zone==='wheel'){app.action(g.action);return}
  if(g.zone==='screen'&&!app.state.hold&&Math.hypot(event.clientX-g.startX,event.clientY-g.startY)<8){
    const x=(g.point.x+D.screenWidth/2)/D.screenWidth*320;const y=(D.screenY+D.screenHeight/2-g.point.y)/D.screenHeight*240;
    const index=screen.hit(x,y);if(index!==null){app.state.selected=index;app.select()}
  }
},true);
renderer.domElement.addEventListener('pointercancel',()=>{clearPress();gesture=null;controls.enabled=true},true);
renderer.domElement.addEventListener('dblclick',event=>{if(inspect||pick(event)?.zone==='case')setView('front')});
renderer.domElement.addEventListener('contextmenu',event=>event.preventDefault());
controls.addEventListener('start',()=>{if(controls.enabled)viewTarget=null});
let meshes=0,triangles=0;classic.model.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3}});
host.dataset.webgl='true';host.dataset.meshes=String(meshes);host.dataset.triangles=String(Math.round(triangles));host.dataset.modelUnits='centimeters';
host.dataset.nominalDimensions='61.8 × 103.5 × 10.5 mm';
const exportButton=document.getElementById('exportModel');
exportButton.onclick=async()=>{
  exportButton.disabled=true;exportButton.textContent='正在导出…';
  try{
    const clone=classic.model.clone(true);clone.scale.setScalar(.01);clone.updateMatrixWorld(true);
    const neutral=screen.neutralTexture();clone.traverse(o=>{if(o.isMesh&&o.userData.lcd){o.material=o.material.clone();o.material.map=neutral}});
    const binary=await new GLTFExporter().parseAsync(clone,{binary:true,onlyVisible:true,maxTextureSize:1024});
    const blob=new Blob([binary],{type:'model/gltf-binary'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`Pocket-Classic-2009-${app.state.dark?'black':'silver'}.glb`;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);neutral.dispose();status.textContent='三维模型已导出 · 文件不含账号或歌单信息';
  }catch(error){console.error('Model export failed',error);status.textContent='模型导出失败，请稍后重试'}
  finally{exportButton.disabled=false;exportButton.textContent='下载三维模型'}
};
function animate(now){
  const elapsed=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;
  if(viewTarget){camera.position.lerp(viewTarget,1-Math.exp(-elapsed*7));if(camera.position.distanceTo(viewTarget)<.005){camera.position.copy(viewTarget);viewTarget=null}camera.lookAt(controls.target)}
  controls.update();classic.setDark(app.state.dark);classic.setHold(app.state.hold);screen.draw();
  host.dataset.cameraSide=camera.position.z < -2?'back':camera.position.x > 15?'side':'front';
  host.dataset.view=inspect?'inspect':'play';document.getElementById('modelHold').setAttribute('aria-pressed',String(app.state.hold));
  renderer.render(scene,camera);requestAnimationFrame(animate);
}
status.textContent='拖动机身旋转 · 转轮与屏幕可操作';document.body.classList.add('three-ready');requestAnimationFrame(animate);
