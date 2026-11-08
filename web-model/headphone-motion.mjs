const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
// Centimetres: keep the cable's combined lateral/depth offset below 0.45 mm.
export const MAX_CABLE_SWAY=.045;
const limitSway=(x,z)=>{const length=Math.hypot(x,z),scale=length>MAX_CABLE_SWAY?MAX_CABLE_SWAY/length:1;return [x*scale,z*scale];};

export function createHeadphoneMotion(){
  let connected=false,progress=0,demo=0,withdraw=0,time=0,rest=1;
  let sway=0,swayDepth=0,velocity=0,depthVelocity=0;
  return {
    setConnected(value){value=!!value;if(value!==connected){connected=value;demo=0;withdraw=0;rest=0;}},
    preview(){demo=4.6;withdraw=progress>.01?.55:0;rest=0;},
    snap(){progress=Number(connected);demo=withdraw=0;rest=1;sway=swayDepth=velocity=depthVelocity=0;},
    step(dt,{blocked=false,paused=false,reducedMotion=false,tiltX=0,tiltY=0}={}){
      dt=Math.max(0,Math.min(.05,dt));
      if(!blocked&&!paused){demo=Math.max(0,demo-dt);withdraw=Math.max(0,withdraw-dt);}
      const target=Number(withdraw>0?false:demo>0||connected);
      if(!blocked&&!paused){
        time+=dt;const before=progress;
        if(reducedMotion)progress=target;
        else progress=target?Math.min(1,progress+dt/1.08):Math.max(0,progress-dt/.64);
        rest=before===progress?rest+dt:0;
        if(reducedMotion){sway=swayDepth=velocity=depthVelocity=0;}
        else{
          const moving=progress>0&&progress<1;
          const flutter=Math.sin(time*9)*.014*(moving?1:Math.exp(-rest*6));
          const [target,targetDepth]=limitSway(-tiltY*.12+flutter,tiltX*.10);
          // Small integration steps keep the damped response stable at low frame rates.
          const steps=Math.max(1,Math.ceil(dt/.01)),h=dt/steps;
          for(let i=0;i<steps;i++){
            velocity+=((target-sway)*90-velocity*18)*h;
            depthVelocity+=((targetDepth-swayDepth)*90-depthVelocity*18)*h;
            sway+=velocity*h;swayDepth+=depthVelocity*h;
            const bounded=limitSway(sway,swayDepth);
            if(bounded[0]!==sway||bounded[1]!==swayDepth){[sway,swayDepth]=bounded;velocity=depthVelocity=0;}
          }
        }
      }
      return {progress,connected,preview:demo>0,insert:smooth(.08,.94,progress),framing:smooth(0,.50,progress),
        sway:blocked?0:sway,swayDepth:blocked?0:swayDepth,visible:!blocked&&progress>0};
    }
  };
}

export function headphoneFrustum(view,amount){
  const b=view.frustum;if(!amount)return {...b};
  const h=Math.max((b.top-b.bottom)/view.height*view.contentHeight,13.65),units=h/view.contentHeight;
  const cx=view.centerX??view.width/2,cy=view.centerY??view.height/2;
  const next={left:-cx*units,right:(view.width-cx)*units,top:cy*units+.62,bottom:-(view.height-cy)*units+.62};
  return Object.fromEntries(Object.entries(b).map(([key,value])=>[key,value+(next[key]-value)*amount]));
}
