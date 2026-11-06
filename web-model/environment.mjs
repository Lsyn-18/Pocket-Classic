import * as THREE from 'three';

export function createStudioEnvironment(renderer,{baseline=false}={}) {
  const w=baseline?512:1024,h=w/2,data=new Float32Array(w*h*4);
  const longitude=Array.from({length:w},(_,x)=>{const a=(x/(w-1)-.5)*Math.PI*2;return [Math.cos(a),Math.sin(a)];});
  const directions=[[0,.2,1],[-.62,.45,.9],[.9,.1,.35],[0,1,0]].map(a=>{const length=Math.hypot(...a);return a.map(v=>v/length);});
  const gaussian=(x,y,z,d,s)=>Math.exp((x*d[0]+y*d[1]+z*d[2]-1)/(s*s));
  const strip=(x,y,z,cx,width,cy,height)=>Math.exp(-.5*((x-cx)/width)**2-.5*((y-cy)/height)**2)*Math.max(0,z);
  const box=(x,y,z,cx,cy,width,height)=>Math.exp(-(((x-cx)/width)**4)-((y-cy)/height)**4)*Math.max(0,z);
  for(let row=0;row<h;row++){
    const phi=row/(h-1)*Math.PI,sin=Math.sin(phi),y=Math.cos(phi);
    for(let column=0;column<w;column++){
      const x=-sin*longitude[column][0],z=sin*longitude[column][1],i=(row*w+column)*4;
      if(baseline){
        let light=.33+.62*gaussian(x,y,z,directions[0],.82)+2.1*gaussian(x,y,z,directions[1],.25)+1.4*gaussian(x,y,z,directions[2],.12)+.38*gaussian(x,y,z,directions[3],.7);
        light+=2.7*strip(x,y,z,-.27,.095,.08,.78)+1.5*strip(x,y,z,.48,.06,-.12,.67);light*=1-.42*strip(x,y,z,.13,.11,.04,.9);
        data[i]=data[i+1]=data[i+2]=light;
      }else{
        const sky=.24+.25*Math.max(0,y),top=1.45*gaussian(x,y,z,[0,.8,.6],.62);
        const left=2.25*box(x,y,z,-.43,.12,.37,.80),right=1.35*box(x,y,z,.65,.02,.27,.72);
        const front=.55*gaussian(x,y,z,directions[0],.78),bottom=1-.35*Math.max(0,-y);
        data[i]=(sky+top*.96+left*.88+right*1.05+front)*bottom;
        data[i+1]=(sky+top+left*.96+right*1.01+front)*bottom;
        data[i+2]=(sky*1.06+top*1.05+left*1.08+right*.94+front*1.03)*bottom;
      }
      data[i+3]=1;
    }
  }
  const input=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.FloatType);input.mapping=THREE.EquirectangularReflectionMapping;input.needsUpdate=true;
  const generator=new THREE.PMREMGenerator(renderer),target=generator.fromEquirectangular(input);
  input.dispose();generator.dispose();
  return {texture:target.texture,resolution:`${w}x${h}`,dispose:()=>target.dispose()};
}
