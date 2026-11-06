import {createRoamStream} from './roam-stream.mjs';
import {createNativePlatform} from './native-platform.mjs';
import {createWheelInput} from './wheel-input.mjs';
import {coverUrl} from './artwork.mjs';
const native=window.PocketNative?createNativePlatform(window.PocketNative):null;
const $=id=>document.getElementById(id),audio=native?.audio||$('audio');
const state={page:'home',selected:0,history:[],playlists:[],tracks:[],tracksSource:'playlist',queue:[],queueMode:'playlist',queueIndex:0,current:null,connected:false,nickname:'',busy:false,hold:false,sleep:false,dark:false,haptics:true,shuffle:false,repeat:0,mode:'volume',title:'iPod',trial:false,noticeError:false,battery:{level:null,charging:false}};
let requestEpoch=0,playEpoch=0,loginTimer=null,lastPlayError='';if(!native)audio.volume=.65;
let queueEpoch=0,roamFill=null,roamNext=null,nativeInitialized=false;
const roamStream=createRoamStream(()=>api('roam'));
const home=['音乐','正在播放','随机播放歌曲','设置'];
const escapeText=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=seconds=>{const s=Math.floor(Math.max(0,Number(seconds)||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
function tick(){if(!state.haptics)return;if(native)native.vibrate();else if(navigator.vibrate)navigator.vibrate(5)}
async function api(route,body){if(native)return native.api(route);const response=await fetch('/api/'+route,{cache:'no-store',...(body!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'音乐服务暂不可用');return result}
function footer(message,error=false){state.noticeError=error;$('lcdFooter').textContent=message|| (state.connected?'网易云音乐 · '+state.nickname:'转动转轮浏览 · 中央键选择');$('lcdFooter').classList.toggle('error',error)}
function album(track,small=false){const colors=[['#304f48','#a1b49b'],['#94674f','#dcc09d'],['#3a526b','#aabdc9']][Math.abs(Number(track?.id)||0)%3],url=coverUrl(track?.cover);return '<div class="album'+(url?' has-cover':'')+'" style="background:linear-gradient(135deg,'+colors.join(',')+')'+(small?';width:62px;height:62px;min-width:62px':'')+'">'+(url&&!native?'<img src="'+escapeText(url)+'" alt="专辑封面" referrerpolicy="no-referrer">':'<i class="shine"></i>')+'</div>'}
function row(label,index,sub){return '<button class="row'+(index===state.selected?' active':'')+(sub!==undefined?' with-sub':'')+'" data-index="'+index+'" aria-selected="'+(index===state.selected)+'"><span class="text"><strong class="label">'+escapeText(label)+'</strong>'+(sub!==undefined?'<small>'+escapeText(sub)+'</small>':'')+'</span><span class="arrow">›</span></button>'}
function entries(){if(state.page==='home')return home.map(name=>({name}));if(state.page==='music')return [{name:'我的歌单',sub:'收藏与创建的歌单'},{name:'每日推荐',sub:'今天为你推荐的歌曲'},{name:'私人漫游',sub:'私人 FM · 连续发现音乐'}];if(state.page==='playlists')return state.playlists.map(p=>({name:p.name,sub:p.trackCount+' 首'}));if(state.page==='tracks')return state.tracks.map(t=>({name:t.name,sub:t.artist}));if(state.page==='settings')return [{name:'账号与连接',sub:state.connected?'已连接':'未连接'},{name:'触感反馈',sub:state.haptics?'开':'关'},{name:'随机播放',sub:state.queueMode==='roam'?'漫游自动续歌':state.shuffle?'开':'关'},{name:'循环模式',sub:state.queueMode==='roam'?'漫游自动续歌':['关闭','单曲','全部'][state.repeat]},{name:'机身颜色',sub:state.dark?'曜石黑':'银色'}];return []}
function render(){native?.syncPreferences({dark:state.dark,haptics:state.haptics});document.body.classList.toggle('dark',state.dark);document.body.classList.toggle('locked',state.hold);document.body.classList.toggle('sleep',state.sleep);$('title').textContent=state.title;$('playIndicator').style.display=!audio.paused?'block':'none';$('bottomMark').textContent=state.hold?'HOLD · 按键已锁定':'MUSIC. AT YOUR FINGERTIPS.';$('online').classList.toggle('online',state.connected);$('accountLabel').textContent=state.connected?'网易云已连接':'连接音乐';const screen=$('screen');
 if(state.page==='playing'){const t=state.current;if(!t){screen.innerHTML='<div class="empty">先从音乐菜单选择一首歌</div>'}else{screen.innerHTML='<div class="now"><div class="track-head">'+album(t)+'<div class="track-meta"><h2>'+escapeText(t.name)+'</h2><p>'+escapeText(t.artist)+'</p><small>'+(state.queueIndex+1)+' / '+state.queue.length+'</small></div></div><div><div class="progress-caption" id="caption"></div><div class="progress'+(state.mode==='seek'?' seek':'')+'"><i id="progressFill"></i></div><div class="times"><span id="elapsed">0:00</span><span id="remaining">−0:00</span></div><div class="volume-row"><span>音量</span><div class="progress"><i id="volumeFill"></i></div><span id="volumeText"></span></div></div></div>';updateProgress()}}
 else{const list=entries(),height=document.querySelector('.device').getBoundingClientRect().width*(state.page==='home'?.108:.122),visible=Math.max(1,Math.floor(screen.clientHeight/height)),start=Math.max(0,Math.min(state.selected-Math.floor(visible/2),list.length-visible));const menu='<div class="menu">'+list.slice(start,start+visible).map((e,i)=>row(e.name,start+i,e.sub)).join('')+(list.length===0?'<div class="empty">暂无内容</div>':'')+'</div>';screen.innerHTML=state.page==='home'?'<div class="home-split">'+menu+'<div class="preview-tile">'+album(state.current,true)+'<span>MUSIC</span></div></div>':menu;screen.querySelectorAll('[data-index]').forEach(e=>e.onclick=()=>{state.selected=Number(e.dataset.index);select()})}
 if(state.busy){const spin=document.createElement('div');spin.className='spinner';spin.setAttribute('aria-label','正在读取音乐');screen.append(spin)}footer()}
function updateProgress(){if(state.page!=='playing'||!state.current)return;const duration=Number.isFinite(audio.duration)?audio.duration:state.current.durationMs/1000;const progress=$('progressFill');if(progress)progress.style.width=Math.min(100,audio.currentTime/Math.max(duration,1)*100)+'%';if($('elapsed'))$('elapsed').textContent=format(audio.currentTime);if($('remaining'))$('remaining').textContent='−'+format(duration-audio.currentTime);if($('volumeFill'))$('volumeFill').style.width=Math.round(audio.volume*100)+'%';if($('volumeText'))$('volumeText').textContent=Math.round(audio.volume*100)+'%';if($('caption'))$('caption').textContent=state.trial?'试听片段':state.mode==='seek'?'转动转轮调整进度':'转动转轮调整音量'}
function navigate(page,title){state.history.push({page:state.page,title:state.title,selected:state.selected});state.page=page;state.title=title;state.selected=0;state.mode='volume';render()}
async function load(page,title,fn){const epoch=++requestEpoch;navigate(page,title);if(page==='tracks')state.tracks=[];state.busy=true;render();try{const result=await fn();if(epoch===requestEpoch){Object.assign(state,result);state.busy=false;render();if(page==='tracks'&&!state.tracks.length)footer('暂无推荐歌曲，按 MENU 返回后重试')}}catch(e){if(epoch===requestEpoch){state.busy=false;render();footer(e.message,true)}}}
async function library(){if(!state.connected)return openLogin();return load('playlists','我的歌单',async()=>({playlists:(await api('playlists')).playlists}))}
async function daily(){if(!state.connected)return openLogin();return load('tracks','每日推荐',async()=>({tracks:(await api('daily')).tracks,tracksSource:'daily'}))}
async function startRoam(){
 if(!state.connected)return openLogin();
 const request=++requestEpoch,epoch=++queueEpoch;roamStream.reset();roamFill=null;roamNext=null;++playEpoch;audio.pause();audio.removeAttribute('src');audio.load();
 state.queueMode='roam';state.queue=[];state.queueIndex=0;state.current=null;state.shuffle=false;state.repeat=0;lastPlayError='';
 navigate('playing','私人漫游');state.busy=true;render();
 try{const tracks=await roamStream.nextBatch();if(request!==requestEpoch||epoch!==queueEpoch)return;if(!tracks.length)throw Error('漫游暂时没有推荐，请按 MENU 返回重试');state.busy=false;await playAt(0,tracks,'roam')}
 catch(e){if(request===requestEpoch&&epoch===queueEpoch){state.busy=false;render();footer(e.message,true)}}
}
async function select(){if(state.hold||state.busy)return;if(state.sleep){state.sleep=false;render();return}tick();const index=state.selected;
 if(state.page==='home'){if(index===0)return navigate('music','音乐');if(index===1)return nowPlaying();if(index===2){if(!state.tracks.length)return library();state.shuffle=true;return playAt(Math.floor(Math.random()*state.tracks.length),state.tracks,state.tracksSource)}if(index===3)return navigate('settings','设置')}
 else if(state.page==='music'){if(index===0)return library();if(index===1)return daily();if(index===2)return startRoam()}
 else if(state.page==='playlists'){const p=state.playlists[index];if(p)return load('tracks',p.name,async()=>({tracks:(await api('tracks?id='+p.id)).tracks,tracksSource:'playlist'}))}
 else if(state.page==='tracks')return playAt(index,state.tracks,state.tracksSource);
 else if(state.page==='playing'){state.mode=state.mode==='volume'?'seek':'volume';render()}
 else if(state.page==='settings'){if(index===0)return openLogin();if(index===1)state.haptics=!state.haptics;if(index===2&&state.queueMode!=='roam')state.shuffle=!state.shuffle;if(index===3&&state.queueMode!=='roam')state.repeat=(state.repeat+1)%3;if(index===4)state.dark=!state.dark;if(index===2||index===3)native?.configure({shuffle:state.shuffle,repeat:state.repeat});render()}}
function nowPlaying(){if(!state.current){footer('先从音乐菜单选择一首歌');return}if(state.page!=='playing')navigate('playing',state.queueMode==='roam'?'私人漫游':'正在播放')}
async function playAt(index,queue=state.queue,mode=state.queueMode){if(!queue[index])return;
 native?.beginTransition();
 if(queue!==state.queue||mode!==state.queueMode){++queueEpoch;roamFill=null;roamNext=null;if(mode!=='roam')roamStream.reset()}
 const epoch=++playEpoch;audio.pause();audio.removeAttribute('src');audio.load();state.queue=queue;state.queueMode=mode;state.queueIndex=index;state.current=queue[index];state.trial=false;lastPlayError='';
 const title=mode==='roam'?'私人漫游':'正在播放';if(state.page!=='playing')navigate('playing',title);else state.title=title;
 render();footer('正在获取播放资源…');
 try{if(native){await native.playQueue(queue,index,mode,{shuffle:state.shuffle,repeat:state.repeat,volume:audio.volume});if(epoch!==playEpoch)return;render();footer();return;}const r=await api('resolve',{id:state.current.id});if(epoch!==playEpoch)return;if(!r.url)throw Error('账号或版权限制，暂无音源，请试试下一首');state.trial=!!r.trial;audio.src=r.url;audio.load();await audio.play();if(epoch!==playEpoch)return;render();footer(state.trial?'当前账号仅可试听':null);if(mode==='roam')refillRoam()}
 catch(e){if(epoch===playEpoch){lastPlayError=e.message;footer(e.message,true)}}
}
function refillRoam(){
 if(native)return Promise.resolve(false);
 if(state.queueMode!=='roam'||state.queue.length-state.queueIndex>2)return Promise.resolve(false);
 if(roamFill)return roamFill;
 const epoch=queueEpoch,queue=state.queue;
 const task=(async()=>{try{const tracks=await roamStream.nextBatch();if(epoch!==queueEpoch||state.queueMode!=='roam'||queue!==state.queue)return false;
   const existing=new Set(queue.map(t=>t.id));const fresh=tracks.filter(t=>!existing.has(t.id));queue.push(...fresh);
   if(state.queueIndex>40){const remove=state.queueIndex-20;queue.splice(0,remove);state.queueIndex-=remove}
   if(state.page==='playing'){render();if(!fresh.length)footer('暂无新推荐，按下一首可重试',true)}return fresh.length>0;
 }catch(e){if(epoch===queueEpoch&&state.queueMode==='roam'&&state.page==='playing')footer('漫游续歌暂不可用，按下一首重试',true);return false}})();
 roamFill=task;task.finally(()=>{if(roamFill===task)roamFill=null});return task;
}
function menu(home=false){if(state.hold)return;if(state.sleep){state.sleep=false;render();return}++requestEpoch;state.busy=false;if(home||!state.history.length){state.page='home';state.title='iPod';state.selected=0;state.history=[]}else Object.assign(state,state.history.pop());render()}
function rotate(delta){if(state.hold||state.busy)return;if(state.sleep){state.sleep=false;render();return}if(state.page==='playing'){tick();if(state.mode==='seek')seek(delta*3);else audio.volume=Math.max(0,Math.min(1,audio.volume+delta*.04));updateProgress()}else{const selected=Math.max(0,Math.min(entries().length-1,state.selected+delta));if(selected!==state.selected){state.selected=selected;tick();render()}}}
function seek(seconds){if(state.current&&Number.isFinite(audio.duration)){audio.currentTime=Math.max(0,Math.min(audio.duration,audio.currentTime+seconds));updateProgress()}}
async function toggle(){if(state.sleep){state.sleep=false;render();return}if(state.busy)return;if(state.page==='tracks')return select();if(!state.current){footer('先从音乐菜单选择一首歌');return}if(lastPlayError)return playAt(state.queueIndex);try{if(audio.paused)await audio.play();else audio.pause()}catch(e){footer('播放失败，请重新选择歌曲',true)}}
async function next(){if(state.busy||!state.queue.length)return;
 if(native)return native.next();
 if(state.queueMode==='roam'){
   if(state.queueIndex+1<state.queue.length)return playAt(state.queueIndex+1);
   if(roamNext)return roamNext;const epoch=queueEpoch;footer('正在续接漫游推荐…');
   const task=(async()=>{await refillRoam();if(epoch===queueEpoch&&state.queueMode==='roam'&&state.queueIndex+1<state.queue.length)return playAt(state.queueIndex+1)})();
   roamNext=task;task.finally(()=>{if(roamNext===task)roamNext=null});return task;
 }
 let index=state.queueIndex+1;if(state.shuffle&&state.queue.length>1){do{index=Math.floor(Math.random()*state.queue.length)}while(index===state.queueIndex)}if(index>=state.queue.length){if(state.repeat===2)index=0;else return}return playAt(index)
}
function previous(){if(native)return native.previous();if(audio.currentTime>3){audio.currentTime=0;return}if(state.queueIndex>0)playAt(state.queueIndex-1);else if(state.current)audio.currentTime=0}
function action(name,long=false){if(state.hold)return;if(state.sleep){state.sleep=false;render();return}if(long){if(name==='menu')return menu(true);if(name==='play'){audio.pause();state.sleep=true;render();return}if(name==='previous')return seek(-2);if(name==='next')return seek(2);if(name==='select'){$('moreTitle').textContent=state.current?.name||'更多操作';$('moreText').textContent='播放队列 '+state.queue.length+' 首。中央键可切换播放页的音量与进度模式。';$('moreDialog').showModal();return}}else{if(name==='select')return select();tick();if(name==='menu')return menu();if(name==='play')return toggle();if(name==='previous')return previous();if(name==='next')return next()}}
let gesture=null,holdTimer=null,seekTimer=null;
const clearTimers=()=>{clearTimeout(holdTimer);clearInterval(seekTimer)};
$('wheel').addEventListener('pointerdown',event=>{if(event.button!==0)return;const rect=$('wheel').getBoundingClientRect(),x=event.clientX-rect.left-rect.width/2,y=event.clientY-rect.top-rect.height/2;gesture={id:event.pointerId,angle:Math.atan2(y,x),sum:0,dial:createWheelInput(),moved:false,held:false,valid:Math.hypot(x,y)>rect.width*.19,action:event.target.closest('[data-action]')?.dataset.action};$('wheel').setPointerCapture(event.pointerId);holdTimer=setTimeout(()=>{if(gesture&&!gesture.moved){gesture.held=true;action(gesture.action,true);if(['previous','next'].includes(gesture.action))seekTimer=setInterval(()=>action(gesture?.action,true),180)}},480)});
$('wheel').addEventListener('pointermove',event=>{if(!gesture||gesture.id!==event.pointerId||!gesture.valid||state.hold)return;const rect=$('wheel').getBoundingClientRect(),a=Math.atan2(event.clientY-rect.top-rect.height/2,event.clientX-rect.left-rect.width/2);let delta=a-gesture.angle;while(delta>Math.PI)delta-=2*Math.PI;while(delta<-Math.PI)delta+=2*Math.PI;gesture.angle=a;gesture.sum+=delta;if(Math.abs(gesture.sum)>.065){gesture.moved=true;clearTimers()}const step=gesture.dial.move(delta,event.timeStamp);if(step)rotate(step)});
$('wheel').addEventListener('pointerup',()=>{clearTimers();if(gesture&&!gesture.moved&&!gesture.held)action(gesture.action);gesture=null});$('wheel').addEventListener('pointercancel',()=>{clearTimers();gesture=null});
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',e=>{if(e.detail===0)action(b.dataset.action)}));
$('hold').onclick=()=>{state.hold=!state.hold;render()};$('lcdFooter').onclick=()=>{if(lastPlayError&&state.current)playAt(state.queueIndex)};
document.addEventListener('keydown',event=>{if(document.querySelector('dialog[open]'))return;if(['ArrowDown','ArrowUp','Enter','Escape',' '].includes(event.key)){event.preventDefault();if(event.key==='ArrowDown')rotate(1);if(event.key==='ArrowUp')rotate(-1);if(event.key==='Enter')select();if(event.key==='Escape')menu();if(event.key===' '&&!state.hold)toggle()}});
audio.addEventListener('timeupdate',updateProgress);audio.addEventListener('durationchange',updateProgress);audio.addEventListener('volumechange',updateProgress);audio.addEventListener('play',()=>{$('playIndicator').style.display='block';if(!native&&'mediaSession'in navigator){const cover=coverUrl(state.current?.cover);navigator.mediaSession.metadata=new MediaMetadata({title:state.current?.name||'',artist:state.current?.artist||'',album:state.current?.album||'',artwork:cover?[{src:cover,sizes:'320x320'}]:[]})}});audio.addEventListener('pause',()=>{$('playIndicator').style.display='none'});audio.addEventListener('ended',()=>{if(state.repeat===1){audio.currentTime=0;audio.play().catch(()=>{})}else next()});audio.addEventListener('error',()=>{if(state.current&&audio.error){lastPlayError='音频暂时无法加载，点击这里重试';footer(lastPlayError,true)}});
if(!native&&'mediaSession'in navigator){for(const [name,handler]of Object.entries({play:()=>audio.play(),pause:()=>audio.pause(),nexttrack:next,previoustrack:previous,seekbackward:()=>seek(-10),seekforward:()=>seek(10)})){try{navigator.mediaSession.setActionHandler(name,handler)}catch{}}}
async function updateAccount(){const r=await api('status');state.connected=r.authenticated;state.nickname=r.nickname||'';if($('loginDialog').open){$('loginState').textContent=r.message;$('qrImage').hidden=!r.qrImage;if(r.qrImage)$('qrImage').src=r.qrImage;$('newQr').hidden=!!r.authenticated;$('clearSession').hidden=!r.authenticated;if(r.authenticated)clearInterval(loginTimer)}render();return r}
async function openLogin(){if(native)return native.openConnection();$('loginDialog').showModal();try{await updateAccount()}catch(e){$('loginState').textContent=e.message}}
$('account').onclick=openLogin;$('closeLogin').onclick=()=>{$('loginDialog').close();clearInterval(loginTimer)};$('newQr').onclick=async()=>{try{$('newQr').disabled=true;await api('qr',{});await updateAccount();clearInterval(loginTimer);loginTimer=setInterval(()=>updateAccount().catch(e=>{$('loginState').textContent=e.message}),3000)}catch(e){$('loginState').textContent=e.message}finally{$('newQr').disabled=false}};
$('clearSession').onclick=async()=>{audio.pause();++playEpoch;++requestEpoch;++queueEpoch;roamStream.reset();roamFill=null;roamNext=null;await api('logout',{});state.connected=false;state.nickname='';state.current=null;state.queue=[];state.queueMode='playlist';state.playlists=[];state.tracks=[];audio.removeAttribute('src');$('newQr').hidden=false;await updateAccount();menu(true)};$('goPlaying').onclick=()=>{$('moreDialog').close();nowPlaying()};$('closeMore').onclick=()=>{$('moreDialog').close()};
function updateBattery(value){const level=Number.isFinite(value?.level)?Math.max(0,Math.min(1,value.level)):null;state.battery={level,charging:!!value?.charging};$('battery').classList.toggle('charging',state.battery.charging);$('battery').classList.toggle('low',level!==null&&level<=.15);$('batteryLevel').style.width=level===null?'0%':Math.round(level*100)+'%';$('battery').setAttribute('aria-label',level===null?'电量不可用':Math.round(level*100)+'%'+(value.charging?' · 正在充电':''));$('battery').title=level===null?'当前环境不提供电量':Math.round(level*100)+'%';}
updateBattery(state.battery);
if(native)native.onBattery(updateBattery);
else if(navigator.getBattery)navigator.getBattery().then(b=>{const update=()=>updateBattery(b);update();b.addEventListener('levelchange',update);b.addEventListener('chargingchange',update)}).catch(()=>{});
render();
if(native){
 native.onConnection(()=>{++requestEpoch;state.busy=false;state.tracks=[];state.playlists=[];menu(true);updateAccount().catch(e=>footer(e.message,true));});
 native.onPlayback(value=>{
   if(state.busy)return;
   const changed=state.current?.id!==value.current?.id||state.queueIndex!==value.index||state.queue.length!==value.count;
   if(value.tracks)state.queue=value.tracks;state.queueIndex=value.index||0;state.current=value.current||null;state.queueMode=value.mode||'playlist';state.shuffle=!!value.shuffle;state.repeat=value.repeat||0;
   if(!nativeInitialized){state.dark=!!value.dark;state.haptics=value.haptics!==false;if(state.current)navigate('playing',state.queueMode==='roam'?'私人漫游':'正在播放');nativeInitialized=true;render();}
   state.trial=!!state.current&&value.durationMs>0&&value.durationMs+2000<state.current.durationMs;
   if(changed){lastPlayError='';if(state.page==='playing')state.title=state.queueMode==='roam'?'私人漫游':'正在播放';render();}
   if(value.error){lastPlayError=value.error;footer(value.error,true);}else updateProgress();
 });
 native.ready.then(()=>updateAccount()).catch(e=>footer(e.message,true));
 native.back=()=>{const dialog=document.querySelector('dialog[open]');if(dialog){dialog.close();return;}if(document.body.classList.contains('options-open')){$('playerOptionsToggle').click();return;}if(state.page!=='home')menu();else native.request('finish');};
}else if(location.protocol!=='file:')updateAccount().catch(e=>footer('音乐服务暂不可用，请检查电脑服务',true));
window.PocketClassicContext={state,audio,native,entries,format,action,rotate,select,render,footerText:()=>$('lcdFooter').textContent};
