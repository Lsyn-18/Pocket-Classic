import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createHeadphoneMotion} from './headphone-motion.mjs';

const shellProfile=new THREE.CatmullRomCurve3([
    [-.65,0,0],[-.61,.23,.20],[-.48,.43,.35],[-.24,.55,.43],
    [0,.565,.42],[.22,.51,.36],[.42,.40,.27],[.52,.31,.20],[.55,.285,.185]
].map(p=>new THREE.Vector3(...p)));

function earPodShell(){
  // One continuous asymmetric shell, ending in an oval side opening.
  const positions=[],indices=[],rings=32,radial=32;
  for(let i=0;i<=rings;i++){
    const p=shellProfile.getPoint(i/rings);
    for(let j=0;j<=radial;j++){const a=j/radial*Math.PI*2;positions.push(p.x,.04+Math.cos(a)*p.y,.025+Math.sin(a)*p.z);}
  }
  for(let i=0;i<rings;i++)for(let j=0;j<radial;j++){const a=i*(radial+1)+j,b=a+radial+1;indices.push(a,a+1,b,a+1,b+1,b);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function earPodRim(){
  const positions=[],indices=[],rings=[[.55,.285,.185],[.557,.270,.165],[.543,.248,.137]],radial=48;
  for(const [x,y,z]of rings)for(let j=0;j<=radial;j++){const a=j/radial*Math.PI*2;positions.push(x,.04+Math.cos(a)*y,.025+Math.sin(a)*z);}
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<radial;j++){const a=i*(radial+1)+j,b=a+radial+1;indices.push(a,a+1,b,a+1,b+1,b);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3*2),2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function speakerWeave(){
  const size=64,data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const hole=Math.hypot(x%8-3.5,y%8-3.5)<2.6,c=hole?17:57+(x+y)%3*4,i=(y*size+x)*4;
    data[i]=c;data[i+1]=c+3;data[i+2]=c+4;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.needsUpdate=true;return texture;
}

function sideLetter(right,mirrored){
  const shape=new THREE.Shape();
  if(!right){shape.moveTo(0,0);shape.lineTo(0,.12);shape.lineTo(.01,.12);shape.lineTo(.01,.01);shape.lineTo(.07,.01);shape.lineTo(.07,0);}
  else{
    shape.moveTo(0,0);shape.lineTo(0,.12);shape.lineTo(.045,.12);shape.quadraticCurveTo(.075,.12,.075,.088);shape.quadraticCurveTo(.075,.06,.044,.06);shape.lineTo(.082,0);shape.lineTo(.067,0);shape.lineTo(.029,.058);shape.lineTo(.011,.058);shape.lineTo(.011,0);
    const hole=new THREE.Path();hole.moveTo(.011,.108);hole.lineTo(.041,.108);hole.quadraticCurveTo(.063,.108,.063,.088);hole.quadraticCurveTo(.063,.070,.041,.070);hole.lineTo(.011,.070);shape.holes.push(hole);
  }
  shape.closePath();const geometry=new THREE.ShapeGeometry(shape,8);geometry.translate(-.035,-.04,0);if(mirrored){geometry.scale(-1,1,1);const index=geometry.index;for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}}
  geometry.translate(.16,-.02,0);
  // Project the printed letter onto the curved casing instead of burying a flat decal.
  const positions=geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),y=positions.getY(i);let low=0,high=1;
    for(let j=0;j<12;j++){const middle=(low+high)/2;if(shellProfile.getPoint(middle).x<x)low=middle;else high=middle;}
    const p=shellProfile.getPoint((low+high)/2),v=(y-.04)/p.y;
    positions.setZ(i,.025+p.z*Math.sqrt(Math.max(0,1-v*v))+.004);
  }
  geometry.computeVertexNormals();return geometry;
}

