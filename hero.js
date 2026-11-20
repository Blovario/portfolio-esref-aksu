import * as THREE from "three";
import { FOV, W, H, RADIUS_CORNER, RIG_TILT, FLOOR, floorPoints, ringRadius, layoutHero, pickSrc } from "./hero-geometry.js";
import { DOT, createDot } from "./dot.js";

/*
 * Hero 3D : les écrans des projets montés en anneau.
 * Glisser pour tourner, cliquer sur l'écran de face pour aller au projet.
 */

const canvas = document.querySelector("#hero-scene");
const hero = document.querySelector(".hero");
const label = document.querySelector("#hero-current");
const inner = document.querySelector(".hero-inner");

// Rendu net sur les écrans haute densité (iPhone : 3), plafonné à 2 pour rester fluide
const PIXEL_RATIO = Math.min(window.devicePixelRatio || 1, 2);

const projects = [...document.querySelectorAll("[data-project]")].map((el) => ({
  id: el.id,
  n: el.querySelector(".project-kicker")?.textContent.trim().slice(0, 2),
  name: el.dataset.project,
  kind: el.dataset.kind,
  image: pickSrc(el.querySelector(".project-media img")),
}));

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

if (canvas && hero && projects.length && webglAvailable()) init();

function roundedPanel(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);

  const geo = new THREE.ShapeGeometry(s, 12);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) + w / 2) / w, (pos.getY(i) + h / 2) / h);
  }
  return { geo, outline: s.getPoints(12) };
}

