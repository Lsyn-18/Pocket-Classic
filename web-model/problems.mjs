const reasons=new Set(['auth','network','unavailable','local-access','storage','unknown']);

export function problemFrom(error,{local=false}={}){
  const message=String(error?.message||error||'暂时无法完成，请重试').slice(0,220);
  const supplied=error?.reason||error?.errorReason;
  let reason=reasons.has(supplied)&&supplied!=='unknown'?supplied:null;
  if(!reason){
    const status=Number(error?.status);
    // Compatibility for older native/services. Structured reasons take priority.
    reason=status===401||/登录|授权|连接已失效|重新连接/.test(message)?'auth':
      /版权|权限限制|没有可用音源|暂无音源/.test(message)?'unavailable':
      local&&/权限|原文件|文件不存在|找不到文件|FileNotFound/.test(message)?'local-access':
      /空间不足|存储已满|ENOSPC/.test(message)?'storage':
      /网络|超时|连接失败|Failed to fetch|NetworkError|ECONN|ENOTFOUND/.test(message)?'network':'unknown';
  }
  return {message,reason,login:reason==='auth'};
}

export function recoveryActions(problem,{advance=false,native=false,local=false}={}){
  const back={id:'back',label:'返回列表'},retry={id:'retry',label:'重试'};
  if(problem?.reason==='auth')return [{id:'retry',label:'重新连接'},native?{id:'local',label:'本地音乐'}:back];
  if(problem?.reason==='unavailable')return [advance?{id:'next',label:'下一首'}:back,retry];
  if(problem?.reason==='local-access')return [{id:'import',label:'重新导入'},back];
  if(problem?.reason==='storage')return [{id:'manage',label:'管理空间'},back];
  return [retry,problem?.reason==='network'&&native&&!local?{id:'local',label:'本地音乐'}:advance?{id:'next',label:'下一首'}:back];
}
