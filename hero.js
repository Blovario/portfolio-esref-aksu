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
    panels.push({ holder, front, edge, mat });

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

  // --- Passage de relais : l'écran 01 quitte l'anneau et se pose sur sa capture ---
  const flight = createFlight();

  // --- Boucle ---
  const clock = new THREE.Clock();

  function frame() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const now = performance.now();

    // dès qu'on scrolle, l'anneau ramène l'écran 01 devant lui pour le passage de relais
    if (flight && window.scrollY > 4 && !dragging) {
      target = Math.round(angle / (Math.PI * 2)) * Math.PI * 2;
      lastInteraction = now;
    }

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
    flight?.update();
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

    // Calque WebGL fixe par-dessus la page, transparent et non cliquable
    const layer = document.createElement("canvas");
    layer.className = "flight-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    const r2 = new THREE.WebGLRenderer({ canvas: layer, antialias: true, alpha: true });
    r2.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r2.setClearColor(0x000000, 0);
    r2.outputColorSpace = THREE.SRGBColorSpace;

    const fscene = new THREE.Scene();
    const fcam = new THREE.Camera(); // positions données directement en coordonnées écran

    // Un quadrilatère libre, texturé avec une interpolation projective
    // (les 4 coins viennent de l'écran 3D au départ, du rectangle de l'image à l'arrivée)
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setAttribute("uvq", new THREE.BufferAttribute(new Float32Array(12), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const tex = new THREE.TextureLoader().load(img.getAttribute("src"));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = r2.capabilities.getMaxAnisotropy();
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      side: THREE.DoubleSide,
      uniforms: {
        map: { value: tex },
        uvMin: { value: new THREE.Vector2(0, 0) },
        uvMax: { value: new THREE.Vector2(1, 1) },
        radius: { value: 0.03 },
        aspect: { value: 1.6 },
        alpha: { value: 1 },
      },
      vertexShader: `
        attribute vec3 uvq;
        varying vec3 vUvq;
        void main() {
          vUvq = uvq;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        uniform vec2 uvMin, uvMax;
        uniform float radius, aspect, alpha;
        varying vec3 vUvq;
        void main() {
          vec2 uv = vUvq.xy / vUvq.z;
          // coins arrondis qui s'effacent à l'arrivée
          vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
          vec2 b = vec2(aspect, 1.0) * 0.5 - radius;
          float d = length(max(abs(p) - b, 0.0)) - radius;
          if (d > 0.0) discard;
          vec4 c = texture2D(map, mix(uvMin, uvMax, uv));
          gl_FragColor = vec4(c.rgb, c.a * alpha);
          #include <colorspace_fragment>
        }`,
    });
    const quad = new THREE.Mesh(g, mat);
    quad.frustumCulled = false;
    fscene.add(quad);

    const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const local = [
      [-W / 2, H / 2],
      [W / 2, H / 2],
      [W / 2, -H / 2],
      [-W / 2, -H / 2],
    ];
    const src = local.map(() => [0, 0]);
    const panel0 = panels[0];
    let lastT = -1;

    function sizeLayer() {
      r2.setSize(window.innerWidth, window.innerHeight, false);
    }
    sizeLayer();
    window.addEventListener("resize", sizeLayer);

    // Coins de l'écran 01 dans l'anneau, en pixels de la fenêtre
    function sourceCorners() {
      const rect = canvas.getBoundingClientRect();
      panel0.holder.updateWorldMatrix(true, false);
      local.forEach(([x, y], i) => {
        corners[i].set(x, y, 0).applyMatrix4(panel0.holder.matrixWorld).project(camera);
        src[i][0] = rect.left + ((corners[i].x + 1) / 2) * rect.width;
        src[i][1] = rect.top + ((1 - corners[i].y) / 2) * rect.height;
      });
    }

    // Partie visible de l'image dans son cadre (object-fit: cover, calé en haut)
    function targetCrop(box) {
      const ia = (img.naturalWidth || 1600) / (img.naturalHeight || 1000);
      const ba = box.width / box.height;
      if (ba > ia) return { min: [0, 1 - ia / ba], max: [1, 1] };
      const k = ba / ia;
      return { min: [(1 - k) / 2, 0], max: [(1 + k) / 2, 1] };
    }

    const smooth = (t) => t * t * (3 - 2 * t);

    function update() {
      const vh = window.innerHeight;
      const box = img.parentElement.getBoundingClientRect();
      // fin du trajet : la capture est centrée dans l'écran (ou au plus haut possible)
      const endScroll = Math.max(box.top + window.scrollY - Math.max((vh - box.height) / 2, 80), vh * 0.35);
      const startScroll = vh * 0.04;
      const raw = (window.scrollY - startScroll) / (endScroll - startScroll);
      const t = Math.min(Math.max(raw, 0), 1);

      const flying = t > 0 && t < 1;
      panel0.holder.visible = t === 0;
      img.style.visibility = t >= 1 || t === 0 ? "" : "hidden";
      layer.style.visibility = flying ? "visible" : "hidden";
      if (!flying) {
        if (lastT !== t) r2.clear();
        lastT = t;
        return;
      }
      lastT = t;

      sourceCorners();
      const dst = [
        [box.left, box.top],
        [box.right, box.top],
        [box.right, box.bottom],
        [box.left, box.bottom],
      ];
      const e = smooth(t);
      // petit arc : l'écran se soulève vers nous à mi-chemin
      const lift = Math.sin(Math.PI * e) * 0.06;
      const cx = (box.left + box.right) / 2;
      const cy = (box.top + box.bottom) / 2;
      const pts = src.map(([sx, sy], i) => {
        let x = sx + (dst[i][0] - sx) * e;
        let y = sy + (dst[i][1] - sy) * e;
        const mx = (src.reduce((a, p) => a + p[0], 0) / 4) * (1 - e) + cx * e;
        const my = (src.reduce((a, p) => a + p[1], 0) / 4) * (1 - e) + cy * e;
        x = mx + (x - mx) * (1 + lift);
        y = my + (y - my) * (1 + lift);
        return [x, y];
      });

      // interpolation projective : q dépend de l'intersection des diagonales
      const [p0, p1, p2, p3] = pts;
      const d1x = p2[0] - p0[0], d1y = p2[1] - p0[1];
      const d2x = p3[0] - p1[0], d2y = p3[1] - p1[1];
      const den = d1x * d2y - d1y * d2x || 1e-6;
      const s = ((p1[0] - p0[0]) * d2y - (p1[1] - p0[1]) * d2x) / den;
      const c = [p0[0] + s * d1x, p0[1] + s * d1y];
      const dist = pts.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]));
      const uvs = [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ];
      const pos = g.attributes.position.array;
      const uvq = g.attributes.uvq.array;
      pts.forEach((p, i) => {
        const q = (dist[i] + dist[(i + 2) % 4]) / Math.max(dist[(i + 2) % 4], 1e-6);
        pos[i * 3] = (p[0] / window.innerWidth) * 2 - 1;
        pos[i * 3 + 1] = 1 - (p[1] / vh) * 2;
        uvq[i * 3] = uvs[i][0] * q;
        uvq[i * 3 + 1] = uvs[i][1] * q;
        uvq[i * 3 + 2] = q;
      });
      g.attributes.position.needsUpdate = true;
      g.attributes.uvq.needsUpdate = true;

      const crop = targetCrop(box);
      mat.uniforms.uvMin.value.set(crop.min[0] * e, crop.min[1] * e);
      mat.uniforms.uvMax.value.set(1 + (crop.max[0] - 1) * e, 1 + (crop.max[1] - 1) * e);
      mat.uniforms.aspect.value = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / Math.max(Math.hypot(p3[0] - p0[0], p3[1] - p0[1]), 1);
      mat.uniforms.radius.value = 0.045 * (1 - e);

      r2.render(fscene, fcam);
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