function init() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const INK = 0x171a18;
  const INTRO = 1.3; // secondes
  const clamp01 = (x) => Math.min(Math.max(x, 0), 1);
  const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
  const easeBack = (x) => {
    x = clamp01(x);
    const c = 1.5;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  };
  const GREEN = 0x7ab540;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(PIXEL_RATIO);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(INK);
  scene.fog = new THREE.Fog(INK, 9, 17);

  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 60);

  const rig = new THREE.Group(); // position + inclinaison selon la souris
  const ring = new THREE.Group(); // rotation de l'anneau
  rig.add(ring);
  scene.add(rig);

  const N = projects.length;
  const R = ringRadius(N);
  const STEP = (Math.PI * 2) / N;

  const { geo, outline } = roundedPanel(W, H, RADIUS_CORNER);
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const panels = [];
  let texturesLeft = projects.filter((p) => p.image).length;
  let ready = false; // toutes les captures sont dans la scène
  let readyAt = -1;
  let warming = false;
  let introT = 0;

  projects.forEach((p, i) => {
    const holder = new THREE.Group();
    const a = i * STEP;
    holder.position.set(Math.sin(a) * R, 0, Math.cos(a) * R);
    holder.rotation.y = a;

    const mat = new THREE.MeshBasicMaterial({ color: 0x2a2f2a, side: THREE.FrontSide });
    const front = new THREE.Mesh(geo, mat);
    front.userData.index = i;

    const back = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ color: 0x232823, side: THREE.BackSide })
    );

    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(outline),
      new THREE.LineBasicMaterial({ color: GREEN, transparent: true, opacity: 0 })
    );
    edge.position.z = 0.002;

    holder.add(front, back, edge);
    ring.add(holder);

    panels.push({ holder, front, edge, mat, loaded: !p.image });

    if (p.image) {
      loader.load(p.image, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        // recadrage "cover", aligné en haut comme une capture d'écran
        const imgAspect = tex.image.width / tex.image.height;
        const panelAspect = W / H;
        if (imgAspect > panelAspect) {
          tex.repeat.set(panelAspect / imgAspect, 1);
          tex.offset.set((1 - tex.repeat.x) / 2, 0);
        } else {
          tex.repeat.set(1, imgAspect / panelAspect);
          tex.offset.set(0, 1 - tex.repeat.y);
        }
        renderer.initTexture(tex); // envoi à la carte graphique tout de suite, pas en pleine animation
        mat.map = tex;
        mat.color.set(0x2a2f2a); // la capture apparaît en fondu depuis le gris de l'écran vide
        mat.needsUpdate = true;
        panels[i].loaded = true;
        texturesLeft -= 1;
      }, undefined, () => {
        panels[i].loaded = true;
        texturesLeft -= 1;
      });
    }
  });

  // Sol : des points en cercles autour de l'anneau. Ils s'allument en vague à l'arrivée,
  // puis, de temps en temps, l'un d'eux s'éclaire brièvement en vert.
  // Au défilement, ils sont aspirés en spirale vers un seul point, devant l'écran de face :
  // ce point quitte ensuite la scène et accompagne la lecture (dot.js).
  const GATHER = new THREE.Vector3(0, 0, R + 1); // point de rassemblement, dans le repère du sol
  const fp = floorPoints();
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute("position", new THREE.Float32BufferAttribute(fp.flatMap(([x, z]) => [x, 0, z]), 3));
  floorGeo.setAttribute("aRand", new THREE.Float32BufferAttribute(fp.map((p) => p[2]), 1));
  const floorMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uColor: { value: new THREE.Color(FLOOR.color) },
      uGreen: { value: new THREE.Color(0x7ab540) },
      uFog: { value: new THREE.Color(0x171a18) },
      uFogNear: { value: 0 },
      uFogFar: { value: 1 },
      uSize: { value: FLOOR.size },
      uScale: { value: 1 },
      uReveal: { value: 0 }, // rayon (en unités) déjà allumé autour de l'anneau
      uFadeFrom: { value: FLOOR.fadeFrom },
      uFadeTo: { value: FLOOR.fadeTo },
      uTime: { value: 0 },
      uBlink: { value: 0 }, // 0 pendant l'arrivée, 1 ensuite
      uGather: { value: 0 }, // 0 : sol en place, 1 : tous les points rassemblés
      uTarget: { value: GATHER },
    },
    vertexShader: `
      attribute float aRand;
      uniform float uSize, uScale, uReveal, uFogNear, uFogFar, uFadeFrom, uFadeTo, uTime, uBlink, uGather;
      uniform vec3 uTarget;
      varying float vAlpha, vLit, vFog, vSpark, vPull;
      void main() {
        float r = length(position.xz);
        // aspiration : les points proches partent d'abord, les plus lointains ensuite,
        // chacun en spirale vers le point de rassemblement, en se soulevant un peu
        float delay = 0.5 * clamp(r / uFadeTo, 0.0, 1.0) + 0.12 * aRand;
        float q = clamp((uGather - delay) / 0.38, 0.0, 1.0);
        float e = q * q * (3.0 - 2.0 * q);
        // petite spirale : les points lointains (grands à l'écran) tournent moins
        float sw = e * (1.1 + 0.9 * aRand) * clamp(2.5 / max(r, 0.1), 0.25, 1.0);
        float cs = cos(sw), sn = sin(sw);
        vec3 p = vec3(position.x * cs - position.z * sn, 0.0, position.x * sn + position.z * cs);
        p = mix(p, uTarget, e);
        p.y += sin(3.14159 * e) * (0.1 + 0.3 * aRand);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vPull = e;
        vLit = max(clamp((uReveal - r - aRand * 1.6) / 0.8, 0.0, 1.0), e);
        vAlpha = vLit * (1.0 - smoothstep(uFadeFrom, uFadeTo, r)) * (1.0 - smoothstep(0.82, 1.0, e));
        vFog = smoothstep(uFogNear, uFogFar, -mv.z) * (1.0 - e);
        // une étincelle rare : chaque point s'éclaire une fois toutes les 2 min environ,
        // pendant une demi-seconde (2 ou 3 points à la fois sur l'ensemble du sol)
        float ph = fract(uTime / 120.0 + aRand * 17.0);
        vSpark = uBlink * (1.0 - e) * smoothstep(0.0, 0.0008, ph) * (1.0 - smoothstep(0.0008, 0.004, ph));
        gl_PointSize = uSize * uScale / -mv.z * (1.0 + vSpark * 0.8) * (1.0 - 0.45 * e);
      }`,
    fragmentShader: `
      uniform vec3 uColor, uGreen, uFog;
      varying float vAlpha, vLit, vFog, vSpark, vPull;
      void main() {
        // points ronds
        vec2 d = gl_PointCoord - 0.5;
        float m = 1.0 - smoothstep(0.38, 0.5, length(d));
        if (vAlpha * m <= 0.0) discard;
        // éclat vert à l'allumage, puis étincelles occasionnelles
        float g = max(max(1.0 - smoothstep(0.0, 1.0, vLit), vSpark), vPull);
        vec3 c = mix(uColor, uGreen, g);
        gl_FragColor = vec4(mix(c, uFog, vFog), vAlpha * m * max(1.0, vSpark * 1.6));
        #include <colorspace_fragment>
      }`,
  });
  const floor = new THREE.Points(floorGeo, floorMat);
  floor.position.y = FLOOR.y;
  rig.add(floor);

  // Le point qui grossit à mesure que les autres le rejoignent : taille fixe à l'écran,
  // la même que celui de la page, qui le remplace à la fin du rassemblement
  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const coreMat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(GREEN) }, uPx: { value: 0 } },
    vertexShader: `
      uniform float uPx;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = uPx;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uPx;
      void main() {
        float l = length(gl_PointCoord - 0.5) * uPx;
        float m = 1.0 - smoothstep(uPx * 0.5 - 1.0, uPx * 0.5, l);
        if (m <= 0.0) discard;
        gl_FragColor = vec4(uColor, m);
        #include <colorspace_fragment>
      }`,
  });
  const core = new THREE.Points(coreGeo, coreMat);
  core.position.copy(GATHER);
  core.renderOrder = 2;
  core.frustumCulled = false;
  core.visible = false;
  floor.add(core);

  // --- État ---
  let angle = 0; // rotation courante de l'anneau
  let target = 0;
  let velocity = 0;
  let dragging = false;
  let dragMoved = 0;
  let lastX = 0;
  let lastMove = performance.now();
  let lastInteraction = performance.now();
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let active = -1;
  let running = false;
  let layout = { x: 0, y: 0 };
  let revealTo = FLOOR.fadeTo + 3; // rayon atteint par la vague d'allumage

  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();

  // Hauteur d'écran stable : sur iPhone, innerHeight change quand la barre de Safari se replie
  // pendant le défilement, ce qui faisait sauter les trajets pilotés par le scroll. On ne la relit
  // qu'en cas de vrai redimensionnement (rotation, fenêtre).
  let vw = window.innerWidth;
  let vh = window.innerHeight;
  window.addEventListener("resize", () => {
    if (window.innerWidth === vw && Math.abs(window.innerHeight - vh) < 160) return;
    vw = window.innerWidth;
    vh = window.innerHeight;
  });

  // Rassemblement des points du sol : sur le premier tiers d'écran de défilement
  // (plus vite sur téléphone, où l'anneau passe tôt sous le menu)
  const GATHER_FROM = 0.04;
  let gatherSpan = 0.32;
  const gatherAt = () => (reduceMotion ? 0 : clamp01((window.scrollY - vh * GATHER_FROM) / (vh * gatherSpan)));
  const dot = reduceMotion ? null : createDot({ getVh: () => vh });
  const gatherWorld = new THREE.Vector3();

  // Position du point de rassemblement dans la PAGE, transmise au point qui prend le relais
  function sendSource() {
    if (!dot) return;
    const rect = canvas.getBoundingClientRect();
    floor.updateWorldMatrix(true, false);
    gatherWorld.copy(GATHER).applyMatrix4(floor.matrixWorld).project(camera);
    dot.setHandoff(vh * (GATHER_FROM + gatherSpan));
    dot.setSource(
      rect.left + window.scrollX + ((gatherWorld.x + 1) / 2) * rect.width,
      rect.top + window.scrollY + ((1 - gatherWorld.y) / 2) * rect.height
    );
  }

  function frontIndex() {
    const k = Math.round(-angle / STEP);
    return ((k % N) + N) % N;
  }

  function setActive(i) {
    if (i === active) return;
    active = i;
    const p = projects[i];
    if (label) {
      label.querySelector("[data-n]").textContent = p.n || String(i + 1).padStart(2, "0");
      label.querySelector("[data-name]").textContent = p.name;
      label.querySelector("[data-kind]").textContent = p.kind;
      label.setAttribute("href", `#${p.id}`);
      label.classList.remove("is-swapping");
      void label.offsetWidth;
      label.classList.add("is-swapping");
    }
  }

  function resize() {
    const view = layoutHero(hero, inner, N);
    renderer.setSize(hero.clientWidth, hero.clientHeight, false);
    camera.aspect = view.aspect;
    camera.position.set(...view.cam);
    camera.lookAt(...view.target);
    camera.updateProjectionMatrix();
    layout = view.layout;
    // empilé (téléphone), la caméra est proche : le point se forme juste sous l'écran, au-dessus du texte
    if (view.stacked) GATHER.set(0, 0.32, R + 0.15);
    else GATHER.set(0, 0, R + 1);
    gatherSpan = view.stacked ? 0.2 : 0.32;
    core.position.copy(GATHER);
    floorMat.uniforms.uFogNear.value = view.fog.near;
    floorMat.uniforms.uFogFar.value = view.fog.far;
    floorMat.uniforms.uFadeFrom.value = view.floor.fadeFrom;
    floorMat.uniforms.uFadeTo.value = view.floor.fadeTo;
    revealTo = view.floor.fadeTo + 3;
    floorMat.uniforms.uScale.value = hero.clientHeight * 0.5 * renderer.getPixelRatio();
    // l'écran de face reste net, l'arrière de l'anneau se fond dans le fond
    scene.fog.near = view.fog.near;
    scene.fog.far = view.fog.far;
  }

  function pickPanel(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(panels.map((p) => p.front))[0];
    return hit ? hit.object.userData.index : -1;
  }

  // --- Interactions ---
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    dragMoved = 0;
    lastX = e.clientX;
    lastMove = performance.now();
    velocity = 0;
    canvas.setPointerCapture(e.pointerId);
    hero.classList.add("is-dragging");
  });

  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    pointer.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.ty = ((e.clientY - r.top) / r.height) * 2 - 1;

    if (dragging) {
      const dx = e.clientX - lastX;
      const now = performance.now();
      const delta = (dx / r.width) * 4.2;
      angle += delta;
      target = angle;
      velocity = delta / Math.max(now - lastMove, 8);
      dragMoved += Math.abs(dx);
      lastX = e.clientX;
      lastMove = now;
      lastInteraction = now;
    } else {
      canvas.style.cursor = pickPanel(e) >= 0 ? "pointer" : "grab";
    }
  });

  function release(e) {
    if (!dragging) return;
    dragging = false;
    hero.classList.remove("is-dragging");
    lastInteraction = performance.now();

    if (dragMoved < 6) {
      const i = pickPanel(e);
      if (i >= 0) {
        if (i === frontIndex()) {
          document.getElementById(projects[i].id)?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
        } else {
          // tourner par le chemin le plus court vers l'écran cliqué
          let d = (-i * STEP - angle) % (Math.PI * 2);
          if (d > Math.PI) d -= Math.PI * 2;
          if (d < -Math.PI) d += Math.PI * 2;
          target = angle + d;
        }
      }
      return;
    }
    // inertie puis aimantation sur l'écran le plus proche
    const throwBy = THREE.MathUtils.clamp(velocity * 260, -STEP * 2.5, STEP * 2.5);
    target = Math.round((angle + throwBy) / STEP) * STEP;
  }

  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", () => {
    pointer.tx = 0;
    pointer.ty = 0;
  });

  // Clavier : flèches quand le hero a le focus
  hero.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    if (e.target.closest("input, textarea")) return;
    target = Math.round(target / STEP) * STEP + (e.key === "ArrowLeft" ? STEP : -STEP);
    lastInteraction = performance.now();
  });

  // --- Passage de relais : l'écran 01 quitte l'anneau et se pose sur sa capture ---
  const flight = createFlight();

  // --- Boucle ---
  const clock = new THREE.Clock();
  const WHITE = new THREE.Color(0xffffff);
  const startedAt = performance.now();
  const LOAD_WAIT = 400; // ms d'attente max des captures du fond, une fois celles de devant chargées
  // les écrans visibles de face pendant l'arrivée (l'anneau fait un quart de tour en jaillissant)
  const frontLoaded = () => [0, 1, 2, N - 1].every((i) => !panels[i % N] || panels[i % N].loaded);

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const now = performance.now();
    // progression de l'arrivée, image par image (un ralentissement ne lui fait pas sauter d'étape)
    if (ready) introT += dt;
    const k = ready ? (reduceMotion ? 1 : introT / INTRO) : 0;

    // On ne touche jamais à la position choisie : pendant qu'on lit la page,
    // la rotation automatique est simplement en pause.
    if (window.scrollY > 4 && !dragging) lastInteraction = now;

    // défilement automatique, un écran toutes les 4 s, après 5 s sans interaction
    if (k >= 1 && !reduceMotion && !dragging && now - lastInteraction > 5000) {
      target -= STEP;
      lastInteraction = now - 1000;
    }

    if (!dragging) angle += (target - angle) * (1 - Math.exp(-dt * 4.5));

    // Arrivée : l'anneau jaillit du point vert en faisant un quart de tour, puis le sol s'allume
    ring.scale.setScalar(Math.max(easeBack(k), 0.001));
    ring.visible = ready || warming;
    ring.rotation.y = angle - STEP * 1.5 * (1 - easeOut(k));
    // les points s'allument en vague depuis le centre de l'anneau, puis scintillent de temps en temps
    floorMat.uniforms.uReveal.value = reduceMotion ? 99 : easeOut((k - 0.15) / 1.6) * revealTo;
    floorMat.uniforms.uTime.value = t;
    floorMat.uniforms.uBlink.value = reduceMotion ? 0 : clamp01(k - 1.6);
    // au défilement, les points se rassemblent ; le point de la page prend le relais à la fin
    const gather = gatherAt();
    floorMat.uniforms.uGather.value = gather;
    core.visible = gather > 0.3 && gather < 1;
    coreMat.uniforms.uPx.value = DOT * renderer.getPixelRatio() * Math.min(Math.max((gather - 0.3) / 0.7, 0), 1);

    // la souris ne fait bouger l'anneau qu'une fois son arrivée terminée
    const live = k >= 1 ? 1 - Math.exp(-dt * 3) : 0;
    pointer.x += (pointer.tx - pointer.x) * live;
    pointer.y += (pointer.ty - pointer.y) * live;

    const float = reduceMotion || !ready ? 0 : Math.sin((t - readyAt) * 0.6) * 0.06 * Math.min(k, 1);
    rig.position.set(layout.x, layout.y + float, 0);
    rig.rotation.x = RIG_TILT.x + pointer.y * 0.08;
    rig.rotation.z = RIG_TILT.z + pointer.x * -0.03;
    rig.rotation.y = pointer.x * 0.12;

    const fi = frontIndex();
    setActive(fi);
    panels.forEach((p, i) => {
      if (p.mat.map) p.mat.color.lerp(WHITE, ready ? 1 - Math.exp(-dt * 5) : 1);
      const o = i === fi ? 0.9 : 0;
      p.edge.material.opacity += (o - p.edge.material.opacity) * (1 - Math.exp(-dt * 6));
    });

    renderer.render(scene, camera);
    sendSource();
    flight?.update();
    // toutes les captures sont chargées : une image de préchauffe (envoi des textures
    // à la carte graphique, invisible car minuscule), puis l'anneau jaillit
    if (!ready && warming) {
      ready = true;
      readyAt = t;
      lastInteraction = now;
      document.documentElement.classList.add("has-ring");
    } else if (!ready && (texturesLeft <= 0 || (now - startedAt > LOAD_WAIT && frontLoaded()))) {
      // on n'attend pas les captures du fond de l'anneau (dans le brouillard) : elles arriveront en fondu
      warming = true;
    }
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    clock.getDelta();
    requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
  }

  function createFlight() {
    if (reduceMotion) return null;
    const article = document.getElementById(projects[0].id);
    const img = article?.querySelector(".project-media img");
    if (!img) return null;
    const slot = img.parentElement;

    // Une carte HTML posée DANS la page, à l'emplacement de la capture, déformée en CSS 3D
    // entre l'écran 01 de l'anneau et sa place finale.
    const card = document.createElement("div");
    card.className = "flight-card";
    card.setAttribute("aria-hidden", "true");
    const pic = document.createElement("img");
    pic.alt = "";
    pic.decoding = "async";
    pic.src = pickSrc(img);
    card.appendChild(pic);
    document.body.appendChild(card);

    const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const local = [
      [-W / 2, H / 2],
      [W / 2, H / 2],
      [W / 2, -H / 2],
      [-W / 2, -H / 2],
    ];
    const src = local.map(() => [0, 0]);
    const panel0 = panels[0];
    const R_X = (RADIUS_CORNER / W) * 100;
    const R_Y = (RADIUS_CORNER / H) * 100;

    // Coins de l'écran 01 dans l'anneau, en coordonnées de la PAGE (pas de la fenêtre)
    function sourceCorners() {
      const rect = canvas.getBoundingClientRect();
      panel0.holder.updateWorldMatrix(true, false);
      local.forEach(([x, y], i) => {
        corners[i].set(x, y, 0).applyMatrix4(panel0.holder.matrixWorld).project(camera);
        src[i][0] = rect.left + window.scrollX + ((corners[i].x + 1) / 2) * rect.width;
        src[i][1] = rect.top + window.scrollY + ((1 - corners[i].y) / 2) * rect.height;
      });
      // vu de dos (au fond de l'anneau), l'écran apparaîtrait en miroir : on remet l'image à l'endroit
      const area =
        (src[1][0] - src[0][0]) * (src[3][1] - src[0][1]) - (src[1][1] - src[0][1]) * (src[3][0] - src[0][0]);
      if (area < 0) {
        [src[0], src[1]] = [src[1], src[0]];
        [src[2], src[3]] = [src[3], src[2]];
      }
    }

    // Transformation projective : rectangle de la carte → quadrilatère
    function matrix3d(p, ew, eh) {
      const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p;
      const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
      const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
      const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
      const g = (sx * dy2 - dx2 * sy) / den;
      const h = (dx1 * sy - sx * dy1) / den;
      const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3;
      const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
      const m = [a / ew, d / ew, 0, g / ew, b / eh, e / eh, 0, h / eh, 0, 0, 1, 0, x0, y0, 0, 1];
      return `matrix3d(${m.map((v) => +v.toFixed(8)).join(",")})`;
    }

    const smooth = (t) => t * t * (3 - 2 * t);

    // Géométrie du trajet (en coordonnées de la page)
    function measure() {
      const box = slot.getBoundingClientRect();
      const top = box.top + window.scrollY;
      const left = box.left + window.scrollX;
      // fin du trajet : la capture est centrée dans l'écran (ou au plus haut possible)
      const endScroll = Math.max(top - Math.max((vh - box.height) / 2, 80), vh * 0.35);
      const startScroll = vh * 0.04;
      return { top, left, w: box.width, h: box.height, startScroll, endScroll };
    }

    // État de la carte à l'avancement t (0 : dans l'anneau, 1 : sur la capture)
    function stateAt(t, g) {
      const { top, left, w, h } = g;
      const dst = [
        [left, top],
        [left + w, top],
        [left + w, top + h],
        [left, top + h],
      ];
      const e = smooth(t);
      // petit arc : l'écran se soulève vers nous à mi-chemin
      const lift = Math.sin(Math.PI * e) * 0.06;
      const mx = (src.reduce((a, p) => a + p[0], 0) / 4) * (1 - e) + (left + w / 2) * e;
      const my = (src.reduce((a, p) => a + p[1], 0) / 4) * (1 - e) + (top + h / 2) * e;
      const pts = src.map(([sx, sy], i) => {
        const x = sx + (dst[i][0] - sx) * e;
        const y = sy + (dst[i][1] - sy) * e;
        return [mx + (x - mx) * (1 + lift) - left, my + (y - my) * (1 + lift) - top];
      });
      // recadrage : image entière dans l'anneau, puis même cadrage que la capture (cover, calée en haut)
      const ia = (img.naturalWidth || 1600) / (img.naturalHeight || 1000);
      const ba = w / h;
      const k = ba > ia ? 1 + (ba / ia - 1) * e : 1 + (ia / ba - 1) * e;
      return {
        transform: matrix3d(pts, w, h),
        opacity: +smooth(Math.min(t / 0.16, 1)).toFixed(3), // il sort de sa place en fondu
        borderRadius: `${(R_X * (1 - e)).toFixed(3)}% / ${(R_Y * (1 - e)).toFixed(3)}%`,
        pic: ba > ia ? `scaleY(${k.toFixed(5)})` : `scaleX(${k.toFixed(5)})`,
        picOrigin: ba > ia ? "50% 0" : "50% 50%",
      };
    }

    function place(g) {
      card.style.top = `${g.top}px`;
      card.style.left = `${g.left}px`;
      card.style.width = `${g.w}px`;
      card.style.height = `${g.h}px`;
    }

    const progress = (g) => Math.min(Math.max((window.scrollY - g.startScroll) / (g.endScroll - g.startScroll), 0), 1);

    // --- Mode 1 : animation pilotée par le défilement (Chrome, Safari 26+) ---
    // Le navigateur calcule lui-même la position de la carte à chaque image de défilement,
    // sur le fil du compositeur : elle reste parfaitement en phase avec la page, même sur iPhone.
    // Le script ne fait que recalculer les images-clés quand l'anneau bouge.
    let driven = null;
    if (typeof window.ScrollTimeline === "function") {
      try {
        const timeline = new ScrollTimeline({ source: document.documentElement, axis: "block" });
        const opts = { timeline, fill: "both" };
        driven = {
          timeline,
          card: card.animate([{ opacity: 0 }, { opacity: 0 }], opts),
          radius: card.animate([{ borderRadius: "0" }, { borderRadius: "0" }], opts),
          pic: pic.animate([{ transform: "none" }, { transform: "none" }], opts),
          key: "",
        };
      } catch {
        driven = null;
      }
    }
    card.style.display = driven ? "block" : "none";

    // Défilement maximal tel que le voit la timeline (sur iPhone, il dépend de la barre de Safari)
    function maxScroll() {
      const p = driven.timeline.currentTime;
      const pct = p && typeof p === "object" ? p.value : null;
      if (pct > 1 && window.scrollY > 20) return (window.scrollY * 100) / pct;
      return document.documentElement.scrollHeight - window.innerHeight;
    }

    const STEPS = 40;
    function rebuild(g) {
      const max = maxScroll();
      if (!(max > g.endScroll)) return;
      const key = [
        ...src.flat().map((v) => Math.round(v * 2)),
        Math.round(g.top), Math.round(g.left), Math.round(g.w), Math.round(g.h),
        Math.round(g.startScroll), Math.round(g.endScroll), Math.round(max / 8), img.naturalWidth,
      ].join(",");
      if (key === driven.key) return;
      driven.key = key;
      place(g);

      // sans image-clé tout en haut de la page, le navigateur interpolerait depuis l'état « au repos »
      // de la carte (opaque, posée sur la capture) : elle surgissait d'en bas avant de remonter
      const s0 = stateAt(0, g);
      const kCard = [{ offset: 0, transform: s0.transform, opacity: 0 }];
      const kRadius = [{ offset: 0, borderRadius: s0.borderRadius }];
      const kPic = [{ offset: 0, transform: s0.pic }];
      const off = (s) => Math.min(Math.max(s / max, 0), 1);
      let origin = "50% 50%";
      for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const s = stateAt(t, g);
        const offset = off(g.startScroll + (g.endScroll - g.startScroll) * t);
        kCard.push({ offset, transform: s.transform, opacity: s.opacity });
        kRadius.push({ offset, borderRadius: s.borderRadius });
        kPic.push({ offset, transform: s.pic });
        origin = s.picOrigin;
      }
      // une fois posée, la carte s'efface : la vraie capture, identique, prend le relais
      const last = kCard[kCard.length - 1];
      kCard.push({ offset: Math.min(last.offset + 0.5 / max, 1), transform: last.transform, opacity: 0 });
      kCard.push({ offset: 1, transform: last.transform, opacity: 0 });
      pic.style.transformOrigin = origin;
      driven.card.effect.setKeyframes(kCard);
      driven.radius.effect.setKeyframes(kRadius);
      driven.pic.effect.setKeyframes(kPic);
    }

    // --- Mode 2 (navigateurs plus anciens) : le script suit le défilement image par image ---
    let shown = null;
    function setShown(on) {
      if (shown === on) return;
      shown = on;
      card.style.display = on ? "block" : "none";
    }
    function apply(t, g) {
      setShown(t > 0 && t < 1);
      if (!(t > 0 && t < 1)) return;
      place(g);
      const s = stateAt(t, g);
      card.style.transform = s.transform;
      card.style.opacity = String(s.opacity);
      card.style.borderRadius = s.borderRadius;
      pic.style.transformOrigin = s.picOrigin;
      pic.style.transform = s.pic;
    }

    function update() {
      const g = measure();
      const t = progress(g);
      // l'écran de l'anneau s'efface pendant que sa copie apparaît
      panel0.holder.visible = t < 0.14;
      img.style.visibility = t > 0 && t < 1 ? "hidden" : "";
      // l'écran 01 n'est plus dessiné : sa position ne change plus, inutile de la recalculer
      if (t < 0.14 || !driven) sourceCorners();
      if (driven) rebuild(g);
      else apply(t, g);
    }

    // hors du hero, la boucle 3D est en pause : on suit le scroll directement
    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (!running) update();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    pic.addEventListener("load", onScroll);
    img.addEventListener("load", onScroll);
    return { update };
  }

  resize();
  window.addEventListener("resize", resize);
  document.fonts?.ready.then(resize);

  let inView = true;
  const sync = () => (inView && !document.hidden ? start() : stop());
  new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    sync();
  }).observe(hero);
  document.addEventListener("visibilitychange", sync);

  document.documentElement.classList.add("has-scene");
  start();
}
