import * as THREE from 'three';
import {createArtworkStore} from './artwork.mjs';
import {drawBattery} from './battery.mjs';
import {visualBaseline} from './visual-profile.mjs';

const LCD_FONT='"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", sans-serif';

export function makeScreen(app,{pixelScale=4,maxAnisotropy=1,baseline=visualBaseline}={}) {
  const scale=baseline?2:Math.max(3,Math.min(4,pixelScale));
  const canvas = document.createElement('canvas'); canvas.width=320*scale; canvas.height=240*scale;
  const c=canvas.getContext('2d'); const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  texture.minFilter=baseline?THREE.LinearFilter:THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=!baseline;texture.anisotropy=baseline?1:Math.min(8,maxAnisotropy);
  const palette=baseline?{}:{'#687b8e':'#465e73','#8593a3':'#5b7185','#7e8b9b':'#5d7286','#8190a0':'#61778a','#7b8a9c':'#566d82','#8090a1':'#5d7386'};
  let lastKey=''; let listLayout=null;
  const artwork=createArtworkStore({resolve:app.native?url=>app.native.artwork(url):undefined});
  function text(value,x,y,maxWidth,font='13px Arial',color='#18222e') {
    c.font=baseline?font:font.replace('Arial',LCD_FONT);c.fillStyle=palette[color]||color;c.textBaseline='middle';let s=String(value??'');
    while(c.measureText(s).width>maxWidth&&s.length>1)s=s.slice(0,-2)+'…';c.fillText(s,x,y);
  }
  function album(x,y,size,track) {
    const image=artwork.get(track);
    if(image){const side=Math.min(image.naturalWidth,image.naturalHeight);c.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,x,y,size,size);return;}
    const id=track?.id||0;
    const palettes=[['#335268','#9fb7c9'],['#8b6045','#c9b29a'],['#3b5550','#a6b8a3']];const colors=palettes[Math.abs(Number(id))%3];
    const gradient=c.createLinearGradient(x,y,x+size,y+size);gradient.addColorStop(0,colors[0]);gradient.addColorStop(1,colors[1]);c.fillStyle=gradient;c.fillRect(x,y,size,size);
    c.strokeStyle='#dae6ed66';c.lineWidth=2;c.beginPath();c.arc(x+size*.5,y+size*.52,size*.36,0,Math.PI*2);c.stroke();
    c.fillStyle='#20394faa';c.beginPath();c.arc(x+size*.5,y+size*.52,size*.18,0,Math.PI*2);c.fill();c.fillStyle='#dde8ed';c.beginPath();c.arc(x+size*.5,y+size*.52,size*.045,0,Math.PI*2);c.fill();
  }
  function draw(force=false,neutral=false) {
    const s=neutral?{page:'home',selected:0,title:'iPod',connected:false,nickname:'',hold:false,sleep:false,shuffle:false,mode:'volume'}:app.state;
    const a=app.audio;
    // Start the request even when an unchanged, paused screen skips painting.
    artwork.get(s.current);
    const key=JSON.stringify([s.page,s.selected,s.title,s.current?.id,s.current?.cover,artwork.revision,s.battery?.level,s.battery?.charging,s.nickname,s.connected,s.busy,s.hold,s.sleep,s.mode,s.trial,s.queueMode,s.queue?.length,s.queueIndex,s.tracks?.length,s.playlists?.length,s.noticeError,s.haptics,s.shuffle,s.repeat,s.dark,Math.floor(a?.currentTime||0),a?.paused,a?.volume,app.footerText?.()]);
    if(!force&&key===lastKey)return;lastKey=key;
    c.setTransform(scale,0,0,scale,0,0);c.fillStyle=s.sleep?'#151d28':'#fcfdff';c.fillRect(0,0,320,240);listLayout=null;
    if(s.sleep){texture.needsUpdate=true;return}
    const head=c.createLinearGradient(0,0,0,24);head.addColorStop(0,'#f7f9fc');head.addColorStop(.5,'#e4e9ef');head.addColorStop(1,'#c0c9d5');c.fillStyle=head;c.fillRect(0,0,320,24);c.fillStyle='#a5afbd';c.fillRect(0,23,320,1);
    text(s.title,7,12,230,'bold 14px Arial');
    if(s.hold)text('HOLD',242,12,29,'8px Arial','#6a7584');
    if(a&&!a.paused&&!neutral){c.fillStyle='#3e84bd';c.beginPath();c.moveTo(270,7);c.lineTo(278,12);c.lineTo(270,17);c.closePath();c.fill()}
    drawBattery(c,s.battery);
    if(s.page==='playing'&&s.current){
      const t=s.current;album(12,40,95,t);text(t.name,120,57,188,'bold 15px Arial');text(t.artist,120,82,188,'12px Arial','#687b8e');text(t.album||(s.queueMode==='roam'?'私人 FM · 连续推荐':`${s.queueIndex+1} / ${s.queue.length}`),120,109,180,'10px Arial','#8593a3');
      const duration=Number.isFinite(a.duration)?a.duration:t.durationMs/1000;const progress=(a.currentTime||0)/Math.max(1,duration);
      text(s.trial?'试听片段':s.mode==='seek'?'转动转轮调整进度':'转动转轮调整音量',12,158,295,'10px Arial','#7e8b9b');
      c.fillStyle='#d5deea';c.fillRect(12,174,296,8);c.fillStyle='#3984c4';c.fillRect(12,174,296*Math.min(1,progress),8);c.strokeStyle='#9cabbd';c.strokeRect(12,174,296,8);
      text(app.format(a.currentTime),12,195,120,'11px Arial');text('−'+app.format(duration-a.currentTime),255,195,58,'11px Arial');
      text(`音量 ${Math.round(a.volume*100)}%`,12,214,160,'9px Arial','#8190a0');
    }else{
      const list=neutral?['音乐','正在播放','随机播放歌曲','设置'].map(name=>({name})):app.entries();
      const split=s.page==='home';const rowH=split?32:36;const visible=Math.floor(198/rowH);const start=Math.max(0,Math.min(s.selected-2,list.length-visible));const width=split?158:320;
      if(split){const gradient=c.createLinearGradient(159,24,320,222);gradient.addColorStop(0,'#dce4ed');gradient.addColorStop(1,'#f1f5fa');c.fillStyle=gradient;c.fillRect(159,24,161,200);c.fillStyle='#c1ccda';c.fillRect(158,24,1,200);c.save();c.translate(242,100);c.rotate(-.13);album(-43,-43,86,s.current);c.globalAlpha=.16;c.scale(1,-1);album(-43,-135,86,s.current);c.restore();text('MUSIC',216,198,90,'10px Arial','#7d8fa6')}
      list.slice(start,start+visible).forEach((item,i)=>{const idx=start+i,y=24+i*rowH,active=idx===s.selected;if(active){const gradient=c.createLinearGradient(0,y,0,y+rowH);gradient.addColorStop(0,'#69b3eb');gradient.addColorStop(.5,'#3d93de');gradient.addColorStop(1,'#1e6ac1');c.fillStyle=gradient;c.fillRect(0,y,width,rowH)}
        const nameFont=baseline?(active?'bold 13px Arial':'13px Arial'):(active?'700 14px Arial':'600 14px Arial');
        text(item.name,8,y+(item.sub?12:rowH/2),width-29,nameFont,active?'#fff':'#172332');if(item.sub)text(item.sub,8,y+27,width-29,baseline?'9px Arial':'10px Arial',active?'#e0eeff':'#7b8a9c');text('›',width-15,y+rowH/2,12,'19px Arial',active?'#fff':'#536378')});
      if(!list.length&&!s.busy)text(s.page==='playing'?'按 MENU 返回音乐菜单':'暂无歌曲，按 MENU 返回重试',50,121,260,'12px Arial','#7b8a9c');
      listLayout={start,rowH,width,count:list.length};
    }
    c.fillStyle=s.noticeError?'#fae4bd':'#e8eef5';c.fillRect(0,224,320,16);text(neutral?'Pocket Classic':(app.footerText?.()||(s.connected?'网易云音乐 · '+s.nickname:'选择音乐，开始播放')),6,232,307,baseline?'8px Arial':'10px Arial',s.noticeError?'#845730':'#8090a1');
    if(s.busy){c.fillStyle='#ffffffd9';c.fillRect(0,24,320,200);text('正在读取音乐…',108,120,150,'12px Arial','#5c7896')}
    if(!baseline){
      // Subpixel lattice, kept below 2% opacity so small Chinese text stays clear.
      c.save();c.strokeStyle='rgba(52,76,98,.018)';c.lineWidth=1/scale;c.beginPath();
      for(let x=0;x<320;x+=2){c.moveTo(x+.5,24);c.lineTo(x+.5,224)}
      for(let y=24;y<224;y+=2){c.moveTo(0,y+.5);c.lineTo(320,y+.5)}c.stroke();
      const edge=c.createLinearGradient(0,24,0,32);edge.addColorStop(0,'rgba(22,41,63,.07)');edge.addColorStop(1,'rgba(22,41,63,0)');c.fillStyle=edge;c.fillRect(0,24,320,8);
      c.strokeStyle='rgba(27,46,68,.10)';c.lineWidth=.5;c.strokeRect(.25,24.25,319.5,199.5);c.restore();
    }
    texture.needsUpdate=true;
  }
  draw(true);
  return {canvas,texture,draw,pixelScale:scale,dispose(){texture.dispose();},hit(x,y){if(!listLayout||y<24||y>=224||x>listLayout.width)return null;const i=listLayout.start+Math.floor((y-24)/listLayout.rowH);return i<listLayout.count?i:null;},neutralTexture(){const copy=makeScreen({...app,state:{page:'home',selected:0,title:'iPod'},audio:{paused:true,currentTime:0,volume:.65},entries:()=>[],footerText:()=>''},{pixelScale:scale,maxAnisotropy,baseline});copy.draw(true,true);return copy.texture;}};
}
