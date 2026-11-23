import * as THREE from "three";
import { FOV, W, H, RADIUS_CORNER, RIG_TILT, FLOOR, floorPoints, ringRadius, layoutHero, pickSrc } from "./hero-geometry.js";
import { dotSize, createDot } from "./dot.js";

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
        // Aspiration en tourbillon vers le point de rassemblement.
        // Les points proches partent d'abord ; chacun recule à peine, puis est aspiré
        // de plus en plus vite en tournant, se soulève un peu en chemin et disparaît dans le noyau.
        vec2 d0 = position.xz - uTarget.xz;
        float rho = length(d0);
        float th = atan(d0.y, d0.x);
        float delay = 0.45 * clamp(rho / (uFadeTo + 2.0), 0.0, 1.0) + 0.15 * aRand;
        float q = clamp((uGather - delay) / 0.4, 0.0, 1.0);
        float k = 1.0 - q * q + 0.14 * sin(3.14159 * q) * (1.0 - q); // rayon restant (avec un petit recul)
        // les points lointains (grands à l'écran) tournent moins pour ne pas balayer tout l'écran
        float spin = min(2.6, 3.0 / max(rho, 0.1)) * (0.75 + 0.5 * aRand);
        float a = th + spin * q * q;
        float lift = pow(sin(3.14159 * q), 2.0) * 0.28 * (0.5 + aRand) * min(rho / 3.0, 1.0);
        vec3 p = vec3(uTarget.x + cos(a) * rho * k, mix(0.0, uTarget.y, q * q) + lift, uTarget.z + sin(a) * rho * k);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        vPull = smoothstep(0.0, 0.25, q);
        vLit = max(clamp((uReveal - r - aRand * 1.6) / 0.8, 0.0, 1.0), step(0.001, q));
        vAlpha = vLit * (1.0 - smoothstep(uFadeFrom, uFadeTo, r)) * (1.0 - smoothstep(0.88, 1.0, q));
        vFog = smoothstep(uFogNear, uFogFar, -mv.z) * (1.0 - vPull);
        // une étincelle rare : chaque point s'éclaire une fois toutes les 2 min environ,
        // pendant une demi-seconde (2 ou 3 points à la fois sur l'ensemble du sol)
        float ph = fract(uTime / 120.0 + aRand * 17.0);
        vSpark = uBlink * (1.0 - vPull) * smoothstep(0.0, 0.0008, ph) * (1.0 - smoothstep(0.0008, 0.004, ph));
        gl_PointSize = uSize * uScale / -mv.z * (1.0 + vSpark * 0.8)
          * (1.0 + 0.6 * sin(3.14159 * q)) * (1.0 - 0.6 * smoothstep(0.7, 1.0, q));
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

  // Le noyau : il gonfle et rayonne à mesure que les points le rejoignent. Taille fixe à l'écran,
  // il finit à la taille du point de la page, qui le remplace à la fin du rassemblement.
  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const coreMat = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(GREEN) }, uDisc: { value: 0 }, uGlow: { value: 0 } },
    vertexShader: `
      uniform float uDisc;
      varying float vPx;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vPx = uDisc * 4.0 + 16.0; // de la place autour du disque pour le halo
        gl_PointSize = vPx;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uDisc, uGlow;
      varying float vPx;
      void main() {
        float l = length(gl_PointCoord - 0.5) * vPx; // distance au centre, en pixels
        float rad = uDisc * 0.5;
        float disc = 1.0 - smoothstep(rad - 1.0, rad, l);
        float halo = uGlow * 0.5 * exp(-max(l - rad, 0.0) / (rad * 0.8 + 2.0));
        float a = max(disc, halo);
        if (a <= 0.004) discard;
        gl_FragColor = vec4(uColor, a);
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

  // Empilé : cible à l'écran du point de rassemblement (coordonnées du canvas, en px) : dans le vide à droite
  // de la dernière ligne du titre, à l'écart de tout texte du hero. Renvoie null s'il n'y a pas de place.
  const CLEAR = 24; // écart minimal au texte
  const EDGE_R = 40; // écart minimal au bord droit
  function stackedTarget(w) {
    const box = hero.getBoundingClientRect();
    const rects = [];
    let last = null; // dernière ligne du h1
    for (const el of hero.querySelectorAll(".hero-tag, .hero h1, .hero-line, .hero-current, .hero-hint")) {
      // les blocs d'entrée sont décalés pendant leur animation : on mesure à leur place finale
      const tf = getComputedStyle(el).transform;
      const dy = tf && tf !== "none" ? new DOMMatrix(tf).f : 0;
      const rg = document.createRange();
      rg.selectNodeContents(el);
      for (const r of rg.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        const q = { l: r.left - box.left, r: r.right - box.left, t: r.top - box.top - dy, b: r.bottom - box.top - dy };
        rects.push(q);
        if (el.tagName === "H1" && (!last || q.b > last.b + 1)) last = q;
      }
    }
    if (!last) return null;
    const gap = (x, y) => Math.min(...rects.map((q) => Math.hypot(Math.max(q.l - x, 0, x - q.r), Math.max(q.t - y, 0, y - q.b))));
    const hi = w - EDGE_R;
    // plage horizontale dégagée à la hauteur y : [lo, hi] (la plus large), ou null
    const span = (y, from) => {
      let best = null;
      let cur = null;
      for (let x = from; x <= hi; x += 2) {
        if (gap(x, y) >= CLEAR) {
          cur = cur ? [cur[0], x] : [x, x];
          if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur;
        } else cur = null;
      }
      return best;
    };
    const yc = (last.t + last.b) / 2;
    // cas normal : milieu entre la fin de la ligne et le bord droit
    if (w - last.r >= 90) {
      const s0 = span(yc, last.r);
      if (s0) return { x: Math.min(Math.max((last.r + w) / 2, s0[0]), s0[1]), y: yc };
    }
    // sinon : un autre vide à droite, plus bas
    for (let y = yc; y < hero.clientHeight - 20; y += 4) {
      const s1 = span(y, w * 0.5);
      if (s1 && s1[1] - s1[0] >= 30) return { x: (s1[0] + s1[1]) / 2, y };
    }
    return null;
  }

  // Point du sol (repère local de `floor`) sous un point de l'écran, le rig étant dans sa pose de repos
  // (sans le mouvement du pointeur ni le flottement). Renvoie false si le rayon manque le sol.
  function gatherUnder(px, py, w, h) {
    const keepPos = rig.position.clone();
    const keepRot = rig.rotation.clone();
    rig.position.set(layout.x, layout.y, 0);
    rig.rotation.set(RIG_TILT.x, 0, RIG_TILT.z);
    rig.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    ray.setFromCamera(ndc.set((px / w) * 2 - 1, 1 - (py / h) * 2), camera);
    const inv = floor.matrixWorld.clone().invert();
    const o = ray.ray.origin.clone().applyMatrix4(inv);
    const d = ray.ray.direction.clone().transformDirection(inv);
    rig.position.copy(keepPos);
    rig.rotation.copy(keepRot);
    rig.updateMatrixWorld(true);
    if (d.y > -1e-4) return false;
    const t = -o.y / d.y;
    if (!(t > 0)) return false; // derrière la caméra
    GATHER.set(o.x + d.x * t, 0, o.z + d.z * t);
    return true;
  }

  function resize() {
    const view = layoutHero(hero, inner, N);
    renderer.setSize(hero.clientWidth, hero.clientHeight, false);
    camera.aspect = view.aspect;
    camera.position.set(...view.cam);
    camera.lookAt(...view.target);
    camera.updateProjectionMatrix();
    layout = view.layout;
    // empilé (téléphone, tablette portrait) : le point se forme en bas à droite du sol, dans le vide
    // à droite du titre ; repli : juste sous l'écran de face
    if (view.stacked) {
      GATHER.set(0, 0.32, R + 0.15);
      const w = hero.clientWidth;
      const tg = stackedTarget(w);
      if (tg) {
        const keep = GATHER.clone();
        if (!gatherUnder(tg.x, tg.y, w, hero.clientHeight)) GATHER.copy(keep);
      }
    } else GATHER.set(0, 0, R + 1);
    gatherSpan = view.stacked ? 0.3 : 0.32;
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
    const grow = clamp01((gather - 0.12) / 0.8);
    core.visible = grow > 0 && gather < 1;
    // il gonfle à mesure que les points arrivent, palpite un peu, et rayonne surtout au milieu
    const beat = 1 + Math.sin(t * 9) * 0.06 * Math.sin(Math.PI * grow);
    coreMat.uniforms.uDisc.value = dotSize() * renderer.getPixelRatio() * Math.sqrt(grow) * beat;
    coreMat.uniforms.uGlow.value = Math.sin(Math.PI * Math.min(grow * 1.15, 1));

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
