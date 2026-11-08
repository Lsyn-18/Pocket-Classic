import * as THREE from 'three';
import {createArtworkStore} from './artwork.mjs';
import {drawBattery} from './battery.mjs';
import {visualBaseline} from './visual-profile.mjs';
import {menuMarker,listWindow,previewContent,emptyContent,qualityLabel,canAdvance,playbackGlyph} from './presentation.mjs';

const FONT='"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
export function makeScreen(app,{pixelScale=4,maxAnisotropy=1,baseline=visualBaseline}={}) {
  const scale=baseline?2:Math.max(3,Math.min(4,pixelScale));
  const canvas=document.createElement('canvas');canvas.width=320*scale;canvas.height=240*scale;
  const c=canvas.getContext('2d'),texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;texture.minFilter=baseline?THREE.LinearFilter:THREE.LinearMipmapLinearFilter;
  texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=!baseline;texture.anisotropy=baseline?1:Math.min(8,maxAnisotropy);
  const artwork=createArtworkStore({resolve:app.native?url=>app.native.artwork(url):undefined});
  const systemReduced=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
  let lastKey='',selectionKey='',selectedAt=0,listLayout=null,zones=[],now=0,animated=false;
  const font=(size,weight=400)=>`${weight} ${size}px ${FONT}`;
  function text(value,x,y,width,size=14,color='#1c2732',weight=400,scroll=false) {
    const original=String(value??'');c.font=font(size,weight);c.fillStyle=color;c.textBaseline='middle';
    const measured=c.measureText(original).width;
    if(scroll&&measured>width&&!app.state.reducedMotion&&!systemReduced?.matches&&now-selectedAt>1100) {
      animated=true;const travel=measured-width+18,phase=((now-selectedAt-1100)/1000*24)%(travel+48),offset=Math.min(travel,phase);
      c.save();c.beginPath();c.rect(x,y-size,width,size*2);c.clip();c.fillText(original,x-offset,y);c.restore();return;
    }
    let result=original;while(c.measureText(result).width>width&&result.length>1)result=result.slice(0,-2)+'…';c.fillText(result,x,y);
    if(scroll&&measured>width&&!app.state.reducedMotion&&!systemReduced?.matches)animated=true;
  }
  function wrap(value,x,y,width,size=12,maxLines=3,color='#46576a') {
    c.font=font(size);let line='',lines=[];for(const char of String(value)){if(c.measureText(line+char).width>width&&line){lines.push(line);line=char;}else line+=char;}if(line)lines.push(line);
    lines.slice(0,maxLines).forEach((line,index)=>text(line+(index===maxLines-1&&lines.length>maxLines?'…':''),x,y+index*(size+6),width,size,color));
  }
  function album(x,y,size,track) {
    const image=artwork.get(track);if(image){const side=Math.min(image.naturalWidth,image.naturalHeight);c.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,x,y,size,size);return;}
    const gradient=c.createLinearGradient(x,y,x+size,y+size);gradient.addColorStop(0,'#435f70');gradient.addColorStop(1,'#a4bac8');c.fillStyle=gradient;c.fillRect(x,y,size,size);
    c.strokeStyle='#e7eff777';c.lineWidth=2;c.beginPath();c.arc(x+size/2,y+size/2,size*.32,0,Math.PI*2);c.stroke();c.fillStyle='#304b5b';c.beginPath();c.arc(x+size/2,y+size/2,size*.15,0,Math.PI*2);c.fill();c.fillStyle='#e7eef3';c.beginPath();c.arc(x+size/2,y+size/2,size*.035,0,Math.PI*2);c.fill();
  }
  function button(label,x,y,width,action,primary=true) {
    c.fillStyle=primary?'#246ab4':'#e5ebf1';c.fillRect(x,y,width,30);text(label,x+12,y+15,width-24,12,primary?'#fff':'#2b4359',500);zones.push({x,y,width,height:30,action});
  }
  function draw(force=false,neutral=false) {
    now=typeof performance!=='undefined'?performance.now():Date.now();
    const s=neutral?{page:'home',selected:0,title:'iPod',battery:app.state.battery}:app.state,a=app.audio;
    const selection=[s.page,s.selected,s.current?.id,s.mode,s.seeking].join(':');if(selection!==selectionKey){selectionKey=selection;selectedAt=now;}
    artwork.get(s.current);
    const key=JSON.stringify([s.page,s.selected,s.title,s.current,s.battery,s.nickname,s.connected,s.busy,s.hold,s.sleep,s.mode,s.seeking,s.trial,s.queueMode,s.queue?.length,s.queueIndex,s.tracks?.length,s.playlists?.length,s.artists?.length,s.artistMore,s.tracksMore,s.quality,s.actualQuality,s.buffering,s.haptics,s.shuffle,s.repeat,s.dark,s.theme,s.largeText,s.reducedMotion,s.problem,s.feedback,s.feedbackLevel,s.feedbackAt,artwork.revision,Math.floor((a?.currentTime||0)*(s.seeking?10:1)),a?.paused,a?.volume,app.footerText?.(),animated?Math.floor(now/50):0]);
    if(!force&&key===lastKey)return;lastKey=key;animated=false;zones=[];listLayout=null;
    c.setTransform(scale,0,0,scale,0,0);c.fillStyle=s.sleep?'#151d28':'#fbfcfe';c.fillRect(0,0,320,240);
    if(s.sleep){texture.needsUpdate=true;return;}
    const head=c.createLinearGradient(0,0,0,24);head.addColorStop(0,'#f9fbfc');head.addColorStop(1,'#d6dee7');c.fillStyle=head;c.fillRect(0,0,320,24);c.fillStyle='#b3bfcc';c.fillRect(0,23,320,1);
    text(s.title,8,12,208,14,'#202c38',600);if(s.hold)text('HOLD',221,12,35,9,'#475b6c',600);
    const glyph=!neutral&&playbackGlyph(s.current,a?.paused);if(glyph){c.fillStyle='#246ab4';if(glyph==='pause'){c.fillRect(265,7,3,10);c.fillRect(270,7,3,10);}else{c.beginPath();c.moveTo(265,7);c.lineTo(273,12);c.lineTo(265,17);c.closePath();c.fill();}}if(s.feedback&&s.feedbackLevel==='state')text(s.feedback,276,12,42,10,'#33506a');else drawBattery(c,s.battery);
    if(s.page==='playing'&&s.current){
      const t=s.current;album(12,38,108,t);text(t.name,134,51,174,s.largeText?17:15,'#172b3e',600,true);text(t.artist,134,76,174,13,'#40576c');text(t.album||'未知专辑',134,98,174,11,'#53677c');
      const status=s.seeking?(s.seeking>0?'快进 ››':'‹‹ 快退'):s.buffering?'正在缓冲…':s.trial?'试听片段':a.paused?'已暂停':'正在播放';
      text(status,134,120,174,11,'#275783',500);text(s.queueMode==='local'?'离线 · '+(t.format||'本地'):s.actualQuality?qualityLabel(s.actualQuality):'按权限提供',134,140,174,10,'#52677a');
      const duration=Number.isFinite(a.duration)?a.duration:t.durationMs/1000,progress=Math.max(0,Math.min(1,(a.currentTime||0)/Math.max(1,duration))),seek=s.mode==='seek';
      c.fillStyle='#c5d2df';c.fillRect(14,162,292,3);c.fillStyle=seek||s.seeking?'#125dae':'#2874b9';c.fillRect(14,162,292*progress,3);
      text(app.format(a.currentTime),14,181,110,11);text(seek?'调整进度':'播放进度',128,181,108,10,seek?'#205e9f':'#53677c',seek?600:400);text('−'+app.format(duration-a.currentTime),254,181,54,11);
      text('音量 '+Math.round(a.volume*100)+'%',14,207,90,11,seek?'#53677c':'#205e9f',seek?400:600);c.fillStyle='#d8e0e8';c.fillRect(104,205,100,4);c.fillStyle=seek?'#8b9caf':'#2874b9';c.fillRect(104,205,100*a.volume,4);
      text('队列 '+(s.queueIndex+1)+'/'+s.queue.length+' ›',225,207,83,11,'#275f92',500);
      zones.push({x:8,y:154,width:200,height:66,action:'mode'},{x:215,y:194,width:100,height:28,action:'queue'},{x:10,y:28,width:300,height:124,action:'details'});
    }else{
      const list=neutral?['音乐','正在播放','随机播放歌曲','设置'].map(name=>({name})):app.entries();const layout=listWindow(s,list.length),{start,visible,rowHeight,width}=layout;
      if(s.page==='home'){
        c.fillStyle='#edf2f6';c.fillRect(158,24,162,200);c.fillStyle='#cad5df';c.fillRect(158,24,1,200);
        const preview=previewContent(s);if(preview.symbol){text(preview.symbol,213,94,80,42,'#55748c',400);}else album(199,52,80,preview.track);
        text(preview.title,170,158,138,12,'#2f4a61',500);wrap(preview.subtitle,170,181,138,10,2,'#50677a');
      }
      list.slice(start,start+visible).forEach((item,i)=>{
        const idx=start+i,y=24+i*rowHeight,active=idx===s.selected;
        if(active){const gradient=c.createLinearGradient(0,y,0,y+rowHeight);gradient.addColorStop(0,'#4d9de0');gradient.addColorStop(1,'#246ab8');c.fillStyle=gradient;c.fillRect(0,y,width,rowHeight);}
        const nameSize=s.largeText&&s.page!=='home'?16:14;
        text(item.name,9,y+(item.sub?rowHeight*.34:rowHeight/2),width-40,nameSize,active?'#fff':'#1b2b3a',active?500:400,active);
        if(item.sub)text(item.sub,9,y+rowHeight*.76,width-38,s.largeText?11:10.5,active?'#edf5ff':'#4b6278');
        text(menuMarker(s.page,item,idx,s),width-25,y+rowHeight/2,23,12,active?'#fff':'#456077',500);
      });
      if(list.length>visible){c.fillStyle='#d7e0e9';c.fillRect(315,27,2,190);c.fillStyle='#879bb0';c.fillRect(315,27+190*start/list.length,2,Math.max(12,190*visible/list.length));}
      if(!list.length&&!s.busy){const empty=emptyContent(s.page);text(empty[0],22,104,276,16,'#314a60',500);wrap(empty[1],22,134,276,12,3);}
      listLayout={...layout,count:list.length};
    }
    c.fillStyle='#e8eef4';c.fillRect(0,224,320,16);const count=app.entries?.().length||0,position=count>5&&s.page!=='playing'?`${(s.selected||0)+1}/${count}`:'';
    const footer=s.page==='playing'&&s.current?(s.mode==='seek'?'转轮调整进度 · 中央键切换音量':'转轮调整音量 · 中央键切换进度'):app.footerText?.()||'MENU 返回 · 中央键选择';
    text(neutral?'Pocket Classic':s.problem?'点此重试 · '+s.problem.message:footer,7,232,position?262:306,10,s.problem?'#33506a':'#4e657b');if(position)text(position,277,232,38,9,'#526a80');
    if(s.busy){c.fillStyle='#fbfcfef2';c.fillRect(0,24,320,200);text('正在读取'+s.title+'…',27,112,266,15,'#365874',500);text('按 MENU 可返回',27,142,266,12,'#526a80');}
    if(s.problem)zones.push({x:0,y:224,width:320,height:16,action:'retry'});
    if(s.feedback&&s.feedbackLevel!=='state'){
      const warning=s.feedbackLevel==='warning',duration=warning?2400:1200,elapsed=Date.now()-(s.feedbackAt||Date.now());
      const fade=s.reducedMotion||systemReduced?.matches?1:Math.max(0,Math.min(1,elapsed/120,(duration-elapsed)/160));
      animated=true;c.save();c.globalAlpha=fade;
      if(warning){
        c.fillStyle='#fbfcfe';c.strokeStyle='#c9d6e2';c.lineWidth=1;c.shadowColor='rgba(32,53,74,.08)';c.shadowBlur=12;c.shadowOffsetY=4;
        c.beginPath();c.roundRect(8,34,304,108,4);c.fill();c.shadowColor='transparent';c.stroke();
        wrap(s.feedback,20,56,280,13,2,'#33506a');
        const underlying=zones;zones=[];
        if(s.problem){button(s.problem.login?'重新连接':'重试',20,100,96,'retry',false);button(canAdvance(s)?'下一首':'返回列表',124,100,108,canAdvance(s)?'next':'back',false);}
        text('知道了',252,115,50,12,'#33506a',500);zones.push({x:244,y:94,width:64,height:44,action:'dismiss'});
        zones.push({x:8,y:34,width:304,height:108,action:'dismiss'},...underlying);
      }else{c.fillStyle='#f7fafc';c.fillRect(0,218,320,22);c.fillStyle='#dbe4ec';c.fillRect(0,218,320,1);text(s.feedback,14,230,292,12,'#3d5670');}
      c.restore();
    }
    if(!baseline){c.strokeStyle='rgba(27,46,68,.08)';c.lineWidth=.5;c.strokeRect(.25,24.25,319.5,199.5);}
    texture.needsUpdate=true;
  }
  draw(true);
  return {canvas,texture,draw,pixelScale:scale,dispose(){texture.dispose();},hit(x,y){
    if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>320||y<24||y>=240)return null;
    for(const zone of zones)if(x>=zone.x&&x<zone.x+zone.width&&y>=zone.y&&y<zone.y+zone.height)return zone.action;
    if(y>=224||!listLayout||x>listLayout.width)return null;const row=Math.floor((y-24)/listLayout.rowHeight);if(row>=listLayout.visible)return null;const index=listLayout.start+row;return index<listLayout.count?index:null;
  },neutralTexture(){const copy=makeScreen({...app,state:{page:'home',selected:0,title:'iPod'},audio:{paused:true,currentTime:0,volume:.65},entries:()=>[],footerText:()=>''},{pixelScale:scale,maxAnisotropy,baseline});copy.draw(true,true);return copy.texture;}};
}
