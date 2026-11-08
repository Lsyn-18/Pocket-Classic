const {normalizeTracks}=require('./discovery.cjs');
const QUALITY_LEVELS=Object.freeze(['standard','exhigh','lossless','hires']);
function validQuality(value){return QUALITY_LEVELS.includes(value);}
function pageOffset(value=0){const n=Number(value);if(!/^(0|[1-9][0-9]{0,4})$/.test(String(value))||!Number.isSafeInteger(n))throw Object.assign(Error('无效分页'),{status:400});return n;}
function ownLiked(p,userId){const owner=Number(p?.userId??p?.creator?.userId);return Number.isSafeInteger(Number(p?.id))&&Number(p.id)>0&&Number(p.specialType)===5&&(!owner||owner===Number(userId));}
function ordinaryPlaylists(list,userId){const seen=new Set();return list.filter(p=>Number.isSafeInteger(Number(p?.id))&&Number(p.id)>0&&!ownLiked(p,userId)&&!seen.has(Number(p.id))&&seen.add(Number(p.id))).map(p=>({id:Number(p.id),name:p.name,trackCount:p.trackCount,subscribed:!!p.subscribed}));}
function createLibrary({call,getSession}){
  let likedCache=null,playlistCache=null;
  function session(){const s=getSession();if(!s?.authenticated||!s.cookie)throw Object.assign(Error('请先连接网易云音乐'),{status:401});return s;}
  function checked(r,s){if(getSession().cookie!==s.cookie||!getSession().authenticated)throw Error('账号已变化，请重新打开音乐菜单');if(r?.body?.code!==200)throw {body:r?.body};return r.body;}
  function paging(body,raw,offset,limit){const nextOffset=offset+raw.length;return {nextOffset,more:raw.length>0&&!!(body.hasMore??body.more??(Number.isFinite(body.count)?nextOffset<body.count:raw.length===limit))};}
  async function group(s,name,stopAt){
    const rows=[];
    for(let offset=0;offset<5000;offset+=100){
      const body=checked(await call(name,{uid:s.userId,limit:100,offset,crypto:'eapi'},s.cookie),s),data=body.data??body;
      if(!Array.isArray(data.playlist))throw Error('网易云歌单顺序暂时无法读取，请稍后重试');
      for(const p of data.playlist){const row=name==='user_playlist_collect'?{...p,subscribed:true}:p;rows.push(row);if(stopAt?.(row))return rows;}
      const count=data.playlist.length,more=count>0&&!!(data.hasMore??data.more??(Number.isFinite(data.count)?offset+count<data.count:count>=100));
      if(!more)return rows;
    }
    throw Error('歌单过多，暂时无法完整读取，请稍后重试');
  }
  async function playlistSnapshot(s,id,requireOrder=false){
    const body=checked(await call('playlist_detail',{id},s.cookie),s),list=body.playlist;
    if(!list||typeof list!=='object')throw Error('歌单暂不可用');
    if(requireOrder&&!Array.isArray(list.trackIds))throw Error('喜欢的音乐顺序暂时无法读取，请稍后重试');
    const tracks=normalizeTracks(list.tracks||[]),raw=Array.isArray(list.trackIds)?list.trackIds.map(item=>typeof item==='object'?item?.id:item):tracks.map(t=>t.id);
    const ids=[...new Set(raw.filter(value=>Number.isSafeInteger(value)&&value>0))].slice(0,100000);
    return {cookie:s.cookie,id,name:String(list.name||'歌单'),ids,metadata:new Map(tracks.map(t=>[t.id,t]))};
  }
  async function playlistPage(s,cached,offset,size=1000){
    const ids=cached.ids.slice(offset,offset+size),missing=ids.filter(value=>!cached.metadata.has(value));
    for(let start=0;start<missing.length;start+=500){
      const batch=missing.slice(start,start+500),body=checked(await call('song_detail',{ids:batch.join(',')},s.cookie),s),requested=new Set(batch);
      for(const track of normalizeTracks(body.songs||[]))if(requested.has(track.id))cached.metadata.set(track.id,track);
    }
    const nextOffset=offset+ids.length;
    return {id:cached.id,name:cached.name,tracks:ids.map(value=>cached.metadata.get(value)).filter(Boolean),trackCount:cached.ids.length,nextOffset,more:nextOffset<cached.ids.length};
  }
  return {
    async playlists(){
      const s=session();if(!Number.isSafeInteger(Number(s.userId))||Number(s.userId)<=0)throw Object.assign(Error('请重新连接网易云音乐'),{status:401});
      const [created,collected]=await Promise.all([group(s,'user_playlist_create'),group(s,'user_playlist_collect')]);
      return ordinaryPlaylists([...created,...collected],s.userId);
    },
    async tracks(id,offset=0){
      id=Number(id);if(!Number.isSafeInteger(id)||id<=0)throw Object.assign(Error('无效歌单'),{status:400});offset=pageOffset(offset);
      const s=session();let cached=playlistCache;
      if(offset===0||cached?.cookie!==s.cookie||cached?.id!==id)playlistCache=cached=await playlistSnapshot(s,id);
      return playlistPage(s,cached,offset);
    },
    async liked(offset=0){
      offset=pageOffset(offset);const s=session();if(!Number.isSafeInteger(Number(s.userId))||Number(s.userId)<=0)throw Object.assign(Error('请重新连接网易云音乐'),{status:401});
      let cached=likedCache;
      if(offset===0||cached?.cookie!==s.cookie){
        const rows=await group(s,'user_playlist_create',p=>ownLiked(p,s.userId)),heart=rows.find(p=>ownLiked(p,s.userId));
        if(!heart)throw Error('喜欢的音乐歌单暂时无法读取，请稍后重试');
        likedCache=cached=await playlistSnapshot(s,Number(heart.id),true);
      }
      return {...await playlistPage(s,cached,offset,100),orderSource:'red-heart-playlist'};
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