// Original geometry, based on Apple's public EarPods product photographs.
// Coordinates are centimetres, like the Classic. No product image is shipped.
export function createHeadphones(model,D){
  const group=new THREE.Group();group.name='EarPods_35mm_accessory';model.add(group);
  const white=new THREE.MeshPhysicalMaterial({color:'#e9ecec',roughness:.28,metalness:0,clearcoat:.65,clearcoatRoughness:.24});
  const metal=new THREE.MeshStandardMaterial({color:'#d9dddf',roughness:.20,metalness:1});
  const rubber=new THREE.MeshStandardMaterial({color:'#e1e5e5',roughness:.64,metalness:0});
  const cableMaterial=new THREE.MeshStandardMaterial({color:'#8f9da7',roughness:.72,metalness:0});
  const weave=speakerWeave(),grille=new THREE.MeshStandardMaterial({color:'#ffffff',map:weave,roughness:.88,metalness:.12});
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
  function lathe(points,radial=32){return new THREE.LatheGeometry(points.map(p=>new THREE.Vector2(...p)),radial);}
  part(plug,metal,lathe([[0,-1.38],[.07,-1.37],[.164,-1.25],[.175,-1.15],[.175,-.03],[0,-.03]],64));
  part(plug,white,lathe([[0,0],[.16,0],[.215,.012],[.25,.04],[.267,.08],[.275,.13],[.275,.72],[.268,.79],[.249,.84],[.216,.88],[.17,.90],[.132,.92],[.122,.96],[.12,1.15],[.105,1.20],[0,1.20]],64));
  for(const y of [-.98,-.68,-.38])part(plug,white,new THREE.CylinderGeometry(.177,.177,.055,64),[0,y,0]);
  const sphere=()=>new THREE.SphereGeometry(1,24,16);
  const tails=[];
  for(const side of [-1,1]){
    // Fixed, upright and close together, with the speaker openings facing outward.
    // Object transforms retain correct winding for the mirrored left shell.
    const bud=new THREE.Group();bud.name=side<0?'EarPod_L':'EarPod_R';
    bud.position.set(side*.56,6.92,-D.depth/2-.16);bud.rotation.y=-side*.23;bud.scale.set(side*.68,.68,.68);earbuds.add(bud);
    const local=(material,geometry,p=[0,0,0],r=[0,0,0],s=[1,1,1])=>{
      part(bud,material,geometry,p,r,s);
    };
    local(white,earPodShell());local(white,earPodRim());
    local(white,lathe([[0,-1.95],[.115,-1.95],[.13,-1.85],[.14,-.40],[.20,-.24],[0,-.24]]),[-.22,0,.025]);
    local(rubber,lathe([[0,-2.08],[.075,-2.08],[.09,-2.03],[.09,-1.95],[0,-1.95]]),[-.22,0,.025]);
    local(grille,new THREE.CircleGeometry(1,48),[.539,.04,.025],[0,Math.PI/2,0],[.132,.244,1]);
    local(grille,sphere(),[-.30,.045,.437],[0,0,0],[.135,.045,.012]);
    local(grille,new THREE.CapsuleGeometry(.025,.12,3,8),[0,.34,-.29],[.2,0,0],[1,1,.14]);
    local(print,sideLetter(side>0,side<0));
    const anchor=new THREE.Object3D();anchor.name='Cable_anchor';anchor.position.set(-.22,-2.08,.025);bud.add(anchor);
    bud.updateMatrix();tails.push(anchor.position.clone().applyMatrix4(bud.matrix));
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
  function cable(segments,name,radius){
    const radial=8,positions=new Float32Array((segments+1)*(radial+1)*3),normals=new Float32Array(positions.length),indices=[];
    for(let i=0;i<segments;i++)for(let j=0;j<radial;j++){const a=i*(radial+1)+j,b=a+radial+1;indices.push(a,a+1,b,a+1,b+1,b);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('normal',new THREE.BufferAttribute(normals,3).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
    const mesh=new THREE.Mesh(geometry,cableMaterial);mesh.name=name;mesh.frustumCulled=false;group.add(mesh);
    const curve=new THREE.CatmullRomCurve3(),point=new THREE.Vector3(),tangent=new THREE.Vector3(),u=new THREE.Vector3(),v=new THREE.Vector3();
    function update(points,straightEnd){curve.points=points;const curvedSegments=straightEnd?segments-8:segments,start=points[points.length-1];for(let i=0;i<=segments;i++){
      if(i<=curvedSegments){curve.getPoint(i/curvedSegments,point);curve.getTangent(i/curvedSegments,tangent);}
      else{point.copy(start).lerp(straightEnd,(i-curvedSegments)/8);tangent.subVectors(straightEnd,start).normalize();}
      u.set(-tangent.y,tangent.x,0).normalize();v.crossVectors(tangent,u).normalize();
      for(let j=0;j<=radial;j++){const a=j/radial*Math.PI*2,c=Math.cos(a),s=Math.sin(a),nx=u.x*c+v.x*s,ny=u.y*c+v.y*s,nz=u.z*c+v.z*s,offset=(i*(radial+1)+j)*3;positions[offset]=point.x+nx*radius;positions[offset+1]=point.y+ny*radius;positions[offset+2]=point.z+nz*radius;normals[offset]=nx;normals[offset+1]=ny;normals[offset+2]=nz;}
    }geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;}
    cables.push({mesh,update});return {update};
  }
  const lead=cable(48,'Headphone_main_cable',.045),left=cable(32,'Headphone_left_cable',.032),right=cable(64,'Headphone_right_cable',.032),motion=createHeadphoneMotion();
  let last='',pose={progress:0,framing:0,visible:false},disposed=false;
  function updateGeometry(next){
    const rise=(1-next.insert)*2.15,s=next.sway,z=next.swayDepth;
    plug.position.set(D.jackX,socketY+rise,D.portZ);
    const point=(x,y,depth)=>new THREE.Vector3(x,y,depth),rear=-D.depth/2-.18,split=point(0,4.25,rear);
    const start=point(D.jackX,socketY+rise+1.20,D.portZ);
    // Fold directly behind the plug, then route the complete junction behind the case.
    lead.update([start,point(D.jackX+s*.15,6.45+rise,-.17+z*.2),point(D.jackX+s*.35,6.27+rise*.8,rear+z),point(1.85+s,4.80+rise*.1,rear+z),split]);
    const [l,r]=tails;
    const leftStraight=point(l.x,l.y-.22,l.z),rightStraight=point(r.x,r.y-.22,r.z);
    left.update([split,point(l.x+s*.6,4.55,rear+z*.6),point(l.x+s*.3,5.10,rear+z*.3),point(l.x,leftStraight.y-.035,l.z),leftStraight],l);
    const remoteX=r.x+s*.4,remoteZ=rear+z*.4;
    right.update([split,point(r.x+s*.6,4.55,rear+z*.6),point(remoteX,4.60,remoteZ),point(remoteX,4.78,remoteZ),point(r.x+s*.3,5.10,rear+z*.3),point(r.x,rightStraight.y-.035,r.z),rightStraight],r);
    remote.position.set(remoteX,4.69,remoteZ);
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
    },dispose(){if(disposed)return;disposed=true;group.traverse(o=>o.geometry?.dispose());for(const material of [white,metal,rubber,cableMaterial,grille,print])material.dispose();weave.dispose();model.remove(group);}
  };
}
