export function createNativePlatform(transport, host = window) {
  let sequence=0,playbackListener,connectionListener,lastSnapshot,transitioning=false,preferencesReady=false,lastPreferences='';
  const pending=new Map(),motionListeners=new Set(),visibilityListeners=new Set();
  function request(method,args={}) {
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      const timer=host.setTimeout(()=>{pending.delete(id);reject(Error('手机服务响应超时，请重试'));},45000);
      pending.set(id,{resolve,reject,timer});
      try{const message=JSON.stringify({id,method,args});if(message.length>1_900_000)throw Error('歌单过大，请选择较小的歌单');transport.postMessage(message);}catch(error){host.clearTimeout(timer);pending.delete(id);reject(error);}
    });
  }
  function fire(method,args={}) { request(method,args).catch(()=>{}); }
  const events=new EventTarget();
  let position=0,duration=NaN,volume=.65,paused=true,readyState=0,error=null;
  const audio={
    addEventListener:(...args)=>events.addEventListener(...args),
    get currentTime(){return position;},set currentTime(value){position=Math.max(0,Number(value)||0);fire('seek',{positionMs:Math.round(position*1000)});events.dispatchEvent(new Event('timeupdate'));},
    get duration(){return duration;},get paused(){return paused;},get readyState(){return readyState;},get error(){return error;},
    get volume(){return volume;},set volume(value){volume=Math.max(0,Math.min(1,Number(value)||0));fire('volume',{value:volume});events.dispatchEvent(new Event('volumechange'));},
    pause(){paused=true;fire('pause');events.dispatchEvent(new Event('pause'));},
    async play(){await request('play');paused=false;events.dispatchEvent(new Event('play'));},
    load(){},removeAttribute(){},
  };
  function snapshot(value) {
    if(transitioning)return;
    const previousPaused=paused,previousDuration=duration;
    position=Math.max(0,(value.positionMs||0)/1000);duration=value.durationMs>0?value.durationMs/1000:NaN;
    volume=Number.isFinite(value.volume)?value.volume:volume;paused=!value.playing;readyState=value.ready?4:value.buffering?2:0;
    error=value.error?{code:4,message:value.error}:null;
    lastSnapshot={...lastSnapshot,...value};
    playbackListener?.(lastSnapshot);
    events.dispatchEvent(new Event('timeupdate'));
    if(previousPaused!==paused)events.dispatchEvent(new Event(paused?'pause':'play'));
    if(previousDuration!==duration)events.dispatchEvent(new Event('durationchange'));
  }
  const platform={
    audio,request,get transitioning(){return transitioning;},beginTransition(){transitioning=true;},
    api:route=>request('api',{route}),openConnection:()=>request('connection'),
    async playQueue(tracks,index,mode,options){
      transitioning=true;
      try{const value=await request('queue',{tracks,index,mode,...options});transitioning=false;snapshot(value);}
      catch(error){transitioning=false;throw error;}
    },
    next:()=>request('next'),previous:()=>request('previous'),configure:options=>fire('configure',options),
    vibrate:()=>fire('haptic'),
    syncPreferences(value){if(!preferencesReady)return;const text=JSON.stringify(value);if(text!==lastPreferences){lastPreferences=text;fire('preferences',value);}},
    onPlayback(listener){playbackListener=listener;if(lastSnapshot)listener(lastSnapshot);},
    onConnection(listener){connectionListener=listener;},
    motion:{
      async requestPermission(){return (await request('motionAvailable')).available?'granted':'unsupported';},
      subscribe(listener){motionListeners.add(listener);fire('motion',{enabled:true});return()=>{motionListeners.delete(listener);if(!motionListeners.size)fire('motion',{enabled:false});};},
      onVisibility(listener){visibilityListeners.add(listener);return()=>visibilityListeners.delete(listener);},
    },
    receive(packet){
      if(packet.type==='response'){
        const task=pending.get(packet.id);if(!task)return;pending.delete(packet.id);host.clearTimeout(task.timer);
        if(packet.ok)task.resolve(packet.result);else task.reject(Error(packet.error||'手机操作暂时无法完成'));
      }else if(packet.type==='playback')snapshot(packet.value);
      else if(packet.type==='connection')connectionListener?.();
      else if(packet.type==='orientation')for(const listener of motionListeners)listener(packet.value);
      else if(packet.type==='lifecycle')for(const listener of visibilityListeners)listener(!!packet.visible);
    },
  };
  host.PocketClassicNative=platform;
  platform.ready=request('ready').then(value=>{snapshot(value);preferencesReady=true;return value;});
  return platform;
}
