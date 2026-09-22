import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const gameArea = document.getElementById("gameArea");
const scoreEl = document.getElementById("score");
const timerEl = document.getElementById("timer");
const boostFill = document.getElementById("boostFill");
const countdownEl = document.getElementById("countdown");
const menu = document.getElementById("menu");
const startBtn = document.getElementById("startBtn");

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x091117);
scene.fog = new THREE.Fog(0x091117, 28, 70);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 220);
camera.position.set(0, 7, 15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
gameArea.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 1.2);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(10, 20, 8);
scene.add(dirLight);

const keys = {};
const touchState = { w: false, a: false, s: false, d: false, boost: false, jump: false };

document.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === "r") resetRound();
  if (k === "e") jump(player);
  if (k === "q") flip(player);
});

document.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

document.querySelectorAll(".moveBtn, .actionBtn").forEach((btn) => {
  const key = btn.dataset.key;

  const down = (e) => {
    e.preventDefault();
    if (key === "boost") touchState.boost = true;
    else if (key === "jump") touchState.jump = true;
    else touchState[key] = true;
  };

  const up = (e) => {
    e.preventDefault();
    if (key === "boost") touchState.boost = false;
    else if (key === "jump") touchState.jump = false;
    else touchState[key] = false;
  };

  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointerleave", up);
  btn.addEventListener("pointercancel", up);
});

startBtn.addEventListener("click", () => {
  menu.classList.add("hidden");
  startCountdown();
});

const arena = {
  halfX: 12.5,
  halfZ: 7.5,
  goalWidth: 5,
  ballRadius: 0.5
};

const state = {
  scoreLeft: 0,
  scoreRight: 0,
  matchTime: 90,
  started: false,
  countdown: 3
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function buildArena() {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(25, 0.8, 15),
    new THREE.MeshStandardMaterial({ color: 0x1c8c53, roughness: 0.8, metalness: 0.12 })
  );
  floor.position.y = -0.4;
  scene.add(floor);

  const goalMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.14
  });

  const leftGoal = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.5, arena.goalWidth), goalMat);
  leftGoal.position.set(-12.7, 1.2, 0);
  scene.add(leftGoal);

  const rightGoal = leftGoal.clone();
  rightGoal.position.x = 12.7;
  scene.add(rightGoal);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c465e, roughness: 0.82 });
  const walls = [
    { size: [25.2, 2.8, 0.9], pos: [0, 1.4, -7.7] },
    { size: [25.2, 2.8, 0.9], pos: [0, 1.4, 7.7] },
    { size: [0.9, 2.8, 15.2], pos: [-12.6, 1.4, 0] },
    { size: [0.9, 2.8, 15.2], pos: [12.6, 1.4, 0] }
  ];

  for (const wall of walls) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...wall.size), wallMat);
    mesh.position.set(...wall.pos);
    scene.add(mesh);
  }

  const line = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.05, 12.8),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x111111 })
  );
  line.position.set(0, 0.08, 0);
  scene.add(line);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.7, 2.0, 64),
    new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.09;
  scene.add(ring);
}

function makeCar(color, x, z, heading) {
  const group = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.52,
    metalness: 0.2
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.6, 2.7), bodyMat);
  body.position.y = 0.62;
  group.add(body);

  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.38, 1.15),
    new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 })
  );
  hood.position.set(0.82, 0.62, 0);
  group.add(hood);

  const wheelGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.22, 18);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x101010 });

  const wheels = [];
  const wheelOffsets = [
    [-0.75, 0.2, -1.05],
    [0.75, 0.2, -1.05],
    [-0.75, 0.2, 1.05],
    [0.75, 0.2, 1.05]
  ];

  for (const [xo, yo, zo] of wheelOffsets) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(xo, yo, zo);
    group.add(wheel);
    wheels.push(wheel);
  }

  const glow = new THREE.PointLight(color, 0, 7, 2);
  glow.position.set(1.1, 0.45, 0);
  group.add(glow);

  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);

  return {
    group,
    velocity: new THREE.Vector3(0, 0, 0),
    heading,
    pitch: 0,
    roll: 0,
    onGround: true,
    verticalVelocity: 0,
    jumpCount: 0,
    boost: 100,
    flipCooldown: 0,
    radius: 1.1,
    wheels,
    glow
  };
}

const player = makeCar(0x5aa9ff, -4.8, 0, 0);
const ai = makeCar(0xff5a5a, 4.8, 0, Math.PI);

