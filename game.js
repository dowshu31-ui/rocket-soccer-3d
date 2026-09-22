import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const $ = (id) => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x071018);
scene.fog = new THREE.Fog(0x071018, 30, 90);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 250);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
$('gameArea').appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x163020, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(-12, 25, 10); scene.add(sun);

const input = { w:false, a:false, s:false, d:false, boost:false, jump:false, flip:false };
const keys = {};
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; if (e.key === ' ') keys.space = true; });
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; if (e.key === ' ') keys.space = false; });
document.querySelectorAll('[data-key]').forEach(button => {
  const k = button.dataset.key;
  const on = e => { e.preventDefault(); input[k] = true; };
  const off = e => { e.preventDefault(); input[k] = false; };
  button.addEventListener('pointerdown', on); button.addEventListener('pointerup', off);
  button.addEventListener('pointercancel', off); button.addEventListener('pointerleave', off);
});

const A = { x: 13, z: 8, ceiling: 8, goal: 5.4, ballR: .55 };
const game = { left:0, right:0, time:90, running:false, countdown:false };
const v = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const clamp = (n,a,b) => Math.max(a, Math.min(b,n));

function mat(color, extra={}) { return new THREE.MeshStandardMaterial({color, roughness:.7, metalness:.12, ...extra}); }
function box(size, pos, material, parent=scene) { const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material); m.position.set(...pos); parent.add(m); return m; }

function buildArena() {
  box([26,.6,16],[0,-.3,0],mat(0x237b4b));
  const wall = mat(0x294c68);
  box([26,8,.55],[0,4,-8.2],wall); box([26,8,.55],[0,4,8.2],wall);
  box([.55,8,16.4],[-13.2,4,0],wall); box([.55,8,16.4],[13.2,4,0],wall);
  const roof = mat(0x193347,{transparent:true,opacity:.18,side:THREE.DoubleSide}); box([26,.25,16.4],[0,8.2,0],roof);
  const line = mat(0xffffff,{emissive:0x222222}); box([.08,.03,15.2],[0,.03,0],line);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2,2.15,64),new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide})); ring.rotation.x=-Math.PI/2; ring.position.y=.035; scene.add(ring);
  const goal = mat(0x72c9ff,{transparent:true,opacity:.2,emissive:0x164c70});
  box([1.2,3.2,A.goal],[-13.6,1.6,0],goal); box([1.2,3.2,A.goal],[13.6,1.6,0],goal);
  for (const x of [-10,10]) for (const z of [-5.5,5.5]) { const p=new THREE.Mesh(new THREE.CylinderGeometry(.9,.9,.12,24),mat(x<0?0xffc857:0x6ee7ff,{emissive:x<0?0xff8c00:0x006bff,emissiveIntensity:1.5})); p.position.set(x,.08,z); scene.add(p); }
}

function car(color, pos, heading) {
  const g=new THREE.Group(), body=box([1.7,.55,2.8],[0,.65,0],mat(color,{metalness:.35}),g);
  box([.95,.34,1.15],[.45,.95,0],mat(0x9edcff,{transparent:true,opacity:.45,metalness:.5}),g);
  const wheels=[]; const wg=new THREE.CylinderGeometry(.3,.3,.24,16), wm=mat(0x111318);
  for(const [x,z] of [[-.78,-1.02],[.78,-1.02],[-.78,1.02],[.78,1.02]]) { const w=new THREE.Mesh(wg,wm); w.rotation.z=Math.PI/2; w.position.set(x,.28,z); g.add(w); wheels.push(w); }
  const flame=new THREE.PointLight(color,0,6); flame.position.set(1.1,.5,0); g.add(flame); g.position.copy(pos); g.rotation.y=heading; scene.add(g);
  return {g,vel:v(),heading,yaw:heading,boost:100,ground:true,jumps:0,air:0,spin:0,wheels,flame,r:1.15};
}

buildArena();
const player=car(0x37a8ff,v(-6,0,0),0), enemy=car(0xff5353,v(6,0,0),Math.PI);
const ball=new THREE.Mesh(new THREE.SphereGeometry(A.ballR,32,20),mat(0xf2eee2,{roughness:.45})); ball.position.set(0,A.ballR,0); ball.vel=v(); scene.add(ball);

