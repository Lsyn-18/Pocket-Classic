// Saturated LCD cell; the fill follows the device's real level.
export function drawBattery(c,battery,{x=285,y=7}={}) {
  const level=Number.isFinite(battery?.level)?Math.max(0,Math.min(1,battery.level)):null;
  const low=level!==null&&level<=.15;
  c.save();c.translate(x,y);
  c.fillStyle='#77828c';c.beginPath();c.roundRect(26.7,3.25,1.75,4.5,.7);c.fill();
  c.fillStyle='#f4f7f8';c.strokeStyle='#697780';c.lineWidth=.85;
  c.beginPath();c.roundRect(.5,.5,26,10,1.6);c.fill();c.stroke();
  c.save();c.beginPath();c.roundRect(2,2,23,7, .65);c.clip();
  c.fillStyle='#e1e6e9';c.fillRect(2,2,23,7);
  if(level!==null&&level>0){
    const fill=c.createLinearGradient(0,2,0,9);
    fill.addColorStop(0,low?'#ff715d':'#53e783');
    fill.addColorStop(.46,low?'#f04438':'#1cc45a');
    fill.addColorStop(.52,low?'#d92c25':'#0caa43');
    fill.addColorStop(1,low?'#ec4033':'#18bd50');
    c.fillStyle=fill;c.fillRect(2,2,23*level,7);
  }
  c.restore();
  if(level===null){c.strokeStyle='#9aa5ad';c.lineWidth=1;c.beginPath();c.moveTo(11,5.5);c.lineTo(16,5.5);c.stroke();}
  if(battery?.charging){
    c.beginPath();c.moveTo(15.2,1.8);c.lineTo(10.7,5.9);c.lineTo(13.3,5.9);c.lineTo(12.1,9.2);c.lineTo(17.1,4.7);c.lineTo(14.4,4.7);c.closePath();
    c.lineJoin='round';c.lineWidth=.65;c.strokeStyle='#587634';c.stroke();c.fillStyle='#f9ffe9';c.fill();
  }
  c.restore();
}
