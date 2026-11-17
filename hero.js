import * as THREE from "three";

/*
 * Hero 3D : les écrans des projets montés en anneau.
 * Glisser pour tourner, cliquer sur l'écran de face pour aller au projet.
 */

const canvas = document.querySelector("#hero-scene");
const hero = document.querySelector(".hero");
const label = document.querySelector("#hero-current");
const inner = document.querySelector(".hero-inner");

const projects = [...document.querySelectorAll("[data-project]")].map((el) => ({
  id: el.id,
  n: el.querySelector(".project-kicker")?.textContent.trim().slice(0, 2),
  name: el.dataset.project,
  kind: el.dataset.kind,
  image: el.querySelector(".project-media img")?.getAttribute("src"),
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
  const GREEN = 0x7ab540;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(INK);
  scene.fog = new THREE.Fog(INK, 9, 17);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);

  const rig = new THREE.Group(); // position + inclinaison selon la souris
  const ring = new THREE.Group(); // rotation de l'anneau
  rig.add(ring);
  scene.add(rig);

  const N = projects.length;
  const W = 3.2;
  const H = 2.0;
  const R = (W * 1.18 * N) / (2 * Math.PI);
  const STEP = (Math.PI * 2) / N;

  const { geo, outline } = roundedPanel(W, H, 0.09);
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const panels = [];

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
    panels.push({ front, edge, mat });

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
        mat.map = tex;
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      });
    }
  });

  // Sol en points, pour donner de la profondeur
  const dots = [];
  for (let x = -14; x <= 14; x += 0.7) {
    for (let z = -14; z <= 14; z += 0.7) dots.push(x, 0, z);
  }
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute("position", new THREE.Float32BufferAttribute(dots, 3));
  const floor = new THREE.Points(
    floorGeo,
    new THREE.PointsMaterial({ color: 0x4b544b, size: 0.035, sizeAttenuation: true })
  );
  floor.position.y = -H / 2 - 0.55;
  rig.add(floor);

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

  const ndc = new THREE.Vector2();
  const ray = new THREE.Raycaster();

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
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;

    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const narrow = camera.aspect < 0.95;
    let dist;

    if (narrow) {
      // Mobile : l'anneau tient dans l'espace libre entre le menu et le texte.
      const top = parseFloat(getComputedStyle(hero).paddingTop) || 0;
      const bottom = (inner?.offsetTop ?? h * 0.5) - 12;
      const free = Math.max(bottom - top, 80);
      // pixels par unité à la profondeur de l'écran de face
      const ppu = Math.min((w * 0.84) / W, (free * 0.8) / H);
      const front = h / (2 * tan * ppu);
      dist = front + R;
      const eye = 0.6;
      camera.position.set(0, eye, dist);
      camera.lookAt(0, eye, 0);
      const centerPx = top + free / 2;
      layout = { x: 0, y: eye + (h / 2 - centerPx) / ppu + R * Math.sin(0.1) };
    } else {
      dist = 14;
      camera.position.set(0, 1.3, dist);
      camera.lookAt(0, 0, 0);
      const visibleW = 2 * tan * dist * camera.aspect;
      layout = { x: Math.min(visibleW * 0.19, 3.2), y: 0.4 };
    }

    camera.updateProjectionMatrix();
    // l'écran de face reste net, l'arrière de l'anneau se fond dans le fond
    scene.fog.near = dist - R + 0.3;
    scene.fog.far = dist + R * 0.9;
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

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const now = performance.now();

    // défilement automatique, un écran toutes les 4 s, après 5 s sans interaction
    if (!reduceMotion && !dragging && now - lastInteraction > 5000) {
      target -= STEP;
      lastInteraction = now - 1000;
    }

    if (!dragging) angle += (target - angle) * (1 - Math.exp(-dt * 4.5));
    ring.rotation.y = angle;

    pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
    pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));

    const float = reduceMotion ? 0 : Math.sin(t * 0.6) * 0.06;
    rig.position.set(layout.x, layout.y + float, 0);
    rig.rotation.x = 0.1 + pointer.y * 0.08;
    rig.rotation.z = -0.045 + pointer.x * -0.03;
    rig.rotation.y = pointer.x * 0.12;

    const fi = frontIndex();
    setActive(fi);
    panels.forEach((p, i) => {
      const o = i === fi ? 0.9 : 0;
      p.edge.material.opacity += (o - p.edge.material.opacity) * (1 - Math.exp(-dt * 6));
    });

    renderer.render(scene, camera);
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
