import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createClassic, dimensions as D } from './geometry.mjs';
import { makeScreen } from './screen.mjs';
import { createMotionControl } from './motion.mjs';
import { createStudioFloor } from './studio-floor.mjs';
import { createWheelInput } from './wheel-input.mjs';

const app=window.PocketClassicContext,host=document.getElementById('modelViewport'),status=document.getElementById('modelStatus');
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.setClearColor(0,0);
renderer.domElement.setAttribute('aria-label','iPod Classic 正面三维模型，轻移鼠标或开启体感改变反光');host.append(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.OrthographicCamera(-4,4,6,-6,.1,60);camera.position.set(0,0,20);camera.lookAt(0,0,0);

// Broad, neutral studio cards. Anodized aluminum should have soft reflected
// light rather than the dark architectural reflections of an indoor room.
function studioEnvironment(){
  const w=512,h=256,data=new Float32Array(w*h*4);
  const directions=[new THREE.Vector3(0,.2,1).normalize(),new THREE.Vector3(-.62,.45,.9).normalize(),new THREE.Vector3(.9,.1,.35).normalize(),new THREE.Vector3(0,1,0)];
  const gaussian=(v,d,spread)=>Math.exp((v.dot(d)-1)/(spread*spread));
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const phi=y/(h-1)*Math.PI,theta=(x/(w-1)-.5)*Math.PI*2;
    const v=new THREE.Vector3(-Math.sin(phi)*Math.cos(theta),Math.cos(phi),Math.sin(phi)*Math.sin(theta));
    let light=.64+.76*gaussian(v,directions[0],.82)+2.0*gaussian(v,directions[1],.25)+1.15*gaussian(v,directions[2],.14)+.5*gaussian(v,directions[3],.7);
    const i=(y*w+x)*4;data[i]=light;data[i+1]=light;data[i+2]=light;data[i+3]=1;
  }
  const texture=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.FloatType);texture.mapping=THREE.EquirectangularReflectionMapping;texture.needsUpdate=true;
  const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromEquirectangular(texture);texture.dispose();pmrem.dispose();return target.texture;
}
scene.environment=studioEnvironment();scene.environmentIntensity=1;
scene.add(new THREE.HemisphereLight(0xffffff,0xaaaaaa,.4));
const key=new THREE.DirectionalLight(0xffffff,.8);key.position.set(-4,7,12);scene.add(key);
const fill=new THREE.DirectionalLight(0xffffff,.35);fill.position.set(7,-1,5);scene.add(fill);
RectAreaLightUniformsLib.init();
const studioCard=new THREE.RectAreaLight(0xffffff,6,4.5,8);studioCard.position.set(-5,7,11);studioCard.lookAt(0,0,0);scene.add(studioCard);
const screen=makeScreen(app),classic=createClassic(screen.texture);scene.add(classic.model);
const floor=createStudioFloor(classic.model,-D.height/2-.025);scene.add(floor.group);
classic.model.rotation.set(-.008,-.025,0);
let targetX=-.008,targetY=-.025,previous=performance.now(),gesture=null,holdTimer,seekTimer,renderedFrames=0;
const compactQuery=matchMedia('(max-width:1000px)');
const compact=()=>!!app.native||compactQuery.matches;
// Embedded WebView can report its viewport before percentage heights settle.
// Anchor the native root to the viewport and refresh it on rotation or resize.
function nativeViewport(){if(!app.native)return;const height=document.documentElement.clientHeight;document.documentElement.style.height=height+'px';document.body.style.height=height+'px';document.querySelector('.layout').style.height=height+'px';}
nativeViewport();window.addEventListener('resize',()=>{nativeViewport();measure();});
const tools=document.getElementById('playerTools'),optionsToggle=document.getElementById('playerOptionsToggle');
function closeOptions(){document.body.classList.remove('options-open');optionsToggle.setAttribute('aria-expanded','false')}
optionsToggle.onclick=()=>{const open=document.body.classList.toggle('options-open');optionsToggle.setAttribute('aria-expanded',String(open))};
document.addEventListener('pointerdown',e=>{if(!tools.contains(e.target))closeOptions()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('options-open')){e.stopImmediatePropagation();e.preventDefault();closeOptions();optionsToggle.focus()}},true);
const fullscreenButton=document.getElementById('fullscreenToggle');
fullscreenButton.hidden=!!app.native||!document.fullscreenEnabled;
fullscreenButton.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();closeOptions()}catch{status.textContent='当前浏览器暂不支持全屏显示';host.dataset.notice='true';setTimeout(()=>{delete host.dataset.notice;status.textContent=motion.state.message},4000)}};
document.addEventListener('fullscreenchange',()=>{fullscreenButton.textContent=document.fullscreenElement?'退出全屏':'全屏显示'});
function adaptTools(){document.body.classList.toggle('compact-player',compact());document.documentElement.classList.toggle('compact-player',compact());document.getElementById(compact()?'playerAccountSlot':'desktopAccountSlot').append(document.getElementById('account'));closeOptions()}
compactQuery.addEventListener('change',()=>{adaptTools();measure()});adaptTools();
const motionButton=document.getElementById('motionToggle'),calibrateButton=document.getElementById('motionCalibrate');
function motionUI(view){motionButton.textContent=view.pending?'取消开启':view.enabled?'关闭体感':'开启体感';motionButton.setAttribute('aria-pressed',String(view.enabled));calibrateButton.hidden=!view.enabled;status.textContent=view.message;host.dataset.motion=view.phase;if(!view.enabled){targetX=-.008;targetY=-.025}}
const motion=createMotionControl({source:app.native?.motion,onChange:motionUI});motionUI(motion.state);
motionButton.onclick=()=>{if(motion.state.enabled||motion.state.pending)motion.stop();else motion.start()};
calibrateButton.onclick=()=>motion.recalibrate();
for(const button of tools.querySelectorAll('button'))button.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation()});
window.addEventListener('pagehide',()=>motion.stop());
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster();
function measure(){const root=document.documentElement;document.body.classList.toggle('landscape-player',root.clientWidth>root.clientHeight);const r=host.getBoundingClientRect();if(!r.width||!r.height)return;const aspect=r.width/r.height,height=compact()?Math.max(11.38,6.34/aspect):Math.max(11.75,6.65/aspect);camera.left=-height*aspect/2;camera.right=height*aspect/2;camera.top=height/2-.28;camera.bottom=-height/2-.28;camera.updateProjectionMatrix();renderer.setSize(r.width,r.height,false);host.dataset.fit=compact()?'screen':'studio'}
new ResizeObserver(measure).observe(host);measure();
function pick(e){const r=host.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
  for(const hit of raycaster.intersectObject(classic.model,true)){const p=classic.model.worldToLocal(hit.point.clone()),zone=hit.object.userData.zone;if(zone==='wheel'&&Math.hypot(p.x,p.y-D.wheelY)>1.945)continue;return {point:p,zone:zone||'case'}}return null}
