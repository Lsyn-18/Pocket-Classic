import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createClassic, dimensions as D } from './geometry.mjs';
import { makeScreen } from './screen.mjs';
import { createMotionControl } from './motion.mjs';
import { createStudioFloor } from './studio-floor.mjs';
import { createWheelInput } from './wheel-input.mjs';
import {createButtonPress} from './button-press.mjs';
import {visualBaseline,screenQuality} from './visual-profile.mjs';
import {createStudioEnvironment} from './environment.mjs';
import {createAtmosphere} from './atmosphere.mjs';
import {createStartupView} from './startup-view.mjs';
import {createStartupRenderer} from './startup-renderer.mjs';

const app=window.PocketClassicContext,host=document.getElementById('modelViewport'),status=document.getElementById('modelStatus');
document.body.classList.toggle('visual-baseline',visualBaseline);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance',preserveDrawingBuffer:visualBaseline});
let shaderErrors=0;
renderer.debug.onShaderError=(gl,program,vertex,fragment)=>{shaderErrors++;console.error('WebGL shader compilation failed',gl.getProgramInfoLog(program),gl.getShaderInfoLog(vertex),gl.getShaderInfoLog(fragment));};
const quality=screenQuality(renderer.capabilities);
const renderPixelRatio=!visualBaseline&&!app.native&&quality.pixelScale===4?2:Math.min(devicePixelRatio,2);
renderer.setPixelRatio(renderPixelRatio);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.setClearColor(0,0);
renderer.domElement.setAttribute('aria-label','iPod Classic 正面三维模型，轻移鼠标或开启体感改变反光');host.append(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.OrthographicCamera(-4,4,6,-6,.1,60);camera.position.set(0,0,20);camera.lookAt(0,0,0);

const environment=createStudioEnvironment(renderer,{baseline:visualBaseline});
scene.environment=environment.texture;scene.environmentIntensity=1;
scene.add(new THREE.HemisphereLight(0xffffff,0xaaaaaa,.4));
const key=new THREE.DirectionalLight(0xffffff,.8);key.position.set(-4,7,12);scene.add(key);
const fill=new THREE.DirectionalLight(0xffffff,.35);fill.position.set(7,-1,5);scene.add(fill);
RectAreaLightUniformsLib.init();
const studioCard=new THREE.RectAreaLight(0xffffff,visualBaseline?12:7.5,visualBaseline?1.8:1.4,visualBaseline?12:11);studioCard.position.set(...(visualBaseline?[-2.8,1.5,6]:[-2.2,2,5]));studioCard.lookAt(0,0,0);scene.add(studioCard);
const rimLight=new THREE.RectAreaLight(0xffead1,visualBaseline?0:1.6,3,7);rimLight.position.set(5,2,6);rimLight.lookAt(0,0,0);if(!visualBaseline)scene.add(rimLight);
const screen=makeScreen(app,{...quality,baseline:visualBaseline}),classic=createClassic(screen.texture,{baseline:visualBaseline});scene.add(classic.model);
// Composite the original high-resolution canvas at the display's native DPR.
// The scene's 2x budget and texture mip chain no longer soften LCD text/colors.
if(!visualBaseline){screen.canvas.className='lcd-surface';screen.canvas.setAttribute('aria-hidden','true');host.append(screen.canvas);}
const floor=createStudioFloor(classic.model,-D.height/2-.025,{baseline:visualBaseline});scene.add(floor.group);
const atmosphere=createAtmosphere({scene,camera,native:!!app.native,baseline:visualBaseline});
classic.model.rotation.set(-.008,-.025,0);
let targetX=-.008,targetY=-.025,previous=performance.now(),gesture=null,renderedFrames=0;
const compactQuery=matchMedia('(max-width:1000px)');
const compact=()=>!!app.native||compactQuery.matches;
// Some immersive Android WebViews resolve vh/svh/dvh to zero even while
// visualViewport reports the real window. Share that height with dialogs too.
function nativeViewport(){if(!app.native)return;const height=window.visualViewport?.height||window.innerHeight;if(!(height>0))return;document.documentElement.style.setProperty('--app-height',height+'px');document.documentElement.style.height=height+'px';document.body.style.height=height+'px';document.querySelector('.layout').style.height=height+'px';}
function refreshViewport(){nativeViewport();measure();}
nativeViewport();window.addEventListener('resize',refreshViewport);window.visualViewport?.addEventListener('resize',refreshViewport);
const tools=document.getElementById('playerTools'),optionsToggle=document.getElementById('playerOptionsToggle');
function closeOptions(){document.body.classList.remove('options-open');optionsToggle.setAttribute('aria-expanded','false')}
optionsToggle.onclick=()=>{const open=document.body.classList.toggle('options-open');optionsToggle.setAttribute('aria-expanded',String(open))};
document.addEventListener('pointerdown',e=>{document.body.classList.remove('keyboard-navigation');if(!tools.contains(e.target))closeOptions()});
document.addEventListener('keydown',e=>{if(e.key==='Tab')document.body.classList.add('keyboard-navigation');if(e.key==='Escape'&&document.body.classList.contains('options-open')){e.stopImmediatePropagation();e.preventDefault();closeOptions();optionsToggle.focus()}},true);
const fullscreenButton=document.getElementById('fullscreenToggle');
fullscreenButton.hidden=!!app.native||!document.fullscreenEnabled;
fullscreenButton.onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();closeOptions()}catch{status.textContent='当前浏览器暂不支持全屏显示';host.dataset.notice='true';setTimeout(()=>{delete host.dataset.notice;status.textContent=motion.state.message},4000)}};
document.addEventListener('fullscreenchange',()=>{fullscreenButton.textContent=document.fullscreenElement?'退出全屏':'全屏显示'});
function adaptTools(){document.body.classList.toggle('compact-player',compact());document.documentElement.classList.toggle('compact-player',compact());document.getElementById(compact()?'playerAccountSlot':'desktopAccountSlot').append(document.getElementById('account'));closeOptions()}
compactQuery.addEventListener('change',()=>{adaptTools();measure()});adaptTools();
const motionButton=document.getElementById('motionToggle'),calibrateButton=document.getElementById('motionCalibrate');
function motionUI(view){motionButton.textContent=view.pending?'取消开启':view.enabled?'关闭体感':'开启体感';motionButton.setAttribute('aria-pressed',String(view.enabled));calibrateButton.hidden=!view.enabled;status.textContent=view.message;host.dataset.motion=view.phase;if(!view.enabled){targetX=-.008;targetY=-.025}}
const motion=createMotionControl({source:app.native?.motion,onChange:motionUI});motionUI(motion.state);
document.getElementById('playerOptionsPanel').prepend(motionButton.parentElement);
document.getElementById('openAppearance').onclick=()=>{closeOptions();app.openAppearance();};
document.getElementById('openHelp').onclick=()=>{closeOptions();app.openHelp();};
motionButton.onclick=()=>{if(motion.state.enabled||motion.state.pending)motion.stop();else motion.start()};
calibrateButton.onclick=()=>motion.recalibrate();
for(const button of tools.querySelectorAll('button'))button.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')e.stopPropagation()});
window.addEventListener('pagehide',()=>motion.stop());
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const pointer=new THREE.Vector2(),raycaster=new THREE.Raycaster();
let fittedView;
function applyFrustum(bounds){Object.assign(camera,bounds);camera.updateProjectionMatrix();}
function measure(){const root=document.documentElement;document.body.classList.toggle('landscape-player',root.clientWidth>root.clientHeight);const r=host.getBoundingClientRect();if(!r.width||!r.height)return;const style=getComputedStyle(host),left=parseFloat(style.paddingLeft)||0,right=parseFloat(style.paddingRight)||0,top=parseFloat(style.paddingTop)||0,bottom=parseFloat(style.paddingBottom)||0;const width=Math.max(1,r.width-left-right),height=Math.max(1,r.height-top-bottom),aspect=width/height,units=(compact()?Math.max(11.38,6.34/aspect):Math.max(11.75,6.65/aspect))/height,cx=(left+r.width-right)/2,cy=(top+r.height-bottom)/2;
  fittedView={width:r.width,height:r.height,contentHeight:height,centerX:cx,centerY:cy,frustum:{left:-cx*units,right:(r.width-cx)*units,top:cy*units-.28,bottom:-(r.height-cy)*units-.28}};
  applyFrustum(fittedView.frustum);renderer.setSize(r.width,r.height,false);host.dataset.fit=compact()?'screen':'studio'}
