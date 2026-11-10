import './player.mjs';
import {startFrontView} from './front-view.mjs';

let presentation;
function fallback(message='三维界面暂不可用，已切换简洁界面，可以继续听歌。'){
  if(document.body.classList.contains('three-fallback'))return;
  document.body.classList.add('three-fallback','three-ready');presentation?.stop();document.body.classList.remove('startup-playing','showcase-playing');
  for(const element of document.querySelectorAll('#loadingPoster,.startup-skip,.startup-rings'))element.remove();
  const app=window.PocketClassicContext;
  const resize=()=>{const height=window.visualViewport?.height||innerHeight;document.documentElement.style.setProperty('--app-height',height+'px');document.documentElement.style.height=height+'px';document.body.style.height=height+'px';};resize();window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
  document.getElementById('playerAccountSlot').append(document.getElementById('account'));
  const toggle=document.getElementById('playerOptionsToggle');toggle.onclick=()=>{const open=document.body.classList.toggle('options-open');toggle.setAttribute('aria-expanded',String(open));};
  document.getElementById('frontColor').onclick=()=>{app.state.dark=!app.state.dark;app.render();};document.getElementById('openAppearance').onclick=()=>app.openAppearance();
  const status=document.getElementById('modelStatus');status.textContent=message;status.setAttribute('role','status');document.getElementById('uiAnnouncement').textContent=message;
  document.getElementById('screen').addEventListener('click',()=>{if(app.state.page==='playing')app.openReader();});app.render();
}
window.PocketClassicPresentation={fallback};
try { presentation=startFrontView({onFallback:fallback}); }
catch { fallback(); }
