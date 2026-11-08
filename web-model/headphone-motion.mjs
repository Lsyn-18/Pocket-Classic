const clamp=x=>Math.max(0,Math.min(1,x));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

export function createHeadphoneMotion(){
  let connected=false,progress=0,demo=0,withdraw=0,time=0,rest=1;
  return {
    setConnected(value){value=!!value;if(value!==connected){connected=value;demo=0;withdraw=0;rest=0;}},
    preview(){demo=4.6;withdraw=progress>.01?.55:0;rest=0;},
    snap(){progress=Number(connected);demo=withdraw=0;rest=1;},
    step(dt,{blocked=false,paused=false,reducedMotion=false}={}){
      dt=Math.max(0,Math.min(.05,dt));
      if(!blocked&&!paused){demo=Math.max(0,demo-dt);withdraw=Math.max(0,withdraw-dt);}
      const target=Number(withdraw>0?false:demo>0||connected);
      if(!blocked&&!paused){
        time+=dt;const before=progress;
        if(reducedMotion)progress=target;
        else progress=target?Math.min(1,progress+dt/1.08):Math.max(0,progress-dt/.64);
        rest=before===progress?rest+dt:0;
      }
      return {progress,connected,preview:demo>0,insert:smooth(.08,.94,progress),framing:smooth(0,.50,progress),
        sway:reducedMotion||blocked?0:Math.sin(time*14)*.065*(progress>0&&progress<1?1:Math.exp(-rest*6)),visible:!blocked&&progress>0};
    }
  };
}

export function headphoneFrustum(view,amount){
  const b=view.frustum;if(!amount)return {...b};
  const h=Math.max((b.top-b.bottom)/view.height*view.contentHeight,13.35),units=h/view.contentHeight;
  const cx=view.centerX??view.width/2,cy=view.centerY??view.height/2;
  const next={left:-cx*units,right:(view.width-cx)*units,top:cy*units+.55,bottom:-(view.height-cy)*units+.55};
  return Object.fromEntries(Object.entries(b).map(([key,value])=>[key,value+(next[key]-value)*amount]));
}
