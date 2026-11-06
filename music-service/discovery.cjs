function coverUrl(raw) {
  try { const url=new URL(raw);if(!['https:','http:'].includes(url.protocol)||!/^p[1-9]\.music\.126\.net$/.test(url.hostname)||url.username||url.password||url.port)return '';url.protocol='https:';url.hash='';url.searchParams.set('param','320y320');return url.href; }catch{return '';}
}
function normalizeTracks(items) {
  if (!Array.isArray(items)) throw new Error('网易云返回的推荐列表暂时无法识别');
  const seen = new Set();
  return items.flatMap(track => {
    const id = Number(track?.id);
    if (!Number.isSafeInteger(id) || id <= 0 || seen.has(id) || typeof track.name !== 'string') return [];
    seen.add(id);
    const duration = Number(track.dt ?? track.duration ?? track.durationMs ?? 0);
    const artists = track.ar || track.artists;
    const album = track.al || track.album;
    return [{ id, name: track.name, artist: Array.isArray(artists) ? artists.map(a => a?.name).filter(n => typeof n === 'string').join(' / ') : '未知歌手',
      durationMs: Number.isFinite(duration) && duration > 0 ? duration : 0, fee: Number(track.fee) || 0,
      cover: coverUrl(album?.picUrl), album: typeof album?.name === 'string' ? album.name : '' }];
  });
}

function createDiscovery({call, getSession, now = Date.now}) {
  let dailyCache, dailyPending, generation = 0;
  function session() {
    const value = getSession();
    if (!value?.authenticated || !value.cookie) throw Object.assign(new Error('请先连接网易云音乐'), {status: 401});
    return value;
  }
  function checked(response) {
    const body = response?.body;
    if (body?.code !== 200) throw {body: body || {message: '网易云推荐服务暂时不可用'}};
    return body;
  }
  function result(source, tracks) { return {source, name: source === 'daily' ? '每日推荐' : '私人漫游', trackCount: tracks.length, tracks}; }
  return {
    clear() { generation++; dailyCache = null; dailyPending = null; },
    async daily() {
      const current = session(), epoch = generation;
      if (dailyCache?.cookie === current.cookie && now() - dailyCache.at < 60000) return dailyCache.value;
      if (dailyPending?.cookie === current.cookie) return dailyPending.promise;
      const promise = (async () => {
        const body = checked(await call('recommend_songs', {afresh: false}, current.cookie));
        const value = result('daily', normalizeTracks(body.data?.dailySongs ?? body.recommend));
        // An old request must not repopulate the cache after logout/account change.
        if (epoch === generation && getSession().cookie === current.cookie) dailyCache = {cookie: current.cookie, at: now(), value};
        return value;
      })();
      const pending = {cookie: current.cookie, promise}; dailyPending = pending;
      try { return await promise; } finally { if (dailyPending === pending) dailyPending = null; }
    },
    async roam() {
      const current = session();
      const body = checked(await call('personal_fm', {}, current.cookie));
      return result('roam', normalizeTracks(body.data));
    }
  };
}
module.exports = {createDiscovery, normalizeTracks};
