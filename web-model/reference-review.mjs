import * as THREE from 'three';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {exportModelGLB} from './export-model.mjs';
import {createClassic,dimensions as D} from './geometry.mjs';
import {createStudioEnvironment} from './environment.mjs';

const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.setClearColor(0,0);
const scene=new THREE.Scene(),environment=createStudioEnvironment(renderer);scene.environment=environment.texture;
scene.add(new THREE.HemisphereLight(0xffffff,0xaaaaaa,.4));RectAreaLightUniformsLib.init();
for(const [x,y,z,width,height,intensity]of [[-2.2,2,5,1.4,11,7.5],[3,2,-6,2,10,5]]){const light=new THREE.RectAreaLight(0xffffff,intensity,width,height);light.position.set(x,y,z);light.lookAt(0,0,0);scene.add(light)}
const key=new THREE.DirectionalLight(0xffffff,.8);key.position.set(-4,7,12);scene.add(key);
const image=document.createElement('canvas');image.width=640;image.height=480;const ctx=image.getContext('2d');
ctx.fillStyle='#f2f5f8';ctx.fillRect(0,0,640,480);const bar=ctx.createLinearGradient(0,0,0,48);bar.addColorStop(0,'#fafafa');bar.addColorStop(1,'#c1c7ce');ctx.fillStyle=bar;ctx.fillRect(0,0,640,48);ctx.font='bold 30px Arial';ctx.fillStyle='#111';ctx.fillText('iPod',14,34);
ctx.fillStyle='#66a448';ctx.fillRect(558,12,58,22);ctx.strokeStyle='#4e585b';ctx.strokeRect(556,10,62,26);ctx.fillStyle='#69767e';ctx.fillRect(619,18,4,10);
ctx.fillStyle='#a2afbe';ctx.fillRect(340,49,300,431);ctx.font='bold 31px Arial';
for(const [i,name]of ['Music','Videos','Photos','Podcasts','Extras','Settings','Shuffle Songs'].entries()){if(!i){const blue=ctx.createLinearGradient(0,50,0,108);blue.addColorStop(0,'#55b9f1');blue.addColorStop(1,'#0865bc');ctx.fillStyle=blue;ctx.fillRect(0,50,340,58)}ctx.fillStyle=i?'#111':'#fff';ctx.fillText(name,14,90+i*53)}
ctx.fillStyle='#e4e9ee';ctx.font='210px Arial';ctx.fillText('♫',386,309);
const lcd=new THREE.CanvasTexture(image);lcd.colorSpace=THREE.SRGBColorSpace;
const classic=createClassic(lcd,{baseline:false});classic.setHold(true);scene.add(classic.model);
const views=[['front',[0,0,20],[0,1,0],6.8,11.2,500,824],['back',[0,0,-20],[0,1,0],6.8,11.2,500,824],['right',[20,0,0],[0,1,0],1.7,11.2,125,824],['top',[0,20,0],[0,0,-1],6.8,1.65,600,146],['bottom',[0,-20,0],[0,0,-1],6.8,1.65,600,146]];
function render(){
 for(const [name,pos,up,w,h,pw,ph]of views){const camera=new THREE.OrthographicCamera(-w/2,w/2,h/2,-h/2,.1,50);camera.up.set(...up);camera.position.set(...pos);camera.lookAt(0,0,0);camera.updateMatrixWorld();renderer.setSize(pw,ph,false);renderer.render(scene,camera);const target=document.getElementById(name);target.width=pw;target.height=ph;const c=target.getContext('2d');c.clearRect(0,0,pw,ph);c.drawImage(renderer.domElement,0,0);}
 document.body.dataset.ready='true';
}
for(const button of document.querySelectorAll('[data-finish]'))button.onclick=()=>{classic.setDark(button.dataset.finish==='black');document.querySelectorAll('[data-finish]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));render()};
document.getElementById('export').onclick=async()=>{const button=document.getElementById('export');button.disabled=true;try{const data=await exportModelGLB(classic.model);const url=URL.createObjectURL(new Blob([data],{type:'model/gltf-binary'}));const link=document.createElement('a');link.href=url;link.download='Pocket-Classic-2009-'+(document.querySelector('[data-finish="black"]').getAttribute('aria-pressed')==='true'?'black':'silver')+'.glb';link.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}catch(error){button.textContent='导出失败，请重试';console.error(error)}finally{button.disabled=false}};
window.ReferenceReview={classic,renderer,dimensions:D,render};render();
