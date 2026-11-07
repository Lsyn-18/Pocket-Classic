// One press lifecycle for the flat wheel, 3D wheel and keyboard hit targets.
export function createButtonPress({shortPress,longPress,stop=()=>{},delay=480,timers=globalThis}) {
  let timer=null,active=null;
  function cancel(){if(timer!==null)timers.clearTimeout(timer);timer=null;active=null;stop();}
  return {
    start(action){cancel();const press={action,held:false};active=press;timer=timers.setTimeout(()=>{timer=null;if(active!==press)return;press.held=true;longPress(action);},delay);},
    release(){const press=active;cancel();if(press&&!press.held)shortPress(press.action);},
    cancel,
  };
}
