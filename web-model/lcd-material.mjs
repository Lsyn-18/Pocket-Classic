import * as THREE from 'three';

// Sharpen only the LCD's final projected pixels, before display color encoding.
// Keep the font size/weight settings and continuous mip filtering. Bounds
// from the sampled neighbourhood limit overshoot beyond the local color range.
export function createLCDMaterial(texture,{baseline=false}={}) {
  const material=new THREE.MeshBasicMaterial({map:texture,toneMapped:false});
  if(baseline)return material;
  material.onBeforeCompile=shader=>{
    shader.uniforms.lcdSharpness={value:.6};
    shader.fragmentShader='uniform float lcdSharpness;\n'+shader.fragmentShader.replace('#include <map_fragment>',`
      #ifdef USE_MAP
        vec2 lcdDx=dFdx(vMapUv)*.75,lcdDy=dFdy(vMapUv)*.75;
        vec4 lcdCenter=texture2D(map,vMapUv);
        vec3 lcdLeft=texture2D(map,vMapUv-lcdDx).rgb;
        vec3 lcdRight=texture2D(map,vMapUv+lcdDx).rgb;
        vec3 lcdTop=texture2D(map,vMapUv-lcdDy).rgb;
        vec3 lcdBottom=texture2D(map,vMapUv+lcdDy).rgb;
        vec3 lcdLow=min(lcdCenter.rgb,min(min(lcdLeft,lcdRight),min(lcdTop,lcdBottom)));
        vec3 lcdHigh=max(lcdCenter.rgb,max(max(lcdLeft,lcdRight),max(lcdTop,lcdBottom)));
        vec3 lcdMean=(lcdLeft+lcdRight+lcdTop+lcdBottom)*.25;
        lcdCenter.rgb=clamp(lcdCenter.rgb+(lcdCenter.rgb-lcdMean)*lcdSharpness,lcdLow,lcdHigh);
        diffuseColor*=lcdCenter;
      #endif
    `);
  };
  material.customProgramCacheKey=()=> 'pocket-lcd-local-sharp-v1';
  return material;
}