new ResizeObserver(measure).observe(host);measure();
function pick(e){const r=host.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);
  for(const hit of raycaster.intersectObject(classic.model,true)){const p=classic.model.worldToLocal(hit.point.clone()),zone=hit.object.userData.zone;if(zone==='wheel'&&Math.hypot(p.x,p.y-D.wheelY)>D.wheelOpening)continue;return {point:p,zone:zone||'case'}}return null}
function wheelAction(p){const x=p.x,y=p.y-D.wheelY;if(Math.hypot(x,y)<D.centerRadius+.012)return 'select';return Math.abs(y)>Math.abs(x)?(y>0?'menu':'play'):(x<0?'previous':'next')}
const press=createButtonPress({shortPress:name=>app.action(name),longPress:name=>app.action(name,true),stop:()=>app.stopSeeking()});
const keyboardCancels=[];
function release(){press.cancel();}
const cancelGesture=()=>{gesture=null;release();for(const cancel of keyboardCancels)cancel();};
host.addEventListener('pointerdown',e=>{if(e.button!==0||gesture)return;const hit=pick(e);if(!hit||hit.zone==='case')return;const p=hit.point;
  gesture={id:e.pointerId,zone:hit.zone,point:p.clone(),angle:Math.atan2(p.y-D.wheelY,p.x),sum:0,dial:createWheelInput(),moved:false,held:false,x:e.clientX,y:e.clientY,action:hit.zone==='wheel'?wheelAction(p):null};
  host.setPointerCapture(e.pointerId);
  if(hit.zone==='wheel')press.start(gesture.action);
});
host.addEventListener('pointermove',e=>{
  if(!gesture){if(e.pointerType!=='touch'&&!motion.state.enabled&&!reducedMotion.matches&&!app.state.reducedMotion){const r=host.getBoundingClientRect();targetY=-.025+((e.clientX-r.left)/r.width-.5)*.07;targetX=-.008+((e.clientY-r.top)/r.height-.5)*.035}return}
  if(e.pointerId!==gesture.id||gesture.zone!=='wheel'||app.state.hold||Math.hypot(gesture.point.x,gesture.point.y-D.wheelY)<D.centerRadius+.012)return;
  const hit=pick(e);if(hit?.zone!=='wheel')return;const a=Math.atan2(hit.point.y-D.wheelY,hit.point.x);let delta=a-gesture.angle;while(delta>Math.PI)delta-=Math.PI*2;while(delta<-Math.PI)delta+=Math.PI*2;gesture.angle=a;gesture.sum-=delta;
  if(Math.abs(gesture.sum)>.065){gesture.moved=true;release()}const step=gesture.dial.move(-delta,e.timeStamp);if(step)app.rotate(step);
});
host.addEventListener('pointerup',e=>{const g=gesture;if(!g||g.id!==e.pointerId)return;gesture=null;if(g.zone==='wheel'){press.release();return;}release();if(g.moved)return;
  if(g.zone==='hold'){app.state.hold=!app.state.hold;app.render();return}
  if(app.state.hold){app.feedback('按键已锁定 · 拨动顶部开关解锁');return;}
  if(g.zone==='screen'){const index=screen.hit((g.point.x+D.screenWidth/2)/D.screenWidth*320,(D.screenY+D.screenHeight/2-g.point.y)/D.screenHeight*240);if(typeof index==='string')app.screenAction(index);else if(index!==null){app.state.selected=index;app.select()}}
});
for(const name of ['pointercancel','lostpointercapture'])host.addEventListener(name,cancelGesture);
window.addEventListener('blur',cancelGesture);window.addEventListener('pagehide',cancelGesture);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelGesture();});app.native?.motion.onVisibility(visible=>{if(!visible)cancelGesture();});
host.addEventListener('pointerleave',()=>{if(!gesture){targetX=-.008;targetY=-.025}});
const overlay=document.createElement('div');overlay.className='model-hit-controls';host.append(overlay);
const hitButtons=[];
const buttons=[['menu','MENU，长按返回主页',0,D.wheelY+1.50,.509,44,44],['previous','上一曲，长按快退',-1.50,D.wheelY,.509,44,44],['next','下一曲，长按快进',1.50,D.wheelY,.509,44,44],['play','播放暂停，长按休眠',0,D.wheelY-1.50,.509,44,44],['select','中央选择键',0,D.wheelY,.515,54,54],['hold','锁定或解锁按键',D.holdX,5.19,D.portZ,44,44]];
for(const [action,label,x,y,z,w,h]of buttons){const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',label);button.style.width=w+'px';button.style.height=h+'px';
  const activate=()=>{if(action==='hold'){app.state.hold=!app.state.hold;app.render()}else app.action(action)};
  let keyDown=false;const keyPress=createButtonPress({shortPress:activate,longPress:()=>app.action(action,true),stop:()=>app.stopSeeking()});
  keyboardCancels.push(()=>{keyDown=false;keyPress.cancel();});
  button.onclick=e=>{if(e.detail===0)activate()};button.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.stopPropagation();e.preventDefault();if(!keyDown){keyDown=true;keyPress.start(action);}}};button.onkeyup=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();keyDown=false;keyPress.release();}};button.onblur=()=>{keyDown=false;keyPress.cancel();};
  if(action==='hold'){
    // The reference switch is flush with the top face and nearly edge-on from
    // the player camera. Its accessible touch target must not depend on a ray
    // hitting that subpixel surface.
    let pointer=null;button.onpointerdown=e=>{if(e.button!==0)return;e.stopPropagation();pointer=e.pointerId;button.setPointerCapture(e.pointerId)};
    button.onpointerup=e=>{e.stopPropagation();if(pointer===e.pointerId){pointer=null;activate()}};
    button.onpointercancel=button.onlostpointercapture=()=>{pointer=null};
  }
  overlay.append(button);hitButtons.push({button,point:new THREE.Vector3(x,y,z)})}
