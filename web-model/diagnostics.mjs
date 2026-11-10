const flows=['play','authorize','find','recovery'];
const mean=values=>values.length?Math.round(values.reduce((sum,n)=>sum+n,0)/values.length):null;

/** Session-only aggregate timings. Off by default; no content or network I/O. */
export function createDiagnostics({now=()=>performance.now()}={}){
  let enabled=false,started=new Map(),completed=new Map(),frames=[],previousFrame=null;
  function clear(){started.clear();completed.clear();frames=[];previousFrame=null;}
  return {
    get enabled(){return enabled;},
    setEnabled(value){enabled=!!value;clear();},clear,
    begin(flow,{restart=true}={}){if(!enabled||!flows.includes(flow)||!restart&&started.has(flow))return;if(started.has(flow))this.end(flow,'cancelled');started.set(flow,now());},
    end(flow,outcome='success'){
      if(!enabled||!started.has(flow)||!['success','failed','cancelled'].includes(outcome))return;
      const ms=Math.max(0,now()-started.get(flow));started.delete(flow);
      const values=completed.get(flow)||[];values.push({ms,outcome});if(values.length>120)values.shift();completed.set(flow,values);
    },
    frame(time,{hidden=false,blocked=false}={}){
      if(!enabled||hidden||blocked){previousFrame=null;return;}
      if(previousFrame!==null){frames.push(Math.max(0,time-previousFrame));if(frames.length>300)frames.shift();}previousFrame=time;
    },
    snapshot(){return {enabled,flows:flows.map(name=>{const values=completed.get(name)||[],success=values.filter(value=>value.outcome==='success');return {name,attempts:values.length,success:success.length,failed:values.filter(value=>value.outcome==='failed').length,cancelled:values.filter(value=>value.outcome==='cancelled').length,meanMs:mean(success.map(value=>value.ms))};}),frames:{count:frames.length,meanMs:mean(frames),p95Ms:frames.length?Math.round(frames.toSorted((a,b)=>a-b)[Math.ceil(frames.length*.95)-1]):null}};},
  };
}
