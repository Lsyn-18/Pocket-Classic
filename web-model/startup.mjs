// The outline, click wheel and final player share one orthographic projection.
// Model dimensions are supplied by the actual scene, rather than a second model.
export const openingDuration=5;
export const openingTiming=Object.freeze({wheelStart:.7,wheelEnd:1.5,zoomStart:1.8,zoomEnd:3.7,lcdStart:3.6,lcdEnd:4.2,end:openingDuration});
const clamp=x=>Math.max(0,Math.min(1,x));
const mix=(a,b,u)=>a+(b-a)*u;
export function smooth(a,b,t){const u=clamp((t-a)/(b-a));return u*u*u*(10+u*(-15+u*6));}

export function sampleOpening(seconds,view,model){
  const t=Math.max(0,Math.min(openingDuration,seconds)),{width,height,frustum}=view;
  const outerRadius=model.wheelRadius+.011,innerRadius=model.centerRadius+.012;
  const diameter=Math.min(260,width*.70,(view.contentHeight||height)*.60);
  const closeHeight=2*outerRadius*height/diameter,finalHeight=frustum.top-frustum.bottom;
  const zoom=smooth(openingTiming.zoomStart,openingTiming.zoomEnd,t);
  // Logarithmic scale keeps the apparent pull-back speed even across sizes.
  const worldHeight=Math.exp(mix(Math.log(closeHeight),Math.log(finalHeight),zoom)),worldWidth=worldHeight*width/height;
  const closeX=(.5-(view.centerX??width/2)/width)*closeHeight*width/height;
  const closeY=model.wheelY+((view.centerY??height/2)/height-.5)*closeHeight;
  const x=mix(closeX,(frustum.left+frustum.right)/2,zoom),y=mix(closeY,(frustum.top+frustum.bottom)/2,zoom);
  const bounds=zoom===1?{...frustum}:{left:x-worldWidth/2,right:x+worldWidth/2,top:y+worldHeight/2,bottom:y-worldHeight/2};
  const centerX=(0-bounds.left)/(bounds.right-bounds.left)*width,centerY=(bounds.top-model.wheelY)/(bounds.top-bounds.bottom)*height;
  const outerDiameter=2*outerRadius*height/worldHeight,wheelAlpha=smooth(.7,1.5,t);
  const reveal=smooth(1.8,3.32,t),radius=mix(outerDiameter/2,Math.hypot(width,height)*1.1,reveal);
  return {seconds:t,bounds,zoom,centerX,centerY,outerDiameter,innerDiameter:outerDiameter*innerRadius/outerRadius,
    wheelAlpha,ringAlpha:smooth(0,.35,t)*(1-wheelAlpha),maskRadius:radius,reveal,
    lcdLevel:smooth(3.6,4.2,t),pose:smooth(3.7,4.2,t),
    stage:t<.7?'rings':t<1.8?'wheel':t<3.7?'reveal':t<4.2?'backlight':'hold'};
}

// Start only after preferences and the first rendered frame; never advance a
// cold shader compile through the opening. Finishing is terminal for this host.
export function createOpeningPlayback(){
  let ready=false,warm=false,start=null,active=true,reason='';
  return {
    get active(){return active;},get started(){return start!==null;},get reason(){return reason;},
    ready(){ready=true;},warm(){warm=true;},
    finish(value='skip'){if(active){active=false;reason=value;}},
    tick(now){
      if(!active)return openingDuration;
      if(!ready||!warm)return 0;
      start??=now;
      const seconds=Math.max(0,(now-start)/1000);
      if(seconds>=openingDuration){active=false;reason='complete';return openingDuration;}
      return seconds;
    }
  };
}