function wheelAction(p){const x=p.x,y=p.y-D.wheelY;if(Math.hypot(x,y)<.70)return 'select';return Math.abs(y)>Math.abs(x)?(y>0?'menu':'play'):(x<0?'previous':'next')}
function release(){clearTimeout(holdTimer);clearInterval(seekTimer);classic.center.position.z=.493}
host.addEventListener('pointerdown',e=>{if(e.button!==0)return;const hit=pick(e);if(!hit||hit.zone==='case')return;const p=hit.point;
  gesture={id:e.pointerId,zone:hit.zone,point:p.clone(),angle:Math.atan2(p.y-D.wheelY,p.x),sum:0,dial:createWheelInput(),moved:false,held:false,x:e.clientX,y:e.clientY,action:hit.zone==='wheel'?wheelAction(p):null};
  host.setPointerCapture(e.pointerId);if(gesture.action==='select'&&!app.state.hold)classic.center.position.z=.470;
  if(hit.zone==='wheel')holdTimer=setTimeout(()=>{if(gesture&&!gesture.moved){gesture.held=true;app.action(gesture.action,true);if(['previous','next'].includes(gesture.action))seekTimer=setInterval(()=>app.action(gesture?.action,true),180)}},480);
});
host.addEventListener('pointermove',e=>{
  if(!gesture){if(e.pointerType!=='touch'&&!motion.state.enabled&&!reducedMotion.matches){const r=host.getBoundingClientRect();targetY=-.025+((e.clientX-r.left)/r.width-.5)*.07;targetX=-.008+((e.clientY-r.top)/r.height-.5)*.035}return}
  if(gesture.zone!=='wheel'||app.state.hold||Math.hypot(gesture.point.x,gesture.point.y-D.wheelY)<.70)return;
  const hit=pick(e);if(hit?.zone!=='wheel')return;const a=Math.atan2(hit.point.y-D.wheelY,hit.point.x);let delta=a-gesture.angle;while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;gesture.angle=a;gesture.sum-=delta;
  if(Math.abs(gesture.sum)>.065){gesture.moved=true;release()}const step=gesture.dial.move(-delta,e.timeStamp);if(step)app.rotate(step);
});
host.addEventListener('pointerup',e=>{const g=gesture;release();gesture=null;if(!g||g.id!==e.pointerId||g.moved||g.held)return;
  if(g.zone==='hold'){app.state.hold=!app.state.hold;app.render();return}if(g.zone==='wheel'){app.action(g.action);return}
  if(g.zone==='screen'&&!app.state.hold){const index=screen.hit((g.point.x+D.screenWidth/2)/D.screenWidth*320,(D.screenY+D.screenHeight/2-g.point.y)/D.screenHeight*240);if(index!==null){app.state.selected=index;app.select()}}
});
host.addEventListener('pointercancel',()=>{gesture=null;release()});host.addEventListener('pointerleave',()=>{if(!gesture){targetX=-.008;targetY=-.025}});
const overlay=document.createElement('div');overlay.className='model-hit-controls';host.append(overlay);
const hitButtons=[];
const buttons=[['menu','MENU，长按返回主页',0,D.wheelY+1.50,.509,44,32],['previous','上一曲，长按快退',-1.50,D.wheelY,.509,42,44],['next','下一曲，长按快进',1.50,D.wheelY,.509,42,44],['play','播放暂停，长按休眠',0,D.wheelY-1.50,.509,44,32],['select','中央选择键',0,D.wheelY,.515,54,54],['hold','锁定或解锁按键',1.95,5.18,0,42,25]];
for(const [action,label,x,y,z,w,h]of buttons){const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',label);button.style.width=w+'px';button.style.height=h+'px';
  const activate=()=>{if(action==='hold'){app.state.hold=!app.state.hold;app.render()}else app.action(action)};
  button.onclick=e=>{if(e.detail===0)activate()};button.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.stopPropagation();e.preventDefault();activate()}};
  overlay.append(button);hitButtons.push({button,point:new THREE.Vector3(x,y,z)})}
