import {createRoamStream} from './roam-stream.mjs';
import {createNativePlatform} from './native-platform.mjs';
import {createWheelInput} from './wheel-input.mjs';
import {createButtonPress} from './button-press.mjs';
import {coverUrl} from './artwork.mjs';
import {menuMarker,listWindow,emptyContent,qualityLabel,appearanceIsDark,canAdvance,playbackGlyph} from './presentation.mjs';
const native=window.PocketNative?createNativePlatform(window.PocketNative):null;
const $=id=>document.getElementById(id),audio=native?.audio||$('audio');
const qualities=[{id:'standard',name:'标准',sub:'优先标准音质'},{id:'exhigh',name:'极高',sub:'优先 320 kbps'},{id:'lossless',name:'无损',sub:'需账号与歌曲支持'},{id:'hires',name:'Hi-Res',sub:'需账号与歌曲支持'}];
const qualityValue=value=>qualities.some(q=>q.id===value)?value:'standard';
const state={page:'home',selected:0,history:[],playlists:[],tracks:[],tracksSource:'playlist',queue:[],queueMode:'playlist',queueIndex:0,current:null,connected:false,nickname:'',busy:false,hold:false,sleep:false,dark:false,haptics:true,shuffle:false,repeat:0,mode:'volume',title:'iPod',trial:false,noticeError:false,battery:{level:null,charging:false}};
let requestEpoch=0,playEpoch=0,loginTimer=null,lastPlayError='';if(!native)audio.volume=.65;
let queueEpoch=0,roamFill=null,roamNext=null,nativeInitialized=false;
Object.assign(state,{artists:[],artistOffset:0,artistMore:false,artistId:0,tracksMore:false,tracksOffset:0,quality:'standard',localTracks:[],localCategory:'device',localPermission:false});
if(!native)try{state.quality=qualityValue(window.localStorage?.getItem('pocketclassic.quality'))}catch{}
const roamStream=createRoamStream(()=>api('roam'));
Object.assign(state,{theme:'auto',largeText:false,reducedMotion:false,reader:false,buffering:false,actualQuality:'',problem:null,feedback:'',seeking:0});
if(!native)try{const saved=JSON.parse(window.localStorage?.getItem('pocketclassic.appearance')||'{}');for(const key of ['dark','largeText','reducedMotion'])if(typeof saved[key]==='boolean')state[key]=saved[key];if(['auto','light','dark'].includes(saved.theme))state.theme=saved.theme;}catch{}
const systemTheme=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
systemTheme?.addEventListener('change',()=>render());
const home=['音乐','正在播放','随机播放歌曲','设置'];
const music=[{id:'liked',name:'喜欢的音乐',sub:'网易云红心歌曲'},{id:'playlists',name:'我的歌单',sub:'创建与收藏的歌单'},{id:'netease',name:'网易云已下载',sub:'导入下载文件 · 离线播放'},{id:'device',name:'手机本地音乐',sub:'扫描手机音频 · 离线播放'},{id:'daily',name:'每日推荐',sub:'今天为你推荐的歌曲'},{id:'roam',name:'私人漫游',sub:'私人 FM · 连续发现音乐'},{id:'artists',name:'关注的歌手',sub:'网易云收藏 / 订阅的歌手'}];
function updatePlayIndicator(){const glyph=playbackGlyph(state.current,audio.paused),icon=$('playIndicator');icon.style.display=glyph?'block':'none';icon.innerHTML=glyph==='pause'?'<path fill="currentColor" d="M2 1H5V11H2ZM7 1H10V11H7Z"/>':'<path fill="currentColor" d="M2 0 11 6 2 12Z"/>';icon.setAttribute('aria-label',glyph==='pause'?'暂停':'播放');}
let retryAction=null,feedbackTimer,lastAppearance='';
function clearNotice(){state.problem=null;state.noticeError=false;}
function feedback(message){state.feedback=message;$('uiAnnouncement').textContent=message;clearTimeout(feedbackTimer);feedbackTimer=setTimeout(()=>{state.feedback='';},1800);}
function persistAppearance(){if(!native)try{const value=JSON.stringify({dark:state.dark,theme:state.theme,largeText:state.largeText,reducedMotion:state.reducedMotion});if(value!==lastAppearance){window.localStorage?.setItem('pocketclassic.appearance',value);lastAppearance=value;}}catch{}}
const escapeText=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=seconds=>{const s=Math.floor(Math.max(0,Number(seconds)||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
function tick(){if(!state.haptics)return;if(native)native.vibrate();else if(navigator.vibrate)navigator.vibrate(5)}
async function api(route,body){if(native)return native.api(route);const response=await fetch('/api/'+route,{cache:'no-store',...(body!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Error(result.error||'音乐服务暂不可用');return result}
function footer(message,error=false){if(error){state.noticeError=true;state.problem={message,login:/登录|授权|连接网易云/.test(message)};renderReader();}else if(message){clearNotice();}const value=state.problem?.message||message||(state.connected?'MENU 返回 · 长按中央键打开队列':'转轮浏览 · 屏幕也可点选');$('lcdFooter').textContent=value;$('lcdFooter').classList.toggle('error',state.noticeError);if(error)$('uiAnnouncement').textContent=message;}
function album(track,small=false){const colors=[['#304f48','#a1b49b'],['#94674f','#dcc09d'],['#3a526b','#aabdc9']][Math.abs(Number(track?.id)||0)%3],url=coverUrl(track?.cover);return '<div class="album'+(url?' has-cover':'')+'" style="background:linear-gradient(135deg,'+colors.join(',')+')'+(small?';width:62px;height:62px;min-width:62px':'')+'">'+(url&&!native?'<img src="'+escapeText(url)+'" alt="专辑封面" referrerpolicy="no-referrer">':'<i class="shine"></i>')+'</div>'}
function row(label,index,sub,item={}){return '<button class="row'+(index===state.selected?' active':'')+(sub!==undefined?' with-sub':'')+'" data-index="'+index+'" aria-current="'+(index===state.selected)+'"><span class="text"><strong class="label">'+escapeText(label)+'</strong>'+(sub!==undefined?'<small>'+escapeText(sub)+'</small>':'')+'</span><span class="arrow" aria-hidden="true">'+menuMarker(state.page,item,index,state)+'</span></button>'}
function entries(){
 if(state.page==='home')return home.map(name=>({name}));
 if(state.page==='music')return music;
 if(state.page==='local'){const tracks=state.localTracks.filter(t=>(t.category||'device')===state.localCategory),netease=state.localCategory==='netease';return [{name:netease?'扫描网易云下载':'扫描手机音乐',sub:state.localPermission?'已有 '+tracks.length+' 首 · 点击重新扫描':'允许读取手机音频，或手动导入',localAction:'localScan'},{name:'导入音乐文件',sub:netease?'NCM / MP3 / FLAC · 保存离线副本':'MP3 / FLAC / M4A / WAV 等',localAction:'localImport'},{name:'导入音乐文件夹',sub:netease?'私有缓存需先导出 · 保存离线副本':'包含子文件夹 · 保存离线副本',localAction:'localFolder'},...tracks.map(t=>({...t,sub:[t.artist,t.format].filter(Boolean).join(' · ')}))];}
 if(state.page==='playlists')return state.playlists.map(p=>({name:p.name,sub:p.trackCount+' 首'}));
 if(state.page==='artists')return [...state.artists.map(a=>({name:a.name,sub:a.songCount?a.songCount+' 首歌曲':'查看歌手歌曲'})),...(state.artistMore?[{name:'加载更多歌手',sub:'继续读取关注列表'}]:[])];
 if(state.page==='tracks')return [...state.tracks.map(t=>({id:t.id,name:t.name,sub:t.artist})),...(state.tracksMore?[{name:'加载更多歌曲',sub:'继续读取歌手歌曲',more:true}]:[])];
 if(state.page==='queue')return state.queue.map(t=>({id:t.id,name:t.name,sub:t.artist}));
 if(state.page==='quality')return qualities.map(q=>({id:q.id,name:q.name,sub:q.sub}));
 if(state.page==='appearance')return [{name:'环境主题',sub:({auto:'跟随系统',light:'明亮',dark:'深色'})[state.theme]},{name:'大字菜单',sub:state.largeText?'开':'关'},{name:'减少动态效果',sub:state.reducedMotion?'开':'关'}];
 if(state.page==='settings')return [{name:'账号与连接',sub:state.connected?state.nickname:'未连接'},{name:'触感反馈'},{name:'随机播放',sub:state.queueMode==='roam'?'漫游按推荐顺序播放':undefined},{name:'循环模式',sub:state.queueMode==='roam'?'漫游持续发现新歌':undefined},{name:'机身颜色',sub:state.dark?'石墨黑':'银色'},{name:'音质选择',sub:qualities.find(q=>q.id===state.quality).name+' · 首选音质'},{name:'显示与动态效果',sub:'环境主题 · 大字 · 减少动态'},{name:'使用帮助',sub:'转轮、按键与直接点选'}];return [];
}
function render(){native?.syncPreferences({dark:state.dark,haptics:state.haptics,quality:state.quality,theme:state.theme,largeText:state.largeText,reducedMotion:state.reducedMotion});persistAppearance();document.body.classList.toggle('dark',appearanceIsDark(state.theme,systemTheme?.matches));document.body.classList.toggle('graphite',state.dark);document.body.classList.toggle('large-text',state.largeText);document.body.classList.toggle('reduce-motion',state.reducedMotion);document.body.classList.toggle('connected',state.connected);document.body.classList.toggle('locked',state.hold);document.body.classList.toggle('sleep',state.sleep);$('title').textContent=state.title;updatePlayIndicator();$('bottomMark').textContent=state.hold?'HOLD · 按键已锁定':'MUSIC. AT YOUR FINGERTIPS.';$('online').classList.toggle('online',state.connected);$('accountLabel').textContent=state.connected?'账号':'连接网易云';$('account').setAttribute('aria-label',state.connected?'网易云账号：'+state.nickname:'连接网易云音乐');const screen=$('screen');
 if(state.page==='playing'){const t=state.current;if(!t){screen.innerHTML='<div class="empty">先从音乐菜单选择一首歌</div>'}else{screen.innerHTML='<div class="now"><div class="track-head">'+album(t)+'<div class="track-meta"><h2>'+escapeText(t.name)+'</h2><p>'+escapeText(t.artist)+'</p><small>'+(state.queueIndex+1)+' / '+state.queue.length+'</small></div></div><div><div class="progress-caption" id="caption"></div><div class="progress'+(state.mode==='seek'?' seek':'')+'"><i id="progressFill"></i></div><div class="times"><span id="elapsed">0:00</span><span id="remaining">−0:00</span></div><div class="volume-row"><span>音量</span><div class="progress"><i id="volumeFill"></i></div><span id="volumeText"></span></div></div></div>';updateProgress()}}
 else{const list=entries(),{visible,start}=listWindow(state,list.length);const menu='<div class="menu">'+list.slice(start,start+visible).map((e,i)=>row(e.name,start+i,e.sub,e)).join('')+(list.length===0?'<div class="empty">'+emptyContent(state.page).map(escapeText).join('<br>')+'</div>':'')+'</div>';screen.innerHTML=state.page==='home'?'<div class="home-split">'+menu+'<div class="preview-tile">'+album(state.current,true)+'<span>MUSIC</span></div></div>':menu;screen.querySelectorAll('[data-index]').forEach(e=>e.onclick=()=>{state.selected=Number(e.dataset.index);select()})}
 if(state.busy){const spin=document.createElement('div');spin.className='spinner';spin.setAttribute('aria-label','正在读取音乐');screen.append(spin)}footer(state.page==='quality'&&!state.problem?'首选音质 · 按账号和歌曲权限提供':null);renderReader();}
function renderReader(force=false){
 const panel=$('readerContent');if(!panel||!force&&!$('readerDialog').open)return;const samePage=panel.dataset.page===state.page,focusIndex=document.activeElement?.dataset?.readerIndex;panel.dataset.page=state.page;let body='';
 if(state.problem){body='<div class="reader-message"><h3>暂时未能完成</h3><p>'+escapeText(state.problem.message)+'</p><div class="reader-actions"><button class="primary" id="readerRetry">'+(state.problem.login?'重新连接':'重试')+'</button><button id="readerRecover">'+(canAdvance(state)?'下一首':'返回列表')+'</button></div></div>';}
 else if(state.busy)body='<p role="status">正在读取'+escapeText(state.title)+'…</p>';
 else if(state.page==='playing'&&state.current){body='<h3>'+escapeText(state.current.name)+'</h3><p>'+escapeText(state.current.artist)+'</p><p>'+escapeText(state.current.album)+'</p><p id="readerProgress"></p><div class="reader-actions"><button id="readerPlay">'+(audio.paused?'播放':'暂停')+'</button><button id="readerQueue">播放队列 · '+state.queue.length+' 首</button></div><p>首选 '+qualityLabel(state.quality)+(state.actualQuality?' · 当前 '+qualityLabel(state.actualQuality):' · 当前音质以可用资源为准')+'</p>';}
 else {const list=entries();body=list.length?list.map((item,index)=>{const marker=menuMarker(state.page,item,index,state),suffix=marker==='▶'?'正在播放':marker==='✓'?'已选择':['开','关','关闭','单曲','全部'].includes(marker)?marker:'';return '<button class="reader-row" data-reader-index="'+index+'" aria-label="'+escapeText([item.name,item.sub,suffix].filter(Boolean).join('，'))+'" aria-current="'+(index===state.selected)+'"><span>'+escapeText(item.name)+(item.sub?'<small>'+escapeText(item.sub)+'</small>':'')+'</span><span aria-hidden="true">'+marker+'</span></button>';}).join(''):'<h3>'+emptyContent(state.page)[0]+'</h3><p>'+emptyContent(state.page)[1]+'</p>';}
 panel.innerHTML=body;$('readerTitle').textContent=state.title;panel.querySelectorAll('[data-reader-index]').forEach(button=>button.onclick=()=>{state.selected=Number(button.dataset.readerIndex);select();});
 if($('readerRetry'))$('readerRetry').onclick=retryProblem;if($('readerPlay'))$('readerPlay').onclick=()=>toggle().then(()=>renderReader());if($('readerQueue'))$('readerQueue').onclick=openQueue;
 if($('readerRecover'))$('readerRecover').onclick=()=>canAdvance(state)?next():menu();
 if(samePage&&focusIndex!==undefined)panel.querySelector('[data-reader-index="'+focusIndex+'"]')?.focus();else if($('readerDialog').open)$('readerTitle').focus?.();
}
function openQueue(){if(!state.queue.length){feedback('先选择一首歌，队列会显示在这里');return;}navigate('queue','播放队列');state.selected=state.queueIndex;render();}
function openReader(){renderReader(true);state.reader=true;$('readerDialog').showModal();}
function openHelp(){stopSeeking();const dialog=$('helpDialog');dialog.showModal();dialog.scrollTop=0;$('helpTitle').focus?.({preventScroll:true});}
async function retryProblem(){const login=state.problem?.login;clearNotice();render();if(login)return openLogin();if(retryAction)return retryAction();if(state.current)return playAt(state.queueIndex);return updateAccount().catch(e=>footer(e.message,true));}
function screenAction(name){if(name==='retry')return retryProblem();if(name==='back')return menu();if(name==='next')return next();if(name==='queue')return openQueue();if(name==='details')return openReader();if(name==='mode'){state.mode=state.mode==='seek'?'volume':'seek';feedback(state.mode==='seek'?'正在调整播放进度':'正在调整音量');render();}}
function updateProgress(){if(state.page!=='playing'||!state.current)return;const duration=Number.isFinite(audio.duration)?audio.duration:state.current.durationMs/1000;const progress=$('progressFill');if(progress)progress.style.width=Math.min(100,audio.currentTime/Math.max(duration,1)*100)+'%';if($('elapsed'))$('elapsed').textContent=format(audio.currentTime);if($('remaining'))$('remaining').textContent='−'+format(duration-audio.currentTime);if($('volumeFill'))$('volumeFill').style.width=Math.round(audio.volume*100)+'%';if($('volumeText'))$('volumeText').textContent=Math.round(audio.volume*100)+'%';if($('caption'))$('caption').textContent=state.trial?'试听片段':state.mode==='seek'?'转动转轮调整进度':'转动转轮调整音量'}
function navigate(page,title){clearNotice();state.history.push({page:state.page,title:state.title,selected:state.selected});state.page=page;state.title=title;state.selected=0;state.mode='volume';render()}
async function load(page,title,fn){const epoch=++requestEpoch;navigate(page,title);retryAction=()=>{menu();return load(page,title,fn);};if(page==='tracks'){state.tracks=[];state.tracksMore=false;state.tracksOffset=0}if(page==='artists'){state.artists=[];state.artistMore=false;state.artistOffset=0}state.busy=true;render();try{const result=await fn();if(epoch===requestEpoch){Object.assign(state,result);state.busy=false;render();if(page==='tracks'&&!state.tracks.length)footer('暂无歌曲，按 MENU 返回后重试');if(page==='artists'&&!state.artists.length)footer('暂无关注歌手，可先在网易云收藏歌手')}}catch(e){if(epoch===requestEpoch){state.busy=false;render();footer(e.message,true)}}}
async function library(){if(!state.connected)return openLogin();return load('playlists','我的歌单',async()=>({playlists:(await api('playlists')).playlists}))}
async function liked(){if(!state.connected)return openLogin();return load('tracks','喜欢的音乐',async()=>{const r=await api('liked?offset=0');return {tracks:r.tracks,tracksMore:!!r.more,tracksOffset:r.nextOffset,tracksSource:'liked'};});}
async function localLibrary(category){state.localCategory=category;return load('local',category==='netease'?'网易云已下载':'手机本地音乐',async()=>{if(!native)return {localTracks:[],localPermission:false};const r=await api('local');return {localTracks:r.tracks||[],localPermission:!!r.permissionGranted};});}
async function localAction(method){if(!native){feedback('请使用安卓客户端扫描或导入手机音乐');return;}const epoch=++requestEpoch;clearNotice();state.busy=true;render();try{const r=await native.localAction(method,state.localCategory);if(epoch!==requestEpoch)return;state.localTracks=r.tracks||[];state.localPermission=!!r.permissionGranted;state.busy=false;state.selected=Math.min(state.selected,entries().length-1);render();footer(r.message||'已下载音乐可直接离线播放');}catch(e){if(epoch===requestEpoch){state.busy=false;render();footer(e.message,true);}}}
async function daily(){if(!state.connected)return openLogin();return load('tracks','每日推荐',async()=>({tracks:(await api('daily')).tracks,tracksSource:'daily'}))}
async function artists(){if(!state.connected)return openLogin();return load('artists','关注的歌手',async()=>{const r=await api('artists?offset=0');return {artists:r.artists,artistOffset:r.nextOffset,artistMore:r.more}})}
async function artistTracks(artist){return load('tracks',artist.name,async()=>{const r=await api('artist-tracks?id='+artist.id+'&offset=0');return {tracks:r.tracks,tracksMore:r.more,tracksOffset:r.nextOffset,artistId:artist.id,tracksSource:'artist'}})}
async function appendRows(field,route,offsetKey,moreKey){
 const epoch=++requestEpoch;retryAction=()=>appendRows(field,route,offsetKey,moreKey);clearNotice();state.busy=true;render();
 try{const r=await api(route);if(epoch!==requestEpoch)return;const previous=state[field],seen=new Set(previous.map(x=>x.id));state[field]=[...previous,...r[field].filter(x=>!seen.has(x.id)&&seen.add(x.id))].slice(0,5000);state[offsetKey]=r.nextOffset;state[moreKey]=!!r.more&&state[field].length<5000;state.selected=Math.max(0,Math.min(state.selected,entries().length-1));state.busy=false;render()}
 catch(e){if(epoch===requestEpoch){state.busy=false;render();footer(e.message,true)}}
}
async function startRoam(){
 if(!state.connected)return openLogin();
 const request=++requestEpoch,epoch=++queueEpoch;roamStream.reset();roamFill=null;roamNext=null;++playEpoch;audio.pause();audio.removeAttribute('src');audio.load();
 state.queueMode='roam';state.queue=[];state.queueIndex=0;state.current=null;state.shuffle=false;state.repeat=0;lastPlayError='';
 navigate('playing','私人漫游');state.busy=true;render();
 try{const tracks=await roamStream.nextBatch();if(request!==requestEpoch||epoch!==queueEpoch)return;if(!tracks.length)throw Error('漫游暂时没有推荐，请按 MENU 返回重试');state.busy=false;await playAt(0,tracks,'roam')}
 catch(e){if(request===requestEpoch&&epoch===queueEpoch){state.busy=false;render();footer(e.message,true)}}
}
async function select(){if(state.hold||state.busy)return;if(state.sleep){state.sleep=false;render();return}tick();const index=state.selected;
 if(state.problem)return retryProblem();
 if(state.page==='home'){if(index===0)return navigate('music','音乐');if(index===1)return nowPlaying();if(index===2){const tracks=state.queueMode==='local'?state.queue:state.tracks;if(!tracks.length)return library();state.shuffle=true;return playAt(Math.floor(Math.random()*tracks.length),tracks,state.queueMode==='local'?'local':state.tracksSource)}if(index===3)return navigate('settings','设置')}
 else if(state.page==='music'){const id=music[index]?.id;if(id==='liked')return liked();if(id==='playlists')return library();if(id==='netease'||id==='device')return localLibrary(id);if(id==='daily')return daily();if(id==='roam')return startRoam();if(id==='artists')return artists()}
 else if(state.page==='local'){const item=entries()[index];if(item?.localAction)return localAction(item.localAction);const tracks=state.localTracks.filter(t=>(t.category||'device')===state.localCategory);if(index>=3)return playAt(index-3,tracks,'local');}
 else if(state.page==='playlists'){const p=state.playlists[index];if(p)return load('tracks',p.name,async()=>({tracks:(await api('tracks?id='+p.id)).tracks,tracksSource:'playlist'}))}
 else if(state.page==='artists'){if(index===state.artists.length&&state.artistMore)return appendRows('artists','artists?offset='+state.artistOffset,'artistOffset','artistMore');const a=state.artists[index];if(a)return artistTracks(a)}
 else if(state.page==='tracks'){if(index===state.tracks.length&&state.tracksMore)return appendRows('tracks',(state.tracksSource==='liked'?'liked?offset='+state.tracksOffset:'artist-tracks?id='+state.artistId+'&offset='+state.tracksOffset),'tracksOffset','tracksMore');return playAt(index,state.tracks,state.tracksSource)}
 else if(state.page==='queue')return playAt(index);
 else if(state.page==='appearance'){if(index===0)state.theme=['auto','light','dark'][(['auto','light','dark'].indexOf(state.theme)+1)%3];if(index===1)state.largeText=!state.largeText;if(index===2)state.reducedMotion=!state.reducedMotion;render();}
 else if(state.page==='quality'){const q=qualities[index];if(q){state.quality=q.id;if(!native)try{window.localStorage?.setItem('pocketclassic.quality',q.id)}catch{}menu();footer('已选'+q.name+' · 重新选歌时生效')}}
 else if(state.page==='playing')return screenAction('mode');
 else if(state.page==='settings'){if(index===0)return openLogin();if(index===5)return navigate('quality','音质选择');if(index===6)return navigate('appearance','显示与动态效果');if(index===7)return openHelp();if(index===1)state.haptics=!state.haptics;if(index===2&&state.queueMode!=='roam')state.shuffle=!state.shuffle;if(index===3&&state.queueMode!=='roam')state.repeat=(state.repeat+1)%3;if(index===4)state.dark=!state.dark;if(index===2||index===3)native?.configure({shuffle:state.shuffle,repeat:state.repeat});render()}}
function nowPlaying(){if(!state.current){footer('先从音乐菜单选择一首歌');return}if(state.page!=='playing')navigate('playing',state.queueMode==='roam'?'私人漫游':'正在播放')}
async function playAt(index,queue=state.queue,mode=state.queueMode){if(!queue[index])return;stopSeeking();
 clearNotice();retryAction=()=>playAt(state.queueIndex);state.actualQuality='';state.buffering=true;
 native?.beginTransition();
 if(queue!==state.queue||mode!==state.queueMode){++queueEpoch;roamFill=null;roamNext=null;if(mode!=='roam')roamStream.reset()}
 const epoch=++playEpoch;audio.pause();audio.removeAttribute('src');audio.load();state.queue=queue;state.queueMode=mode;state.queueIndex=index;state.current=queue[index];state.trial=false;lastPlayError='';
 const title=mode==='roam'?'私人漫游':'正在播放';if(state.page!=='playing')navigate('playing',title);else state.title=title;
 render();footer('正在获取播放资源…');
 try{if(native){await native.playQueue(queue,index,mode,{shuffle:state.shuffle,repeat:state.repeat,volume:audio.volume,quality:state.quality});if(epoch!==playEpoch)return;render();footer();return;}const r=await api('resolve',{id:state.current.id,quality:state.quality});if(epoch!==playEpoch)return;if(!r.url)throw Error('账号或版权限制，暂无音源，请试试下一首');state.trial=!!r.trial;state.actualQuality=r.level||'';audio.src=r.url;audio.load();await audio.play();if(epoch!==playEpoch)return;state.buffering=false;render();footer(state.trial?'当前账号仅可试听':null);if(mode==='roam')refillRoam()}
 catch(e){if(epoch===playEpoch){state.buffering=false;lastPlayError=e.message;footer(e.message,true)}}
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
function menu(home=false){if(state.hold){feedback('按键已锁定 · 拨动顶部开关解锁');return;}clearNotice();if(state.sleep){state.sleep=false;render();return}++requestEpoch;state.busy=false;if(home||!state.history.length){state.page='home';state.title='iPod';state.selected=0;state.history=[]}else Object.assign(state,state.history.pop());render()}
function rotate(delta){if(state.hold||state.busy)return;if(state.sleep){state.sleep=false;render();return}if(state.page==='playing'){tick();if(state.mode==='seek')seek(delta*3);else audio.volume=Math.max(0,Math.min(1,audio.volume+delta*.04));updateProgress()}else{const selected=Math.max(0,Math.min(entries().length-1,state.selected+delta));if(selected!==state.selected){state.selected=selected;tick();render()}}}
function seek(seconds){if(state.current&&Number.isFinite(audio.duration)){audio.currentTime=Math.max(0,Math.min(audio.duration,audio.currentTime+seconds));updateProgress()}}
let seekingTimer=null;
function stopSeeking(){clearInterval(seekingTimer);seekingTimer=null;if(state.seeking){state.seeking=0;audio.endSeek?.();state.feedback='';}}
function startSeeking(direction){
 if(state.seeking===direction)return;
 stopSeeking();if(!state.current||!Number.isFinite(audio.duration)||audio.duration<=0||state.buffering)return;
 const track=state.current.id,start=Date.now();let previous=start;state.seeking=direction;audio.beginSeek?.();
 const advance=()=>{if(state.hold||state.sleep||state.current?.id!==track){stopSeeking();return;}const now=Date.now(),dt=Math.min(.25,(now-previous)/1000);previous=now;const speed=now-start>1800?24:10;const target=Math.max(0,Math.min(Math.max(0,audio.duration-.25),audio.currentTime+direction*speed*dt));if(target!==audio.currentTime)audio.currentTime=target;updateProgress();};
 seekingTimer=setInterval(advance,120);
}
async function toggle(){if(state.sleep){state.sleep=false;render();return}if(state.busy)return;if(state.page==='tracks')return select();if(!state.current){footer('先从音乐菜单选择一首歌');return}if(lastPlayError)return playAt(state.queueIndex);try{if(audio.paused)await audio.play();else audio.pause()}catch(e){footer('播放失败，请重新选择歌曲',true)}}
async function next(){if(state.busy||!state.queue.length)return;
 if(native){clearNotice();return native.next().catch(e=>footer(e.message,true));}
 if(state.queueMode==='roam'){
   if(state.queueIndex+1<state.queue.length)return playAt(state.queueIndex+1);
   if(roamNext)return roamNext;const epoch=queueEpoch;footer('正在续接漫游推荐…');
   const task=(async()=>{await refillRoam();if(epoch===queueEpoch&&state.queueMode==='roam'&&state.queueIndex+1<state.queue.length)return playAt(state.queueIndex+1)})();
   roamNext=task;task.finally(()=>{if(roamNext===task)roamNext=null});return task;
 }
 let index=state.queueIndex+1;if(state.shuffle&&state.queue.length>1){do{index=Math.floor(Math.random()*state.queue.length)}while(index===state.queueIndex)}if(index>=state.queue.length){if(state.repeat===2)index=0;else return}return playAt(index)
}
function previous(){if(native){clearNotice();return native.previous().catch(e=>footer(e.message,true));}if(audio.currentTime>3){audio.currentTime=0;return}if(state.queueIndex>0)playAt(state.queueIndex-1);else if(state.current)audio.currentTime=0}
function action(name,long=false){if(state.hold){stopSeeking();feedback('按键已锁定 · 拨动顶部开关解锁');return;}if(state.sleep){state.sleep=false;render();return}if(long){if(name==='menu')return menu(true);if(name==='play'){stopSeeking();audio.pause();state.sleep=true;render();return}if(name==='previous')return startSeeking(-1);if(name==='next')return startSeeking(1);if(name==='select')return openQueue();}else{stopSeeking();if(name==='select')return select();tick();if(name==='menu')return menu();if(name==='play')return toggle();if(name==='previous')return previous();if(name==='next')return next()}}
let gesture=null;
const wheelPress=createButtonPress({shortPress:action,longPress:name=>action(name,true),stop:stopSeeking});
const cancelWheel=()=>{gesture=null;wheelPress.cancel();};
$('wheel').addEventListener('pointerdown',event=>{if(event.button!==0||gesture)return;const rect=$('wheel').getBoundingClientRect(),x=event.clientX-rect.left-rect.width/2,y=event.clientY-rect.top-rect.height/2;gesture={id:event.pointerId,angle:Math.atan2(y,x),sum:0,dial:createWheelInput(),moved:false,valid:Math.hypot(x,y)>rect.width*.19,action:event.target.closest('[data-action]')?.dataset.action};$('wheel').setPointerCapture(event.pointerId);wheelPress.start(gesture.action)});
$('wheel').addEventListener('pointermove',event=>{if(!gesture||gesture.id!==event.pointerId||!gesture.valid||state.hold)return;const rect=$('wheel').getBoundingClientRect(),a=Math.atan2(event.clientY-rect.top-rect.height/2,event.clientX-rect.left-rect.width/2);let delta=a-gesture.angle;while(delta>Math.PI)delta-=2*Math.PI;while(delta<-Math.PI)delta+=2*Math.PI;gesture.angle=a;gesture.sum+=delta;if(Math.abs(gesture.sum)>.065){gesture.moved=true;wheelPress.cancel()}const step=gesture.dial.move(delta,event.timeStamp);if(step)rotate(step)});
$('wheel').addEventListener('pointerup',event=>{if(!gesture||gesture.id!==event.pointerId)return;gesture=null;wheelPress.release();});for(const name of ['pointercancel','lostpointercapture'])$('wheel').addEventListener(name,cancelWheel);
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelWheel();});
window.addEventListener?.('blur',cancelWheel);window.addEventListener?.('pagehide',cancelWheel);
native?.motion.onVisibility(visible=>{if(!visible)cancelWheel();});
document.querySelectorAll('[data-action]').forEach(b=>b.addEventListener('click',e=>{if(e.detail===0)action(b.dataset.action)}));
$('hold').onclick=()=>{state.hold=!state.hold;render()};$('lcdFooter').onclick=()=>{if(lastPlayError&&state.current)playAt(state.queueIndex)};
document.addEventListener('keydown',event=>{if(document.querySelector('dialog[open]')||event.target?.closest?.('button,input,select,textarea,a'))return;if(['ArrowDown','ArrowUp','Enter','Escape',' '].includes(event.key)){event.preventDefault();if(event.key==='ArrowDown')rotate(1);if(event.key==='ArrowUp')rotate(-1);if(event.key==='Enter')select();if(event.key==='Escape')menu();if(event.key===' '&&!state.hold)toggle()}});
for(const name of ['waiting','stalled'])audio.addEventListener(name,()=>{state.buffering=true;});
for(const name of ['canplay','playing'])audio.addEventListener(name,()=>{state.buffering=false;});
audio.addEventListener('timeupdate',()=>{if($('readerProgress'))$('readerProgress').textContent=format(audio.currentTime)+' / '+format(audio.duration);});
audio.addEventListener('timeupdate',updateProgress);audio.addEventListener('durationchange',updateProgress);audio.addEventListener('volumechange',updateProgress);audio.addEventListener('play',()=>{updatePlayIndicator();if(!native&&'mediaSession'in navigator){const cover=coverUrl(state.current?.cover);navigator.mediaSession.metadata=new MediaMetadata({title:state.current?.name||'',artist:state.current?.artist||'',album:state.current?.album||'',artwork:cover?[{src:cover,sizes:'320x320'}]:[]})}});audio.addEventListener('pause',()=>{updatePlayIndicator()});audio.addEventListener('ended',()=>{if(state.repeat===1){audio.currentTime=0;audio.play().catch(()=>{})}else next()});audio.addEventListener('error',()=>{if(state.current&&audio.error){lastPlayError='音频暂时无法加载，点击这里重试';footer(lastPlayError,true)}});
if(!native&&'mediaSession'in navigator){for(const [name,handler]of Object.entries({play:()=>audio.play(),pause:()=>audio.pause(),nexttrack:next,previoustrack:previous,seekbackward:()=>seek(-10),seekforward:()=>seek(10)})){try{navigator.mediaSession.setActionHandler(name,handler)}catch{}}}
async function updateAccount(){const r=await api('status');state.connected=r.authenticated;state.nickname=r.nickname||'';if($('loginDialog').open){$('loginState').textContent=r.message;$('qrImage').hidden=!r.qrImage;if(r.qrImage)$('qrImage').src=r.qrImage;$('newQr').hidden=!!r.authenticated;$('clearSession').hidden=!r.authenticated;if(r.authenticated)clearInterval(loginTimer)}render();return r}
async function openLogin(){clearNotice();if(native)return native.openConnection();$('loginDialog').showModal();try{await updateAccount()}catch(e){$('loginState').textContent=e.message}}
$('account').onclick=openLogin;$('closeLogin').onclick=()=>{$('loginDialog').close();clearInterval(loginTimer)};$('newQr').onclick=async()=>{try{$('newQr').disabled=true;await api('qr',{});await updateAccount();clearInterval(loginTimer);loginTimer=setInterval(()=>updateAccount().catch(e=>{$('loginState').textContent=e.message}),3000)}catch(e){$('loginState').textContent=e.message}finally{$('newQr').disabled=false}};
$('clearSession').onclick=async()=>{audio.pause();++playEpoch;++requestEpoch;++queueEpoch;roamStream.reset();roamFill=null;roamNext=null;await api('logout',{});state.connected=false;state.nickname='';state.current=null;state.queue=[];state.queueMode='playlist';state.playlists=[];state.artists=[];state.artistMore=false;state.tracks=[];state.tracksMore=false;audio.removeAttribute('src');$('newQr').hidden=false;await updateAccount();menu(true)};$('goPlaying').onclick=()=>{$('moreDialog').close();nowPlaying()};$('closeMore').onclick=()=>{$('moreDialog').close()};
function updateBattery(value){const level=Number.isFinite(value?.level)?Math.max(0,Math.min(1,value.level)):null;state.battery={level,charging:!!value?.charging};$('battery').classList.toggle('charging',state.battery.charging);$('battery').classList.toggle('low',level!==null&&level<=.15);$('batteryLevel').style.width=level===null?'0%':Math.round(level*100)+'%';$('battery').setAttribute('aria-label',level===null?'电量不可用':Math.round(level*100)+'%'+(value.charging?' · 正在充电':''));$('battery').title=level===null?'当前环境不提供电量':Math.round(level*100)+'%';}
updateBattery(state.battery);
$('closeReader').onclick=()=>{state.reader=false;$('readerDialog').close();};$('readerDialog').addEventListener('close',()=>{state.reader=false;});$('readerBack').onclick=()=>menu();$('openHelp').onclick=openHelp;$('closeHelp').onclick=$('dismissHelp').onclick=()=>$('helpDialog').close();
if(native)native.onBattery(updateBattery);
else if(navigator.getBattery)navigator.getBattery().then(b=>{const update=()=>updateBattery(b);update();b.addEventListener('levelchange',update);b.addEventListener('chargingchange',update)}).catch(()=>{});
render();
if(native){
 native.onConnection(()=>{++requestEpoch;state.busy=false;state.tracks=[];state.tracksMore=false;state.playlists=[];state.artists=[];state.artistMore=false;menu(true);updateAccount().catch(e=>footer(e.message,true));});
 native.onPlayback(value=>{
   if(state.busy)return;
   const changed=state.current?.id!==value.current?.id||state.queueIndex!==value.index||state.queue.length!==value.count;
   const statusChanged=state.buffering!==!!value.buffering||state.actualQuality!==(value.actualQuality||'');
   if(value.tracks)state.queue=value.tracks;state.queueIndex=value.index||0;state.current=value.current||null;state.queueMode=value.mode||'playlist';state.shuffle=!!value.shuffle;state.repeat=value.repeat||0;
   state.buffering=!!value.buffering;state.actualQuality=value.actualQuality||'';
   if(!nativeInitialized){state.dark=!!value.dark;state.haptics=value.haptics!==false;state.quality=qualityValue(value.quality);state.theme=['auto','light','dark'].includes(value.theme)?value.theme:'auto';state.largeText=!!value.largeText;state.reducedMotion=!!value.reducedMotion;if(state.current)navigate('playing',state.queueMode==='roam'?'私人漫游':'正在播放');nativeInitialized=true;render();}
   state.trial=value.mode!=='local'&&!!state.current&&value.durationMs>0&&value.durationMs+2000<state.current.durationMs;
   if(changed){stopSeeking();lastPlayError='';clearNotice();if(state.page==='playing')state.title=state.queueMode==='roam'?'私人漫游':'正在播放';render();}
   if(statusChanged)renderReader();
   if(value.error){lastPlayError=value.error;footer(value.error,true);}else updateProgress();
 });
 native.ready.then(()=>updateAccount().catch(()=>{state.connected=false;render();footer('网易云暂不可用 · 已下载和本地音乐仍可离线播放');})).catch(e=>footer(e.message,true));
 native.back=()=>{const dialog=Array.from(document.querySelectorAll('dialog[open]')).at(-1);if(dialog){dialog.close();return;}if(document.body.classList.contains('options-open')){$('playerOptionsToggle').click();return;}if(state.page!=='home')menu();else native.request('finish');};
}else if(location.protocol!=='file:')updateAccount().catch(e=>footer('离线预览 · 连接本机音乐服务后可听歌'));
window.PocketClassicContext={state,audio,native,entries,format,action,stopSeeking,rotate,select,render,screenAction,openReader,openHelp,feedback,openAppearance:()=>navigate('appearance','显示与动态效果'),footerText:()=>$('lcdFooter').textContent};
