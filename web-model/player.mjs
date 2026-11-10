import {createDiagnostics} from './diagnostics.mjs';
import {problemFrom,recoveryActions} from './problems.mjs';
import {createRoamStream} from './roam-stream.mjs';
import {createNativePlatform} from './native-platform.mjs';
import {createWheelInput} from './wheel-input.mjs';
import {createButtonPress} from './button-press.mjs';
import {coverUrl} from './artwork.mjs';
import {motionTiming} from './design-tokens.mjs';
import {menuMarker,listWindow,emptyContent,qualityLabel,appearanceIsDark,canAdvance,playbackGlyph,collectionScope,matchingEntries} from './presentation.mjs';
const diagnostics=createDiagnostics();
const native=window.PocketNative?createNativePlatform(window.PocketNative):null;
const $=id=>document.getElementById(id),audio=native?.audio||$('audio');
const qualities=[{id:'standard',name:'标准',sub:'优先标准音质'},{id:'exhigh',name:'极高',sub:'优先 320 kbps'},{id:'lossless',name:'无损',sub:'需账号与歌曲支持'},{id:'hires',name:'Hi-Res',sub:'需账号与歌曲支持'}];
const qualityValue=value=>qualities.some(q=>q.id===value)?value:'standard';
const state={page:'home',selected:0,history:[],playlists:[],tracks:[],tracksSource:'playlist',queue:[],queueMode:'playlist',queueIndex:0,current:null,connected:false,nickname:'',busy:false,hold:false,sleep:false,dark:false,haptics:true,shuffle:false,repeat:0,mode:'volume',title:'iPod',trial:false,noticeError:false,battery:{level:null,charging:false}};
let requestEpoch=0,playEpoch=0,loginTimer=null,lastPlayError='';if(!native)audio.volume=.65;
let queueEpoch=0,roamFill=null,roamNext=null,nativeInitialized=false;
let queueFill=null,localRefreshTimer=null;
let pendingDestination=null;
const readerPositions=new Map();
let readerAnimation=null,readerClosing=false;
Object.assign(state,{artists:[],artistOffset:0,artistMore:false,artistId:0,tracksMore:false,tracksOffset:0,quality:'standard',localTracks:[],localPermission:false});
Object.assign(state,{tracksSnapshot:'',queueContinuation:null,nativeQueueSession:'',queueLoading:false,queueError:'',queueTotal:0});
Object.assign(state,{localStorage:null,localReport:null,localProgress:null,localRemovals:[],localSelection:[]});
if(!native)try{state.quality=qualityValue(window.localStorage?.getItem('pocketclassic.quality'))}catch{}
const roamStream=createRoamStream(()=>api('roam'));
Object.assign(state,{theme:'auto',largeText:false,reducedMotion:false,reader:false,readerQuery:'',readerOffset:0,buffering:false,actualQuality:'',problem:null,feedback:'',feedbackLevel:'hint',feedbackAt:0,seeking:0,tracksTotal:0,queueTitle:'',queueHasMore:false,lastCollection:null});
if(!native)try{const saved=JSON.parse(window.localStorage?.getItem('pocketclassic.appearance')||'{}');for(const key of ['dark','largeText','reducedMotion'])if(typeof saved[key]==='boolean')state[key]=saved[key];if(['auto','light','dark'].includes(saved.theme))state.theme=saved.theme;}catch{}
const systemTheme=typeof matchMedia==='function'?matchMedia('(prefers-color-scheme: dark)'):null;
systemTheme?.addEventListener('change',()=>render());
const home=['音乐','正在播放','随机播放','设置'];
const music=[{id:'liked',name:'喜欢的音乐',sub:'网易云红心歌曲'},{id:'playlists',name:'我的歌单',sub:'创建与收藏的歌单'},{id:'device',name:'手机本地音乐',sub:'扫描或导入 · 无需登录'},{id:'daily',name:'每日推荐',sub:'今天为你推荐的歌曲'},{id:'roam',name:'私人漫游',sub:'私人 FM · 连续发现音乐'},{id:'artists',name:'收藏的歌手',sub:'网易云收藏 / 订阅的歌手'}];
function updatePlayIndicator(){const glyph=playbackGlyph(state.current,audio.paused),icon=$('playIndicator');icon.style.display=glyph?'block':'none';icon.innerHTML=glyph==='pause'?'<path fill="currentColor" d="M2 1H5V11H2ZM7 1H10V11H7Z"/>':'<path fill="currentColor" d="M2 0 11 6 2 12Z"/>';icon.setAttribute('aria-label',glyph==='pause'?'暂停':'播放');}
let retryAction=null,feedbackTimer,lastAppearance='';
function clearNotice(){state.problem=null;state.noticeError=false;if(state.feedbackLevel==='warning')dismissFeedback();}
function dismissFeedback(){clearTimeout(feedbackTimer);state.feedback='';const button=$('feedbackDismiss');button.hidden=true;if(document.activeElement===button)$('modelViewport')?.focus?.({preventScroll:true});}
function feedback(message,level='hint',announce=true){
 if(state.feedback&&state.feedbackLevel==='warning'&&level!=='warning')return;
 clearTimeout(feedbackTimer);state.feedback=message;state.feedbackLevel=level;state.feedbackAt=Date.now();
 $('feedbackDismiss').hidden=level!=='warning'||!!state.problem;if(announce)$('uiAnnouncement').textContent=message;
 if(level!=='warning'||!state.problem)feedbackTimer=setTimeout(dismissFeedback,level==='state'?1600:level==='warning'?2400:1200);
}
$('feedbackDismiss').onclick=dismissFeedback;
$('feedbackDismiss').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dismissFeedback();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)dismissFeedback();});
native?.motion.onVisibility(visible=>{if(!visible)dismissFeedback();});
function persistAppearance(){if(!native)try{const value=JSON.stringify({dark:state.dark,theme:state.theme,largeText:state.largeText,reducedMotion:state.reducedMotion});if(value!==lastAppearance){window.localStorage?.setItem('pocketclassic.appearance',value);lastAppearance=value;}}catch{}}
const escapeText=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const format=seconds=>{const s=Math.floor(Math.max(0,Number(seconds)||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
function tick(){if(!state.haptics)return;if(native)native.vibrate();else if(navigator.vibrate)navigator.vibrate(5)}
async function api(route,body){if(native)return native.api(route);const response=await fetch('/api/'+route,{cache:'no-store',...(body!==undefined?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const result=await response.json();if(!response.ok)throw Object.assign(Error(result.error||'音乐服务暂不可用'),{reason:result.errorReason,status:response.status});return result}
function problemActions(){return recoveryActions(state.problem,{advance:canAdvance(state),native:!!native,local:!!state.current?.local||['local','localManage'].includes(state.page)});}
function footer(message,error=false){if(error){const problem=problemFrom(message,{local:!!state.current?.local||['local','localManage'].includes(state.page)}),fresh=state.problem?.message!==problem.message;state.noticeError=true;state.problem=problem;message=problem.message;if(fresh){diagnostics.end('play','failed');diagnostics.begin('recovery');}renderReader();if(fresh)feedback(message,'warning');}else if(message){clearNotice();feedback(message);}const value=state.problem?.message||message||(state.page==='queue'?collectionScope(state):state.connected?'MENU 返回 · 长按中央键打开队列':'网易云 / 本地免登录 · 屏幕可点选');$('lcdFooter').textContent=value;$('lcdFooter').classList.toggle('error',state.noticeError);renderAccessibleMenu();}
function album(track,small=false){const colors=[['#304f48','#a1b49b'],['#94674f','#dcc09d'],['#3a526b','#aabdc9']][Math.abs(Number(track?.id)||0)%3],url=coverUrl(track?.cover);return '<div class="album'+(url?' has-cover':'')+'" style="background:linear-gradient(135deg,'+colors.join(',')+')'+(small?';width:62px;height:62px;min-width:62px':'')+'">'+(url&&!native?'<img src="'+escapeText(url)+'" alt="专辑封面" referrerpolicy="no-referrer">':'<i class="shine"></i>')+'</div>'}
function row(label,index,sub,item={}){return '<button class="row'+(index===state.selected?' active':'')+(sub!==undefined?' with-sub':'')+'" data-index="'+index+'" aria-current="'+(index===state.selected)+'"><span class="text"><strong class="label">'+escapeText(label)+'</strong>'+(sub!==undefined?'<small>'+escapeText(sub)+'</small>':'')+'</span><span class="arrow" aria-hidden="true">'+menuMarker(state.page,item,index,state)+'</span></button>'}
function entries(){
 if(state.page==='home')return home.map(name=>({name}));
 if(state.page==='music')return music;
 if(state.page==='local'){const tracks=state.localTracks.map(t=>({...t,sub:[t.artist,t.sourceKind==='copy'?'应用内副本':t.sourceKind==='scan'?'扫描原文件':t.format].filter(Boolean).join(' · ')}));return tracks.length?[...tracks,{name:'导入与管理',sub:'扫描 · 导入 · 空间与移除',localAction:'manage'}]:[{name:'扫描手机音乐',sub:'允许读取手机音频，或手动导入',localAction:'localScan'},{name:'导入音乐文件',sub:'保存应用内副本 · 支持 NCM',localAction:'localImport'},{name:'导入音乐文件夹',sub:'包含子文件夹 · 保存副本',localAction:'localFolder'}];}
 if(state.page==='localManage')return state.localTracks.map(t=>({...t,manageId:t.id,sub:[t.artist,t.sourceKind==='copy'?'应用内副本':t.sourceKind==='scan'?'扫描原文件':'本地音乐',t.id===state.current?.id?'正在播放，请先换歌':''].filter(Boolean).join(' · ')}));
 if(state.page==='playlists')return state.playlists.map(p=>({name:p.name,sub:p.trackCount+' 首'}));
 if(state.page==='artists')return [...state.artists.map(a=>({name:a.name,sub:a.songCount?a.songCount+' 首歌曲':'查看歌手歌曲'})),...(state.artistMore?[{name:'加载更多歌手',sub:'继续读取收藏列表',more:true}]:[])];
 if(state.page==='tracks')return [...state.tracks.map(t=>({...t,sub:t.artist})),...(state.tracksMore?[{name:'加载更多歌曲',sub:'已加载 '+state.tracks.length+' 首'+(state.tracksTotal?' / 共 '+state.tracksTotal+' 首':''),more:true}]:[])];
 if(state.page==='queue')return state.queue.map(t=>({...t,sub:t.artist}));
 if(state.page==='covers')return (state.coverCollection?.tracks||[]).map(t=>({...t,sub:t.artist}));
 if(state.page==='quality')return qualities.map(q=>({id:q.id,name:q.name,sub:q.sub}));
 if(state.page==='diagnostics')return [{name:diagnostics.enabled?'关闭并清除诊断':'开启本次诊断',sub:'仅汇总耗时，不记录歌曲和账号'},{name:'查看诊断结果',sub:'首播 · 查找 · 授权 · 故障恢复'}];
 if(state.page==='appearance')return [{name:'环境主题',sub:({auto:'跟随系统',light:'明亮',dark:'深色'})[state.theme]},{name:'大字菜单',sub:state.systemLargeText?'跟随系统大字':state.largeText?'开':'关'},{name:'减少动态效果',sub:state.reducedMotion?'开':'关'}];
 if(state.page==='settings')return [{name:'账号与连接',sub:state.connected?state.nickname:'未连接'},{name:'触感反馈'},{name:'随机播放',sub:state.queueMode==='roam'?'漫游按推荐顺序播放':undefined},{name:'循环模式',sub:state.queueMode==='roam'?'漫游持续发现新歌':undefined},{name:'机身颜色',sub:state.dark?'石墨黑':'银色'},{name:'音质选择',sub:qualities.find(q=>q.id===state.quality).name+' · 首选音质'},{name:'显示与动态效果',sub:'环境主题 · 大字 · 减少动态'},{name:'使用帮助',sub:'转轮、按键与直接点选'},{name:'本地体验诊断',sub:'自愿开启 · 仅本次使用'}];return [];
}
function render(){native?.syncPreferences({dark:state.dark,haptics:state.haptics,quality:state.quality,theme:state.theme,largeText:state.largeText,reducedMotion:state.reducedMotion});persistAppearance();document.body.classList.toggle('dark',appearanceIsDark(state.theme,systemTheme?.matches));document.body.classList.toggle('graphite',state.dark);document.body.classList.toggle('large-text',state.largeText||state.systemLargeText);document.body.classList.toggle('reduce-motion',state.reducedMotion);document.body.classList.toggle('connected',state.connected);document.body.classList.toggle('locked',state.hold);document.body.classList.toggle('sleep',state.sleep);$('title').textContent=state.title;updatePlayIndicator();$('bottomMark').textContent=state.hold?'HOLD · 按键已锁定':'MUSIC. AT YOUR FINGERTIPS.';$('online').classList.toggle('online',state.connected);$('accountLabel').textContent=state.connected?'账号':'连接网易云';$('account').setAttribute('aria-label',state.connected?'网易云账号：'+state.nickname:'连接网易云音乐');const screen=$('screen');
 if(state.page==='playing'){const t=state.current;if(!t){screen.innerHTML='<div class="empty">先从音乐菜单选择一首歌</div>'}else{screen.innerHTML='<div class="now"><div class="track-head">'+album(t)+'<div class="track-meta"><h2>'+escapeText(t.name)+'</h2><p>'+escapeText(t.artist)+'</p><small>'+(state.queueIndex+1)+' / '+state.queue.length+'</small></div></div><div><div class="progress-caption" id="caption"></div><div class="progress'+(state.mode==='seek'?' seek':'')+'"><i id="progressFill"></i></div><div class="times"><span id="elapsed">0:00</span><span id="remaining">−0:00</span></div><div class="volume-row"><span>音量</span><div class="progress"><i id="volumeFill"></i></div><span id="volumeText"></span></div></div></div>';updateProgress()}}
 else{const list=entries(),{visible,start}=listWindow(state,list.length);const menu='<div class="menu">'+list.slice(start,start+visible).map((e,i)=>row(e.name,start+i,e.sub,e)).join('')+(list.length===0?'<div class="empty">'+emptyContent(state.page).map(escapeText).join('<br>')+'</div>':'')+'</div>';screen.innerHTML=state.page==='home'?'<div class="home-split">'+menu+'<div class="preview-tile">'+album(state.current,true)+'<span>MUSIC</span></div></div>':menu;screen.querySelectorAll('[data-index]').forEach(e=>e.onclick=()=>{state.selected=Number(e.dataset.index);select()})}
 $('localShortcut').hidden=!native||state.connected||state.page==='playing';
 $('openLocalManager').hidden=!native;
 $('quickQueue').hidden=state.page!=='playing'||!state.queue.length;
 $('openList').textContent=state.page==='playing'?'播放详情':'展开列表';
 if(state.busy){const spin=document.createElement('div');spin.className='spinner';spin.setAttribute('aria-label','正在读取音乐');screen.append(spin)}footer(state.page==='quality'&&!state.problem?'首选音质 · 按账号和歌曲权限提供':null);renderReader();}
function renderAccessibleMenu(){
 const panel=$('accessibleMenu');if(!panel)return;
 const list=entries(),{start,visible}=listWindow(state,list.length);
 const key=JSON.stringify([state.page,state.title,state.selected,state.problem,state.busy,state.hold,state.sleep,state.current?.id,state.current?.name,state.current?.artist,audio.paused,list.length,list.slice(start,start+visible)]);if(panel.dataset.key===key)return;panel.dataset.key=key;
 const focused=document.activeElement?.dataset?.accessibleIndex;
 let body='<h2 id="accessibleTitle" tabindex="-1">'+escapeText(state.title)+'</h2>';
 if(state.hold||state.sleep)body+='<p>'+(state.hold?'按键已锁定，请使用顶部 HOLD 开关解锁':'播放器已休眠，请按中央键唤醒')+'</p>';
 else if(state.problem)body+='<p>'+escapeText(state.problem.message)+'</p>'+problemActions().map(action=>'<button data-screen-action="'+action.id+'">'+action.label+'</button>').join('');
 else if(state.busy)body+='<p role="status">正在读取'+escapeText(state.title)+'，按 MENU 返回</p>';
 else if(state.page==='playing')body+='<p>'+escapeText([state.current?.name,state.current?.artist,audio.paused?'已暂停':'正在播放'].filter(Boolean).join('，'))+'</p><button data-screen-action="details">打开播放详情、进度和音量</button><button data-screen-action="queue">播放队列</button>';
 else {body+=list.slice(start,start+visible).map((item,i)=>'<button data-accessible-index="'+(start+i)+'" aria-current="'+(start+i===state.selected)+'">'+escapeText([item.name,item.sub,menuMarker(state.page,item,start+i,state)].filter(Boolean).join('，'))+'</button>').join('');if(start>0)body+='<button data-list-step="'+(-visible)+'">上一页选项</button>';if(start+visible<list.length)body+='<button data-list-step="'+visible+'">下一页选项</button>';body+='<button data-screen-action="details">展开完整列表</button>';}
 panel.innerHTML=body;
 panel.querySelectorAll('[data-accessible-index]').forEach(button=>button.onclick=async()=>{state.selected=Number(button.dataset.accessibleIndex);await select();$('accessibleTitle')?.focus?.();});
 panel.querySelectorAll('[data-list-step]').forEach(button=>button.onclick=()=>{rotate(Number(button.dataset.listStep));$('accessibleTitle')?.focus?.();});
 panel.querySelectorAll('[data-screen-action]').forEach(button=>button.onclick=()=>screenAction(button.dataset.screenAction));
 if(focused!==undefined)panel.querySelector?.('[data-accessible-index="'+focused+'"]')?.focus?.();
}
function renderReader(force=false){
 const panel=$('readerContent');if(!panel||!force&&!$('readerDialog').open)return;
 const viewKey=[state.page,state.title,state.page==='tracks'?state.tracksSource:''].join(':'),samePage=panel.dataset.page===viewKey,focusIndex=document.activeElement?.dataset?.readerIndex,focusControl=document.activeElement?.id;
 if(!samePage){if(panel.dataset.page)readerPositions.set(panel.dataset.page,{scroll:$('readerDialog').scrollTop||0,query:state.readerQuery});const saved=readerPositions.get(viewKey);state.readerQuery=saved?.query||'';$('readerQuery').value=state.readerQuery;$('readerDialog').scrollTop=saved?.scroll||0;}
 if(!samePage)state.readerOffset=state.readerQuery?0:Math.floor(state.selected/200)*200;
 panel.dataset.page=viewKey;let body='';
 const searchable=['tracks','queue','local','localManage','playlists','artists','covers'].includes(state.page)&&!state.problem&&!state.busy;
 $('readerSearch').hidden=!searchable;$('readerScope').textContent=searchable?collectionScope(state):'';
 if(state.problem){body='<div class="reader-message"><h3>暂时未能完成</h3><p>'+escapeText(state.problem.message)+'</p><div class="reader-actions">'+problemActions().map((action,index)=>'<button '+(!index?'class="primary" ':'')+'data-recovery="'+action.id+'">'+action.label+'</button>').join('')+'</div></div>';}
 else if(state.busy)body='<p role="status">'+(state.localProgress?'正在处理 '+state.localProgress.processed+' / '+state.localProgress.total+' 个文件':'正在读取'+escapeText(state.title)+'…')+'</p>';
 else if(state.page==='playing'&&state.current){const duration=Number.isFinite(audio.duration)?audio.duration:0;body='<h3>'+escapeText(state.current.name)+'</h3><p>'+escapeText(state.current.artist)+'</p><p>'+escapeText(state.current.album)+'</p><p id="readerProgress">'+format(audio.currentTime)+' / '+format(duration)+'</p><div class="reader-playback-controls"><label>播放进度<input id="readerSeek" type="range" min="0" max="'+duration+'" step="1" value="'+Math.min(duration,audio.currentTime)+'" '+(!duration?'disabled':'')+'></label><label>系统音量<input id="readerVolume" type="range" min="0" max="100" step="1" value="'+Math.round(audio.volume*100)+'"></label></div><div class="reader-actions"><button id="readerPlay">'+(audio.paused?'播放':'暂停')+'</button><button id="readerQueue">播放队列 · '+state.queue.length+' 首</button></div><p>'+escapeText(collectionScope(state,'queue'))+'</p><p>首选 '+qualityLabel(state.quality)+(state.actualQuality?' · 当前 '+qualityLabel(state.actualQuality):' · 当前音质以可用资源为准')+'</p>';}
 else if(state.page==='diagnostics')body=diagnosticsContent();
 else {const list=entries(),matches=matchingEntries(list,searchable?state.readerQuery:'');state.readerOffset=Math.max(0,Math.min(state.readerOffset,Math.max(0,matches.length-1)));const shown=matches.slice(state.readerOffset,state.readerOffset+200);$('readerResultCount').textContent=(state.readerQuery?'找到 '+matches.length+' 项':matches.length+' 项')+(matches.length>200?'，显示 '+(state.readerOffset+1)+'–'+Math.min(matches.length,state.readerOffset+200):'');body=matches.length?shown.map(({item,index})=>{const marker=menuMarker(state.page,item,index,state),suffix=marker==='▶'?'正在播放':marker==='✓'?'已选择':['开','关','关闭','单曲','全部'].includes(marker)?marker:'';return '<button class="reader-row" data-reader-index="'+index+'" aria-label="'+escapeText([item.name,item.sub,suffix].filter(Boolean).join('，'))+'" aria-current="'+(index===state.selected)+'"'+(item.manageId!==undefined?' aria-pressed="'+state.localSelection.includes(item.manageId)+'"':'')+'><span>'+escapeText(item.name)+(item.sub?'<small>'+escapeText(item.sub)+'</small>':'')+'</span><span aria-hidden="true">'+marker+'</span></button>';}).join(''):state.readerQuery?'<h3>已加载内容中没有匹配项</h3><p>试试其他歌名、歌手或专辑。'+(state.tracksMore||state.artistMore?'清空搜索后可继续加载更多。':'')+'</p>':'<h3>'+emptyContent(state.page)[0]+'</h3><p>'+emptyContent(state.page)[1]+'</p>';}
 if(searchable){const matches=matchingEntries(entries(),state.readerQuery);if(matches.length>200)body+='<div class="reader-actions"><button id="readerPreviousResults" '+(!state.readerOffset?'disabled':'')+'>上一组</button><button id="readerNextResults" '+(state.readerOffset+200>=matches.length?'disabled':'')+'>下一组</button></div>';}
 if(state.page==='playing'&&state.current?.local)body+='<p>'+escapeText(state.current.sourceKind==='copy'?'应用内副本 · '+bytesLabel(state.current.bytes)+' · 移除原文件后仍可播放':state.current.sourceKind==='scan'?'扫描原文件 · 需要保留原文件和读取权限':'本地离线播放')+'</p>';
 if(['local','localManage'].includes(state.page)&&!state.busy&&!state.problem)body=localControls()+body;
 if(['playing','queue'].includes(state.page)&&state.queueError)body='<div class="reader-message"><p>'+escapeText(state.queueError)+'</p><button id="readerQueueRetry">重试续载</button></div>'+body;
 else if(['playing','queue'].includes(state.page)&&state.queueLoading)body='<p role="status">正在按原歌单顺序续载，已有歌曲可以继续播放。</p>'+body;
 panel.innerHTML=body;$('readerTitle').textContent=state.title;panel.querySelectorAll('[data-reader-index]').forEach(button=>button.onclick=()=>{if(state.readerQuery)diagnostics.end('find');state.selected=Number(button.dataset.readerIndex);select();});
 if($('diagnosticsToggle'))$('diagnosticsToggle').onclick=()=>{diagnostics.setEnabled(!diagnostics.enabled);render();};if($('diagnosticsRefresh'))$('diagnosticsRefresh').onclick=()=>renderReader();if($('diagnosticsClear'))$('diagnosticsClear').onclick=()=>{diagnostics.clear();renderReader();};if($('simplePresentation'))$('simplePresentation').onclick=()=>window.PocketClassicPresentation?.fallback('已切换简洁界面。重新打开应用可恢复三维外观。');
 if($('readerRetry'))$('readerRetry').onclick=retryProblem;if($('readerPlay'))$('readerPlay').onclick=()=>toggle().then(()=>renderReader());if($('readerQueue'))$('readerQueue').onclick=openQueue;
 if($('readerQueueRetry'))$('readerQueueRetry').onclick=()=>refillQueue(true).catch(error=>{state.queueError=error.message;renderReader();});
 panel.querySelectorAll('[data-recovery]').forEach(button=>button.onclick=()=>screenAction(button.dataset.recovery));
 panel.querySelectorAll('[data-local-action]').forEach(button=>button.onclick=()=>localAction(button.dataset.localAction));
 panel.querySelectorAll('[data-undo-token]').forEach(button=>button.onclick=()=>manageLocal('localUndo',{token:button.dataset.undoToken}));
 if($('readerManageLocal'))$('readerManageLocal').onclick=openLocalManager;if($('readerRemoveLocal'))$('readerRemoveLocal').onclick=()=>manageLocal('localRemove',{ids:state.localSelection});
 for(const [id,step]of [['readerPreviousResults',-200],['readerNextResults',200]])if($(id))$(id).onclick=()=>{state.readerOffset=Math.max(0,state.readerOffset+step);renderReader();$('readerContent').querySelectorAll('[data-reader-index]')[0]?.focus?.();};
 if($('readerRecover'))$('readerRecover').onclick=()=>canAdvance(state)?next():menu();
 if($('readerSeek'))$('readerSeek').oninput=event=>{audio.currentTime=Math.max(0,Math.min(Number.isFinite(audio.duration)?audio.duration:0,Number(event.target.value)||0));updateProgress();};
 if($('readerVolume'))$('readerVolume').oninput=event=>{audio.volume=Math.max(0,Math.min(1,Number(event.target.value)/100));updateProgress();};
 if(samePage&&focusIndex!==undefined)panel.querySelector('[data-reader-index="'+focusIndex+'"]')?.focus();else if(samePage&&['readerPlay','readerSeek','readerVolume'].includes(focusControl))$(focusControl)?.focus?.();else if(!samePage&&$('readerDialog').open)$('readerTitle').focus?.();
}
function diagnosticsContent(){const value=diagnostics.snapshot(),labels={play:'选歌至可播放',authorize:'授权后回到原任务',find:'输入查找到选择结果',recovery:'故障出现至恢复成功'},duration=ms=>ms===null?'尚无样本':(ms/1000).toFixed(2)+' 秒';return '<h3>本次使用的体验诊断</h3><p>默认关闭，只在当前会话汇总耗时和成功次数。不会记录歌名、查询内容、账号或文件地址，也不会上传；关闭、清除或重新加载界面后删除结果。</p><div class="reader-actions"><button id="diagnosticsToggle">'+(value.enabled?'关闭并清除':'开启本次诊断')+'</button><button id="diagnosticsRefresh">刷新结果</button><button id="diagnosticsClear">清除结果</button></div><dl class="diagnostics-results">'+value.flows.map(flow=>'<dt>'+labels[flow.name]+'</dt><dd>成功 '+flow.success+' / 完成 '+flow.attempts+' · 失败 '+flow.failed+' · 取消 '+flow.cancelled+'<br>成功平均耗时：'+duration(flow.meanMs)+'</dd>').join('')+'</dl><p>最近 '+value.frames.count+' 个前台帧间隔：平均 '+(value.frames.meanMs??'—')+' ms，P95 '+(value.frames.p95Ms??'—')+' ms。界面切到后台、弹出阅读面板和开场期间不采样。这些数据不能代表长期功耗。</p><p>选歌耗时止于实际可播放；查找从输入开始，止于选择结果。每项最多保留最近 120 次完成记录。</p><button id="simplePresentation">使用简洁界面</button>';}
function openQueue(){if(!state.queue.length){feedback('先选择一首歌，队列会显示在这里');return;}navigate('queue','播放队列');state.selected=state.queueIndex;render();}
function openCovers(){const source=['playing','queue'].includes(state.page)?{tracks:state.queue,mode:state.queueMode,title:state.queueTitle||'当前队列'}:state.lastCollection||{tracks:state.queue,mode:state.queueMode,title:'当前队列'};if(!source.tracks.length){feedback('先选择一个有歌曲的列表，再浏览封面');return;}state.coverCollection=source;navigate('covers','封面浏览');state.selected=Math.max(0,source.tracks.findIndex(track=>track.id===state.current?.id));render();}
function readerMotion(open){
 const dialog=$('readerDialog'),source=document.querySelector('.lcd-surface')?.getBoundingClientRect?.();
 if(!dialog.animate||!source||state.reducedMotion||typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches)return null;
 const target=dialog.getBoundingClientRect();if(!target.width||!target.height)return null;
 const dx=source.left+source.width/2-target.left-target.width/2,dy=source.top+source.height/2-target.top-target.height/2;
 const compact={opacity:0,transform:`translate(${dx}px,${dy}px) scale(${Math.max(.1,Math.min(1,source.width/target.width))},${Math.max(.1,Math.min(1,source.height/target.height))})`},expanded={opacity:1,transform:'translate(0,0) scale(1,1)'};
 return dialog.animate(open?[compact,expanded]:[expanded,compact],{duration:motionTiming.reader,easing:'cubic-bezier(.2,.8,.2,1)'});
}
function openReader(){readerAnimation?.cancel();readerClosing=false;renderReader(true);state.reader=true;if(!$('readerDialog').open){$('readerDialog').showModal();readerAnimation=readerMotion(true);}$('readerTitle').focus?.({preventScroll:true});}
function closeReader(){diagnostics.end('find','cancelled');if(readerClosing)return;readerAnimation?.cancel();readerClosing=true;const animation=readerAnimation=readerMotion(false),finish=()=>{if(readerAnimation!==animation)return;readerAnimation=null;readerClosing=false;state.reader=false;$('readerDialog').close();};if(animation)animation.finished.then(finish,()=>{});else finish();}
function openHelp(){stopSeeking();const dialog=$('helpDialog');dialog.showModal();dialog.scrollTop=0;$('helpTitle').focus?.({preventScroll:true});}
async function retryProblem(){const login=state.problem?.login;clearNotice();render();if(login)return openLogin();if(retryAction)return retryAction();if(state.current)return playAt(state.queueIndex);return updateAccount().catch(e=>footer(e,true));}
function screenAction(name){if(name==='local'){clearNotice();return localLibrary();}if(name==='import'){clearNotice();return localLibrary().then(()=>localAction('localImport'));}if(name==='manage'){clearNotice();return openLocalManager();}if(name==='dismiss')return dismissFeedback();if(name==='retry')return retryProblem();if(name==='back')return menu();if(name==='next')return next();if(name==='queue')return openQueue();if(name==='details')return openReader();if(name==='mode'||name==='seekMode'||name==='volumeMode'){state.mode=name==='mode'?(state.mode==='seek'?'volume':'seek'):name==='seekMode'?'seek':'volume';if(state.feedbackLevel!=='warning')dismissFeedback();$('uiAnnouncement').textContent=state.mode==='seek'?'转动转轮调整进度':'转动转轮调整音量';render();}}
function updateProgress(){if(state.page!=='playing'||!state.current)return;const duration=Number.isFinite(audio.duration)?audio.duration:state.current.durationMs/1000;const progress=$('progressFill');if(progress)progress.style.width=Math.min(100,audio.currentTime/Math.max(duration,1)*100)+'%';if($('elapsed'))$('elapsed').textContent=format(audio.currentTime);if($('remaining'))$('remaining').textContent='−'+format(duration-audio.currentTime);if($('volumeFill'))$('volumeFill').style.width=Math.round(audio.volume*100)+'%';if($('volumeText'))$('volumeText').textContent=Math.round(audio.volume*100)+'%';if($('caption'))$('caption').textContent=state.trial?'试听片段':state.mode==='seek'?'转动转轮调整进度':'转动转轮调整音量'}
function navigate(page,title){pendingDestination=null;clearNotice();state.history.push({page:state.page,title:state.title,selected:state.selected});state.page=page;state.title=title;state.selected=0;state.mode='volume';state.navigationDirection=1;render()}
function rememberCollection(){if(state.page==='tracks')state.lastCollection={tracks:state.tracks,mode:state.tracksSource,title:state.title,continuation:state.tracksSnapshot?{snapshot:state.tracksSnapshot,offset:state.tracksOffset,more:state.tracksMore,total:state.tracksTotal,title:state.title}:null};if(state.page==='local')state.lastCollection={tracks:state.localTracks,mode:'local',title:'手机本地音乐'};}
async function load(page,title,fn){const epoch=++requestEpoch;navigate(page,title);retryAction=()=>{menu();return load(page,title,fn);};if(page==='tracks'){state.tracks=[];state.tracksMore=false;state.tracksOffset=0;state.tracksTotal=0;state.tracksSnapshot=''}if(page==='artists'){state.artists=[];state.artistMore=false;state.artistOffset=0}state.busy=true;render();try{const result=await fn();if(epoch===requestEpoch){Object.assign(state,result);rememberCollection();state.busy=false;diagnostics.end('recovery');render();if(page==='tracks'&&!state.tracks.length)footer('暂无歌曲，按 MENU 返回后重试');if(page==='artists'&&!state.artists.length)footer('暂无收藏歌手，可先在网易云收藏歌手')}}catch(e){if(epoch===requestEpoch){state.busy=false;render();footer(e,true)}}}
function connectFor(name,run){diagnostics.begin('authorize');pendingDestination={name,run};return openLogin().catch(error=>footer(error,true));}
async function library(){if(!state.connected)return connectFor('playlists',library);return load('playlists','我的歌单',async()=>({playlists:(await api('playlists')).playlists}))}
async function liked(){if(!state.connected)return connectFor('liked',liked);return load('tracks','喜欢的音乐',async()=>{const r=await api('liked?offset=0');return {tracks:r.tracks,tracksMore:!!r.more,tracksOffset:r.nextOffset,tracksTotal:r.trackCount||0,tracksSource:'liked',tracksSnapshot:r.snapshot||''};});}
async function localLibrary(){return load('local','手机本地音乐',async()=>{if(!native)return {localTracks:[],localPermission:false};const r=await api('local');return {localTracks:r.tracks||[],localPermission:!!r.permissionGranted,localStorage:r.storage||null,localRemovals:r.pendingRemovals||[],localRemovalWarning:r.removalWarning||''};});}
function applyLocalCatalog(result){state.localTracks=result.tracks||[];state.localPermission=!!result.permissionGranted;state.localStorage=result.storage||null;state.localRemovals=result.pendingRemovals||[];state.localRemovalWarning=result.removalWarning||'';if(result.report)state.localReport=result.report;state.localSelection=state.localSelection.filter(id=>state.localTracks.some(track=>track.id===id));if(['local','localManage'].includes(state.page))state.lastCollection={tracks:state.localTracks,mode:'local',title:'手机本地音乐'};scheduleLocalRefresh();}
function scheduleLocalRefresh(){clearTimeout(localRefreshTimer);const next=state.localRemovals.filter(item=>item.until>Date.now()).sort((a,b)=>a.until-b.until)[0];if(next)localRefreshTimer=setTimeout(()=>{if(['local','localManage'].includes(state.page)&&!state.busy)api('local').then(result=>{applyLocalCatalog(result);render();}).catch(()=>{});},Math.max(50,next.until-Date.now()+100));}
async function localAction(method){if(!native){feedback('请使用安卓客户端扫描或导入手机音乐');return;}const epoch=++requestEpoch;clearNotice();state.localProgress=null;state.localReport=null;state.busy=true;render();try{const result=await native.localAction(method,'device');if(epoch!==requestEpoch)return;applyLocalCatalog(result);state.localProgress=null;state.busy=false;state.selected=Math.min(state.selected,Math.max(0,entries().length-1));render();footer(result.message||'本地音乐可直接离线播放');}catch(error){if(epoch===requestEpoch){state.busy=false;state.localProgress=null;render();footer(error,true);}}}
async function openLocalManager(){if(!native){feedback('本地音乐管理需要安卓客户端');return;}if(!['local','localManage'].includes(state.page))await localLibrary();if(state.problem)return openReader();if(state.page!=='localManage')navigate('localManage','本地音乐管理');state.localSelection=[];openReader();scheduleLocalRefresh();}
async function manageLocal(method,args){if(!native||state.busy)return;const epoch=++requestEpoch;state.busy=true;clearNotice();render();try{const result=await native.localManage(method,args);if(epoch!==requestEpoch)return;applyLocalCatalog(result);state.localSelection=[];state.busy=false;render();footer(result.message);}catch(error){if(epoch===requestEpoch){state.busy=false;render();footer(error,true);}}}
const bytesLabel=value=>{const bytes=Math.max(0,Number(value)||0);return bytes>=1073741824?(bytes/1073741824).toFixed(1)+' GB':bytes>=1048576?(bytes/1048576).toFixed(1)+' MB':bytes>=1024?Math.round(bytes/1024)+' KB':bytes+' B';};
function localControls(){
 let html='<section class="local-management"><div class="reader-actions"><button data-local-action="localScan">扫描手机音乐</button><button data-local-action="localImport">导入文件</button><button data-local-action="localFolder">导入文件夹</button>'+(state.page==='local'?'<button id="readerManageLocal">管理与移除</button>':'')+'</div>';
 if(state.localRemovalWarning)html+='<p role="alert">'+escapeText(state.localRemovalWarning)+'</p>';
 if(state.localStorage)html+='<p>应用内副本 '+state.localStorage.copies+' 首，占用 '+bytesLabel(state.localStorage.importedBytes)+'；音频缓存 '+bytesLabel(state.localStorage.cacheBytes)+'。手机可用 '+bytesLabel(state.localStorage.availableBytes)+'。</p>';
 html+='<p class="hint">导入会保存应用内副本；扫描只读取原文件。移除不会删除手机原文件，扫描记录可重新扫描找回。</p>';
 if(state.page==='localManage')html+='<div class="reader-actions"><button id="readerRemoveLocal" '+(!state.localSelection.length||state.localSelection.includes(state.current?.id)?'disabled':'')+'>移除所选 '+state.localSelection.length+' 首</button></div>';
 const pending=state.localRemovals.filter(item=>item.until>Date.now());if(pending.length)html+='<div class="local-undo">'+pending.map(item=>'<button data-undo-token="'+escapeText(item.token)+'">撤销移除 '+item.count+' 首</button>').join('')+'</div>';
 const report=state.localReport;if(report)html+='<details class="local-report" open><summary>导入结果：新增 '+report.added+'，更新 '+report.updated+'，跳过 '+report.skipped+'，失败 '+report.failed+'</summary>'+(report.failures?.length?'<ul>'+report.failures.map(item=>'<li><strong>'+escapeText(item.file)+'</strong>：'+escapeText(item.reason)+'</li>').join('')+'</ul>':'<p>本次选择的文件已处理完成。</p>')+(report.failed+report.skipped>100?'<p>仅列出前 100 项原因。</p>':'')+'</details>';
 return html+'</section>';
}
async function daily(){if(!state.connected)return connectFor('daily',daily);return load('tracks','每日推荐',async()=>({tracks:(await api('daily')).tracks,tracksSource:'daily'}))}
async function artists(){if(!state.connected)return connectFor('artists',artists);return load('artists','收藏的歌手',async()=>{const r=await api('artists?offset=0');return {artists:r.artists,artistOffset:r.nextOffset,artistMore:r.more}})}
async function artistTracks(artist){return load('tracks',artist.name,async()=>{const r=await api('artist-tracks?id='+artist.id+'&offset=0');return {tracks:r.tracks,tracksMore:r.more,tracksOffset:r.nextOffset,artistId:artist.id,tracksSource:'artist'}})}
async function appendRows(field,route,offsetKey,moreKey){
 const epoch=++requestEpoch;retryAction=()=>appendRows(field,route,offsetKey,moreKey);clearNotice();state.busy=true;render();
 try{const r=await api(route);if(epoch!==requestEpoch)return;const previous=state[field],seen=new Set(previous.map(x=>x.id));state[field]=[...previous,...r[field].filter(x=>!seen.has(x.id)&&seen.add(x.id))].slice(0,5000);state[offsetKey]=r.nextOffset;state[moreKey]=!!r.more&&state[field].length<5000;if(field==='tracks')state.tracksTotal=r.trackCount||state.tracksTotal;rememberCollection();state.selected=Math.max(0,Math.min(state.selected,entries().length-1));state.busy=false;render()}
 catch(e){if(epoch===requestEpoch){state.busy=false;render();footer(e,true)}}
}
async function startRoam(){
  if(!state.connected)return connectFor('roam',startRoam);
  const request=++requestEpoch;roamStream.reset();retryAction=startRoam;
  if(state.page!=='playing'||state.title!=='私人漫游')navigate('playing','私人漫游');else clearNotice();state.busy=true;render();
  try{const tracks=await roamStream.nextBatch();if(request!==requestEpoch)return;if(!tracks.length)throw Error('漫游暂时没有推荐，请按 MENU 返回重试');state.shuffle=false;state.repeat=0;state.busy=false;await playAt(0,tracks,'roam')}
  catch(e){if(request===requestEpoch){state.busy=false;render();footer(e,true)}}
}
async function select(){if(state.hold||state.busy)return;if(state.sleep){state.sleep=false;render();return}tick();const index=state.selected;
 if(state.problem)return screenAction(problemActions()[0].id);
  if(state.page==='home'){if(index===0)return navigate('music','音乐');if(index===1)return nowPlaying();if(index===2){const source=state.lastCollection||{tracks:state.queue,mode:state.queueMode,title:'当前播放队列'};if(!source.tracks.length){feedback('先从音乐中选择一个有歌曲的列表');return;}state.shuffle=true;return playAt(Math.floor(Math.random()*source.tracks.length),source.tracks,source.mode)}if(index===3)return navigate('settings','设置')}
 else if(state.page==='music'){const id=music[index]?.id;if(id==='liked')return liked();if(id==='playlists')return library();if(id==='device')return localLibrary();if(id==='daily')return daily();if(id==='roam')return startRoam();if(id==='artists')return artists()}
 else if(state.page==='local'){const item=entries()[index];if(item?.localAction==='manage')return openLocalManager();if(item?.localAction)return localAction(item.localAction);const track=state.localTracks.findIndex(t=>t.id===item?.id);if(track>=0)return playAt(track,state.localTracks,'local');}
 else if(state.page==='localManage'){const id=entries()[index]?.manageId;if(id===state.current?.id&&!state.localSelection.includes(id)){feedback('这首歌正在播放，请先切换歌曲');return;}if(id!==undefined){state.localSelection=state.localSelection.includes(id)?state.localSelection.filter(value=>value!==id):[...state.localSelection,id];render();}}
  else if(state.page==='playlists'){const p=state.playlists[index];if(p)return load('tracks',p.name,async()=>{const r=await api('tracks?id='+p.id);return {tracks:r.tracks,tracksSource:'playlist',playlistId:p.id,tracksMore:!!r.more,tracksOffset:r.nextOffset,tracksTotal:r.trackCount||p.trackCount||0,tracksSnapshot:r.snapshot||''};})}
 else if(state.page==='artists'){if(index===state.artists.length&&state.artistMore)return appendRows('artists','artists?offset='+state.artistOffset,'artistOffset','artistMore');const a=state.artists[index];if(a)return artistTracks(a)}
 else if(state.page==='tracks'){if(index===state.tracks.length&&state.tracksMore)return appendRows('tracks',state.tracksSource==='liked'?'liked?offset='+state.tracksOffset:state.tracksSource==='playlist'?'tracks?id='+state.playlistId+'&offset='+state.tracksOffset:'artist-tracks?id='+state.artistId+'&offset='+state.tracksOffset,'tracksOffset','tracksMore');return playAt(index,state.tracks,state.tracksSource)}
 else if(state.page==='queue')return playAt(index);
  else if(state.page==='covers')return playAt(index,state.coverCollection.tracks,state.coverCollection.mode);
 else if(state.page==='appearance'){if(index===0)state.theme=['auto','light','dark'][(['auto','light','dark'].indexOf(state.theme)+1)%3];if(index===1)state.largeText=!state.largeText;if(index===2)state.reducedMotion=!state.reducedMotion;render();}
 else if(state.page==='quality'){const q=qualities[index];if(q){state.quality=q.id;if(!native)try{window.localStorage?.setItem('pocketclassic.quality',q.id)}catch{}menu();footer('已选'+q.name+' · 重新选歌时生效')}}
 else if(state.page==='playing')return screenAction('mode');
 else if(state.page==='diagnostics'){if(index===0)diagnostics.setEnabled(!diagnostics.enabled);render();openReader();}
 else if(state.page==='settings'){if(index===8){navigate('diagnostics','本地体验诊断');return openReader();}if(index===0)return openLogin();if(index===5)return navigate('quality','音质选择');if(index===6)return navigate('appearance','显示与动态效果');if(index===7)return openHelp();if(index===1)state.haptics=!state.haptics;if(index===2&&state.queueMode!=='roam')state.shuffle=!state.shuffle;if(index===3&&state.queueMode!=='roam')state.repeat=(state.repeat+1)%3;if(index===4)state.dark=!state.dark;if(index===2||index===3)native?.configure({shuffle:state.shuffle,repeat:state.repeat});render()}}
function nowPlaying(){if(!state.current){footer('先从音乐菜单选择一首歌');return}if(state.page!=='playing')navigate('playing',state.queueMode==='roam'?'私人漫游':'正在播放')}
async function playAt(index,queue=state.queue,mode=state.queueMode){if(!queue[index])return;stopSeeking();diagnostics.begin('play');
 const reuseNative=!!(native&&queue===state.queue&&mode===state.queueMode&&state.nativeQueueSession);
 clearNotice();retryAction=()=>playAt(state.queueIndex);state.actualQuality='';state.buffering=true;
 native?.beginTransition();
 if(queue!==state.queue||mode!==state.queueMode){const collection=state.coverCollection?.tracks===queue?state.coverCollection:state.lastCollection?.tracks===queue?state.lastCollection:null;state.queueTitle=collection?.title||state.title;state.queueContinuation=collection?.continuation?{...collection.continuation}:null;state.queueHasMore=!!state.queueContinuation?.more||queue===state.tracks&&!!state.tracksMore;state.queueTotal=state.queueContinuation?.total||queue.length;state.queueError='';state.queueLoading=false;++queueEpoch;queueFill=null;roamFill=null;roamNext=null;if(mode!=='roam')roamStream.reset()}
 const epoch=++playEpoch;if(!native){audio.pause();audio.removeAttribute('src');audio.load();}state.queue=queue;state.queueMode=mode;state.queueIndex=index;state.current=queue[index];state.trial=false;lastPlayError='';
 const title=mode==='roam'?'私人漫游':'正在播放';if(state.page!=='playing')navigate('playing',title);else state.title=title;
 render();footer('正在获取播放资源…');
 try{if(native){if(reuseNative)await native.selectQueue(index,state.nativeQueueSession);else await native.playQueue(queue,index,mode,{shuffle:state.shuffle,repeat:state.repeat,volume:audio.volume,quality:state.quality,source:state.queueContinuation});if(epoch!==playEpoch)return;render();footer();feedback('换曲','state');return;}if(state.queueContinuation?.more)await api('queue-pin',{snapshot:state.queueContinuation.snapshot});if(epoch!==playEpoch)return;const r=await api('resolve',{id:state.current.id,quality:state.quality});if(epoch!==playEpoch)return;if(!r.url)throw Object.assign(Error('账号或版权限制，暂无音源，请试试下一首'),{reason:r.errorReason||'unavailable'});state.trial=!!r.trial;state.actualQuality=r.level||'';audio.src=r.url;audio.load();await audio.play();if(epoch!==playEpoch)return;state.buffering=false;render();footer(state.trial?'当前账号仅可试听':null);feedback('换曲','state');if(mode==='roam')refillRoam();else refillQueue()}
 catch(e){if(epoch===playEpoch){state.buffering=false;lastPlayError=e.message;footer(e,true)}}
}
function refillQueue(force=false){
 if(native)return native.retryQueue();
 const source=state.queueContinuation;if(!source?.more||state.queue.length>=5000||!force&&(state.queueError||!state.shuffle&&state.queue.length-state.queueIndex>5))return Promise.resolve(false);
 if(queueFill)return queueFill;const epoch=queueEpoch,queue=state.queue;state.queueLoading=true;state.queueError='';render();
 const task=(async()=>{try{const page=await api('queue-page?snapshot='+encodeURIComponent(source.snapshot)+'&offset='+source.offset);if(epoch!==queueEpoch||state.queue!==queue)return false;if(!Number.isInteger(page.nextOffset)||page.nextOffset<=source.offset&&page.more)throw Error('歌单分页没有前进，请重新进入歌单');const seen=new Set(queue.map(track=>track.id));queue.push(...page.tracks.filter(track=>track.id>0&&!seen.has(track.id)&&seen.add(track.id)).slice(0,5000-queue.length));source.offset=page.nextOffset;source.more=!!page.more&&queue.length<5000;state.queueHasMore=source.more;if(state.tracks===queue){state.tracksOffset=source.offset;state.tracksMore=source.more;}for(const collection of [state.lastCollection,state.coverCollection])if(collection?.tracks===queue)collection.continuation={...source};return true;
 }catch(error){if(epoch===queueEpoch)state.queueError=error.message;return false;}finally{if(epoch===queueEpoch){state.queueLoading=false;render();}}})();
 queueFill=task;task.then(success=>{if(queueFill===task){queueFill=null;if(success&&epoch===queueEpoch)refillQueue();}});return task;
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
function menu(home=false){if(state.hold){feedback('按键已锁定 · 拨动顶部开关解锁','warning');return;}if(pendingDestination)diagnostics.end('authorize','cancelled');pendingDestination=null;clearNotice();if(state.sleep){state.sleep=false;render();return}++requestEpoch;state.busy=false;state.navigationDirection=-1;if(home||!state.history.length){state.page='home';state.title='iPod';state.selected=0;state.history=[]}else Object.assign(state,state.history.pop());render()}
function rotate(delta){if(state.hold||state.busy)return;if(state.sleep){state.sleep=false;render();return}if(state.page==='playing'){tick();if(state.mode==='seek')seek(delta*3);else{audio.volume=Math.max(0,Math.min(1,audio.volume+delta*Math.max(.04,audio.volumeStep||0)));feedback('VOL '+Math.round(audio.volume*100),'state');}updateProgress()}else{const selected=Math.max(0,Math.min(entries().length-1,state.selected+delta));if(selected!==state.selected){state.selected=selected;tick();render()}}}
function seek(seconds){if(state.current&&Number.isFinite(audio.duration)){audio.currentTime=Math.max(0,Math.min(audio.duration,audio.currentTime+seconds));feedback(format(audio.currentTime),'state');updateProgress()}}
let seekingTimer=null;
function stopSeeking(){clearInterval(seekingTimer);seekingTimer=null;if(state.seeking){state.seeking=0;audio.endSeek?.();feedback(format(audio.currentTime),'state');}}
function startSeeking(direction){
 if(state.seeking===direction)return;
 stopSeeking();if(!state.current||!Number.isFinite(audio.duration)||audio.duration<=0||state.buffering)return;
 const track=state.current.id,start=Date.now();let previous=start;state.seeking=direction;audio.beginSeek?.();
 const advance=()=>{if(state.hold||state.sleep||state.current?.id!==track){stopSeeking();return;}const now=Date.now(),dt=Math.min(.25,(now-previous)/1000);previous=now;const speed=now-start>1800?24:10;const target=Math.max(0,Math.min(Math.max(0,audio.duration-.25),audio.currentTime+direction*speed*dt));if(target!==audio.currentTime)audio.currentTime=target;feedback(format(audio.currentTime),'state',false);updateProgress();};
 seekingTimer=setInterval(advance,120);
}
async function toggle(){if(state.sleep){state.sleep=false;render();return}if(state.busy)return;if(state.page==='tracks')return select();if(!state.current){footer('先从音乐菜单选择一首歌');return}if(lastPlayError)return playAt(state.queueIndex);try{if(audio.paused)await audio.play();else audio.pause()}catch(e){footer('播放失败，请重新选择歌曲',true)}}
async function next(){if(state.busy||!state.queue.length)return;
 if(native){clearNotice();return native.next().catch(e=>footer(e,true));}
 if(state.queueMode==='roam'){
   if(state.queueIndex+1<state.queue.length)return playAt(state.queueIndex+1);
   if(roamNext)return roamNext;const epoch=queueEpoch;footer('正在续接漫游推荐…');
   const task=(async()=>{await refillRoam();if(epoch===queueEpoch&&state.queueMode==='roam'&&state.queueIndex+1<state.queue.length)return playAt(state.queueIndex+1)})();
   roamNext=task;task.finally(()=>{if(roamNext===task)roamNext=null});return task;
 }
 if(state.queueContinuation?.more && state.queueIndex+1>=state.queue.length){await refillQueue(true);if(state.queueContinuation?.more&&state.queueIndex+1>=state.queue.length)return;}
 let index=state.queueIndex+1;if(state.shuffle&&state.queue.length>1){do{index=Math.floor(Math.random()*state.queue.length)}while(index===state.queueIndex)}if(index>=state.queue.length){if(state.repeat===2)index=0;else return}return playAt(index)
}
function previous(){if(native){clearNotice();return native.previous().catch(e=>footer(e,true));}if(audio.currentTime>3){audio.currentTime=0;return}if(state.queueIndex>0)playAt(state.queueIndex-1);else if(state.current)audio.currentTime=0}
function action(name,long=false){if(state.hold){stopSeeking();feedback('按键已锁定 · 拨动顶部开关解锁','warning');return;}if(state.sleep){state.sleep=false;render();return}if(long){if(name==='menu')return menu(true);if(name==='play'){stopSeeking();audio.pause();state.sleep=true;render();return}if(name==='previous')return startSeeking(-1);if(name==='next')return startSeeking(1);if(name==='select')return openQueue();}else{stopSeeking();if(name==='select')return select();tick();if(name==='menu')return menu();if(name==='play')return toggle();if(name==='previous')return previous();if(name==='next')return next()}}
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
function updateReaderControls(){if(!$('readerDialog').open||state.page!=='playing')return;const duration=Number.isFinite(audio.duration)?audio.duration:0,seek=$('readerSeek'),volume=$('readerVolume');if(seek&&document.activeElement!==seek){seek.max=duration;seek.value=Math.min(duration,audio.currentTime);seek.disabled=!duration;seek.setAttribute('aria-valuetext',format(audio.currentTime)+'，共 '+format(duration));}if(volume&&document.activeElement!==volume){volume.value=Math.round(audio.volume*100);volume.setAttribute('aria-valuetext',Math.round(audio.volume*100)+'%');}if($('readerPlay'))$('readerPlay').textContent=audio.paused?'播放':'暂停';}
for(const name of ['timeupdate','durationchange','volumechange','play','pause'])audio.addEventListener(name,updateReaderControls);
audio.addEventListener('playing',()=>{if(!native){diagnostics.end('play');diagnostics.end('recovery');}});
audio.addEventListener('timeupdate',updateProgress);audio.addEventListener('durationchange',updateProgress);audio.addEventListener('volumechange',updateProgress);audio.addEventListener('play',()=>{updatePlayIndicator();if(!native&&'mediaSession'in navigator){const cover=coverUrl(state.current?.cover);navigator.mediaSession.metadata=new MediaMetadata({title:state.current?.name||'',artist:state.current?.artist||'',album:state.current?.album||'',artwork:cover?[{src:cover,sizes:'320x320'}]:[]})}});audio.addEventListener('pause',()=>{updatePlayIndicator()});audio.addEventListener('ended',()=>{if(state.repeat===1){audio.currentTime=0;audio.play().catch(()=>{})}else next()});audio.addEventListener('error',()=>{if(state.current&&audio.error){lastPlayError='音频暂时无法加载，点击这里重试';footer(lastPlayError,true)}});
if(!native&&'mediaSession'in navigator){for(const [name,handler]of Object.entries({play:()=>audio.play(),pause:()=>audio.pause(),nexttrack:next,previoustrack:previous,seekbackward:()=>seek(-10),seekforward:()=>seek(10)})){try{navigator.mediaSession.setActionHandler(name,handler)}catch{}}}
function clearOnlineCollections(){state.tracks=[];state.tracksMore=false;state.tracksTotal=0;state.playlists=[];state.artists=[];state.artistMore=false;if(state.lastCollection?.mode!=='local')state.lastCollection=null;if(state.coverCollection?.mode!=='local')state.coverCollection=null;if(state.queueMode!=='local'){state.current=null;state.queue=[];state.queueHasMore=false;state.queueTitle='';}readerPositions.clear();state.readerQuery='';$('readerQuery').value='';}
async function updateAccount(){const r=await api('status'),wasConnected=state.connected;state.connected=!!r.authenticated;state.nickname=r.nickname||'';if($('loginDialog').open){$('loginState').textContent=r.message;$('qrImage').hidden=!r.qrImage;if(r.qrImage)$('qrImage').src=r.qrImage;$('newQr').hidden=!!r.authenticated;$('clearSession').hidden=!r.authenticated;if(r.authenticated)clearInterval(loginTimer)}if(wasConnected&&!state.connected){pendingDestination=null;clearOnlineCollections();menu(true);}else render();if(state.connected&&pendingDestination){const destination=pendingDestination;pendingDestination=null;if($('loginDialog').open)$('loginDialog').close();await destination.run();diagnostics.end('authorize',state.problem?'failed':'success');}return r}
async function openLogin(){clearNotice();if(native)return native.openConnection();$('loginDialog').showModal();try{await updateAccount()}catch(e){$('loginState').textContent=e.message}}
$('account').onclick=()=>{pendingDestination=null;return openLogin();};$('closeLogin').onclick=()=>{diagnostics.end('authorize','cancelled');pendingDestination=null;$('loginDialog').close();clearInterval(loginTimer)};$('loginDialog').addEventListener('cancel',()=>{diagnostics.end('authorize','cancelled');pendingDestination=null;clearInterval(loginTimer);});$('newQr').onclick=async()=>{try{$('newQr').disabled=true;await api('qr',{});await updateAccount();clearInterval(loginTimer);loginTimer=setInterval(()=>updateAccount().catch(e=>{$('loginState').textContent=e.message}),3000)}catch(e){$('loginState').textContent=e.message}finally{$('newQr').disabled=false}};
$('clearSession').onclick=async()=>{audio.pause();++playEpoch;++requestEpoch;++queueEpoch;roamStream.reset();roamFill=null;roamNext=null;await api('logout',{});clearOnlineCollections();state.connected=false;state.nickname='';state.queueMode='playlist';audio.removeAttribute('src');$('newQr').hidden=false;await updateAccount();menu(true)};$('goPlaying').onclick=()=>{$('moreDialog').close();nowPlaying()};$('closeMore').onclick=()=>{$('moreDialog').close()};
function updateBattery(value){const level=Number.isFinite(value?.level)?Math.max(0,Math.min(1,value.level)):null;state.battery={level,charging:!!value?.charging};$('battery').classList.toggle('charging',state.battery.charging);$('battery').classList.toggle('low',level!==null&&level<=.15);$('batteryLevel').style.width=level===null?'0%':Math.round(level*100)+'%';$('battery').setAttribute('aria-label',level===null?'电量不可用':Math.round(level*100)+'%'+(value.charging?' · 正在充电':''));$('battery').title=level===null?'当前环境不提供电量':Math.round(level*100)+'%';}
updateBattery(state.battery);
$('closeReader').onclick=closeReader;$('readerDialog').addEventListener('cancel',event=>{event.preventDefault();closeReader();});$('readerDialog').addEventListener('close',()=>{state.reader=false;readerClosing=false;readerAnimation?.cancel();readerAnimation=null;const key=$('readerContent').dataset.page;if(key)readerPositions.set(key,{scroll:$('readerDialog').scrollTop||0,query:state.readerQuery});$('openList').focus?.({preventScroll:true});});$('readerBack').onclick=()=>menu();$('openHelp').onclick=openHelp;$('closeHelp').onclick=$('dismissHelp').onclick=()=>$('helpDialog').close();
$('localShortcut').onclick=()=>localLibrary();$('openList').onclick=openReader;
$('quickQueue').onclick=openQueue;
$('openCovers').onclick=openCovers;$('openLocalManager').onclick=openLocalManager;
$('readerQuery').oninput=event=>{if(event.target.value)diagnostics.begin('find',{restart:false});else diagnostics.end('find','cancelled');state.readerQuery=event.target.value;state.readerOffset=0;renderReader();};
if(native)native.onBattery(updateBattery);
else if(navigator.getBattery)navigator.getBattery().then(b=>{const update=()=>updateBattery(b);update();b.addEventListener('levelchange',update);b.addEventListener('chargingchange',update)}).catch(()=>{});
render();
let lastFeedbackVolume=audio.volume;
audio.addEventListener('volumechange',()=>{const changed=audio.volume!==lastFeedbackVolume;lastFeedbackVolume=audio.volume;if(changed&&(!native||nativeInitialized))feedback('VOL '+Math.round(audio.volume*100),'state');});
if(native){
 native.onLocalProgress?.(value=>{if(state.busy&&['local','localManage'].includes(state.page)){state.localProgress=value;renderReader();}});
 native.onConnection(()=>{++requestEpoch;state.busy=false;state.tracks=[];state.tracksMore=false;state.playlists=[];state.artists=[];state.artistMore=false;updateAccount().catch(e=>footer(e,true));});
 native.onPlayback(value=>{
   if(state.busy)return;
   const fontChanged=Number.isFinite(value.fontScale)&&state.systemLargeText!==(value.fontScale>=1.2);if(fontChanged)state.systemLargeText=value.fontScale>=1.2;
   const trackChanged=state.current?.id!==value.current?.id;
   const changed=trackChanged||state.queueIndex!==value.index||state.queue.length!==value.count;
   const queueStatusChanged=state.queueLoading!==!!value.queueLoading||state.queueError!==(value.queueError||'')||state.queueHasMore!==!!value.queueMore;
   const statusChanged=state.buffering!==!!value.buffering||state.actualQuality!==(value.actualQuality||'');
   if(value.tracks)state.queue=value.tracks;state.queueIndex=value.index||0;state.current=value.current||null;state.queueMode=value.mode||'playlist';state.shuffle=!!value.shuffle;state.repeat=value.repeat||0;
   state.buffering=!!value.buffering;state.actualQuality=value.actualQuality||'';
   state.nativeQueueSession=value.queueSession||'';state.queueHasMore=!!value.queueMore;state.queueLoading=!!value.queueLoading;state.queueError=value.queueError||'';state.queueTotal=value.queueTotal||state.queue.length;state.queueTitle=value.queueTitle||state.queueTitle;
   if(!nativeInitialized){state.dark=!!value.dark;state.haptics=value.haptics!==false;state.quality=qualityValue(value.quality);state.theme=['auto','light','dark'].includes(value.theme)?value.theme:'auto';state.largeText=!!value.largeText;state.reducedMotion=!!value.reducedMotion;if(state.current)navigate('playing',state.queueMode==='roam'?'私人漫游':'正在播放');nativeInitialized=true;render();}
   state.trial=value.mode!=='local'&&!!state.current&&value.durationMs>0&&value.durationMs+2000<state.current.durationMs;
   if(changed){stopSeeking();lastPlayError='';clearNotice();if(state.page==='playing')state.title=state.queueMode==='roam'?'私人漫游':'正在播放';render();if(trackChanged&&state.current)feedback('换曲','state');}
   if(fontChanged&&!changed)render();
   if(queueStatusChanged)render();else if(statusChanged)renderReader();
   if(value.ready&&value.playing){diagnostics.end('play');diagnostics.end('recovery');}
   if(value.error){lastPlayError=value.error;footer({message:value.error,reason:value.errorReason},true);}else updateProgress();
 });
 native.ready.then(()=>updateAccount().catch(()=>{state.connected=false;render();footer('网易云暂不可用 · 已下载和本地音乐仍可离线播放');})).catch(e=>footer(e,true));
 native.back=()=>{const dialog=Array.from(document.querySelectorAll('dialog[open]')).at(-1);if(dialog){if(dialog.id==='readerDialog')closeReader();else dialog.close();return;}if(state.feedback&&state.feedbackLevel==='warning'&&!state.problem){dismissFeedback();return;}if(document.body.classList.contains('options-open')){$('playerOptionsToggle').click();return;}if(state.page!=='home')menu();else native.request('finish');};
}else if(location.protocol!=='file:')updateAccount().catch(e=>footer('离线预览 · 连接本机音乐服务后可听歌'));
window.PocketClassicContext={state,audio,native,diagnostics,entries,format,action,stopSeeking,rotate,select,render,screenAction,openReader,openCovers,openLocalManager,openHelp,feedback,openAppearance:()=>navigate('appearance','显示与动态效果'),footerText:()=>$('lcdFooter').textContent};
