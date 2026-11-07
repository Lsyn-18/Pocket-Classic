const {normalizeTracks}=require('./discovery.cjs');
const QUALITY_LEVELS=Object.freeze(['standard','exhigh','lossless','hires']);
function validQuality(value){return QUALITY_LEVELS.includes(value);}
function pageOffset(value=0){const n=Number(value);if(!/^(0|[1-9][0-9]{0,4})$/.test(String(value))||!Number.isSafeInteger(n))throw Object.assign(Error('无效分页'),{status:400});return n;}
function ordinaryPlaylists(list,userId){return list.filter(p=>!(Number(p.specialType)===5&&(!Number(p.userId??p.creator?.userId)||Number(p.userId??p.creator?.userId)===Number(userId)))).map(p=>({id:p.id,name:p.name,trackCount:p.trackCount,subscribed:!!p.subscribed}));}
function createLibrary({call,getSession}){
  let likedCache=null;
  function session(){const s=getSession();if(!s?.authenticated||!s.cookie)throw Object.assign(Error('请先连接网易云音乐'),{status:401});return s;}
  function checked(r,s){if(getSession().cookie!==s.cookie||!getSession().authenticated)throw Error('账号已变化，请重新打开音乐菜单');if(r?.body?.code!==200)throw {body:r?.body};return r.body;}
  function paging(body,raw,offset,limit){const nextOffset=offset+raw.length;return {nextOffset,more:raw.length>0&&!!(body.hasMore??body.more??(Number.isFinite(body.count)?nextOffset<body.count:raw.length===limit))};}
  return {
    async liked(offset=0){
      offset=pageOffset(offset);const s=session();if(!Number.isSafeInteger(Number(s.userId))||Number(s.userId)<=0)throw Object.assign(Error('请重新连接网易云音乐'),{status:401});
      if(!likedCache||likedCache.cookie!==s.cookie||Date.now()-likedCache.at>60000){const body=checked(await call('likelist',{uid:s.userId},s.cookie),s);if(!Array.isArray(body.ids))throw Error('喜欢的音乐列表暂时无法识别');likedCache={cookie:s.cookie,at:Date.now(),ids:[...new Set(body.ids.filter(id=>Number.isSafeInteger(id)&&id>0))].slice(0,100000)};}
      const ids=likedCache.ids.slice(offset,offset+100),body=ids.length?checked(await call('song_detail',{ids:ids.join(',')},s.cookie),s):{songs:[]};
      const byId=new Map(normalizeTracks(body.songs||[]).map(t=>[t.id,t]));return {tracks:ids.map(id=>byId.get(id)).filter(Boolean),trackCount:likedCache.ids.length,nextOffset:offset+ids.length,more:offset+ids.length<likedCache.ids.length};
    },
    async resolve(id,quality='standard'){
      id=Number(id);if(!Number.isSafeInteger(id)||id<=0||!validQuality(quality))throw Object.assign(Error('无效歌曲或音质'),{status:400});
      const s=session(),body=checked(await call('song_url_v1',{id,level:quality,unblock:'false'},s.cookie),s),a=body.data?.[0];
      if(!a)throw Error('歌曲暂时没有可用音源');
      return {id,code:a.code,url:a.url||null,durationMs:a.time,size:a.size,trial:a.freeTrialInfo||null,type:a.type,level:a.level||null,bitrate:a.br||null};
    },
    async artists(offset=0){
      offset=pageOffset(offset);const s=session(),limit=50;
      const body=checked(await call('artist_sublist',{limit,offset},s.cookie),s);
      if(!Array.isArray(body.data))throw Error('网易云歌手列表暂时无法识别');
      const seen=new Set(),artists=body.data.flatMap(a=>{const id=Number(a?.id);if(!Number.isSafeInteger(id)||id<=0||seen.has(id))return [];seen.add(id);return [{id,name:String(a.name||'未知歌手'),songCount:Math.max(0,Number(a.musicSize)||0)}];});
      return {artists,...paging(body,body.data,offset,limit)};
    },
    async artistTracks(id,offset=0){
      id=Number(id);if(!Number.isSafeInteger(id)||id<=0)throw Object.assign(Error('无效歌手'),{status:400});offset=pageOffset(offset);
      const s=session(),limit=100,body=checked(await call('artist_songs',{id,offset,limit,order:'hot'},s.cookie),s);
      if(!Array.isArray(body.songs))throw Error('网易云歌手歌曲暂时无法识别');
      return {id,tracks:normalizeTracks(body.songs),...paging(body,body.songs,offset,limit)};
    }
  };
}
module.exports={createLibrary,validQuality,pageOffset,ordinaryPlaylists};