const ball = new THREE.Mesh(
  new THREE.SphereGeometry(arena.ballRadius, 32, 32),
  new THREE.MeshStandardMaterial({
    color: 0xf5f0e8,
    roughness: 0.75,
    metalness: 0.08
  })
);
ball.position.set(0, arena.ballRadius, 0);
ball.userData.velocity = new THREE.Vector3(0, 0, 0);
scene.add(ball);

const boostPads = [
  { x: -8, z: -3, enabled: true, color: 0xffd166, mesh: null },
  { x: -8, z: 3, enabled: true, color: 0xffd166, mesh: null },
  { x: 8, z: -3, enabled: true, color: 0x7fe3ff, mesh: null },
  { x: 8, z: 3, enabled: true, color: 0x7fe3ff, mesh: null }
];

function createBoostPads() {
  for (const pad of boostPads) {
    const group = new THREE.Group();

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(1.0, 1.0, 0.2, 32),
      new THREE.MeshStandardMaterial({ color: 0x11263b, emissive: pad.color, emissiveIntensity: 0.4 })
    );
    base.position.y = 0.12;
    group.add(base);

    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: pad.color, emissive: pad.color, emissiveIntensity: 0.9 })
    );
    top.position.y = 0.28;
    group.add(top);

    group.position.set(pad.x, 0, pad.z);
    scene.add(group);
    pad.mesh = group;
  }
}

createBoostPads();

function updateHud() {
  scoreEl.textContent = `${state.scoreLeft} : ${state.scoreRight}`;
  timerEl.textContent = String(Math.max(0, Math.ceil(state.matchTime)));
  boostFill.style.width = `${player.boost}%`;
}

function resetRound() {
  player.group.position.set(-4.8, 0, 0);
  player.group.rotation.set(0, 0, 0);
  player.heading = 0;
  player.velocity.set(0, 0, 0);
  player.onGround = true;
  player.verticalVelocity = 0;
  player.boost = 100;

  ai.group.position.set(4.8, 0, 0);
  ai.group.rotation.set(0, Math.PI, 0);
  ai.heading = Math.PI;
  ai.velocity.set(0, 0, 0);
  ai.onGround = true;
  ai.verticalVelocity = 0;
  ai.boost = 100;

  ball.position.set(0, arena.ballRadius, 0);
  ball.userData.velocity.set(0, 0, 0);
}

function jump(car) {
  if (car.onGround) {
    car.verticalVelocity = 7.8;
    car.onGround = false;
    car.jumpCount = 1;
  } else if (car.jumpCount < 2) {
    car.verticalVelocity = 6.7;
    car.jumpCount = 2;
  }
}

function flip(car) {
  if (car.flipCooldown > 0) return;
  car.flipCooldown = 0.8;

  const forward = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
  car.velocity.addScaledVector(forward, 5.2);

  if (!car.onGround) {
    car.verticalVelocity += 3.5;
  }
  car.pitch += 0.9;
  car.roll += 0.7;
}

function applyBoostPads(car) {
  for (const pad of boostPads) {
    const dx = car.group.position.x - pad.x;
    const dz = car.group.position.z - pad.z;
    const dist = Math.hypot(dx, dz);

    if (dist < 1.0 && pad.enabled) {
      const fwd = new THREE.Vector3(Math.sin(car.heading), 0, Math.cos(car.heading));
      car.velocity.addScaledVector(fwd, 10.5);
      car.boost = Math.min(100, car.boost + 20);
      pad.enabled = false;
      pad.mesh.scale.setScalar(1.35);
      setTimeout(() => {
        pad.enabled = true;
        pad.mesh.scale.setScalar(1);
      }, 1200);
    }
  }
}

