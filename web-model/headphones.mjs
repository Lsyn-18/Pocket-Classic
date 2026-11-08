import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createHeadphoneMotion} from './headphone-motion.mjs';

// Original geometry, based on Apple's public EarPods product photographs.
// Coordinates are centimetres, like the Classic. No product image is shipped.
export function createHeadphones(model,D){
  const group=new THREE.Group();group.name='EarPods_35mm_accessory';model.add(group);
  const white=new THREE.MeshPhysicalMaterial({color:'#e9ecec',roughness:.28,metalness:0,clearcoat:.65,clearcoatRoughness:.24});
  const metal=new THREE.MeshStandardMaterial({color:'#d9dddf',roughness:.20,metalness:1});
  const rubber=new THREE.MeshStandardMaterial({color:'#e1e5e5',roughness:.64,metalness:0});
  const grille=new THREE.MeshStandardMaterial({color:'#181c1e',roughness:.88,metalness:.12});
  const print=new THREE.MeshBasicMaterial({color:'#a6afb4',toneMapped:false});
  // Rest on the metal rim, slightly above the coplanar dark socket interior.
  const socketY=5.210,plug=new THREE.Group(),earbuds=new THREE.Group();group.add(plug,earbuds);
  plug.name='Straight_TRRS_plug';earbuds.name='Wired_EarPods_and_inline_remote';
  const batches=new Map();
  function part(parent,material,geometry,position=[0,0,0],rotation=[0,0,0],scale=[1,1,1]){
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale));
    geometry.applyMatrix4(matrix);const key=parent.uuid+material.uuid;let batch=batches.get(key);
    if(!batch){batch={parent,material,geometry:[]};batches.set(key,batch);}batch.geometry.push(geometry.toNonIndexed());geometry.dispose();
  }
  function lathe(points){return new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),32);}
  part(plug,metal,lathe([[0,-1.38],[.07,-1.37],[.164,-1.25],[.175,-1.15],[.175,-.03],[0,-.03]]));
  part(plug,white,lathe([[0,0],[.25,0],[.27,.035],[.27,.84],[.24,.89],[.13,.89],[.12,1.20],[0,1.20]]));
  for(const y of [-.98,-.68,-.38])part(plug,white,new THREE.CylinderGeometry(.177,.177,.055,32),[0,y,0]);
  const sphere=()=>new THREE.SphereGeometry(1,24,16);
  const tails=[];
  for(const [i,x,y,z,angle]of [[0,-1.70,6.28,.32,1.90],[1,-.36,6.28,.29,1.58]]){
    const pose=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(i?-.12:.08,i?.22:-.20,angle)),new THREE.Vector3(.68,.68,.68));
    const local=(material,geometry,p=[0,0,0],r=[0,0,0],s=[1,1,1])=>{
      const transform=new THREE.Matrix4().compose(new THREE.Vector3(...p),new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),new THREE.Vector3(...s));geometry.applyMatrix4(pose.clone().multiply(transform));part(earbuds,material,geometry);
    };
    local(white,sphere(),[0,0,0],[0,0,0],[.62,.56,.41]);
    local(white,sphere(),[.43,.02,.20],[0,.28,0],[.27,.40,.23]);
    local(white,lathe([[0,-1.70],[.115,-1.70],[.14,-1.58],[.15,-.25],[.22,-.13],[0,-.13]]));
    local(grille,sphere(),[.54,.02,.405],[0,.65,0],[.16,.30,.024]);
    local(grille,new THREE.CapsuleGeometry(.052,.17,3,8),[-.19,.02,.389],[0,0,Math.PI/2],[1,1,.14]);
    local(grille,new THREE.CapsuleGeometry(.025,.12,3,8),[0,.34,-.29],[.2,0,0],[1,1,.14]);
    tails.push(new THREE.Vector3(0,-1.7,0).applyMatrix4(pose));
  }
  // A compact right-branch remote keeps the short display arrangement uncluttered.
  part(earbuds,white,new THREE.CapsuleGeometry(.075,.42,5,16),[.90,6.63,.13]);
  for(const y of [6.53,6.73])part(earbuds,print,new THREE.BoxGeometry(.10,.007,.006),[.90,y,.207]);
  for(const [x,y,w,h]of [[.90,6.82,.055,.007],[.90,6.82,.007,.055],[.90,6.44,.055,.007]])part(earbuds,print,new THREE.BoxGeometry(w,h,.006),[x,y,.210]);
  for(const {parent,material,geometry}of batches.values()){
    const merged=mergeGeometries(geometry,false);geometry.forEach(g=>g.dispose());parent.add(new THREE.Mesh(merged,material));
  }
  const cables=[];
  function cable(segments){
    const radial=8,positions=new Float32Array((segments+1)*(radial+1)*3),normals=new Float32Array(positions.length),indices=[];
    for(let i=0;i<segments;i++)for(let j=0;j<radial;j++){const a=i*(radial+1)+j,b=a+radial+1;indices.push(a,b,a+1,a+1,b,b+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
    const mesh=new THREE.Mesh(geometry,rubber);mesh.frustumCulled=false;group.add(mesh);
    const curve=new THREE.CatmullRomCurve3(),point=new THREE.Vector3(),tangent=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3();
    function update(points){curve.points=points;for(let i=0;i<=segments;i++){
      curve.getPoint(i/segments,point);curve.getTangent(i/segments,tangent);u.set(-tangent.y,tangent.x,0).normalize();v.crossVectors(tangent,u).normalize();
      for(let j=0;j<=radial;j++){const a=j/radial*Math.PI*2,c=Math.cos(a),s=Math.sin(a),nx=u.x*c+v.x*s,ny=u.y*c+v.y*s,nz=u.z*c+v.z*s,offset=(i*(radial+1)+j)*3;positions[offset]=point.x+nx*.052;positions[offset+1]=point.y+ny*.052;positions[offset+2]=point.z+nz*.052;normals[offset]=nx;normals[offset+1]=ny;normals[offset+2]=nz;}
    }geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;}
    cables.push({mesh,update});return {update};
  }
  const lead=cable(48),left=cable(32),right=cable(64),motion=createHeadphoneMotion();
  let last='',pose={progress:0,framing:0,visible:false},disposed=false;
  function updateGeometry(next,tiltX=0,tiltY=0){
    const rise=(1-next.insert)*2.15,follow=(1-next.insert)*1.65,s=next.sway;
    plug.position.set(D.jackX,socketY+rise,D.portZ);earbuds.position.set(0,follow,0);earbuds.rotation.z=s*.045;
    const point=(x,y,z)=>new THREE.Vector3(x,y+follow,z);
    const start=new THREE.Vector3(D.jackX,socketY+rise+1.20,D.portZ),split=point(.18,6.95,.06),l=tails[0].clone().applyEuler(earbuds.rotation).add(earbuds.position),r=tails[1].clone().applyEuler(earbuds.rotation).add(earbuds.position);
    lead.update([start,new THREE.Vector3(2.10+s,6.83+rise*.45,.08),point(1.48+s,7.12,tiltY*.12),split]);
    left.update([split,point(-.20+s,6.91,.07),point(-.48,6.77+tiltX*.10,.12),l]);
    right.update([split,point(.66,6.99,.09),point(.90,6.90,.13),point(.90,6.60,.13),r]);
  }
  updateGeometry({...pose,insert:0,sway:0});
  group.traverse(o=>{o.userData.decorative=true;o.raycast=()=>{};});
  return {group,motion,get framing(){return pose.framing;},
    setConnected:value=>motion.setConnected(value),preview:()=>motion.preview(),snap:()=>motion.snap(),
    update(dt,options={}){
      pose=motion.step(dt,options);group.visible=pose.visible;
      const key=[pose.progress.toFixed(5),pose.sway.toFixed(4),(options.tiltX||0).toFixed(3),(options.tiltY||0).toFixed(3)].join(':');
      if(key!==last){last=key;updateGeometry(pose,options.tiltX,options.tiltY);}
      return pose;
    },dispose(){if(disposed)return;disposed=true;group.traverse(o=>o.geometry?.dispose());for(const material of [white,metal,rubber,grille,print])material.dispose();model.remove(group);}
  };
}
