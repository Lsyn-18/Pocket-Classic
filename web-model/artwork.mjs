export function coverUrl(value) {
  try {
    const url=new URL(value);
    if(!['https:','http:'].includes(url.protocol)||!/^p[1-9]\.music\.126\.net$/.test(url.hostname)||url.username||url.password||url.port)return '';
    url.protocol='https:';url.hash='';url.searchParams.set('param','320y320');return url.href;
  }catch{return '';}
}

// Images may finish out of order. Callers always look up the current cover key.
export function createArtworkStore({resolve=async url=>url,imageFactory=()=>new Image(),onChange=()=>{}}={}) {
  const cache=new Map();let revision=0;
  return {get revision(){return revision;},get(track){
    const key=coverUrl(track?.cover);if(!key)return null;
    if(cache.has(key)){const entry=cache.get(key);cache.delete(key);cache.set(key,entry);return entry.image;}
    const entry={image:null};cache.set(key,entry);
    while(cache.size>12)cache.delete(cache.keys().next().value);
    Promise.resolve().then(()=>resolve(key)).then(source=>{
      if(!source||cache.get(key)!==entry)return;
      const image=imageFactory();image.crossOrigin='anonymous';
      image.onload=()=>{if(cache.get(key)!==entry)return;entry.image=image;revision++;onChange();};
      image.onerror=()=>{};image.src=source;
    }).catch(()=>{});
    return null;
  }};
}