function updatePlayer(dt) {
  const throttle = keys["w"] || touchState.w;
  const reverse = keys["s"] || touchState.s;
  const left = keys["a"] || touchState.a;
  const right = keys["d"] || touchState.d;
  const boostHeld = keys[" "] || touchState.boost;
  const jumpPressed = touchState.jump;

  if (jumpPressed) {
    jump(player);
    touchState.jump = false;
  }

  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));

  const speed = player.velocity.length();
  const turnStrength = 1.8 + clamp(speed / 14, 0, 1) * 1.8;
  player.heading += steer * dt * turnStrength;

  let accel = 0;
  if (throttle) accel += 22;
  if (reverse) accel -= 16;

  if (accel !== 0) {
    player.velocity.addScaledVector(forward, accel * dt);
  }

  if (boostHeld && player.boost > 0) {
    player.velocity.addScaledVector(forward, 28 * dt);
    player.boost = Math.max(0, player.boost - 28 * dt);
    player.glow.intensity = 2.2;
  } else {
    player.boost = Math.min(100, player.boost + 15 * dt);
    player.glow.intensity = 0;
  }

  if (!player.onGround) {
    player.verticalVelocity -= 17 * dt;
    player.group.position.y += player.verticalVelocity * dt;

    const airSteer = steer * dt * 1.5;
    player.heading += airSteer;
  } else {
    player.group.position.y = 0;
    player.verticalVelocity = 0;
  }

  if (player.group.position.y <= 0) {
    player.group.position.y = 0;
    player.verticalVelocity = 0;
    player.onGround = true;
    player.jumpCount = 0;
  }

  player.flipCooldown = Math.max(0, player.flipCooldown - dt);

  player.velocity.multiplyScalar(1 - dt * 0.9);
  const maxSpeed = 18;
  if (player.velocity.length() > maxSpeed) {
    player.velocity.setLength(maxSpeed);
  }

  player.group.position.addScaledVector(player.velocity, dt);
  player.group.rotation.y = player.heading;
  player.group.rotation.x = player.pitch;
  player.group.rotation.z = player.roll;

  player.pitch *= 0.94;
  player.roll *= 0.94;

  const margin = 1.15;
  if (player.group.position.x < -arena.halfX + margin) {
    player.group.position.x = -arena.halfX + margin;
    player.velocity.x *= -0.45;
  }
  if (player.group.position.x > arena.halfX - margin) {
    player.group.position.x = arena.halfX - margin;
    player.velocity.x *= -0.45;
  }
  if (player.group.position.z < -arena.halfZ + margin) {
    player.group.position.z = -arena.halfZ + margin;
    player.velocity.z *= -0.45;
  }
  if (player.group.position.z > arena.halfZ - margin) {
    player.group.position.z = arena.halfZ - margin;
    player.velocity.z *= -0.45;
  }

  for (const wheel of player.wheels) {
    wheel.rotation.x += player.velocity.length() * 1.2 * dt;
  }

  applyBoostPads(player);
}

function updateAI(dt) {
  const toBall = new THREE.Vector3(
    ball.position.x - ai.group.position.x,
    0,
    ball.position.z - ai.group.position.z
  );
  const dist = toBall.length();

  const targetAngle = Math.atan2(toBall.x, toBall.z);
  const delta = targetAngle - ai.heading;
  const shortest = ((delta + Math.PI) % (Math.PI * 2)) - Math.PI;
  ai.heading += shortest * dt * 2.3;

  const forward = new THREE.Vector3(Math.sin(ai.heading), 0, Math.cos(ai.heading));

  let accel = dist > 1.8 ? 18 : -7;
  ai.velocity.addScaledVector(forward, accel * dt);

  if (dist < 3.2 && ai.boost > 0) {
    ai.velocity.addScaledVector(forward, 20 * dt);
    ai.boost = Math.max(0, ai.boost - 18 * dt);
  } else {
    ai.boost = Math.min(100, ai.boost + 15 * dt);
  }

  if (!ai.onGround) {
    ai.verticalVelocity -= 17 * dt;
    ai.group.position.y += ai.verticalVelocity * dt;
  } else {
    ai.group.position.y = 0;
    ai.verticalVelocity = 0;
  }

  if (ai.group.position.y <= 0) {
    ai.group.position.y = 0;
    ai.verticalVelocity = 0;
    ai.onGround = true;
  }

  ai.velocity.multiplyScalar(1 - dt * 0.7);
  if (ai.velocity.length() > 17) ai.velocity.setLength(17);

  ai.group.position.addScaledVector(ai.velocity, dt);
  ai.group.rotation.y = ai.heading;

  const margin = 1.15;
  if (ai.group.position.x < -arena.halfX + margin) {
    ai.group.position.x = -arena.halfX + margin;
    ai.velocity.x *= -0.45;
  }
  if (ai.group.position.x > arena.halfX - margin) {
    ai.group.position.x = arena.halfX - margin;
    ai.velocity.x *= -0.45;
  }
  if (ai.group.position.z < -arena.halfZ + margin) {
    ai.group.position.z = -arena.halfZ + margin;
    ai.velocity.z *= -0.45;
  }
  if (ai.group.position.z > arena.halfZ - margin) {
    ai.group.position.z = arena.halfZ - margin;
    ai.velocity.z *= -0.45;
  }

  for (const wheel of ai.wheels) {
    wheel.rotation.x += ai.velocity.length() * 1.2 * dt;
  }

  applyBoostPads(ai);
}