const swatch=document.getElementById('frontColor');swatch.onclick=()=>{app.state.dark=!app.state.dark;app.render();swatch.setAttribute('aria-label',app.state.dark?'切换银色机身':'切换黑色机身')};
let meshes=0,triangles=0;classic.model.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3}});
Object.assign(host.dataset,{webgl:'true',meshes:String(meshes),triangles:String(Math.round(triangles)),view:'front-only',dimensions:'61.8 × 103.5 × 10.5 mm',reflection:'mirrored-geometry-with-fade',shadow:'soft-contact'});
function frame(now){const dt=Math.min(.05,(now-previous)/1000);previous=now;const ease=1-Math.exp(-dt*7);
  const sensor=motion.tick(dt,now,!!gesture),usingSensor=motion.state.enabled;
  const x=usingSensor?-.008+sensor.x:targetX,y=usingSensor?-.025+sensor.y:targetY;
  // Freeze both input and the rendered pose while using the wheel or buttons.
  if(!gesture){classic.model.rotation.x+=(x-classic.model.rotation.x)*ease;classic.model.rotation.y+=(y-classic.model.rotation.y)*ease}
  classic.model.updateMatrixWorld(true);classic.setDark(app.state.dark);classic.setHold(app.state.hold);screen.draw();floor.update(app.state.dark);
  const r=host.getBoundingClientRect();for(const {button,point}of hitButtons){const p=classic.model.localToWorld(point.clone()).project(camera);button.style.transform=`translate(${(p.x*.5+.5)*r.width}px,${(-p.y*.5+.5)*r.height}px) translate(-50%,-50%)`}
  host.dataset.tilt=`${classic.model.rotation.x.toFixed(4)},${classic.model.rotation.y.toFixed(4)}`;renderer.render(scene,camera);host.dataset.frames=String(++renderedFrames);requestAnimationFrame(frame);
}
document.body.classList.add('three-ready');requestAnimationFrame(frame);
