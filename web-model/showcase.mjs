export const showcaseDuration=7.6;
const clamp=x=>Math.max(0,Math.min(1,x));
const points=[
  [0,0,0,1,0,0], [0,-2.28,.5,.58,.12,-.04],
  [2.5,.1,.2,.66,.30,.06], [0,2.6,.5,.57,-.24,.15], [0,0,0,1,0,0],
];
const spline=(a,b,c,d,t)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
export function sampleShowcase(seconds){
  const t=clamp(seconds/showcaseDuration),u=t*t*t*(10+t*(-15+t*6)),position=u*(points.length-1),index=Math.min(points.length-2,Math.floor(position)),local=position-index;
  if(t===0||t===1)return {focus:[0,0,0],zoom:1,yaw:0,pitch:0,done:t===1};
  const value=points[0].map((_,axis)=>spline(points[Math.max(0,index-1)][axis],points[index][axis],points[index+1][axis],points[Math.min(points.length-1,index+2)][axis],local));
  return {focus:value.slice(0,3),zoom:Math.max(.5,Math.min(1.05,value[3])),yaw:value[4],pitch:value[5],done:t===1};
}

export function createShowcase({app,host,camera,restore}){
  let started=null,active=false,exit=null,blocked=[],previousBack;
  const nativeBack=()=>stop();
  function stop(reason='cancelled'){
    if(!active)return;active=false;started=null;exit?.remove();exit=null;document.body.classList.remove('showcase-playing');for(const [element,inert]of blocked)element.inert=inert;blocked=[];if(app.native?.back===nativeBack)app.native.back=previousBack;host.dataset.showcase=reason;restore();document.getElementById('playerOptionsToggle')?.focus?.({preventScroll:true});
  }
  const key=event=>{if(active&&['Escape','Enter',' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();stop();}};
  const visibility=()=>{if(document.hidden)stop('background');};document.addEventListener('keydown',key,true);document.addEventListener('visibilitychange',visibility);
  const unsubscribe=app.native?.motion.onVisibility(visible=>{if(!visible)stop('background');});
  return {get active(){return active;},stop,start(){
    if(active)return;
    if(app.state.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches){app.feedback('减少动态效果已开启，保留静态外观');return;}
    active=true;started=null;if(app.native){previousBack=app.native.back;app.native.back=nativeBack;}blocked=Array.from(document.querySelectorAll('#playerTools,.model-hit-controls,#accessibleMenu,header,.intro,.notes,footer'),element=>[element,element.inert]);for(const [element]of blocked)element.inert=true;
    document.body.classList.add('showcase-playing');host.dataset.showcase='playing';exit=document.createElement('button');exit.type='button';exit.className='showcase-exit';exit.textContent='退出展示';exit.onclick=()=>stop();document.body.append(exit);exit.focus({preventScroll:true});
  },update(now,view,{reducedMotion=false}={}){
    if(!active)return null;if(reducedMotion||document.hidden){stop(reducedMotion?'reduced-motion':'background');return null;}
    started??=now;const sample=sampleShowcase((now-started)/1000);if(sample.done){stop('complete');return null;}
    const [x,y,z]=sample.focus,radius=20;camera.position.set(x+Math.sin(sample.yaw)*Math.cos(sample.pitch)*radius,y+Math.sin(sample.pitch)*radius,z+Math.cos(sample.yaw)*Math.cos(sample.pitch)*radius);camera.lookAt(x,y,z);
    for(const side of ['left','right','top','bottom'])camera[side]=view.frustum[side]*sample.zoom;camera.updateProjectionMatrix();camera.updateMatrixWorld();return sample;
  },dispose(){stop('disposed');document.removeEventListener('keydown',key,true);document.removeEventListener('visibilitychange',visibility);unsubscribe?.();}};
}