function updateBall(dt) {
  ball.userData.velocity.y -= 18 * dt;
  ball.position.addScaledVector(ball.userData.velocity, dt);

  if (ball.position.y <= arena.ballRadius) {
    ball.position.y = arena.ballRadius;
    if (ball.userData.velocity.y < 0) {
      ball.userData.velocity.y *= -0.72;
    }
  }

  const r = arena.ballRadius;
  if (ball.position.x < -arena.halfX + r) {
    ball.position.x = -arena.halfX + r;
    ball.userData.velocity.x *= -0.9;
  }
  if (ball.position.x > arena.halfX - r) {
    ball.position.x = arena.halfX - r;
    ball.userData.velocity.x *= -0.9;
  }
  if (ball.position.z < -arena.halfZ + r) {
    ball.position.z = -arena.halfZ + r;
    ball.userData.velocity.z *= -0.9;
  }
  if (ball.position.z > arena.halfZ - r) {
    ball.position.z = arena.halfZ - r;
    ball.userData.velocity.z *= -0.9;
  }

  ball.userData.velocity.x *= 0.995;
  ball.userData.velocity.z *= 0.995;
  if (ball.userData.velocity.length() > 24) ball.userData.velocity.setLength(24);

  const inGoalZ = Math.abs(ball.position.z) < arena.goalWidth / 2;

  if (ball.position.x < -arena.halfX - 0.08 && inGoalZ) {
    state.scoreRight += 1;
    resetRound();
  }
  if (ball.position.x > arena.halfX + 0.08 && inGoalZ) {
    state.scoreLeft += 1;
    resetRound();
  }
}

function carBallCollision(car) {
  const dx = ball.position.x - car.group.position.x;
  const dy = ball.position.y - (car.group.position.y + 0.7);
  const dz = ball.position.z - car.group.position.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const minDist = car.radius + arena.ballRadius + 0.08;

  if (distSq < minDist * minDist) {
    const dist = Math.sqrt(distSq) || 0.0001;
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;
    const overlap = minDist - dist;

    ball.position.x += nx * overlap;
    ball.position.y += ny * overlap;
    ball.position.z += nz * overlap;

    const relVelX = ball.userData.velocity.x - car.velocity.x;
    const relVelY = ball.userData.velocity.y - car.verticalVelocity;
    const relVelZ = ball.userData.velocity.z - car.velocity.z;
    const normalVel = relVelX * nx + relVelY * ny + relVelZ * nz;

    if (normalVel < 0) {
      const impulse = -(1.4 + 0.12) * normalVel;
      ball.userData.velocity.x += impulse * nx;
      ball.userData.velocity.y += impulse * ny * 0.9;
      ball.userData.velocity.z += impulse * nz;
    }

    ball.userData.velocity.x += car.velocity.x * 0.32;
    ball.userData.velocity.z += car.velocity.z * 0.32;
    ball.userData.velocity.y += car.verticalVelocity * 0.15 + 0.6;

    car.velocity.x -= nx * 0.8;
    car.velocity.z -= nz * 0.8;
  }
}

function updateCamera() {
  const focus = player.group.position.clone();
  const forward = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
  const desired = focus.clone().add(forward.clone().multiplyScalar(-9)).add(new THREE.Vector3(0, 5.2, 0));
  camera.position.lerp(desired, 0.08);

  const lookTarget = new THREE.Vector3(
    ball.position.x * 0.5 + player.group.position.x * 0.5,
    1.5,
    ball.position.z * 0.5 + player.group.position.z * 0.5
  );
  camera.lookAt(lookTarget);
}

function startCountdown() {
  state.started = true;
  state.countdown = 3;
  countdownEl.textContent = "3";
  countdownEl.classList.add("show");

  const interval = setInterval(() => {
    state.countdown -= 1;
    if (state.countdown > 0) {
      countdownEl.textContent = String(state.countdown);
    } else {
      countdownEl.textContent = "GO";
    }

    if (state.countdown < 0) {
      clearInterval(interval);
      countdownEl.classList.remove("show");
      state.matchTime = 90;
      updateHud();
      resetRound();
    }
  }, 500);
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(0.033, 1 / 60);

  if (state.started) {
    state.matchTime -= dt;
    if (state.matchTime <= 0) {
      state.matchTime = 90;
      state.scoreLeft = 0;
      state.scoreRight = 0;
    }

    updateHud();
    updatePlayer(dt);
    updateAI(dt);
    carBallCollision(player);
    carBallCollision(ai);
    updateBall(dt);
  }

  updateCamera();
  renderer.render(scene, camera);
}

buildArena();
resetRound();
updateHud();
animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
