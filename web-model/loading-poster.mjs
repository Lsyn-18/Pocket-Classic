export const posterVersion='0.10.4';
export const loadingPosterMarkup=`<div id="loadingPoster" class="loading-poster" role="status" aria-live="polite"><div class="ambient-backdrop poster-backdrop" aria-hidden="true"></div><div class="poster-content"><svg class="poster-outline" width="55" height="92" viewBox="0 0 55 92" fill="none" aria-hidden="true"><rect x="1" y="1" width="53" height="90" rx="8"/><rect x="7" y="8" width="41" height="31" rx="2"/><circle cx="27.5" cy="65" r="17"/><circle cx="27.5" cy="65" r="6"/></svg><div class="poster-wordmark">POCKET CLASSIC</div><p class="poster-caption">让音乐，慢慢回到手中。</p><span class="sr-only">正在准备播放器，可跳过开场</span></div><div class="poster-progress" aria-hidden="true"><i></i></div></div>`;

// These are presentation times, never a claimed download percentage.
export function posterTiming({first=true,reduced=false,started=0,ready=0}={}){
  const fade=reduced?200:320;
  return {fade,start:reduced?ready:Math.max(started+(first?1400:600)-fade,ready+200)};
}
export function createLoadingPoster({baseline=false,preferences=Promise.resolve(),state={},storage,markReady,version=posterVersion}={}){
  const element=document.getElementById('loadingPoster'),started=performance.now(),query=matchMedia('(prefers-reduced-motion: reduce)');
  let done=false,warm=false,prefs=false,timer,first=true,resolve;
  if(!markReady)try{storage??=globalThis.localStorage;first=storage?.getItem('pocketclassic.poster')!==version;}catch{}
  const finished=new Promise(r=>{resolve=r;});
  function finish(){if(done)return;done=true;clearTimeout(timer);element?.remove();query.removeEventListener('change',preference);resolve();}
  function schedule(){
    if(done||!warm||!prefs)return;
    clearTimeout(timer);
    const timing=posterTiming({first,reduced:query.matches||state.reducedMotion,started,ready:performance.now()});
    element?.classList.add('is-ready');
    if(markReady)Promise.resolve(markReady(version)).catch(()=>{});
    else try{storage?.setItem('pocketclassic.poster',version);}catch{}
    timer=setTimeout(()=>{element?.classList.add('is-leaving');timer=setTimeout(finish,timing.fade);},Math.max(0,timing.start-performance.now()));
  }
  function preference(){if(query.matches&&warm&&prefs)schedule();}
  query.addEventListener('change',preference);
  Promise.resolve(preferences).then(snapshot=>{prefs=true;if(markReady)first=snapshot?.posterVersion!==version;if(baseline||snapshot?.opening===false)finish();else schedule();},finish);
  if(baseline)finish();
  return {finished,finish,get active(){return !done;},warm(){if(warm)return;warm=true;schedule();}};
}
