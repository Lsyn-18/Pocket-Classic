import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import {visualBaseline} from './visual-profile.mjs';
import {createLCDMaterial} from './lcd-material.mjs';

export const dimensions = { width: 6.18, height: 10.35, depth: 1.05, cornerRadius:.67, seamZ:.025, wheelRadius: 1.92, wheelOpening:1.95, centerRadius:.665, wheelY: -2.28, screenY: 2.60, screenWidth: 4.90, screenHeight: 3.675, bezelWidth:5.18, bezelHeight:4.13, holdX:-1.98, jackX:1.97, portZ:.10 };

export function roundedShape(w, h, r, x = 0, y = 0) {
  const s = new THREE.Shape();
  const l = x - w / 2, b = y - h / 2, right = x + w / 2, t = y + h / 2;
  s.moveTo(l + r, t); s.lineTo(right - r, t); s.quadraticCurveTo(right, t, right, t - r);
  s.lineTo(right, b + r); s.quadraticCurveTo(right, b, right - r, b);
  s.lineTo(l + r, b); s.quadraticCurveTo(l, b, l, b + r);
  s.lineTo(l, t - r); s.quadraticCurveTo(l, t, l + r, t);
  s.closePath(); return s;
}

function grainTexture(seed = 11, strength = 20) {
  const size = 256, pixels = new Uint8Array(size * size * 4);
  let random = seed;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    random = (1664525 * random + 1013904223) >>> 0;
    const n = 128 + ((random >>> 24) / 255 - .5) * strength + Math.sin(y * 6.1) * 3;
    const i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = n; pixels[i + 3] = 255;
  }
  const t = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 9); t.needsUpdate = true;
  return t;
}

function aluminumColorTexture(frosted=false) {
  const w=512,h=1024,data=new Uint8Array(w*h*4);let seed=87;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    seed=(1664525*seed+1013904223)>>>0;
    const v=y/(h-1),line=Math.sin(y*17.317)*Math.sin(y*3.173),base=frosted?195+10*v+4*Math.sin(v*Math.PI)+line*3.2:190+10*v+6*Math.sin(v*Math.PI),noise=((seed>>>24)/255-.5)*(frosted?1.8:2.5);
    const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=base+noise;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;return texture;
}

function frostedTextures(){
  const size=256,height=new Float32Array(size*size),roughness=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4);let seed=2053;
  for(let i=0;i<height.length;i++){seed=(1664525*seed+1013904223)>>>0;height[i]=(seed>>>8)/16777216;}
  const at=(x,y)=>height[((y+size)%size)*size+(x+size)%size];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const gx=Math.floor(x/32),gy=Math.floor(y/32),fx=x/32-gx,fy=y/32-gy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const a=at(gx*29,gy*37)*(1-sx)+at((gx+1)*29,gy*37)*sx,b=at(gx*29,(gy+1)*37)*(1-sx)+at((gx+1)*29,(gy+1)*37)*sx;
    const i=(y*size+x)*4,low=(a*(1-sy)+b*sy)*2-1,grain=at(x,y)-.5;
    // Three.js multiplies this green channel by material.roughness. Keep it near
    // white, rather than multiplying two absolute roughness values together.
    const r=Math.max(218,Math.min(255,242+low*3+grain*8));
    roughness[i]=roughness[i+1]=roughness[i+2]=r;roughness[i+3]=255;
    normal[i]=128+(at(x-1,y)-at(x+1,y))*10;normal[i+1]=128+(at(x,y-1)-at(x,y+1))*10;normal[i+2]=254;normal[i+3]=255;
  }
  const make=data=>{const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(7,11);t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.colorSpace=THREE.NoColorSpace;t.needsUpdate=true;return t;};
  return {roughness:make(roughness),normal:make(normal)};
}

