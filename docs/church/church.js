import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

const host=document.querySelector('#viewport');
const status=document.querySelector('#status');
let renderer;
try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false}); }
catch(error){status.textContent='This device could not start WebGL. Try a browser with hardware acceleration enabled.';throw error;}
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.setClearColor(0xe4e8dd);
renderer.outputColorSpace=THREE.SRGBColorSpace;
host.appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xe4e8dd,65,140);
const camera=new THREE.PerspectiveCamera(44,1,.05,250);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.075;
controls.minDistance=.7;controls.maxDistance=65;
controls.maxPolarAngle=Math.PI*.485;controls.target.set(0,3,0);
controls.autoRotateSpeed=.4;
controls.listenToKeyEvents(host);
scene.add(new THREE.HemisphereLight(0xfffaf0,0x7d927b,2.4));
const sun=new THREE.DirectionalLight(0xffead1,3.3);sun.position.set(-12,25,15);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-22,right:22,top:22,bottom:-22,near:.5,far:80});sun.shadow.normalBias=.04;scene.add(sun);
const fill=new THREE.DirectionalLight(0xdaefff,1.2);fill.position.set(14,8,-12);scene.add(fill);
const chapel=new THREE.Group();scene.add(chapel);
const roofGroup=new THREE.Group();chapel.add(roofGroup);
const openWalls=new THREE.Group();chapel.add(openWalls);
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.88,...extra});
const stone=material(0xd8ccad),trim=material(0xede2c8),base=material(0xb5aa8f);
const roof=material(0x4c665f),wood=material(0x6b4933),darkWood=material(0x513c2d),floor=material(0xd3c6aa);
const glass=[0x6eafac,0xccaa57,0xa66d59,0x8c98ad].map(color=>material(color,{emissive:color,emissiveIntensity:.23,side:THREE.DoubleSide}));
function mesh(geometry,mat,x,y,z,parent=chapel){const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,mat,x,y,z,parent=chapel){return mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z,parent);}
function cylinder(r,h,mat,x,y,z,parent=chapel){return mesh(new THREE.CylinderGeometry(r,r,h,12),mat,x,y,z,parent);}
function arch(cx,bottom,w,h){const s=new THREE.Shape();const spring=bottom+h-w/2;s.moveTo(cx-w/2,bottom);s.lineTo(cx+w/2,bottom);s.lineTo(cx+w/2,spring);s.absarc(cx,spring,w/2,0,Math.PI,false);s.closePath();return s;}
function wall(w,h,holes,x,z,rotation,parent=chapel){const s=new THREE.Shape();s.moveTo(-w/2,0);s.lineTo(w/2,0);s.lineTo(w/2,h);s.lineTo(-w/2,h);s.closePath();s.holes=holes;
const m=mesh(new THREE.ExtrudeGeometry(s,{depth:.38,bevelEnabled:false}),stone,x,.35,z,parent);m.rotation.y=rotation;return m;}
// A small raised site, stone paving, and a nave with actual window openings.
box(23,.35,30,material(0xa9b69a),0,-.45,0);
box(12,.32,20,base,0,-.12,0);
box(10,.32,18,floor,0,.19,0);
for(let x=-4;x<=4;x+=2)for(let z=-8;z<=8;z+=2){box(1.96,.025,1.96,material((x+z)%4===0?0xd8cdb6:0xd1c4a9),x,.365,z);}
box(2.7,.08,18,material(0xc1ae8c),0,.395,0);
const windowPositions=[-6,-2,2,6];
for(const side of [-1,1]){
 const parent=side===1?openWalls:chapel;
 wall(18,6,windowPositions.map(u=>arch(u,2.25,1.25,2.9)),side*5,0,Math.PI/2,parent);
 for(const u of windowPositions){
  const pane=mesh(new THREE.ShapeGeometry(arch(u,2.25,1.1,2.8)),glass[(u+6)/4],side*5+.2,.35,0,parent);pane.rotation.y=Math.PI/2;
  box(.48,.16,1.65,trim,side*5+.18,2.55,-u,parent);
  box(.1,2.25,.065,trim,side*5+.21,3.68,-u,parent);
  box(.1,.07,1.1,trim,side*5+.21,3.7,-u,parent);
 }
 for(let z=-8;z<=8;z+=4){box(.85,4,.8,stone,side*5.15,2.35,z,parent);box(1,.18,1,trim,side*5.15,4.4,z,parent);}
}
const doorHole=arch(0,0,2.4,3.3),roseHole=new THREE.Path();roseHole.absarc(0,4.8,.72,0,Math.PI*2);
wall(10,6,[doorHole,roseHole],0,9,0,openWalls);
wall(10,6,[arch(0,2.3,2.1,3.1)],0,-9,0);
const apseWindow=mesh(new THREE.ShapeGeometry(arch(0,2.3,1.95,3)),glass[1],0,.35,-8.98);
const rose=mesh(new THREE.CircleGeometry(.68,32),glass[0],0,5.15,9.03,openWalls);
for(let a=0;a<8;a++){const bar=box(.045,1.38,.06,trim,0,5.15,9.1,openWalls);bar.rotation.z=a*Math.PI/4;}
for(const side of [-1,1]){const door=box(1.16,2.4,.13,wood,side*1.1,1.55,9.55,openWalls);door.rotation.y=side*.75;}
for(let i=0;i<3;i++)box(3.6-i*.25,.12,1.5,base,0,-.12+i*.12,10.1-i*.2);
// Roof and gables form one removable layer.
for(const side of [-1,1]){const r=box(6.1,.24,19.25,roof,side*2.63,7.84,0,roofGroup);r.rotation.z=-side*Math.atan2(3,5.3);}
for(const z of [-9,9]){const g=new THREE.Shape();g.moveTo(-5,6.35);g.lineTo(5,6.35);g.lineTo(0,9.35);g.closePath();mesh(new THREE.ShapeGeometry(g),material(0xd8ccad,{side:THREE.DoubleSide}),0,0,z,roofGroup);}
box(.22,.24,19.4,trim,0,9.45,0,roofGroup);
// Bell tower, louvres, spire and cross.
const tower=new THREE.Group();chapel.add(tower);tower.position.set(-3.8,0,8);
box(3.05,9.7,3.05,stone,0,5.05,0,tower);box(3.35,.2,3.35,trim,0,9.5,0,tower);
for(const z of [-1.54,1.54]){const opening=mesh(new THREE.ShapeGeometry(arch(0,7.5,1.3,1.6)),darkWood,0,0,z,tower);if(z<0)opening.rotation.y=Math.PI;for(let y=7.6;y<8.7;y+=.22)box(1.2,.08,.1,wood,0,y,z+(z>0?.03:-.03),tower);}
mesh(new THREE.ConeGeometry(2.4,4,4),roof,0,11.8,0,tower).rotation.y=Math.PI/4;
box(.13,1.35,.13,wood,0,14.25,0,tower);box(.7,.13,.13,wood,0,14.5,0,tower);
// Interior columns, pews, a raised altar, and library bays.
for(const x of [-3.7,3.7])for(const z of [-6,-2,2,6]){cylinder(.19,5.6,trim,x,3.15,z);box(.55,.2,.55,base,x,.5,z);box(.55,.2,.55,trim,x,5.95,z);}
for(const x of [-2.2,2.2])for(const z of [5,3,1,-1]){box(2.35,.16,.7,wood,x,.96,z);box(2.35,.8,.12,wood,x,1.28,z+.32);for(const dx of [-.85,.85])box(.12,.5,.55,darkWood,x+dx,.63,z);}
box(6,.25,2.8,trim,0,.55,-6.8);box(2.3,.7,1,stone,0,1.05,-7);box(2.6,.15,1.2,trim,0,1.48,-7);box(.12,1.8,.12,wood,0,3,-8.7);box(.85,.12,.12,wood,0,3.35,-8.7);
const shelfColors=[0x647e75,0xa37a4e,0x916453,0xb6aa82,0x69788c].map(c=>material(c));
for(const z of [-5.4,-2.5,.4]){
 const shelf=new THREE.Group();shelf.name=`library-bay-${z}`;shelf.userData={purpose:'Future document shelf',documents:[]};chapel.add(shelf);
 box(.12,2.5,2.35,darkWood,4.65,1.65,z,shelf);
 for(const dz of [-1.13,1.13])box(.65,2.5,.1,wood,4.38,1.65,z+dz,shelf);
 for(let row=0;row<4;row++){
  const y=.48+row*.72;box(.7,.08,2.35,wood,4.35,y,z,shelf);
  if(row<3)for(let b=0;b<11;b++){const h=.38+(b%4)*.055;box(.4,h,.13,shelfColors[(b+row)%5],4.23,y+h/2+.05,z-1+b*.19,shelf);}
 }
}
// Quiet landscape framing; no downloaded textures.
const foliage=material(0x688368),trunk=material(0x6f6049);
for(const [x,z,scale] of [[-8,-10,1.1],[8,-10,.85],[-8,5,.75],[8,8,1],[-8,-3,.9]]){cylinder(.16,1.3,trunk,x,.4,z);mesh(new THREE.ConeGeometry(1.2*scale,3.2*scale,7),foliage,x,2*scale,z);mesh(new THREE.ConeGeometry(.9*scale,2.4*scale,7),foliage,x,3.2*scale,z);}
for(let z=11;z<15;z+=1)box(2.4,.04,.85,base,0,-.24,z);

