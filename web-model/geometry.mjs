import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

export const dimensions = { width: 6.18, height: 10.35, depth: 1.05, wheelRadius: 1.916, wheelY: -2.15, screenY: 2.66, screenWidth: 5.1, screenHeight: 3.825 };

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

function aluminumColorTexture() {
  const w=512,h=1024,data=new Uint8Array(w*h*4);let seed=87;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    seed=(1664525*seed+1013904223)>>>0;
    const v=y/(h-1),base=190+10*v+6*Math.sin(v*Math.PI),noise=((seed>>>24)/255-.5)*2.5;
    const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=base+noise;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);texture.colorSpace=THREE.SRGBColorSpace;texture.needsUpdate=true;return texture;
}

function canvasTexture(w, h, draw) {
  const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; return texture;
}

function wheelPrinting(dark) {
  return canvasTexture(1024, 1024, (c, w) => {
    c.fillStyle = dark ? '#eef0f3' : '#959da5'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '54px Arial'; c.fillText('MENU', 512, 101);
    const tri = (x, y, reverse = false) => { c.beginPath(); c.moveTo(x + (reverse ? 20 : 0), y - 14); c.lineTo(x + (reverse ? 0 : 20), y); c.lineTo(x + (reverse ? 20 : 0), y + 14); c.closePath(); c.fill(); };
    c.fillRect(96, 497, 7, 30); tri(104, 512, true); tri(126, 512, true);
    tri(874, 512); tri(896, 512); c.fillRect(921, 497, 7, 30);
    tri(473, 921); c.fillRect(511, 907, 8, 28); c.fillRect(529, 907, 8, 28);
  });
}

function engravingTexture() {
  return canvasTexture(1024, 1536, (c, w, h) => {
    c.fillStyle = '#515963'; c.textAlign = 'center'; c.textBaseline = 'middle';
    // Small engraved fruit emblem, drawn as curves rather than a bitmap decal.
    c.save(); c.translate(512, 390); c.scale(1.2, 1.2);
    c.beginPath(); c.moveTo(0,-31); c.bezierCurveTo(-35,-57,-73,-26,-63,18); c.bezierCurveTo(-58,51,-37,76,-21,70); c.bezierCurveTo(-6,64,6,65,21,70); c.bezierCurveTo(38,78,58,47,65,27); c.bezierCurveTo(38,17,36,-9,61,-22); c.bezierCurveTo(40,-51,17,-41,0,-31); c.fill();
    c.beginPath(); c.moveTo(2,-39); c.bezierCurveTo(0,-66,24,-81,36,-81); c.bezierCurveTo(36,-61,22,-41,2,-39); c.fill(); c.restore();
    c.font = '70px Arial'; c.fillText('iPod', 512, 615);
    c.lineWidth = 2; c.strokeStyle = '#58616d'; c.strokeRect(430, 1037, 164, 49);
    c.font = '30px Arial'; c.fillText('160GB', 512, 1062);
    c.font = '18px Arial'; c.fillText('Pocket Classic · Interactive model study', 512, 1188);
    c.fillText('61.8 × 103.5 × 10.5 mm', 512, 1223);
  });
}

