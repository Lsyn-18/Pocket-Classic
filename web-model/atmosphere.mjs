import * as THREE from 'three';

export function trackAccent(id=0) {
  const hue=id?((Math.abs(Number(id)||0)*.61803398875)%1):.56;
  return new THREE.Color().setHSL(hue,.20,.60);
}

export function createAtmosphere({scene,camera,native=false,baseline=false}) {
  const group=new THREE.Group();group.name='Cool_silver_studio_atmosphere';scene.add(group);
  const accent=trackAccent(),target=accent.clone(),backdrop=document.querySelector('.ambient-backdrop');
  let clock=0,phase=0,lastId=null;
  const uniforms={uDark:{value:0},uAccent:{value:accent},uBreath:{value:1},uTilt:{value:new THREE.Vector2()}};
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,uniforms,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec2 vUv;uniform float uDark;uniform vec3 uAccent;uniform float uBreath;uniform vec2 uTilt;
      void main(){vec2 p=vUv+uTilt*.8;
        float halo=exp(-dot((p-vec2(.5,.40))*vec2(2.1,2.4),(p-vec2(.5,.40))*vec2(2.1,2.4))*2.1);
        vec2 sideDelta=(p-vec2(.17,.67))/vec2(.24,.65);float side=exp(-dot(sideDelta,sideDelta));
        vec3 paper=mix(vec3(.91,.94,.975),vec3(.014,.023,.039),uDark);
        vec3 tint=mix(vec3(.97,.985,1.0),vec3(.075,.105,.15),uDark);
        vec3 color=mix(paper,tint,side*.45);color+=uAccent*halo*uBreath*mix(.018,.065,uDark);
        float edge=smoothstep(0.0,.17,vUv.x)*smoothstep(0.0,.17,1.0-vUv.x)*smoothstep(0.0,.15,vUv.y)*smoothstep(0.0,.15,1.0-vUv.y);
        gl_FragColor=vec4(color,edge*.64);
        #include <colorspace_fragment>
      }`});
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);plane.position.z=-5;plane.renderOrder=-10;plane.frustumCulled=false;plane.raycast=()=>{};group.add(plane);
  const count=native?60:88,positions=new Float32Array(count*3),seeds=new Float32Array(count);let seed=618;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<count;i++){positions[i*3]=random()*2-1;positions[i*3+1]=random()*2-1;positions[i*3+2]=-2.5-random()*1.5;seeds[i]=random();}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
  const particleUniforms={uTime:{value:0},uDark:uniforms.uDark,uBounds:{value:new THREE.Vector2()},uCenter:{value:0},uDpr:{value:Math.min(globalThis.devicePixelRatio||1,2)},uTilt:uniforms.uTilt};
  const particleMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:particleUniforms,
    vertexShader:`attribute float aSeed;uniform float uTime,uDpr,uCenter;uniform vec2 uBounds,uTilt;varying float vAlpha;
      void main(){vec3 p=position;p.x=p.x*uBounds.x+sin(uTime*.055+aSeed*28.0)*.12+uTilt.x*.7;p.y=p.y*uBounds.y+uCenter+sin(uTime*.04+aSeed*19.0)*.16+uTilt.y*.7;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);gl_PointSize=(.8+aSeed*.8)*uDpr;vAlpha=.45+aSeed*.55;}`,
    fragmentShader:`uniform float uDark;varying float vAlpha;void main(){float a=exp(-dot(gl_PointCoord-.5,gl_PointCoord-.5)*18.0)*vAlpha*mix(.085,.16,uDark);gl_FragColor=vec4(mix(vec3(.34,.46,.59),vec3(.54,.68,.82),uDark),a);
      #include <colorspace_fragment>
    }`});
  const particles=new THREE.Points(geometry,particleMaterial);particles.renderOrder=-8;particles.frustumCulled=false;particles.raycast=()=>{};group.add(particles);group.visible=!baseline;
  return {group,count:baseline?0:count,accent,update(dt,{dark=false,trackId=0,playing=false,tiltX=0,tiltY=0,reducedMotion=false}={}){
    if(baseline)return;
    if(lastId!==trackId){lastId=trackId;target.copy(trackAccent(trackId));backdrop?.style.setProperty('--track-accent',`${Math.round(target.r*255)},${Math.round(target.g*255)},${Math.round(target.b*255)}`);}
    const ease=1-Math.exp(-dt*2.4);accent.lerp(target,ease);uniforms.uDark.value+=(Number(dark)-uniforms.uDark.value)*ease;
    if(!reducedMotion){clock+=dt;phase+=dt*(playing?.55:.17);}
    uniforms.uBreath.value=reducedMotion?1:1+Math.sin(phase)*.12;uniforms.uTilt.value.set(reducedMotion?0:tiltY,reducedMotion?0:tiltX);
    particleUniforms.uTime.value=clock;particles.visible=!reducedMotion;
    const width=(camera.right-camera.left)/2,height=(camera.top-camera.bottom)/2,center=(camera.top+camera.bottom)/2;
    plane.scale.set(width,height,1);plane.position.y=center;particleUniforms.uBounds.value.set(width,height);particleUniforms.uCenter.value=center;
  },dispose(){plane.geometry.dispose();material.dispose();geometry.dispose();particleMaterial.dispose();scene.remove(group);}};
}
