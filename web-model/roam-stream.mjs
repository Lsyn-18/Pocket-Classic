// One request in flight, bounded history, and generation checks keep an old
// radio response from becoming part of a new account or playback session.
export function createRoamStream(fetchBatch) {
  let generation = 0, pending = null;
  const recent = new Set();
  return {
    reset() { generation++; pending = null; recent.clear(); },
    nextBatch() {
      if (pending) return pending;
      const epoch = generation;
      const task = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const response = await fetchBatch();
          if (epoch !== generation) return [];
          if (!Array.isArray(response.tracks)) throw Error('漫游返回了无法识别的歌曲列表');
          const fresh = response.tracks.filter(track => {
            if (!Number.isSafeInteger(track?.id) || track.id <= 0 || recent.has(track.id)) return false;
            recent.add(track.id); return true;
          });
          while (recent.size > 256) recent.delete(recent.values().next().value);
          if (fresh.length || !response.tracks.length) return fresh;
        }
        return [];
      })();
      pending = task;
      const clear = () => { if (pending === task) pending = null; };
      task.then(clear, clear);
      return task;
    }
  };
}