function reset() { for(const [c,x,h] of [[player,-6,0],[enemy,6,Math.PI]]) { c.g.position.set(x,0,0); c.g.rotation.set(0,h,0); c.heading=h;c.vel.set(0,0,0);c.ground=true;c.jumps=0;c.air=0;c.boost=100; } ball.position.set(0,A.ballR,0); ball.vel.set(0,0,0); }
function jump(c) { if(c.ground || c.jumps<2) { c.vel.y=c.ground?8.5:7.2; c.ground=false;c.jumps++; } }
function flip(c, steering=0) { if(c.spin>0)return; c.spin=.65; c.vel.y+=2; c.vel.x+=Math.sin(c.heading)*4.5; c.vel.z+=Math.cos(c.heading)*4.5; c.g.rotation.x=steering*.8; }
function surface(c,dt) {
  const p=c.g.position, margin=1.2; c.ground=false;
  if(p.y<=0){p.y=0;c.vel.y=0;c.ground=true;c.jumps=0;}
  // Driving onto the side walls rotates the car and preserves tangential velocity.
  if(p.z < -A.z+margin){p.z=-A.z+margin;c.vel.z=Math.abs(c.vel.z);c.g.rotation.x=-Math.PI/2;c.ground=true;}
  if(p.z > A.z-margin){p.z=A.z-margin;c.vel.z=-Math.abs(c.vel.z);c.g.rotation.x=Math.PI/2;c.ground=true;}
  if(p.x < -A.x+margin){p.x=-A.x+margin;c.vel.x=Math.abs(c.vel.x);c.g.rotation.z=Math.PI/2;c.ground=true;}
  if(p.x > A.x-margin){p.x=A.x-margin;c.vel.x=-Math.abs(c.vel.x);c.g.rotation.z=-Math.PI/2;c.ground=true;}
  if(p.y>A.ceiling-margin){p.y=A.ceiling-margin;c.vel.y=-Math.abs(c.vel.y);}
  if(p.y<=0.05 && Math.abs(p.z)<A.z-margin && Math.abs(p.x)<A.x-margin)c.g.rotation.x*=.8,c.g.rotation.z*=.8;
  c.spin=Math.max(0,c.spin-dt); c.g.rotation.y=c.heading;
}
function drive(c, throttle, reverse, left, right, boost, dt, ai=false) {
  const steer=(right?1:0)-(left?1:0), speed=c.vel.length();
  c.heading += steer*dt*(1.8+Math.min(speed/15,1)*2);
  const forward=v(Math.sin(c.heading),0,Math.cos(c.heading));
  c.vel.addScaledVector(forward,((throttle?22:0)-(reverse?15:0))*dt);
  if(boost&&c.boost>0){c.vel.addScaledVector(forward,30*dt);c.boost-=32*dt;c.flame.intensity=3;} else {c.boost=Math.min(100,c.boost+13*dt);c.flame.intensity=0;}
  if(!c.ground){c.vel.y-=18*dt;c.g.position.y+=c.vel.y*dt;c.air+=dt;} else c.air=0;
  c.vel.multiplyScalar(1-dt*.8); if(c.vel.length()>20)c.vel.setLength(20); c.g.position.addScaledVector(c.vel,dt);
  surface(c,dt); for(const w of c.wheels)w.rotation.x+=speed*dt*1.5;
}
function updatePlayer(dt) {
  const jumpPressed=input.jump||keys.e; if(jumpPressed){jump(player);input.jump=false;keys.e=false;}
  if(keys.q){flip(player,(input.d?1:0)-(input.a?1:0));keys.q=false;}
  drive(player,keys.w||input.w,keys.s||input.s,keys.a||input.a,keys.d||input.d,keys.space||input.boost,dt);
}
function updateAI(dt) {
  const dx=ball.position.x-enemy.g.position.x,dz=ball.position.z-enemy.g.position.z, angle=Math.atan2(dx,dz), d=((angle-enemy.heading+Math.PI)%(2*Math.PI))-Math.PI;
  drive(enemy,Math.abs(d)<2.5,true, d<-.1,d>.1,Math.hypot(dx,dz)<5,dt,true); if(ball.position.y>2&&Math.hypot(dx,dz)<4)jump(enemy);
}
function collide(c) { const d=ball.position.clone().sub(c.g.position), min=A.ballR+c.r; if(d.length()<min){const n=d.normalize(),over=min-d.length();ball.position.addScaledVector(n,over);const rel=ball.vel.clone().sub(c.vel), impulse=Math.max(0,-rel.dot(n))*1.8+.8;ball.vel.addScaledVector(n,impulse);ball.vel.addScaledVector(c.vel,.35);}}
function updateBall(dt) {
  ball.vel.y-=18*dt; ball.position.addScaledVector(ball.vel,dt);
  if(ball.position.y<A.ballR){ball.position.y=A.ballR;if(ball.vel.y<0)ball.vel.y*=-.75;}
  if(ball.position.z<-A.z+A.ballR){ball.position.z=-A.z+A.ballR;ball.vel.z=Math.abs(ball.vel.z)*.9;}
  if(ball.position.z>A.z-A.ballR){ball.position.z=A.z-A.ballR;ball.vel.z=-Math.abs(ball.vel.z)*.9;}
  if(ball.position.y>A.ceiling-A.ballR){ball.position.y=A.ceiling-A.ballR;ball.vel.y=-Math.abs(ball.vel.y)*.85;}
  const goal=Math.abs(ball.position.z)<A.goal/2;
  if(ball.position.x<-A.x-0.4&&goal){game.right++;reset();}
  if(ball.position.x>A.x+0.4&&goal){game.left++;reset();}
  ball.vel.multiplyScalar(.995);if(ball.vel.length()>27)ball.vel.setLength(27);
}
function cameraFollow() { const f=v(Math.sin(player.heading),0,Math.cos(player.heading)); const target=player.g.position.clone().addScaledVector(f,-10).add(v(0,5.5,0)); camera.position.lerp(target,.09);camera.lookAt(ball.position.clone().lerp(player.g.position,.35).add(v(0,1.2,0))); }
function hud(){ $('score').textContent=`${game.left} : ${game.right}`; $('timer').textContent=Math.ceil(game.time); $('boostFill').style.width=`${player.boost}%`; }
function countdown(){ game.running=true;game.countdown=true;let n=3;$('countdown').textContent=n;$('countdown').classList.add('show');const t=setInterval(()=>{n--; $('countdown').textContent=n>0?n:'GO';if(n<0){clearInterval(t);$('countdown').classList.remove('show');game.countdown=false;reset();}},500); }
$('startBtn').addEventListener('click',()=>{$('menu').classList.add('hidden');countdown();});
function loop(){requestAnimationFrame(loop);const dt=Math.min(.033,1/60);if(game.running&&!game.countdown){game.time-=dt;if(game.time<=0){game.time=90;game.left=game.right=0;reset();}updatePlayer(dt);updateAI(dt);collide(player);collide(enemy);updateBall(dt);hud();}cameraFollow();renderer.render(scene,camera);} reset();hud();loop();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
