export function createNativePlatform(transport, host = window) {
  let sequence=0,playbackListener,connectionListener,batteryListener,lastBattery,lastHeadphones,lastSnapshot,transitioning=false,preferencesReady=false,lastPreferences='';
  const pending=new Map(),motionListeners=new Set(),visibilityListeners=new Set(),headphoneListeners=new Set();
  function headphones(value){lastHeadphones={available:value?.available!==false,connected:!!value?.connected,kind:['wired','usb','bluetooth'].includes(value?.kind)?value.kind:'none'};for(const listener of headphoneListeners)listener(lastHeadphones);}
  function request(method,args={}) {
    const id=++sequence;
    return new Promise((resolve,reject)=>{
      const library=method==='api'&&(args.route==='playlists'||/^tracks\?id=/.test(args.route));
      const timer=host.setTimeout(()=>{pending.delete(id);reject(Error('手机服务响应超时，请重试'));},['localScan','localImport','localFolder'].includes(method)?600000:library?120000:45000);
      pending.set(id,{resolve,reject,timer});
      try{const message=JSON.stringify({id,method,args});if(message.length>1_900_000)throw Error('歌单过大，请选择较小的歌单');transport.postMessage(message);}catch(error){host.clearTimeout(timer);pending.delete(id);reject(error);}
    });
  }
  function fire(method,args={}) { request(method,args).catch(()=>{}); }
  const events=new EventTarget();
  let position=0,duration=NaN,volume=0,volumeStep=0,paused=true,readyState=0,error=null;
  let volumeTarget=null,volumeBusy=false,volumeGeneration=0;
  function systemVolume(value,apply=volumeTarget===null){
    if(Number.isFinite(value.volumeStep))volumeStep=Math.max(0,Math.min(1,value.volumeStep));
    if(!apply||!Number.isFinite(value.volume))return;
    const actual=Math.max(0,Math.min(1,value.volume));
    if(actual!==volume){volume=actual;events.dispatchEvent(new Event('volumechange'));}
  }
  async function flushVolume(){
    if(volumeBusy||volumeTarget===null)return;
    const target=volumeTarget,generation=volumeGeneration;volumeBusy=true;
    try{
      const actual=await request('volume',{value:target});
      if(generation===volumeGeneration){volumeTarget=null;systemVolume(actual);}
      else systemVolume(actual,false);
    }catch{if(generation===volumeGeneration)volumeTarget=null;}
    finally{volumeBusy=false;if(volumeTarget!==null)flushVolume();}
  }
  let seeking=false,seekTarget=null,seekBusy=false,seekGeneration=0,seekSettleUntil=0;
  function resetSeek(){seeking=false;seekTarget=null;++seekGeneration;}
  async function flushSeek(){
    if(seekBusy||seekTarget===null)return;
    const target=seekTarget,generation=seekGeneration;seekBusy=true;
    try{await request('seek',{positionMs:Math.round(target*1000)});}
    catch{if(generation===seekGeneration)seekTarget=null;}
    finally{seekBusy=false;if(seekTarget!==null&&(generation!==seekGeneration||seekTarget!==target))flushSeek();}
  }
  const audio={
    addEventListener:(...args)=>events.addEventListener(...args),
    get currentTime(){return position;},set currentTime(value){position=Math.max(0,Number(value)||0);seekTarget=position;seekSettleUntil=Date.now()+1500;flushSeek();events.dispatchEvent(new Event('timeupdate'));},
    beginSeek(){seeking=true;},endSeek(){seeking=false;seekSettleUntil=Date.now()+1500;},
    get duration(){return duration;},get paused(){return paused;},get readyState(){return readyState;},get error(){return error;},
    get volumeStep(){return volumeStep;},
    get volume(){return volume;},set volume(value){const next=Math.max(0,Math.min(1,Number(value)||0));if(next===volume&&volumeTarget===null)return;volume=next;volumeTarget=next;++volumeGeneration;events.dispatchEvent(new Event('volumechange'));flushVolume();},
    pause(){paused=true;fire('pause');events.dispatchEvent(new Event('pause'));},
    async play(){await request('play');paused=false;events.dispatchEvent(new Event('play'));},
    load(){},removeAttribute(){},
  };
  function snapshot(value) {
    // Phone media volume is independent of playback/queue transitions.
    systemVolume(value);
    if(transitioning)return;
    const previousPaused=paused,previousDuration=duration;
    const changed=lastSnapshot&&(Object.hasOwn(value,'current')&&value.current?.id!==lastSnapshot.current?.id||value.index!==undefined&&value.index!==lastSnapshot.index);
    if(changed)resetSeek();
    const reported=Math.max(0,(value.positionMs||0)/1000);
    // Media3 snapshots already in transit must not rewind the optimistic scrub.
    if(seekTarget===null||!seeking&&(!seekBusy&&Math.abs(reported-seekTarget)<1||Date.now()>seekSettleUntil)){position=reported;if(!seeking)seekTarget=null;}
    duration=value.durationMs>0?value.durationMs/1000:NaN;
    paused=!value.playing;readyState=value.ready?4:value.buffering?2:0;
    error=value.error?{code:4,message:value.error}:null;
    lastSnapshot={...lastSnapshot,...value};
    playbackListener?.(lastSnapshot);
    events.dispatchEvent(new Event('timeupdate'));
    if(previousPaused!==paused)events.dispatchEvent(new Event(paused?'pause':'play'));
    if(previousDuration!==duration)events.dispatchEvent(new Event('durationchange'));
  }
  const platform={
    audio,request,get transitioning(){return transitioning;},beginTransition(){resetSeek();transitioning=true;},
    api:route=>request('api',{route}),openConnection:()=>request('connection'),
    posterReady:version=>request('posterReady',{version}),
    localAction:(method,category)=>request(method,{category}),
    async playQueue(tracks,index,mode,options){
      resetSeek();transitioning=true;
      const {volume:ignoredVolume,...playbackOptions}=options||{};
      try{const value=await request('queue',{tracks:mode==='local'?tracks.map(t=>({id:t.id})):tracks,index,mode,...playbackOptions});transitioning=false;snapshot(value);}
      catch(error){transitioning=false;throw error;}
    },
    next:()=>request('next'),previous:()=>request('previous'),configure:options=>fire('configure',options),
    vibrate:()=>fire('haptic'),
    artwork:async url=>(await request('artwork',{url})).dataUrl,
    onBattery(listener){batteryListener=listener;if(lastBattery)listener(lastBattery);},
    onHeadphones(listener){headphoneListeners.add(listener);if(lastHeadphones)listener(lastHeadphones);return()=>headphoneListeners.delete(listener);},
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
      else if(packet.type==='battery'){lastBattery=packet.value;batteryListener?.(lastBattery);}
      else if(packet.type==='headphones')headphones(packet.value);
      else if(packet.type==='orientation')for(const listener of motionListeners)listener(packet.value);
      else if(packet.type==='lifecycle')for(const listener of visibilityListeners)listener(!!packet.visible);
    },
  };
  host.PocketClassicNative=platform;
  platform.ready=request('ready').then(value=>{if(value.battery){lastBattery=value.battery;batteryListener?.(lastBattery);}if(value.headphones)headphones(value.headphones);snapshot(value);preferencesReady=true;return value;});
  return platform;
}
