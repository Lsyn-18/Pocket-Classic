import * as THREE from 'three';
import {coverUrl} from './artwork.mjs';

export function coverPose(offset){
  const distance=Math.abs(offset),clamped=Math.min(2.3,distance);
  return {x:Math.sign(offset)*(clamped<=1?clamped:1+(clamped-1)*.68),z:.58+.36*Math.max(0,1-distance),scale:1-.25*Math.min(1,distance)-.16*Math.max(0,clamped-1),yaw:offset===0?0:-Math.max(-1,Math.min(1,offset))*.70};
}

// Five reused three-dimensional cards in the LCD's local space. The physical
// wheel remains available, using the existing renderer and camera.
export function createCoverFlow(model,dimensions,artwork){
  const group=new THREE.Group();group.name='Album_cover_browser';group.visible=false;model.add(group);
  const placeholderCanvas=document.createElement('canvas');placeholderCanvas.width=placeholderCanvas.height=256;
  const c=placeholderCanvas.getContext('2d');c.fillStyle='#68879a';c.fillRect(0,0,256,256);c.fillStyle='#183c53';c.beginPath();c.arc(128,118,73,0,Math.PI*2);c.fill();c.fillStyle='#b8d4df';c.beginPath();c.arc(128,118,22,0,Math.PI*2);c.fill();c.fillStyle='#edf5f8';c.font='11px sans-serif';c.textAlign='center';c.fillText('POCKET CLASSIC',128,226);
  const placeholder=new THREE.CanvasTexture(placeholderCanvas);placeholder.colorSpace=THREE.SRGBColorSpace;
  const boxGeometry=new THREE.BoxGeometry(1.64,1.64,.045),frontGeometry=new THREE.PlaneGeometry(1.61,1.61),backMaterial=new THREE.MeshStandardMaterial({color:'#c4ced5',roughness:.65,metalness:.12});
  const textures=new Map();let visual=0,opened=false;
  const cards=Array.from({length:5},()=>{
    const root=new THREE.Group(),back=new THREE.Mesh(boxGeometry,backMaterial),material=new THREE.MeshBasicMaterial({map:placeholder,toneMapped:false}),front=new THREE.Mesh(frontGeometry,material);front.position.z=.024;
    root.add(back,front);group.add(root);return {root,front,back,material,index:-1};
  });
  function releaseTextures(){for(const card of cards)card.material.map=placeholder;for(const texture of textures.values())texture.dispose();textures.clear();}
  function imageTexture(track){const key=coverUrl(track?.cover),image=artwork.get(track);if(!key||!image)return placeholder;
    if(textures.has(key)){const texture=textures.get(key);textures.delete(key);textures.set(key,texture);return texture;}
    const texture=new THREE.Texture(image);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;textures.set(key,texture);
    const visible=new Set(cards.filter(card=>card.root.visible).map(card=>card.material.map));
    for(const [oldKey,old]of textures){if(textures.size<=10)break;if(!visible.has(old)){old.dispose();textures.delete(oldKey);}}
    return texture;
  }
  return {group,update(state,dt,{reducedMotion=false,blocked=false}={}){
    const tracks=state.coverCollection?.tracks||[],active=state.page==='covers'&&!state.problem&&!state.busy&&!blocked&&tracks.length>0;
    group.visible=active;if(!active){if(opened)releaseTextures();opened=false;return;}
    const selected=Math.max(0,Math.min(tracks.length-1,state.selected||0));
    if(!opened||reducedMotion)visual=selected;else visual+=(selected-visual)*(1-Math.exp(-Math.max(0,Math.min(.05,dt))*16));
    opened=true;
    const wanted=Array.from({length:5},(_,i)=>selected+i-2).filter(index=>index>=0&&index<tracks.length),free=cards.filter(card=>!wanted.includes(card.index));
    for(const index of wanted){const card=cards.find(card=>card.index===index)||free.shift();card.index=index;card.root.visible=true;}
    for(const card of cards){if(!wanted.includes(card.index)){card.root.visible=false;continue;}
      const pose=coverPose(card.index-visual);card.root.position.set(pose.x,dimensions.screenY+.13,pose.z);card.root.scale.setScalar(pose.scale);card.root.rotation.y=pose.yaw;
      card.front.userData={zone:'cover',index:card.index};card.back.userData={zone:'cover',index:card.index};card.material.map=imageTexture(tracks[card.index]);
    }
  },dispose(){releaseTextures();placeholder.dispose();boxGeometry.dispose();frontGeometry.dispose();backMaterial.dispose();for(const card of cards)card.material.dispose();model.remove(group);}};
}