const swatch=document.getElementById('frontColor');swatch.onclick=()=>{app.state.dark=!app.state.dark;app.render();swatch.setAttribute('aria-label',app.state.dark?'切换银色机身':'切换黑色机身')};
let meshes=0,triangles=0;classic.model.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3}});
Object.assign(host.dataset,{webgl:'true',meshes:String(meshes),triangles:String(Math.round(triangles)),view:'front-only',dimensions:'61.8 × 103.5 × 10.5 mm',reflection:'mirrored-geometry-with-fade',shadow:'soft-contact',visualProfile:visualBaseline?'baseline':'frosted',lcdScale:String(screen.pixelScale),lcdPixels:`${screen.canvas.width}x${screen.canvas.height}`,lcdAnisotropy:String(screen.texture.anisotropy),environment:environment.resolution,particles:String(atmosphere.count)});
host.dataset.lcdPresentation=visualBaseline?'texture':'native-compositor';
function placeLCD(){if(visualBaseline)return;const r=host.getBoundingClientRect(),project=(x,y)=>{const p=classic.model.localToWorld(new THREE.Vector3(x,y,.530)).project(camera);return {x:(p.x*.5+.5)*r.width,y:(-p.y*.5+.5)*r.height};},tl=project(-D.screenWidth/2,D.screenY+D.screenHeight/2),tr=project(D.screenWidth/2,D.screenY+D.screenHeight/2),bl=project(-D.screenWidth/2,D.screenY-D.screenHeight/2);screen.canvas.style.transform=`matrix(${(tr.x-tl.x)/320},${(tr.y-tl.y)/320},${(bl.x-tl.x)/240},${(bl.y-tl.y)/240},${tl.x},${tl.y})`;}
const reflectedLCD=floor.group.getObjectByName('Live_LCD_320x240');
const startupRenderer=createStartupRenderer(renderer,{model:classic.model,floor:floor.group,atmosphere:atmosphere.group});
const startup=createStartupView({app,host,canvas:renderer.domElement,lcd:screen.canvas,dimensions:D,baseline:visualBaseline,onFinish(){
  startupRenderer.dispose();
  if(fittedView)applyFrustum(fittedView.frustum);
  classic.lcd.material.color.setScalar(1);reflectedLCD?.material.color.setScalar(1);
  classic.model.rotation.set(-.008,-.025,0);cancelGesture();
  // A skip can arrive between frames. Redraw both surfaces before unmasking
  // can paint a stale close-up or a floating, enlarged LCD for one frame.
  classic.model.updateMatrixWorld(true);classic.setDark(app.state.dark);classic.setHold(app.state.hold);screen.draw();placeLCD();
  atmosphere.update(0,{dark:document.body.classList.contains('dark'),reducedMotion:true});
  floor.update(app.state.dark,atmosphere.accent,1);reflectedLCD?.material.color.setScalar(1);renderer.render(scene,camera);
}});
window.PocketClassicVisual={diagnostics(){const gl=renderer.getContext();return {profile:host.dataset.visualProfile,opening:host.dataset.opening,drawCalls:renderer.info.render.calls,frameTriangles:renderer.info.render.triangles,textures:renderer.info.memory.textures,geometries:renderer.info.memory.geometries,shaderErrors,glError:gl.getError(),contextLost:gl.isContextLost(),lcdPixels:host.dataset.lcdPixels,particles:atmosphere.count};}};
function frame(now){const dt=Math.min(.05,(now-previous)/1000);previous=now;const ease=1-Math.exp(-dt*7),reduce=reducedMotion.matches||app.state.reducedMotion;
  if(reduce){targetX=-.008;targetY=-.025;if(motion.state.enabled)motion.stop();}
  const sensor=motion.tick(dt,now,!!gesture),usingSensor=motion.state.enabled;
  const x=usingSensor?-.008+sensor.x:targetX,y=usingSensor?-.025+sensor.y:targetY;
  // Freeze both input and the rendered pose while using the wheel or buttons.
  const opening=fittedView?startup.update(now,fittedView):null;
  if(opening){applyFrustum(opening.bounds);classic.model.rotation.set(-.008*opening.pose,-.025*opening.pose,0);}
  else if(!gesture){const follow=usingSensor?1:ease;classic.model.rotation.x+=(x-classic.model.rotation.x)*follow;classic.model.rotation.y+=(y-classic.model.rotation.y)*follow}
  classic.model.updateMatrixWorld(true);classic.setDark(app.state.dark);classic.setHold(app.state.hold);screen.draw();
  const backlight=opening?.lcdLevel??1;classic.lcd.material.color.setScalar(backlight);
  placeLCD();
  if(!visualBaseline){studioCard.position.x=-2.2+(classic.model.rotation.y+.025)*2;studioCard.position.y=2+(classic.model.rotation.x+.008)*1.5;studioCard.lookAt(0,0,0);}
  const environmentDark=document.body.classList.contains('dark');
  document.body.classList.toggle('is-playing',!app.audio.paused&&!app.state.sleep);
  atmosphere.update(dt,{dark:environmentDark,trackId:app.state.current?.id||0,playing:!app.audio.paused,tiltX:classic.model.rotation.x+.008,tiltY:classic.model.rotation.y+.025,reducedMotion:reduce||!!opening});
  floor.update(app.state.dark,atmosphere.accent,reduce||opening?1:1+Math.sin(now*.00045)*.035);
  reflectedLCD?.material.color.setScalar(backlight);
  const r=host.getBoundingClientRect();for(const {button,point}of hitButtons){const p=classic.model.localToWorld(point.clone()).project(camera);button.style.transform=`translate(${(p.x*.5+.5)*r.width}px,${(-p.y*.5+.5)*r.height}px) translate(-50%,-50%)`}
  host.dataset.tilt=`${classic.model.rotation.x.toFixed(4)},${classic.model.rotation.y.toFixed(4)}`;
  if(opening)startupRenderer.render(scene,camera,opening,fittedView);else renderer.render(scene,camera);
  // Finish the initial GPU upload while the opening clock is still waiting.
  if(renderedFrames===0&&startup.active)renderer.getContext().finish();
  startup.warm();host.dataset.frames=String(++renderedFrames);if(renderedFrames%30===0){host.dataset.drawCalls=String(renderer.info.render.calls);host.dataset.frameTriangles=String(renderer.info.render.triangles);host.dataset.textures=String(renderer.info.memory.textures);}requestAnimationFrame(frame);
}
// Compile even the initially hidden scene before the first visible wheel.
// Android can otherwise defer linking until the canvas opacity becomes nonzero.
startupRenderer.warm(scene,camera).catch(error=>console.warn('Scene warmup',error)).finally(()=>{document.body.classList.add('three-ready');requestAnimationFrame(frame);});
window.addEventListener('pagehide',e=>{if(!e.persisted){atmosphere.dispose();floor.dispose();screen.dispose();environment.dispose();renderer.dispose();}});