export function createClassic(screenTexture) {
  const model = new THREE.Group(); model.name = 'iPod_Classic_2009';
  model.userData = { dimensionsMillimeters: [61.8, 103.5, 10.5], purpose: 'Visual reconstruction, not a manufacturing drawing', source: 'https://support.apple.com/en-gb/112601' };
  const grain = grainTexture();
  const silverCoat=aluminumColorTexture();
  const materials = {
    front: new THREE.MeshPhysicalMaterial({ color: '#ffffff', map:silverCoat, metalness: .88, roughness: .30, envMapIntensity: 1.12, anisotropy: .32, anisotropyRotation: Math.PI / 2, bumpMap: grain, bumpScale: .0008, clearcoat: .16, clearcoatRoughness: .24 }),
    steel: new THREE.MeshPhysicalMaterial({ color: '#dce0e5', metalness: 1, roughness: .145, clearcoat: .32, clearcoatRoughness: .12 }),
    wheel: new THREE.MeshStandardMaterial({ color: '#eff3f5', roughness: .68, metalness: .025 }),
    center: new THREE.MeshPhysicalMaterial({ color: '#a5a6a9', metalness: .82, roughness: .36, envMapIntensity: 1.08, anisotropy: .25, bumpMap: grain, bumpScale: .0007 }),
    black: new THREE.MeshStandardMaterial({ color: '#0c1118', roughness: .7, metalness: .08 }),
    bezel: new THREE.MeshPhysicalMaterial({ color: '#1b2028', roughness: .22, metalness: .42, clearcoat: .65 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#ffffff', metalness: 1, roughness: .035, transparent:true, opacity:.045, depthWrite:false, clearcoat: .1 }),
    gold: new THREE.MeshStandardMaterial({ color: '#b5a66c', roughness: .45, metalness: .9 }),
  };
  // A soft satin edge keeps the slim rolled lip from reading as a dark sidewall.
  // The white click wheel stays matte so the two materials read separately.
  materials.frontRim = materials.front.clone();
  materials.frontRim.roughness = .36;
  materials.frontRim.metalness = .68;
  materials.frontRim.anisotropy = .16;
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
  solid('Polished_stainless_rear_shell', 6.18, 10.35, .57, .72, .13, materials.steel, [0,0,-.165], 'case');
  // Both holes are real openings in the front face geometry.
  const face = roundedShape(5.98, 10.15, .45);
  const screenHole = roundedShape(5.31, 4.025, .10, 0, dimensions.screenY);
  face.holes.push(new THREE.Path(screenHole.getPoints(100).reverse()));
  const dialHole = new THREE.Path(); dialHole.absarc(0, dimensions.wheelY, 1.945, 0, Math.PI * 2, false); face.holes.push(dialHole);
  const faceGeometry=extrude(face,.022,0),facePositions=faceGeometry.attributes.position,faceUv=[];
  for(let i=0;i<facePositions.count;i++)faceUv.push((facePositions.getX(i)+3.09)/6.18,(facePositions.getY(i)+5.175)/10.35);
  faceGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(faceUv,2));
  add('Flat_anodized_face_with_cutouts', faceGeometry, materials.front, [0,0,.503], 'case');
  // Keep the visible front roll narrow: a broad dark rim exaggerates thickness.
  // Construct that surface separately so the display and wheel openings keep
  // their tight, machined edges rather than acquiring the outer bevel radius.
  const rimVertices=[],rimIndices=[];const around=128,steps=16;
  function perimeter(inset){
    const w=6.18-2*inset,h=10.35-2*inset,r=.55-inset,points=[];
    const centers=[[w/2-r,h/2-r],[-w/2+r,h/2-r],[-w/2+r,-h/2+r],[w/2-r,-h/2+r]];
    for(let corner=0;corner<4;corner++)for(let k=0;k<32;k++){const a=(corner*90+k*90/32)*Math.PI/180;points.push([centers[corner][0]+r*Math.cos(a),centers[corner][1]+r*Math.sin(a)])}
    return points;
  }
  for(let j=0;j<=steps;j++){const a=j/steps*Math.PI/2,inset=.1*(1-Math.sin(a)),z=.2+.325*Math.cos(a);for(const p of perimeter(inset))rimVertices.push(p[0],p[1],z)}
  for(let j=0;j<steps;j++)for(let i=0;i<around;i++){const a=j*around+i,b=j*around+(i+1)%around,c=(j+1)*around+i,d=(j+1)*around+(i+1)%around;rimIndices.push(a,c,b,b,c,d)}
  const rimGeometry=new THREE.BufferGeometry();rimGeometry.setAttribute('position',new THREE.Float32BufferAttribute(rimVertices,3));rimGeometry.setIndex(rimIndices);rimGeometry.computeVertexNormals();
  const rimUv=[];for(let i=0;i<rimVertices.length;i+=3)rimUv.push((rimVertices[i]+3.09)/6.18,(rimVertices[i+1]+5.175)/10.35);rimGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(rimUv,2));
  add('Continuous_rounded_front_lip',rimGeometry,materials.frontRim,[0,0,0],'case');
  solid('Recessed_display_bezel', 5.295, 4.01, .10, .10, .018, materials.bezel, [0,dimensions.screenY,.457], 'screen');
  const lcdMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
  const lcd = add('Live_LCD_320x240', new THREE.PlaneGeometry(5.1, 3.825), lcdMaterial, [0,dimensions.screenY,.509], 'screen');
  lcd.userData.lcd = true; lcd.castShadow = false;
  const glass = solid('Separate_display_glass', 5.15, 3.875, .045, .022, .005, materials.glass, [0,dimensions.screenY,.514], 'screen');
  glass.castShadow = false; glass.renderOrder = 2;
  cylinder('Click_wheel_recess', 1.938, .11, new THREE.MeshStandardMaterial({color:'#b7bdc3',roughness:.7,metalness:.15}), 0, dimensions.wheelY, .428, 'wheel');
  const ring = add('Capacitive_click_wheel_ring', new THREE.RingGeometry(.704, 1.916, 160), materials.wheel, [0,dimensions.wheelY,.506], 'wheel');
  ring.castShadow = false;
  const center = cylinder('Independent_center_button', .693, .042, materials.center, 0, dimensions.wheelY, .493, 'wheel');
  const seam = add('Center_button_seam', new THREE.RingGeometry(.693,.704,128), new THREE.MeshStandardMaterial({color:'#78828e',metalness:.5,roughness:.5}), [0,dimensions.wheelY,.507], 'wheel'); seam.castShadow = false;
  const printMaterial = new THREE.MeshBasicMaterial({ map: wheelPrinting(false), transparent: true, depthWrite: false, toneMapped:false });
  const printing = add('Printed_click_wheel_symbols', new THREE.PlaneGeometry(3.832,3.832), printMaterial, [0,dimensions.wheelY,.509], 'wheel'); printing.castShadow = false;
  const port = add('Headphone_socket_rim', new THREE.TorusGeometry(.177,.026,12,64), materials.steel, [-2.02,5.172,-.08], 'case'); port.rotation.x = -Math.PI / 2;
  const socket = new THREE.CylinderGeometry(.151,.151,.19,48);
  add('Headphone_socket_inner_wall', socket, materials.black, [-2.02,5.103,-.08], 'case');
  const jackBottom = add('Headphone_socket_dark_interior', new THREE.CircleGeometry(.150,48), materials.black, [-2.02,5.183,-.08], 'case'); jackBottom.rotation.x = -Math.PI / 2;
  const holdBase = add('Hold_switch_recess', new THREE.BoxGeometry(.76,.035,.25), materials.black, [1.95,5.175,-.01], 'hold');
  const orange = add('Hold_orange_indicator', new THREE.BoxGeometry(.55,.014,.20), new THREE.MeshStandardMaterial({color:'#cf6c26',roughness:.7}), [1.95,5.197,-.01], 'hold');
  const holdSlider = add('Independent_hold_slider', new THREE.BoxGeometry(.37,.075,.21), materials.center, [1.79,5.213,-.01], 'hold');
  // A recessed dock, inset frame, thirty individual contacts and two fasteners.
  const dock = add('Thirty_pin_dock_recess', new THREE.BoxGeometry(2.25,.035,.30), materials.black, [0,-5.172,-.025], 'case');
  add('Dock_inner_tongue', new THREE.BoxGeometry(1.90,.045,.07), materials.wheel, [0,-5.198,-.015], 'case');
  for (let i=0;i<30;i++) add(`Dock_contact_${String(i+1).padStart(2,'0')}`, new THREE.BoxGeometry(.035,.025,.082), materials.gold, [-.88+i*(1.76/29),-5.224,.026], 'case');
  for (const x of [-1.52,1.52]) {
    const screw = new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.018,24), materials.steel); screw.name = `Dock_fastener_${x<0?'left':'right'}`; screw.position.set(x,-5.18,-.03); model.add(screw);
    add(`Fastener_slot_${x<0?'left':'right'}`,new THREE.BoxGeometry(.054,.006,.009),materials.black,[x,-5.191,-.03],'case');
  }
  const engraving = new THREE.MeshStandardMaterial({ map: engravingTexture(), transparent:true, opacity:.42, metalness:.65, roughness:.53, depthWrite:false });
  const backMark = add('Rear_laser_engraving', new THREE.PlaneGeometry(4.9,7.35), engraving, [0,.05,-.527]); backMark.rotation.y = Math.PI; backMark.castShadow = false;
  let dark = false;
  function setDark(value) {
    if (dark === value) return; dark = value;
    for(const [material,silverRoughness] of [[materials.front,.30],[materials.frontRim,.36]]){
      material.map=value?null:silverCoat;material.color.set(value?'#30343a':'#ffffff');material.roughness=value?.40:silverRoughness;material.needsUpdate=true;
    }
    materials.wheel.color.set(value?'#20242b':'#eff3f5'); materials.center.color.set(value?'#343b45':'#a5a6a9');
    printMaterial.map.dispose(); printMaterial.map = wheelPrinting(value); printMaterial.needsUpdate=true;
  }
  function setHold(value) { holdSlider.position.x = value ? 2.12 : 1.79; orange.visible = value; }
  setHold(false);
  return { model, parts, materials, lcd, center, setDark, setHold };
}
