import * as THREE from 'three';

export function createStudioFloor(model, floorY,{baseline=false}={}) {
  const group=new THREE.Group(),mirror=model.clone(true),materials=new Map();
  mirror.name='Fading_floor_reflection';mirror.matrixAutoUpdate=false;
  const reflectionMatrix=new THREE.Matrix4().set(1,0,0,0, 0,-1,0,2*floorY, 0,0,1,0, 0,0,0,1);
  function reflectedMaterial(source){
    if(materials.has(source))return materials.get(source);
    const material=source.clone();material.transparent=true;material.depthWrite=false;material.opacity=source.opacity*(baseline?.26:.18);
    if('roughness' in material)material.roughness=Math.max(.64,material.roughness);
    if('clearcoat' in material)material.clearcoat=0;
    material.onBeforeCompile=shader=>{
      shader.uniforms.floorY={value:floorY};
      shader.vertexShader='varying float reflectionWorldY;\n'+shader.vertexShader.replace('#include <project_vertex>','reflectionWorldY=(modelMatrix*vec4(transformed,1.0)).y;\n#include <project_vertex>');
      shader.fragmentShader='uniform float floorY;\nvarying float reflectionWorldY;\n'+shader.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\nfloat fade=clamp(1.0-(floorY-reflectionWorldY)/'+(baseline?'1.35':'0.95')+',0.0,1.0);\ngl_FragColor.a*=fade*fade;');
    };
    material.customProgramCacheKey=()=> 'pocket-floor-fade-v1';
    materials.set(source,material);return material;
  }
  mirror.traverse(object=>{if(object.isMesh){object.material=Array.isArray(object.material)?object.material.map(reflectedMaterial):reflectedMaterial(object.material);object.userData={};object.renderOrder=1;}});
  group.add(mirror);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const c=canvas.getContext('2d');c.translate(256,64);c.scale(256,64);
  const gradient=c.createRadialGradient(0,0,0,0,0,1);gradient.addColorStop(0,'rgba(42,57,73,1)');gradient.addColorStop(.35,'rgba(42,57,73,.62)');gradient.addColorStop(1,'rgba(42,57,73,0)');
  c.fillStyle=gradient;c.fillRect(-1,-1,2,2);
  const shadowTexture=new THREE.CanvasTexture(canvas);shadowTexture.colorSpace=THREE.SRGBColorSpace;
  function shadow(width,height,opacity,y){const plane=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:shadowTexture,transparent:true,opacity,depthWrite:false,toneMapped:false}));plane.position.set(0,y,-.7);plane.renderOrder=2;group.add(plane);return plane;}
  const ambient=shadow(7.6,.88,.065,floorY-.08),contact=shadow(6.2,.20,.25,floorY+.005);
  let pool,horizon;
  if(!baseline){
    const glow=document.createElement('canvas');glow.width=256;glow.height=64;const g=glow.getContext('2d');g.translate(128,32);g.scale(128,32);
    const glowGradient=g.createRadialGradient(0,0,0,0,0,1);glowGradient.addColorStop(0,'rgba(255,255,255,1)');glowGradient.addColorStop(.4,'rgba(255,255,255,.45)');glowGradient.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=glowGradient;g.fillRect(-1,-1,2,2);
    const glowTexture=new THREE.CanvasTexture(glow);glowTexture.colorSpace=THREE.SRGBColorSpace;
    pool=new THREE.Mesh(new THREE.PlaneGeometry(9.6,1.7),new THREE.MeshBasicMaterial({map:glowTexture,color:'#a6bdcb',transparent:true,opacity:.08,depthWrite:false,toneMapped:false}));pool.position.set(0,floorY-.36,-1.9);pool.renderOrder=-3;group.add(pool);
    horizon=new THREE.Mesh(new THREE.PlaneGeometry(19,.012),new THREE.MeshBasicMaterial({map:glowTexture,color:'#9dabbc',transparent:true,opacity:.12,depthWrite:false,toneMapped:false}));horizon.position.set(0,floorY+.025,-2.5);horizon.renderOrder=-2;group.add(horizon);
    pool.raycast=horizon.raycast=()=>{};
  }
  let previousDark;
  return {group,update(dark,accent,breath=1){
    mirror.matrix.copy(reflectionMatrix).multiply(model.matrix);
    if(dark!==previousDark){for(const [source,target]of materials){target.color?.copy(source.color);if('metalness'in target)target.metalness=source.metalness;if('roughness'in target)target.roughness=source.roughness;if(target.map!==source.map){target.map=source.map;target.needsUpdate=true;}}previousDark=dark;}
    contact.material.opacity=dark?.28:.25;ambient.material.opacity=dark?.08:.065;
    if(pool){if(accent)pool.material.color.copy(accent);pool.material.opacity=(dark?.15:.08)*breath;horizon.material.opacity=dark?.13:.08;}
  },dispose(){shadowTexture.dispose();if(pool)pool.material.map.dispose();for(const material of materials.values())material.dispose();for(const mesh of [ambient,contact,pool,horizon])if(mesh){mesh.geometry.dispose();mesh.material.dispose();}}};
}
