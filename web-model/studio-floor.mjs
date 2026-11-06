import * as THREE from 'three';

export function createStudioFloor(model, floorY) {
  const group=new THREE.Group(),mirror=model.clone(true),materials=new Map();
  mirror.name='Fading_floor_reflection';mirror.matrixAutoUpdate=false;
  const reflectionMatrix=new THREE.Matrix4().set(1,0,0,0, 0,-1,0,2*floorY, 0,0,1,0, 0,0,0,1);
  function reflectedMaterial(source){
    if(materials.has(source))return materials.get(source);
    const material=source.clone();material.transparent=true;material.depthWrite=false;material.opacity=source.opacity*.26;
    if('roughness' in material)material.roughness=Math.max(.64,material.roughness);
    if('clearcoat' in material)material.clearcoat=0;
    material.onBeforeCompile=shader=>{
      shader.uniforms.floorY={value:floorY};
      shader.vertexShader='varying float reflectionWorldY;\n'+shader.vertexShader.replace('#include <project_vertex>','reflectionWorldY=(modelMatrix*vec4(transformed,1.0)).y;\n#include <project_vertex>');
      shader.fragmentShader='uniform float floorY;\nvarying float reflectionWorldY;\n'+shader.fragmentShader.replace('#include <dithering_fragment>','#include <dithering_fragment>\nfloat fade=clamp(1.0-(floorY-reflectionWorldY)/1.35,0.0,1.0);\ngl_FragColor.a*=fade*fade;');
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
  let previousDark;
  return {group,update(dark){
    mirror.matrix.copy(reflectionMatrix).multiply(model.matrix);
    if(dark!==previousDark){for(const [source,target]of materials){target.color?.copy(source.color);if(target.map!==source.map){target.map=source.map;target.needsUpdate=true;}}previousDark=dark;}
    contact.material.opacity=dark?.28:.25;ambient.material.opacity=dark?.08:.065;
  }};
}
