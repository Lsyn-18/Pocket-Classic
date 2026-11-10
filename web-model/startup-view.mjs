import {createOpeningPlayback,sampleOpening,smooth} from './startup.mjs';

export function createStartupView({app,host,canvas,lcd,dimensions,baseline,poster,onFinish}){
  const playback=createOpeningPlayback(),body=document.body,reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const layer=document.createElement('div');layer.className='startup-rings';layer.setAttribute('aria-hidden','true');
  const outer=document.createElement('i'),inner=document.createElement('i');layer.append(outer,inner);host.append(layer);
  const skip=document.createElement('button');skip.type='button';skip.className='startup-skip';skip.textContent='跳过开场';body.append(skip);
  body.classList.add('startup-playing');host.dataset.opening='preparing';
  const blocked=[...document.querySelectorAll('#playerTools,.model-hit-controls,.feedback-controls,#accessibleMenu,header,.intro,.notes,footer')];
  const inert=blocked.map(element=>element.inert);blocked.forEach(element=>{element.inert=true;});
  const previousBack=app.native?.back;
  let cleaned=false;
  function clean(){
    if(cleaned)return;cleaned=true;
    clearTimeout(deadline);layer.remove();skip.remove();body.classList.remove('startup-playing');
    for(const property of ['opacity','mask-image','-webkit-mask-image'])canvas.style.removeProperty(property);
    lcd.style.removeProperty('opacity');
    blocked.forEach((element,i)=>{element.inert=inert[i];});
    host.dataset.opening=playback.reason;
    document.removeEventListener('keydown',key,true);document.removeEventListener('pointerdown',pointer,true);
    document.removeEventListener('wheel',wheel,true);document.removeEventListener('visibilitychange',visibility);
    reduced.removeEventListener('change',preference);window.removeEventListener('pagehide',hide);
    unsubscribe?.();if(app.native)app.native.back=previousBack;
    if(document.activeElement===document.body||document.activeElement===skip)host.focus({preventScroll:true});
    onFinish();
  }
  function finish(reason){playback.finish(reason);clean();}
  function key(event){
    if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Escape','Enter',' '].includes(event.key))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(['Escape','Enter',' '].includes(event.key))finish('skip');
  }
  function pointer(event){if(skip.contains(event.target))return;event.preventDefault();event.stopImmediatePropagation();}
  function wheel(event){event.preventDefault();event.stopImmediatePropagation();}
  function visibility(){if(document.hidden)finish('background');}
  function hide(){finish('background');}
  function preference(){if(reduced.matches&&!poster?.active)finish('reduced-motion');}
  skip.onclick=()=>finish('skip');
  document.addEventListener('keydown',key,true);document.addEventListener('pointerdown',pointer,true);
  document.addEventListener('wheel',wheel,{capture:true,passive:false});
  document.addEventListener('visibilitychange',visibility);window.addEventListener('pagehide',hide);
  reduced.addEventListener('change',preference);
  const unsubscribe=app.native?.motion.onVisibility(visible=>{if(!visible)finish('background');});
  if(app.native)app.native.back=()=>finish('skip');
  // Failure to receive preferences must never trap the player behind an intro.
  const deadline=setTimeout(()=>finish('timeout'),12000);
  const ready=poster?Promise.all([Promise.resolve(app.native?.ready),poster.finished]).then(([snapshot])=>snapshot):Promise.resolve(app.native?.ready);
  ready.then(snapshot=>{
    if(baseline||snapshot?.opening===false)finish('restored');
    else if(reduced.matches||app.state.reducedMotion)finish('reduced-motion');
    else if(document.hidden)finish('background');
    else playback.ready();
  },()=>finish('unavailable'));
  return {
    get active(){return playback.active;},finish,
    warm(){playback.warm();},
    update(now,view){
      if(!playback.active)return null;
      if(app.state.reducedMotion&&!poster?.active){finish('reduced-motion');return null;}
      const seconds=playback.tick(now);
      if(!playback.active){clean();return null;}
      const sample=sampleOpening(seconds,view,dimensions);
      host.dataset.opening=sample.stage;
      sample.maskFeather=1+Math.min(view.width,view.height)*.16*smooth(1.8,2.55,seconds);
      layer.style.opacity=sample.ringAlpha;
      layer.style.transform=`translate(${sample.centerX}px,${sample.centerY}px)`;
      for(const [ring,size]of [[outer,sample.outerDiameter],[inner,sample.innerDiameter]]){ring.style.width=size+'px';ring.style.height=size+'px';}
      lcd.style.opacity=sample.lcdLevel;
      return sample;
    }
  };
}
