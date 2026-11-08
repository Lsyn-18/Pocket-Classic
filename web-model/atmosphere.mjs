import * as THREE from 'three';

export function trackAccent(id=0) {
  const seed=trackSeed(id);
  return new THREE.Color().setHSL((200+15*seed)/360,.20,.60);
}
const trackSeed=id=>id?((Math.abs(Number(id)||0)*.61803398875)%1):.5;
// A small, bounded change around daylight, rather than colored metal.
export function trackLight(id=0){const shift=trackSeed(id)*2-1;return {kelvin:6500+shift*300,color:new THREE.Color().setRGB(1-Math.max(0,shift)*.025,1-Math.abs(shift)*.009,1+Math.min(0,shift)*.035)};}

export function createAtmosphere({scene,camera,native=false,baseline=false}) {
  const group=new THREE.Group();group.name='Cool_silver_studio_atmosphere';scene.add(group);
  const accent=trackAccent(),target=accent.clone(),light=trackLight().color,lightTarget=light.clone(),backdrops=document.querySelectorAll?.('.ambient-backdrop')||[document.querySelector('.ambient-backdrop')];
  let clock=0,phase=0,lastId=null;
  const uniforms={uDark:{value:0},uAccent:{value:accent},uLight:{value:light},uBreath:{value:1},uTilt:{value:new THREE.Vector2()}};
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,uniforms,
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec2 vUv;uniform float uDark;uniform vec3 uAccent,uLight;uniform float uBreath;uniform vec2 uTilt;
      float lobe(vec2 p,vec2 center,vec2 size,float power){vec2 d=(p-center)/size;return exp(-dot(d,d)*power);}
      void main(){vec2 p=vec2(vUv.x,1.-vUv.y)+uTilt*1.30;
        float key=lobe(p,vec2(.5,.355),vec2(.43,.47),2.);
        float top=lobe(p,vec2(.5,.02),vec2(.33,.30),1.7);
        float warm=lobe(p,vec2(.815,.600),vec2(.25,.33),2.1);
        float pool=lobe(p,vec2(.5,.96),vec2(.44,.215),2.3);
        float shaft=exp(-pow((p.x-.5)/.082,2.))*smoothstep(.01,.18,p.y)*(1.-smoothstep(.70,1.,p.y));
        float wKey=key*.34,wTop=top*.17,wShaft=shaft*.11,wWarm=warm*.095,wPool=pool*.30;
        float total=wKey+wTop+wShaft+wWarm+wPool;
        float alpha=min(total*mix(.60,.40,uDark),mix(.20,.13,uDark))*uBreath;
        vec3 color=((wKey+wShaft)*uLight+wTop*vec3(.91,.95,1.)+wWarm*vec3(1.,.94,.85)+wPool*uAccent)/max(total,.00001);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
      }`});
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);plane.position.z=-5;plane.renderOrder=-10;plane.frustumCulled=false;plane.raycast=()=>{};group.add(plane);
  const count=76,positions=new Float32Array(count*3),seeds=new Float32Array(count);let seed=618;
  const random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<count;i++){positions[i*3]=random()*2-1;positions[i*3+1]=random();positions[i*3+2]=-2.5-random()*1.5;seeds[i]=random();}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('aSeed',new THREE.BufferAttribute(seeds,1));
  const particleUniforms={uTime:{value:0},uDark:uniforms.uDark,uBounds:{value:new THREE.Vector2()},uCenter:{value:new THREE.Vector2()},uDpr:{value:Math.min(globalThis.devicePixelRatio||1,2)},uTilt:uniforms.uTilt};
  const particleMaterial=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:particleUniforms,
    vertexShader:`attribute float aSeed;uniform float uTime,uDpr;uniform vec2 uBounds,uTilt,uCenter;varying float vAlpha;
      void main(){float life=fract(position.y+uTime*.0075);vec3 p=position;
      float cone=.20+.55*(1.-life);p.x=(position.x*cone+sin(uTime*.055+aSeed*28.)*.015)*uBounds.x+uCenter.x+uTilt.x*1.30;
      p.y=(life*2.-1.)*uBounds.y+uCenter.y+uTilt.y*1.30;
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);gl_PointSize=mix(2.2,5.8,aSeed)*uDpr;
      vAlpha=mix(.10,.26,aSeed)*smoothstep(0.,.12,life)*(1.-smoothstep(.82,1.,life));}`,
    fragmentShader:`uniform float uDark;varying float vAlpha;void main(){float a=exp(-dot(gl_PointCoord-.5,gl_PointCoord-.5)*18.0)*vAlpha;gl_FragColor=vec4(mix(vec3(.46,.54,.62),vec3(.66,.74,.82),uDark),a);
      #include <colorspace_fragment>
    }`});
  const particles=new THREE.Points(geometry,particleMaterial);particles.renderOrder=-8;particles.frustumCulled=false;particles.raycast=()=>{};group.add(particles);group.visible=!baseline;
  return {group,count:baseline?0:count,accent,light,update(dt,{dark=false,trackId=0,playing=false,tiltX=0,tiltY=0,reducedMotion=false}={}){
    if(baseline)return;
    if(lastId!==trackId){lastId=trackId;target.copy(trackAccent(trackId));lightTarget.copy(trackLight(trackId).color);const rgb=target.clone().convertLinearToSRGB();for(const backdrop of backdrops)backdrop?.style.setProperty('--track-accent',`${Math.round(rgb.r*255)},${Math.round(rgb.g*255)},${Math.round(rgb.b*255)}`);}
    const ease=1-Math.exp(-dt*2.4);accent.lerp(target,ease);light.lerp(lightTarget,ease);uniforms.uDark.value=Number(dark);
    if(!reducedMotion){clock+=dt;phase+=dt*2*Math.PI/(playing?8:12);}
    uniforms.uBreath.value=reducedMotion?1:1+Math.sin(phase)*.12;uniforms.uTilt.value.set(reducedMotion?0:tiltY,reducedMotion?0:tiltX);
    particleUniforms.uTime.value=clock;particles.visible=!reducedMotion;
    const width=(camera.right-camera.left)/2,height=(camera.top-camera.bottom)/2,cx=(camera.right+camera.left)/2,cy=(camera.top+camera.bottom)/2;
    plane.scale.set(width,height,1);plane.position.set(cx,cy,-5);particleUniforms.uBounds.value.set(width,height);particleUniforms.uCenter.value.set(cx,cy);
  },dispose(){plane.geometry.dispose();material.dispose();geometry.dispose();particleMaterial.dispose();scene.remove(group);}};
}
