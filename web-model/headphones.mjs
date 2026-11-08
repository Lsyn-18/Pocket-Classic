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
  for(const side of [-1,1]){
    // Fixed, upright and mirrored: the two speaker openings face inward.
    // Object transforms retain correct winding for the mirrored right shell.
    const bud=new THREE.Group();bud.name=side<0?'EarPod_L':'EarPod_R';
    bud.position.set(side*.85,6.72,.32);bud.scale.set(-side*.68,.68,.68);earbuds.add(bud);
    const local=(material,geometry,p=[0,0,0],r=[0,0,0],s=[1,1,1])=>{
      part(bud,material,geometry,p,r,s);
    };
    local(white,sphere(),[0,0,0],[0,0,0],[.62,.56,.41]);
    local(white,sphere(),[.43,.02,.20],[0,.28,0],[.27,.40,.23]);
    local(white,lathe([[0,-1.70],[.115,-1.70],[.14,-1.58],[.15,-.25],[.22,-.13],[0,-.13]]));
    local(grille,sphere(),[.705,.02,.32],[0,.95,0],[.16,.30,.024]);
    local(grille,new THREE.CapsuleGeometry(.052,.17,3,8),[-.19,.02,.389],[0,0,Math.PI/2],[1,1,.14]);
    local(grille,new THREE.CapsuleGeometry(.025,.12,3,8),[0,.34,-.29],[.2,0,0],[1,1,.14]);
    bud.updateMatrix();tails.push(new THREE.Vector3(0,-1.7,0).applyMatrix4(bud.matrix));
  }
  // The small right-branch remote moves with the cable, never with the earpieces.
  const remote=new THREE.Group();remote.name='Inline_remote';group.add(remote);
  part(remote,white,new THREE.CapsuleGeometry(.04,.10,5,16));
  for(const y of [-.025,.025])part(remote,print,new THREE.BoxGeometry(.052,.004,.004),[0,y,.041]);
  for(const [y,w,h]of [[.058,.032,.004],[.058,.004,.032],[-.058,.032,.004]])part(remote,print,new THREE.BoxGeometry(w,h,.004),[0,y,.043]);
  for(const {parent,material,geometry}of batches.values()){
    const merged=mergeGeometries(geometry,false);geometry.forEach(g=>g.dispose());parent.add(new THREE.Mesh(merged,material));
  }
  const cables=[];
  function cable(segments,name){
    const radial=8,positions=new Float32Array((segments+1)*(radial+1)*3),normals=new Float32Array(positions.length),indices=[];
    for(let i=0;i<segments;i++)for(let j=0;j<radial;j++){const a=i*(radial+1)+j,b=a+radial+1;indices.push(a,b,a+1,a+1,b,b+1);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
    const mesh=new THREE.Mesh(geometry,rubber);mesh.name=name;mesh.frustumCulled=false;group.add(mesh);
    const curve=new THREE.CatmullRomCurve3(),point=new THREE.Vector3(),tangent=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3();
    function update(points){curve.points=points;for(let i=0;i<=segments;i++){
      curve.getPoint(i/segments,point);curve.getTangent(i/segments,tangent);u.set(-tangent.y,tangent.x,0).normalize();v.crossVectors(tangent,u).normalize();
      for(let j=0;j<=radial;j++){const a=j/radial*Math.PI*2,c=Math.cos(a),s=Math.sin(a),nx=u.x*c+v.x*s,ny=u.y*c+v.y*s,nz=u.z*c+v.z*s,offset=(i*(radial+1)+j)*3;positions[offset]=point.x+nx*.052;positions[offset+1]=point.y+ny*.052;positions[offset+2]=point.z+nz*.052;normals[offset]=nx;normals[offset+1]=ny;normals[offset+2]=nz;}
    }geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;}
    cables.push({mesh,update});return {update};
  }
  const lead=cable(48,'Headphone_main_cable'),left=cable(32,'Headphone_left_cable'),right=cable(64,'Headphone_right_cable'),motion=createHeadphoneMotion();
  let last='',pose={progress:0,framing:0,visible:false},disposed=false;
  function updateGeometry(next){
    const rise=(1-next.insert)*2.15,s=next.sway,z=next.swayDepth;
    plug.position.set(D.jackX,socketY+rise,D.portZ);
    const point=(x,y,depth)=>new THREE.Vector3(x,y,depth),split=point(0,5.33,.32);
    const start=point(D.jackX,socketY+rise+1.20,D.portZ);
    lead.update([start,point(2.40+s,6.72+rise*.60,.10+z),point(2.10+s,5.68+rise*.12,.20+z),point(.45+s*.4,5.26,.44+z*.4),split]);
    left.update([split,point(-.50+s*.7,5.35,.32+z*.7),point(-.85+s*.4,5.42,.32+z*.4),tails[0]]);
    // This straight section gives the remote a stable place along the right branch.
    const remoteX=.85+s*.4,remoteZ=.32+z*.4;
    right.update([split,point(.50+s*.7,5.35,.32+z*.7),point(remoteX,5.40,remoteZ),point(remoteX,5.50,remoteZ),tails[1]]);
    remote.position.set(remoteX,5.45,remoteZ);
  }
  updateGeometry({...pose,insert:0,sway:0,swayDepth:0});
  group.traverse(o=>{o.userData.decorative=true;o.raycast=()=>{};});
  return {group,motion,get framing(){return pose.framing;},
    setConnected:value=>motion.setConnected(value),preview:()=>motion.preview(),snap:()=>motion.snap(),
    update(dt,options={}){
      pose=motion.step(dt,options);group.visible=pose.visible;
      const key=[pose.progress.toFixed(5),pose.sway.toFixed(4),pose.swayDepth.toFixed(4)].join(':');
      if(key!==last){last=key;updateGeometry(pose);}
      return pose;
    },dispose(){if(disposed)return;disposed=true;group.traverse(o=>o.geometry?.dispose());for(const material of [white,metal,rubber,grille,print])material.dispose();model.remove(group);}
  };
}
