export function menuMarker(page,item,index,state) {
  if(page==='quality')return item.id===state.quality?'✓':'';
  if(page==='tracks'||page==='queue')return item.more?'＋':item.id===state.current?.id?'▶':'';
  if(page==='appearance')return index===0?'↻':(index===1?state.largeText:state.reducedMotion)?'开':'关';
  if(page==='settings')return state.queueMode==='roam'&&(index===2||index===3)?'—':index===0||index>=5?'›':index===1?(state.haptics?'开':'关'):index===2?(state.shuffle?'开':'关'):index===3?['关闭','单曲','全部'][state.repeat]:'';
  return '›';
}
export function listWindow(state,count) {
  const rowHeight=state.page==='home'?32:state.largeText?46:38;
  const visible=Math.floor(198/rowHeight);
  const start=Math.max(0,Math.min((state.selected||0)-Math.floor(visible/2),Math.max(0,count-visible)));
  return {rowHeight,visible,start,width:state.page==='home'?158:320};
}
export function previewContent(state) {
  if(state.selected===3)return {title:'你的 Classic',subtitle:state.dark?'石墨黑机身':'银色机身',symbol:'◉'};
  if(state.selected===2)return {title:'换一种顺序',subtitle:'从当前列表随机播放',symbol:'↝'};
  if(state.current)return {title:state.current.name,subtitle:state.current.artist,track:state.current};
  return {title:state.selected===1?'还没有播放':'音乐在手边',subtitle:state.connected?'歌单 · 日推 · 私人漫游':'连接网易云，开始听歌'};
}
export function emptyContent(page) {
  if(page==='artists')return ['还没有收藏歌手','在网易云收藏歌手后，再来这里看看'];
  if(page==='playlists')return ['还没有歌单','在网易云创建或收藏歌单后刷新'];
  if(page==='queue')return ['队列还是空的','从音乐菜单选择一首歌'];
  return ['这里还没有歌曲','按 MENU 返回，换个列表看看'];
}
export function qualityLabel(value) {
  return ({standard:'标准',higher:'较高',exhigh:'极高',lossless:'无损',hires:'Hi-Res',jyeffect:'高清环绕',sky:'沉浸环绕',jymaster:'超清母带'})[value]||'';
}
export function appearanceIsDark(theme,systemDark) { return theme==='dark'||theme==='auto'&&systemDark; }
export function canAdvance(state) { return !!state.current&&!!((state.queueIndex||0)+1<(state.queue?.length||0)||state.queueMode==='roam'||state.repeat===2||state.shuffle&&(state.queue?.length||0)>1); }