const views={
 overview:{position:[23,19,28],target:[0,4,0],roof:true,cutaway:false,label:'EXTERIOR VIEW',note:'A first architectural study. Orbit around the chapel to explore the tower, windows, and grounds.'},
 front:{position:[10,10,32],target:[-1,5,4],roof:true,cutaway:false,label:'THE ENTRANCE',note:'The entrance and bell tower. Drag horizontally to inspect the front and side elevations.'},
 inside:{position:[0,2.2,6.5],target:[0,2.1,-6],roof:true,cutaway:false,label:'THE CENTRAL AISLE',note:'Inside the nave, looking toward the altar. Pan or change distance to explore the interior.'},
 library:{position:[-.5,3.7,1],target:[4.2,1.6,-3],roof:false,cutaway:true,label:'READING ALCOVE',note:'Three bookshelf bays are ready for a future document collection. The books are visual placeholders for now.'},
 plan:{position:[18,25,23],target:[0,1,0],roof:false,cutaway:true,label:'OPEN PLAN',note:'Roof and two walls are removed to reveal the aisle, seating, altar, and reading spaces.'}
};
let transition=null;
function selectView(name){const view=views[name];document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
 roofGroup.visible=view.roof;openWalls.visible=!view.cutaway;document.querySelector('#roof').checked=view.roof;document.querySelector('#cutaway').checked=view.cutaway;
 document.querySelector('#view-label').textContent=view.label;document.querySelector('#view-note').textContent=view.note;
 const p=new THREE.Vector3(...view.position),t=new THREE.Vector3(...view.target);
 if(matchMedia('(prefers-reduced-motion: reduce)').matches){camera.position.copy(p);controls.target.copy(t);}else transition={from:camera.position.clone(),targetFrom:controls.target.clone(),to:p,targetTo:t,start:performance.now()};
}
camera.position.set(...views.overview.position);controls.target.set(...views.overview.target);
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>selectView(b.dataset.view)));
document.querySelector('#roof').addEventListener('change',e=>roofGroup.visible=e.target.checked);
document.querySelector('#cutaway').addEventListener('change',e=>openWalls.visible=!e.target.checked);
document.querySelector('#rotate').addEventListener('change',e=>controls.autoRotate=e.target.checked);
controls.addEventListener('start',()=>transition=null);
function zoom(factor){transition=null;const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*factor,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);}
document.querySelector('#near').addEventListener('click',()=>zoom(.8));document.querySelector('#far').addEventListener('click',()=>zoom(1.25));document.querySelector('#reset').addEventListener('click',()=>{controls.autoRotate=false;document.querySelector('#rotate').checked=false;selectView('overview');});
new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.fov=width<600?62:44;camera.updateProjectionMatrix();}).observe(host);
renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();status.textContent='The graphics context was lost. Reload the page to restore the model.';});
status.textContent='';
function frame(time){requestAnimationFrame(frame);if(document.hidden)return;if(transition){const t=Math.min(1,(time-transition.start)/850),ease=t*t*(3-2*t);camera.position.lerpVectors(transition.from,transition.to,ease);controls.target.lerpVectors(transition.targetFrom,transition.targetTo,ease);if(t===1)transition=null;}controls.update();renderer.render(scene,camera);}
requestAnimationFrame(frame);
