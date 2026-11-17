import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/*
 * Progi-Média : une maquette posée sur la page.
 * Les ERP à gauche, les connecteurs au centre, les usages à droite.
 * À l'arrivée à l'écran, les pièces se posent, les liens se tracent,
 * puis les données (perles vertes) commencent à circuler.
 */

const host = document.querySelector("[data-progi-scene]");

const SOURCES = ["SAP Business One", "Epicor Kinetic", "QuickBooks Online", "PostgreSQL"];
const TARGETS = ["Boutik B2B", "EDI", "PivoHub Connect", "Réassort par scan", "Commande terrain"];

const PAPER = 0xf1efe7;
const TILE = 0xe9e5d9;
const INK = "#171a18";

function webgl() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

if (host && webgl()) {
  (document.fonts?.ready ?? Promise.resolve()).then(init);
}

const clamp01 = (t) => Math.min(Math.max(t, 0), 1);
const ease = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeBack = (t) => {
  t = clamp01(t);
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

function labelTexture(lines, w, h, { hub = false, size = 0 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const fit = (text, weight, size, family, maxW) => {
    ctx.font = `${weight} ${size}px ${family}`;
    while (ctx.measureText(text).width > maxW && size > 12) {
      size -= 2;
      ctx.font = `${weight} ${size}px ${family}`;
    }
  };

  ctx.fillStyle = INK;
  if (hub) {
    if ("fontStretch" in ctx) ctx.fontStretch = "condensed";
    const title = lines[0].toUpperCase();
    fit(title, 800, h * 0.24, "Archivo, Inter, sans-serif", w * 0.8);
    ctx.fillText(title, w / 2, h * 0.44);
    if ("fontStretch" in ctx) ctx.fontStretch = "normal";
    ctx.globalAlpha = 0.75;
    fit(lines[1], 500, h * 0.1, '"JetBrains Mono", monospace', w * 0.8);
    ctx.fillText(lines[1], w / 2, h * 0.66);
  } else {
    ctx.font = `600 ${size}px Inter, sans-serif`;
    ctx.fillText(lines[0], w / 2, h / 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function init() {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 800 ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "progi-canvas";
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PAPER);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);

  // Lumière douce, une seule source qui porte les ombres
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4c4, 1.6));
  const sun = new THREE.DirectionalLight(0xfff6e8, 2.2);
  sun.position.set(-5, 9, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Le sol ne garde que les ombres : la page fait office de table
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ color: 0x3a3426, opacity: 0.16 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const rig = new THREE.Group();
  scene.add(rig);

  // --- Pièces ---
  const tileMat = new THREE.MeshStandardMaterial({ color: TILE, roughness: 0.92, metalness: 0 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0x7ab540, roughness: 0.6, metalness: 0 });

  // une seule taille de texte pour toutes les pièces : celle qui fait tenir le nom le plus long
  const LABEL_W = 1024;
  const LABEL_H = Math.round((LABEL_W * 0.9) / 2.5);
  const labelSize = (() => {
    const ctx = document.createElement("canvas").getContext("2d");
    let size = LABEL_H * 0.4;
    const longest = () =>
      Math.max(...[...SOURCES, ...TARGETS].map((t) => {
        ctx.font = `600 ${size}px Inter, sans-serif`;
        return ctx.measureText(t).width;
      }));
    while (longest() > LABEL_W * 0.86 && size > 12) size -= 2;
    return size;
  })();

  function makePiece(text, isHub = false) {
    const w = 2.5;
    const d = isHub ? 1.9 : 0.9;
    const h = isHub ? 0.7 : 0.3;
    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 5, isHub ? 0.14 : 0.09), isHub ? hubMat : tileMat);
    body.castShadow = true;
    body.receiveShadow = true;
    body.position.y = h / 2;

    const tw = 1024;
    const th = Math.round((tw * d) / w);
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.9, d * 0.9),
      new THREE.MeshBasicMaterial({
        map: labelTexture(isHub ? text : [text], tw, th, { hub: isHub, size: labelSize }),
        transparent: true,
        depthWrite: false,
        toneMapped: false,
      })
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = h + 0.003;

    const piece = new THREE.Group();
    piece.add(body, top);
    piece.userData = { w, d, h, body, lift: 0, delay: 0 };
    rig.add(piece);
    return piece;
  }

  const sources = SOURCES.map((t) => makePiece(t));
  const targets = TARGETS.map((t) => makePiece(t));
  const hub = makePiece(["Connecteurs", "Node.js · C# · Java"], true);
  const pieces = [...sources, hub, ...targets];

  // --- Liens tracés au sol + perles ---
  const linkMat = new THREE.MeshStandardMaterial({ color: 0xc4c1b4, roughness: 1 });
  const links = [];
  const PER_LINK = 2;
  const beads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.075, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x6aa635, roughness: 0.35 }),
    (SOURCES.length + TARGETS.length) * PER_LINK
  );
  beads.castShadow = true;
  beads.count = 0;
  rig.add(beads);

  function anchor(piece, dir, axis) {
    const p = piece.position.clone();
    if (axis === "x") p.x += dir * (piece.userData.w / 2 + 0.05);
    else p.z += dir * (piece.userData.d / 2 + 0.05);
    p.y = 0.03;
    return p;
  }

  function rebuildLinks(axis) {
    links.forEach((l) => {
      rig.remove(l.mesh);
      l.mesh.geometry.dispose();
    });
    links.length = 0;

    const add = (a, b) => {
      const m1 = a.clone();
      const m2 = b.clone();
      const key = axis === "x" ? "x" : "z";
      const k = (b[key] - a[key]) * 0.55;
      m1[key] += k;
      m2[key] -= k;
      const curve = new THREE.CubicBezierCurve3(a, m1, m2, b);
      const geo = new THREE.TubeGeometry(curve, 64, 0.022, 6, false);
      const mesh = new THREE.Mesh(geo, linkMat);
      mesh.receiveShadow = true;
      geo.setDrawRange(0, 0);
      rig.add(mesh);
      links.push({ curve, mesh, total: geo.index.count });
    };

    // le flux va toujours : ERP → connecteurs → usages
    sources.forEach((n) => add(anchor(n, 1, axis), anchor(hub, -1, axis)));
    targets.forEach((n) => add(anchor(hub, 1, axis), anchor(n, -1, axis)));
  }

  // --- Mise en page : en largeur sur desktop, en profondeur sur mobile ---
  let mode = null;

  function layout(next) {
    mode = next;
    if (mode === "wide") {
      sources.forEach((n, i) => n.position.set(-4.4, 0, -1.8 + i * 1.2));
      targets.forEach((n, i) => n.position.set(4.4, 0, -2.4 + i * 1.2));
      hub.position.set(0, 0, 0);
      rebuildLinks("x");
    } else {
      sources.forEach((n, i) => n.position.set(i % 2 ? 1.4 : -1.4, 0, -4.7 + Math.floor(i / 2) * 1.1));
      targets.forEach((n, i) => {
        const lone = i === TARGETS.length - 1 && TARGETS.length % 2;
        n.position.set(lone ? 0 : i % 2 ? 1.4 : -1.4, 0, 2.6 + Math.floor(i / 2) * 1.1);
      });
      hub.position.set(0, 0, -0.6);
      rebuildLinks("z");
    }
    // ordre d'apparition : sources, puis connecteurs, puis usages
    sources.forEach((p, i) => (p.userData.delay = i * 0.08));
    hub.userData.delay = 0.42;
    targets.forEach((p, i) => (p.userData.delay = 0.62 + i * 0.07));
  }

  // Cadre la caméra pour que toute la maquette tienne, quel que soit le format
  function fitCamera() {
    const elev = THREE.MathUtils.degToRad(mode === "wide" ? 58 : 62);
    const dir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
    const corners = [];
    pieces.forEach((p) => {
      const { w, d, h } = p.userData;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          for (const y of [0, h + 0.4]) corners.push(new THREE.Vector3(p.position.x + (sx * w) / 2, y, p.position.z + (sz * d) / 2));
    });
    const box = new THREE.Box3().setFromPoints(corners);
    const center = box.getCenter(new THREE.Vector3());
    center.y = 0;

    let lo = 4;
    let hi = 60;
    const v = new THREE.Vector3();
    for (let it = 0; it < 24; it++) {
      const mid = (lo + hi) / 2;
      camera.position.copy(center).addScaledVector(dir, mid);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const fits = corners.every((c) => {
        v.copy(c).project(camera);
        return Math.abs(v.x) <= 0.94 && Math.abs(v.y) <= 0.9;
      });
      if (fits) hi = mid;
      else lo = mid;
    }
    camera.position.copy(center).addScaledVector(dir, hi);
    camera.lookAt(center);
  }

  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const next = camera.aspect < 1 ? "tall" : "wide";
    if (next !== mode) layout(next);
    fitCamera();
  }

  // --- Interaction : la pièce survolée se soulève ---
  const pointer = { x: 0, tx: 0 };
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let hovered = null;

  host.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 - 1;
    const y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    pointer.tx = x;
    ndc.set(x, y);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pieces.map((p) => p.userData.body))[0];
    hovered = hit ? pieces.find((p) => p.userData.body === hit.object) : null;
  });
  host.addEventListener("pointerleave", () => {
    pointer.tx = 0;
    hovered = null;
  });

  // --- Construction au scroll ---
  const BUILD = 2400; // ms
  let buildStart = reduceMotion ? -Infinity : null; // null = pas encore commencé

  // --- Boucle ---
  const clock = new THREE.Clock();
  const m = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  let running = false;

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const k = 1 - Math.exp(-dt * 6);
    const built = buildStart === null ? 0 : clamp01((performance.now() - buildStart) / BUILD);

    // les pièces tombent en place, puis réagissent au survol
    pieces.forEach((p) => {
      const local = clamp01((built - p.userData.delay * 0.55) / 0.35);
      const fall = (1 - easeBack(local)) * 2.4;
      p.userData.lift += ((p === hovered ? 0.28 : 0) - p.userData.lift) * k;
      p.position.y = fall + p.userData.lift;
      p.visible = local > 0;
    });

    // les liens se tracent après les pièces
    links.forEach((l, i) => {
      const local = ease((built - 0.45 - (i % 5) * 0.03) / 0.4);
      l.mesh.geometry.setDrawRange(0, Math.floor((l.total * local) / 3) * 3);
    });

    // les perles circulent une fois la maquette posée
    let n = 0;
    if (built > 0.92) {
      links.forEach((l, li) => {
        for (let j = 0; j < PER_LINK; j++) {
          const u = reduceMotion ? (j + 0.5) / PER_LINK : (t * 0.22 + j / PER_LINK + li * 0.173) % 1;
          l.curve.getPoint(u, tmp);
          m.makeTranslation(tmp.x, 0.09, tmp.z);
          beads.setMatrixAt(n++, m);
        }
      });
    }
    beads.count = n;
    beads.instanceMatrix.needsUpdate = true;

    // très léger mouvement avec la souris
    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 2.5));
    rig.rotation.y = pointer.x * 0.05;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  function start() {
    if (running) return;
    running = true;
    clock.getDelta();
    requestAnimationFrame(frame);
  }

  resize();
  new ResizeObserver(resize).observe(host);

  let inView = false;
  const sync = () => (inView && !document.hidden ? start() : (running = false));
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    sync();
  }).observe(host);
  document.addEventListener("visibilitychange", sync);

  // la construction démarre quand la maquette est bien visible
  new IntersectionObserver(
    ([e], obs) => {
      if (!e.isIntersecting || buildStart !== null) return;
      buildStart = performance.now();
      obs.disconnect();
    },
    { threshold: 0.45 }
  ).observe(host);

  host.classList.add("has-scene");
}
