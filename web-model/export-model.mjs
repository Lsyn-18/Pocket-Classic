import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

/** The GLTF metal/roughness packer needs drawable images, not raw DataTexture images. */
export async function exportModelGLB(model){
  const clone=model.clone(true),materials=new Map(),textures=new Map();clone.scale.setScalar(.01);clone.updateMatrixWorld(true);
  function texture(source){
    if(!source?.isDataTexture)return source;if(textures.has(source))return textures.get(source);
    const {width,height,data}=source.image;
    if(!(data instanceof Uint8Array)||data.length!==width*height*4)throw Error('此模型贴图格式暂不能导出');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data),width,height),0,0);
    const result=new THREE.CanvasTexture(canvas);for(const key of ['colorSpace','flipY','wrapS','wrapT','magFilter','minFilter','anisotropy','rotation','channel'])result[key]=source[key];
    result.repeat.copy(source.repeat);result.offset.copy(source.offset);result.center.copy(source.center);textures.set(source,result);return result;
  }
  function material(source){if(materials.has(source))return materials.get(source);const result=source.clone();for(const [key,value]of Object.entries(result))if(value?.isTexture)result[key]=texture(value);materials.set(source,result);return result;}
  clone.traverse(object=>{if(object.isMesh)object.material=Array.isArray(object.material)?object.material.map(material):material(object.material)});
  try{return await new GLTFExporter().parseAsync(clone,{binary:true,onlyVisible:true,maxTextureSize:1024})}
  finally{for(const value of materials.values())value.dispose();for(const value of textures.values())value.dispose()}
}
