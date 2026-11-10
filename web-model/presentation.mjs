export function menuMarker(page,item,index,state) {
  if(page==='localManage')return state.localSelection?.includes(item.id)?'✓':'○';
  if(page==='local')return item.localAction?(item.localAction==='localScan'?'↻':'＋'):item.id===state.current?.id?'▶':'';
  if(page==='quality')return item.id===state.quality?'✓':'';
  if(page==='tracks'||page==='queue')return item.more?'＋':item.id===state.current?.id?'▶':'';
  if(page==='appearance')return index===0?'↻':(index===1?(state.largeText||state.systemLargeText):state.reducedMotion)?'开':'关';
  if(page==='settings')return state.queueMode==='roam'&&(index===2||index===3)?'—':index===0||index>=5?'›':index===1?(state.haptics?'开':'关'):index===2?(state.shuffle?'开':'关'):index===3?['关闭','单曲','全部'][state.repeat]:'';
  return '›';
}
export function listWindow(state,count) {
  const rowHeight=state.page==='home'?((state.largeText||state.systemLargeText)?42:32):(state.largeText||state.systemLargeText)?46:38;
  const visible=Math.floor(198/rowHeight);
  const start=Math.max(0,Math.min((state.selected||0)-Math.floor(visible/2),Math.max(0,count-visible)));
  return {rowHeight,visible,start,width:state.page==='home'?158:320};
}
export function previewContent(state) {
  if(state.selected===3)return {title:'你的 Classic',subtitle:state.dark?'石墨黑机身':'银色机身',symbol:'◉'};
  if(state.selected===2)return {title:'随机播放',subtitle:state.lastCollection?.title|| (state.queue?.length?'当前播放队列':'先选择一个音乐列表'),symbol:'↝'};
  if(state.current)return {title:state.current.name,subtitle:state.current.artist,track:state.current};
  return {title:state.selected===1?'还没有播放':'音乐在手边',subtitle:state.connected?'歌单 · 日推 · 本地音乐':'网易云歌单 / 本地免登录'};
}
export function collectionScope(state,page=state.page){
  if(page==='covers')return `${state.coverCollection?.title||'封面浏览'} · ${state.coverCollection?.tracks?.length||0} 首`;
  if(page==='local'||page==='localManage')return `手机本地音乐 · ${state.localTracks?.length||0} 首 · 无需登录`;
  if(page==='queue'){const count=state.queue?.length||0;return `${state.queueTitle||'当前队列'} · ${count}${state.queueTotal>count?' / '+state.queueTotal:''} 首${state.queueLoading?' · 正在续载':state.queueError?' · 续载失败，可重试':state.queueHasMore?(state.queueContinuation||state.nativeQueueSession?' · 将继续载入':' · 仅含已加载歌曲'):count>=5000&&state.queueTotal>count?' · 已到 5000 首上限':''}`;}
  if(page==='tracks')return state.tracksMore?`搜索已加载的 ${state.tracks?.length||0} 首${state.tracksTotal?' / 共 '+state.tracksTotal+' 首':''}`:`当前列表 · ${state.tracks?.length||0} 首`;
  if(page==='artists')return `收藏的歌手 · ${state.artists?.length||0} 位${state.artistMore?' · 仅搜索已加载内容':''}`;
  return `当前${state.title||'音乐'} · ${page==='playlists'?state.playlists?.length||0:0} 项`;
}
export function matchingEntries(list,query=''){
  const words=String(query).trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return list.map((item,index)=>({item,index})).filter(({item})=>!words.length||!item.more&&!item.localAction&&words.every(word=>[item.name,item.sub,item.artist,item.album].filter(Boolean).join(' ').toLocaleLowerCase().includes(word)));
}
export function emptyContent(page) {
  if(page==='local'||page==='localManage')return ['还没有本地音乐','导入文件或扫描手机音乐，无需连接网易云'];
  if(page==='artists')return ['还没有收藏歌手','在网易云收藏歌手后，再来这里看看'];
  if(page==='playlists')return ['还没有歌单','在网易云创建或收藏歌单后刷新'];
  if(page==='queue')return ['队列还是空的','从音乐菜单选择一首歌'];
  return ['这里还没有歌曲','按 MENU 返回，换个列表看看'];
}
export function qualityLabel(value) {
  return ({offline:'离线播放',standard:'标准',higher:'较高',exhigh:'极高',lossless:'无损',hires:'Hi-Res',jyeffect:'高清环绕',sky:'沉浸环绕',jymaster:'超清母带'})[value]||'';
}
export function appearanceIsDark(theme,systemDark) { return theme==='dark'||theme==='auto'&&systemDark; }
export function playbackGlyph(current,paused){return current?(paused?'play':'pause'):'';}
export function canAdvance(state) { return !!state.current&&!!((state.queueIndex||0)+1<(state.queue?.length||0)||state.queueHasMore||state.queueMode==='roam'||state.repeat===2||state.shuffle&&(state.queue?.length||0)>1); }