function annularSurface(profile,segments=96){
  const positions=[],uv=[],indices=[];
  for(const [r,z]of profile)for(let i=0;i<=segments;i++){const a=i/segments*Math.PI*2;positions.push(r*Math.cos(a),r*Math.sin(a),z);uv.push(.5+r*Math.cos(a)/3.9,.5+r*Math.sin(a)/3.9);}
  for(let j=0;j<profile.length-1;j++)for(let i=0;i<segments;i++){const a=j*(segments+1)+i,b=a+1,c=a+segments+1,d=c+1;indices.push(a,c,b,b,c,d);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

// Rounded rectangular cross-sections reproduce the shallow aluminium nose and
// the deeper rolled steel back separately. Units are centimetres.
function shellLoft(profile){
  const positions=[],uv=[],indices=[],corners=24,count=corners*4;
  for(const [z,inset]of profile){
    const w=dimensions.width-2*inset,h=dimensions.height-2*inset,r=dimensions.cornerRadius-inset;
    const centers=[[w/2-r,h/2-r],[-w/2+r,h/2-r],[-w/2+r,-h/2+r],[w/2-r,-h/2+r]];
    for(let j=0;j<4;j++)for(let k=0;k<corners;k++){
      const a=(j+k/corners)*Math.PI/2,x=centers[j][0]+r*Math.cos(a),y=centers[j][1]+r*Math.sin(a);
      positions.push(x,y,z);uv.push(x/dimensions.width+.5,y/dimensions.height+.5);
    }
  }
  for(let row=0;row<profile.length-1;row++)for(let i=0;i<count;i++){const a=row*count+i,b=row*count+(i+1)%count,c=a+count,d=b+count;indices.push(a,c,b,b,c,d)}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; return texture;
}

function wheelPrinting() {
  return canvasTexture(1024, 1024, (c, w) => {
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '54px Arial'; c.fillText('MENU', 512, 101);
    const tri = (x, y, reverse = false) => { c.beginPath(); c.moveTo(x + (reverse ? 20 : 0), y - 14); c.lineTo(x + (reverse ? 0 : 20), y); c.lineTo(x + (reverse ? 20 : 0), y + 14); c.closePath(); c.fill(); };
    c.fillRect(96, 497, 7, 30); tri(104, 512, true); tri(126, 512, true);
    tri(874, 512); tri(896, 512); c.fillRect(921, 497, 7, 30);
    tri(473, 921); c.fillRect(511, 907, 8, 28); c.fillRect(529, 907, 8, 28);
  });
}

function engravingTexture() {
  return canvasTexture(1024, 1720, (c, w, h) => {
    c.fillStyle = '#515963'; c.textAlign = 'center'; c.textBaseline = 'middle';
    // Small engraved fruit emblem, drawn as curves rather than a bitmap decal.
    c.save(); c.translate(512, 585); c.scale(1.6, 1.6);
    c.beginPath(); c.moveTo(0,-31); c.bezierCurveTo(-35,-57,-73,-26,-63,18); c.bezierCurveTo(-58,51,-37,76,-21,70); c.bezierCurveTo(-6,64,6,65,21,70); c.bezierCurveTo(38,78,58,47,65,27); c.bezierCurveTo(38,17,36,-9,61,-22); c.bezierCurveTo(40,-51,17,-41,0,-31); c.fill();
    c.beginPath(); c.moveTo(2,-39); c.bezierCurveTo(0,-66,24,-81,36,-81); c.bezierCurveTo(36,-61,22,-41,2,-39); c.fill(); c.restore();
    c.font = '600 116px Arial'; c.fillText('iPod', 512, 850);
    c.font = '18px Arial'; c.fillText('Designed by Apple in California  Assembled in China',512,1395);
    c.fillText('Model A1238   EMC 2173   160GB',512,1425);
    c.fillText('IC: 579C-A1238   FCC ID: BCGA1238',512,1455);
    c.font='46px Arial';c.fillText('FCC  CE',410,1535);c.lineWidth=2;c.strokeStyle='#515963';c.strokeRect(611,1500,79,43);c.font='24px Arial';c.fillText('VCCI',650,1530);
    c.beginPath();c.moveTo(547,1503);c.lineTo(553,1543);c.lineTo(579,1543);c.lineTo(585,1503);c.moveTo(541,1502);c.lineTo(590,1502);c.moveTo(541,1494);c.lineTo(590,1550);c.moveTo(590,1494);c.lineTo(541,1550);c.stroke();
    c.font='13px Arial';c.fillText('Pocket Classic · Visual reconstruction',512,1610);
  });
}

export function createClassic(screenTexture,{baseline=visualBaseline}={}) {
  const model = new THREE.Group(); model.name = 'iPod_Classic_2009';
  model.userData = { dimensionsMillimeters: [61.8, 103.5, 10.5], purpose: 'Visual reconstruction, not a manufacturing drawing', source: 'https://support.apple.com/en-gb/112601' };
  const grain = grainTexture();
  const silverCoat=aluminumColorTexture(!baseline),frost=baseline?null:frostedTextures();
  const materials = {
    front: new THREE.MeshPhysicalMaterial({ color: '#ffffff', map:silverCoat, metalness: .88, roughness: .30, envMapIntensity: 1.12, anisotropy: .32, anisotropyRotation: Math.PI / 2, bumpMap: grain, bumpScale: .0008, clearcoat: .16, clearcoatRoughness: .24 }),
    steel: new THREE.MeshPhysicalMaterial({ color: '#dce0e5', metalness: 1, roughness: .145, clearcoat: .32, clearcoatRoughness: .12 }),
    wheel: new THREE.MeshStandardMaterial({ color: '#eff3f5', roughness: .68, metalness: .025 }),
    center: new THREE.MeshPhysicalMaterial({ color: '#a5a6a9', metalness: .82, roughness: .36, envMapIntensity: 1.08, anisotropy: .25, bumpMap: grain, bumpScale: .0007 }),
    black: new THREE.MeshStandardMaterial({ color: '#0c1118', roughness: .7, metalness: .08 }),
    bezel: new THREE.MeshPhysicalMaterial({ color: '#1b2028', roughness: .22, metalness: .42, clearcoat: .65 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 1, roughness: .035, transparent:true, opacity:.045, depthWrite:false, clearcoat: .1 }),
    gold: new THREE.MeshStandardMaterial({ color: '#b5a66c', roughness: .45, metalness: .9 }),
    wheelRecess: new THREE.MeshStandardMaterial({color:'#b7bdc3',roughness:.7,metalness:.15}),
    wheelSeam: new THREE.MeshStandardMaterial({color:'#78828e',metalness:.5,roughness:.5}),
  };
  if(!baseline){
    Object.assign(materials.front,{metalness:.96,roughness:.34,clearcoat:0,anisotropy:.38,envMapIntensity:1.0,bumpMap:null,roughnessMap:frost.roughness,normalMap:frost.normal,normalScale:new THREE.Vector2(.035,.035)});
    Object.assign(materials.center,{metalness:.96,roughness:.30,envMapIntensity:1.0,anisotropy:.28,bumpMap:null,roughnessMap:frost.roughness,normalMap:frost.normal,normalScale:new THREE.Vector2(.025,.025)});
    Object.assign(materials.wheel,{metalness:0,roughness:.64,envMapIntensity:.40});
    Object.assign(materials.wheelRecess,{roughness:.84,metalness:0,envMapIntensity:.55});
    Object.assign(materials.wheelSeam,{roughness:.80,metalness:.05,envMapIntensity:.55});
    Object.assign(materials.bezel,{roughness:.32,metalness:.55,clearcoat:.08});
    Object.assign(materials.glass,{metalness:0,roughness:.09,opacity:.035,clearcoat:.48,clearcoatRoughness:.10});
    materials.wheelLip=new THREE.MeshStandardMaterial({color:'#b6bfc9',metalness:.10,roughness:.76,envMapIntensity:.65});
    materials.wheelInnerLip=materials.wheelLip.clone();
  }
  // A soft satin edge keeps the slim rolled lip from reading as a dark sidewall.
  // The white click wheel stays matte so the two materials read separately.
  materials.frontRim = materials.front.clone();
  materials.frontRim.roughness = baseline?.36:.23;
  materials.frontRim.metalness = baseline?.68:.95;
  materials.frontRim.anisotropy = baseline?.16:.07;
  if(!baseline){materials.frontRim.normalScale.set(.025,.025);materials.frontRim.envMapIntensity=1.18;materials.frontRim.clearcoat=0;}
  const parts = {};
  function add(name, geometry, material, position = [0, 0, 0], zone = null) {
    const mesh = new THREE.Mesh(geometry, material); mesh.name = name; mesh.position.set(...position);
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (zone) mesh.userData.zone = zone;
    model.add(mesh); parts[name] = mesh; return mesh;
  }
  function extrude(shape, depth, bevel = .02) {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, steps: 1, curveSegments: 32, bevelEnabled: bevel > 0, bevelSegments: 5, bevelSize: bevel, bevelThickness: bevel });
    const smooth = toCreasedNormals(geometry, Math.PI / 3);
    // Keep the machined front and rear planes flat; smoothing their normals
    // into the curved rim causes triangular reflection artifacts near holes.
    const cap = smooth.groups.find(group => group.materialIndex === 0);
    if (cap) {
      const positions = smooth.attributes.position, normals = smooth.attributes.normal;
      for (let i=cap.start;i<cap.start+cap.count;i++) normals.setXYZ(i,0,0,positions.getZ(i)>depth/2?1:-1);
      normals.needsUpdate=true;
    }
    return smooth;
  }
  function solid(name, w, h, r, depth, bevel, material, center, zone) {
    return add(name, extrude(roundedShape(w - 2 * bevel, h - 2 * bevel, r - bevel), depth - 2 * bevel, bevel), material, [center[0], center[1], center[2] - depth / 2 + bevel], zone);
  }
  function cylinder(name, radius, depth, mat, x, y, z, zone) {
    const geometry = new THREE.CylinderGeometry(radius, radius, depth, 128); geometry.rotateX(Math.PI / 2);
    return add(name, geometry, mat, [x, y, z], zone);
  }
  function decoration(name,geometry,material,position,rotation){
    const mesh=add(name,geometry,material,position);mesh.userData.decorative=true;mesh.raycast=()=>{};if(rotation)mesh.rotation.set(...rotation);return mesh;
  }
  function frameGeometry(w,h,r,thickness){const shape=roundedShape(w,h,r);const hole=roundedShape(w-thickness*2,h-thickness*2,Math.max(.005,r-thickness));shape.holes.push(new THREE.Path(hole.getPoints(48).reverse()));return new THREE.ShapeGeometry(shape,48);}
  if(baseline)solid('Polished_stainless_rear_shell', 6.18, 10.35, .57, .72, .13, materials.steel, [0,0,-.165], 'case');
  else {
    add('Polished_stainless_rear_shell',shellLoft([[.025,0],[-.10,.004],[-.25,.021],[-.39,.065],[-.48,.135],[-.516,.18],[-.524,.20],[-.525,.22]]),materials.steel,[0,0,0],'case');
    const back=add('Rear_center_pillow',new THREE.ShapeGeometry(roundedShape(5.74,9.91,.45),48),materials.steel,[0,0,-.525],'case');back.rotation.y=Math.PI;
    add('Front_rear_case_seam',shellLoft([[.029,.001],[.021,.001]]),new THREE.MeshStandardMaterial({color:'#555b61',roughness:.55,metalness:.5}),[0,0,0],'case');
  }
  // Both holes are real openings in the front face geometry.
  const face = roundedShape(baseline?5.98:5.84, baseline?10.15:10.01, baseline?.45:.50);
  const screenHole = roundedShape(dimensions.bezelWidth+.025, dimensions.bezelHeight+.025, .15, 0, dimensions.screenY);
  face.holes.push(new THREE.Path(screenHole.getPoints(100).reverse()));
  const dialHole = new THREE.Path(); dialHole.absarc(0, dimensions.wheelY, dimensions.wheelOpening, 0, Math.PI * 2, false); face.holes.push(dialHole);
  const faceGeometry=extrude(face,.022,0),facePositions=faceGeometry.attributes.position,faceUv=[];
  for(let i=0;i<facePositions.count;i++)faceUv.push((facePositions.getX(i)+3.09)/6.18,(facePositions.getY(i)+5.175)/10.35);
  faceGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(faceUv,2));
  // Extrude group 1 is the cutout wall. A reflective face material on this
  // subpixel wall produces bright crawling rims around the dark click wheel.
  add('Flat_anodized_face_with_cutouts', faceGeometry, baseline?materials.front:[materials.front,materials.wheelRecess], [0,0,.503], 'case');
  // Keep the visible front roll narrow: a broad dark rim exaggerates thickness.
  // Construct that surface separately so the display and wheel openings keep
  // their tight, machined edges rather than acquiring the outer bevel radius.
  const rimVertices=[],rimIndices=[];const perCorner=baseline?32:48,around=perCorner*4,steps=baseline?16:12;
  function perimeter(inset){
    const w=6.18-2*inset,h=10.35-2*inset,r=.55-inset,points=[];
    const centers=[[w/2-r,h/2-r],[-w/2+r,h/2-r],[-w/2+r,-h/2+r],[w/2-r,-h/2+r]];
    for(let corner=0;corner<4;corner++)for(let k=0;k<perCorner;k++){const a=(corner*90+k*90/perCorner)*Math.PI/180;points.push([centers[corner][0]+r*Math.cos(a),centers[corner][1]+r*Math.sin(a)])}
    return points;
  }
  for(let j=0;j<=steps;j++){const a=j/steps*Math.PI/2,inset=.1*(1-Math.sin(a)),z=.2+.325*Math.cos(a);for(const p of perimeter(inset))rimVertices.push(p[0],p[1],z)}
  for(let j=0;j<steps;j++)for(let i=0;i<around;i++){const a=j*around+i,b=j*around+(i+1)%around,c=(j+1)*around+i,d=(j+1)*around+(i+1)%around;rimIndices.push(a,c,b,b,c,d)}
  const rimGeometry=new THREE.BufferGeometry();rimGeometry.setAttribute('position',new THREE.Float32BufferAttribute(rimVertices,3));rimGeometry.setIndex(rimIndices);rimGeometry.computeVertexNormals();
  const rimUv=[];for(let i=0;i<rimVertices.length;i+=3)rimUv.push((rimVertices[i]+3.09)/6.18,(rimVertices[i+1]+5.175)/10.35);rimGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(rimUv,2));
  if(baseline)add('Continuous_rounded_front_lip',rimGeometry,materials.frontRim,[0,0,0],'case');
  else {rimGeometry.dispose();add('Continuous_rounded_front_lip',shellLoft([[.525,.17],[.524,.153],[.515,.137],[.50,.125],[.46,.085],[.36,.035],[.20,.008],[.025,0]]),materials.frontRim,[0,0,0],'case');}
  solid('Recessed_display_bezel', dimensions.bezelWidth, dimensions.bezelHeight, .14, .10, .015, materials.bezel, [0,dimensions.screenY,.475], 'screen');
  const lcdMaterial = createLCDMaterial(screenTexture,{baseline});
  const lcd = add('Live_LCD_320x240', new THREE.PlaneGeometry(dimensions.screenWidth, dimensions.screenHeight), lcdMaterial, [0,dimensions.screenY,.529], 'screen');
  lcd.userData.lcd = true; lcd.castShadow = false;
  const glass = solid('Separate_display_glass', dimensions.screenWidth+.035, dimensions.screenHeight+.035, .045, .012, .003, materials.glass, [0,dimensions.screenY,.529], 'screen');
  glass.castShadow = false; glass.renderOrder = 2;
  // Extend the well behind the 1.945 opening, including tilt parallax. Leaving
  // a gap here exposes the polished rear shell as a flickering chrome hairline.
  cylinder('Click_wheel_recess', baseline?1.938:1.985, .11, materials.wheelRecess, 0, dimensions.wheelY, .428, 'wheel');
  const inner=dimensions.centerRadius+.012;
  const ring = add('Capacitive_click_wheel_ring', baseline?new THREE.RingGeometry(inner,dimensions.wheelRadius,160):annularSurface([[inner,0],[.90,-.006],[1.52,-.004],[dimensions.wheelRadius,0]]), materials.wheel, [0,dimensions.wheelY,.506], 'wheel');
  ring.castShadow = false;
  const center = cylinder('Independent_center_button', dimensions.centerRadius, .042, materials.center, 0, dimensions.wheelY, .493, 'wheel');
  if(!baseline){
    center.geometry.dispose();center.geometry=new THREE.LatheGeometry([[0,-.021],[.65,-.021],[.665,-.013],[.665,.012],[.64,.021],[.45,.0174],[0,.014]].map(([r,z])=>new THREE.Vector2(r,z)),96);center.geometry.rotateX(Math.PI/2);
    const p=center.geometry.attributes.position,uv=center.geometry.attributes.uv;
    for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/(dimensions.centerRadius*2)+.5,p.getY(i)/(dimensions.centerRadius*2)+.5);uv.needsUpdate=true;
  }
  const seam = add('Center_button_seam', new THREE.RingGeometry(dimensions.centerRadius,inner,128), materials.wheelSeam, [0,dimensions.wheelY,.507], 'wheel'); seam.castShadow = false;
  const printMaterial = new THREE.MeshBasicMaterial({ map: wheelPrinting(), color:'#697783', transparent: true, depthWrite: false, toneMapped:false });
  const printing = add('Printed_click_wheel_symbols', new THREE.PlaneGeometry(dimensions.wheelRadius*2,dimensions.wheelRadius*2), printMaterial, [0,dimensions.wheelY,.509], 'wheel'); printing.castShadow = false;
  const port = add('Headphone_socket_rim', new THREE.TorusGeometry(.203,.023,16,96), materials.steel, [dimensions.jackX,5.181,dimensions.portZ], 'case'); port.rotation.x = -Math.PI / 2;
  const socket = new THREE.CylinderGeometry(.175,.175,.16,64);
  add('Headphone_socket_inner_wall', socket, materials.black, [dimensions.jackX,5.105,dimensions.portZ], 'case');
  const jackBottom = add('Headphone_socket_dark_interior', new THREE.CircleGeometry(.176,64), materials.black, [dimensions.jackX,5.187,dimensions.portZ], 'case'); jackBottom.rotation.x = -Math.PI / 2;
  function topCapsule(name,w,h,material,x,y,z,zone){const shape=new THREE.ShapeGeometry(roundedShape(w,h,h/2),24);const mesh=add(name,shape,material,[x,y,z],zone);mesh.rotation.x=-Math.PI/2;return mesh;}
  const holdBase = topCapsule('Hold_switch_recess',1.05,.34,materials.black,dimensions.holdX,5.181,dimensions.portZ,'hold');
  const orange = topCapsule('Hold_orange_indicator',1.0,.29,new THREE.MeshStandardMaterial({color:'#cf6c26',roughness:.7}),dimensions.holdX,5.186,dimensions.portZ,'hold');
  const holdSlider = topCapsule('Independent_hold_slider',.82,.285,materials.wheel,dimensions.holdX-.10,5.193,dimensions.portZ,'hold');
  if(!baseline){
    const trim=new THREE.MeshPhysicalMaterial({color:'#c3cbd4',metalness:.95,roughness:.23,envMapIntensity:1.18});
    const groove=new THREE.MeshStandardMaterial({color:'#4c5968',metalness:.55,roughness:.62});
    const edge=new THREE.MeshBasicMaterial({color:'#dce7ef',transparent:true,opacity:.30,depthWrite:false,toneMapped:false});
    decoration('Display_outer_satin_bevel',frameGeometry(dimensions.bezelWidth+.025,dimensions.bezelHeight+.025,.15,.012),materials.bezel,[0,dimensions.screenY,.526]);
    decoration('Display_inner_glass_edge',frameGeometry(dimensions.screenWidth+.025,dimensions.screenHeight+.025,.04,.007),materials.bezel,[0,dimensions.screenY,.531]);
    decoration('Display_top_glass_glint',new THREE.PlaneGeometry(dimensions.screenWidth-.08,.006),edge,[0,dimensions.screenY+dimensions.screenHeight/2+.01,.534]);
    decoration('Wheel_rounded_outer_lip',new THREE.TorusGeometry(dimensions.wheelRadius+.011,.012,5,92),materials.wheelLip,[0,dimensions.wheelY,.497]);
    decoration('Wheel_inner_satin_lip',new THREE.RingGeometry(inner+.003,inner+.011,96),materials.wheelInnerLip,[0,dimensions.wheelY,.507]);
    decoration('Headphone_inner_bevel',new THREE.TorusGeometry(.179,.008,4,32),trim,[dimensions.jackX,5.185,dimensions.portZ],[-Math.PI/2,0,0]);
    const label=canvasTexture(256,64,c=>{c.fillStyle='#77828c';c.textAlign='center';c.textBaseline='middle';c.font='26px Arial';c.fillText('HOLD',128,32);});
    decoration('Hold_switch_engraved_label',new THREE.PlaneGeometry(.60,.15),new THREE.MeshBasicMaterial({map:label,transparent:true,depthWrite:false,toneMapped:false}),[-1.02,5.187,dimensions.portZ],[-Math.PI/2,0,0]);
    const phones=canvasTexture(128,128,c=>{c.strokeStyle='#59616a';c.lineWidth=9;c.beginPath();c.arc(64,63,35,Math.PI,0);c.moveTo(29,62);c.lineTo(29,99);c.moveTo(99,62);c.lineTo(99,99);c.stroke();});
    decoration('Headphone_engraved_symbol',new THREE.PlaneGeometry(.22,.22),new THREE.MeshBasicMaterial({map:phones,transparent:true,depthWrite:false,toneMapped:false}),[2.48,5.187,dimensions.portZ],[-Math.PI/2,0,0]);
  }
  // The drawing has a centred 30-pin slot, without exposed screw heads.
  const dock=add('Thirty_pin_dock_recess',new THREE.ShapeGeometry(roundedShape(2.50,.36,.035),16),materials.black,[0,-5.188,dimensions.portZ],'case');dock.rotation.x=Math.PI/2;
  decoration('Dock_satin_frame',frameGeometry(2.62,.43,.05,.035),materials.steel,[0,-5.184,dimensions.portZ],[Math.PI/2,0,0]);
  add('Dock_inner_tongue', new THREE.BoxGeometry(2.14,.012,.075), materials.black, [0,-5.194,.16], 'case');
  for (let i=0;i<30;i++) add(`Dock_contact_${String(i+1).padStart(2,'0')}`, new THREE.BoxGeometry(.025,.009,.045), materials.gold, [-1+i*(2/29),-5.199,.045], 'case');
  const engraving = new THREE.MeshBasicMaterial({ map: engravingTexture(), transparent:true, opacity:.60, depthWrite:false,toneMapped:false });
  const backMark = add('Rear_laser_engraving', new THREE.PlaneGeometry(5.5,9.45), engraving, [0,0,-.528]); backMark.rotation.y = Math.PI; backMark.castShadow = false;
  let dark = null;
  function setDark(value) {
    if (dark === value) return; dark = value;
    if(baseline){
      for(const [material,silverRoughness]of [[materials.front,.30],[materials.frontRim,.36]]){material.map=value?null:silverCoat;material.color.set(value?'#30343a':'#ffffff');material.roughness=value?.40:silverRoughness;material.needsUpdate=true;}
      materials.wheel.color.set(value?'#20242b':'#e8edf1');materials.center.color.set(value?'#343b45':'#a5a6a9');
    }else{
      // Keep the coating and shader layout stable; only uniforms change finish.
      materials.front.color.set(value?'#393b3e':'#aab5c0');materials.front.roughness=value?.35:.30;materials.front.metalness=.96;
      materials.frontRim.color.set(value?'#393b3e':'#c8d1db');materials.frontRim.roughness=value?.30:.23;
      materials.wheel.color.set(value?'#08090b':'#e8ebed');materials.wheel.roughness=.64;
      materials.center.color.set(value?'#5d6268':'#bbc6d0');materials.center.roughness=value?.34:.30;materials.center.metalness=value?.92:.96;
      materials.wheelRecess.color.set(value?'#080a0d':'#b4bdc6');materials.wheelSeam.color.set(value?'#12151a':'#99a5b0');
      materials.wheelLip.color.set(value?'#272c32':'#b3bec9');materials.wheelInnerLip.color.set(value?'#242a30':'#b0bbc6');
    }
    // A single white glyph atlas can be tinted without upload/dispose flashes.
    printMaterial.color.set(value?'#c5ccd3':'#697783');
  }
  setDark(false);
  function setHold(value) { holdSlider.position.x = dimensions.holdX+(value?-.10:.10); orange.visible = value; }
  setHold(false);
  return { model, parts, materials, lcd, center, setDark, setHold };
}
