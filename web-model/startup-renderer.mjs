import * as THREE from 'three';

// Keep the animated reveal inside WebGL. Rebuilding a full-window CSS gradient
// mask can stall Android WebView when its canvas first becomes visible.
export function createStartupRenderer(renderer,{model,floor,atmosphere}){
  const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:Math.min(4,renderer.capabilities.maxSamples),depthBuffer:true,stencilBuffer:false});
  const uniforms={image:{value:target.texture},center:{value:new THREE.Vector2()},radius:{value:1},feather:{value:1},opacity:{value:0}};
  const material=new THREE.ShaderMaterial({uniforms,transparent:true,depthTest:false,depthWrite:false,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`varying vec2 vUv;uniform sampler2D image;uniform vec2 center;uniform float radius,feather,opacity;
      void main(){vec4 pixel=texture2D(image,vUv);float reveal=1.-smoothstep(radius-feather,radius+feather,distance(gl_FragCoord.xy,center));
        gl_FragColor=vec4(pixel.rgb/max(pixel.a,.00001),pixel.a*reveal*opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material),scene=new THREE.Scene(),camera=new THREE.Camera();scene.add(quad);
  const size=new THREE.Vector2();let disposed=false,warming=null,released=false;
  function release(){if(released)return;released=true;target.dispose();quad.geometry.dispose();material.dispose();}
  return {
    warm(source,sourceCamera){
      if(disposed)return;
      if(warming)return warming;
      // Compile both the HDR scene and final screen programs before timing.
      warming=(async()=>{const previous=renderer.getRenderTarget();renderer.setRenderTarget(target);
      const compiling=renderer.compileAsync(source,sourceCamera);renderer.setRenderTarget(previous);
      await compiling;
      if(!disposed)await renderer.compileAsync(scene,camera);
      if(!disposed)await renderer.compileAsync(source,sourceCamera);
      })().finally(()=>{warming=null;if(disposed)release();});
      return warming;
    },
    render(source,sourceCamera,frame,view){
      if(disposed)return;
      renderer.getDrawingBufferSize(size);if(target.width!==size.x||target.height!==size.y)target.setSize(size.x,size.y);
      const scale=size.x/view.width;
      uniforms.center.value.set(frame.centerX*scale,(view.height-frame.centerY)*scale);
      uniforms.radius.value=frame.maskRadius*scale;uniforms.feather.value=frame.maskFeather*scale;uniforms.opacity.value=frame.wheelAlpha;
      const previousTarget=renderer.getRenderTarget(),autoClear=renderer.autoClear,autoReset=renderer.info.autoReset;
      const visibility=[model.visible,floor.visible,atmosphere.visible];
      renderer.info.autoReset=false;renderer.info.reset();
      try{
        atmosphere.visible=false;renderer.setRenderTarget(target);renderer.render(source,sourceCamera);
        atmosphere.visible=visibility[2];model.visible=floor.visible=false;
        renderer.setRenderTarget(previousTarget);renderer.render(source,sourceCamera);
        renderer.autoClear=false;renderer.render(scene,camera);
      }finally{
        [model.visible,floor.visible,atmosphere.visible]=visibility;
        renderer.setRenderTarget(previousTarget);renderer.autoClear=autoClear;renderer.info.autoReset=autoReset;
      }
    },
    dispose(){if(disposed)return;disposed=true;if(!warming)release();else warming.finally(release).catch(()=>{});}
  };
}
