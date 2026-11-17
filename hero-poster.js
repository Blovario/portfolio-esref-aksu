import { FOV, W, H, RADIUS_CORNER, RIG_TILT, FLOOR, layoutHero, pickSrc } from "./hero-geometry.js";

/*
 * Image de remplacement de l'anneau, affichée pendant le chargement de la 3D
 * (et à sa place si WebGL n'est pas disponible).
 * Même caméra, mêmes positions, même brouillard que la scène Three.js :
 * les vraies captures sont placées en CSS 3D (matrix3d) au pixel près,
 * le sol en points est dessiné sur un canvas 2D.
 */

const hero = document.querySelector(".hero");
const poster = document.querySelector(".hero-poster");
const inner = document.querySelector(".hero-inner");
const sources = [...document.querySelectorAll("[data-project]")].map((el) => pickSrc(el.querySelector(".project-media img")));

const N = sources.length;
const STEP = (Math.PI * 2) / N;
const EL_W = 320;
const EL_H = (EL_W * H) / W;

// --- petite algèbre 3D, mêmes conventions que Three.js ---
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const rotX = ([x, y, z], t) => [x, y * Math.cos(t) - z * Math.sin(t), y * Math.sin(t) + z * Math.cos(t)];
const rotY = ([x, y, z], t) => [x * Math.cos(t) + z * Math.sin(t), y, -x * Math.sin(t) + z * Math.cos(t)];
const rotZ = ([x, y, z], t) => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t), z];
const smoothstep = (a, b, x) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

// Euler XYZ de Three.js : la matrice vaut Rx·Ry·Rz, donc Rz s'applique en premier
const rig = (p, layout) => {
  const r = rotX(rotZ(p, RIG_TILT.z), RIG_TILT.x);
  return [r[0] + layout.x, r[1] + layout.y, r[2]];
};

// Transformation projective : rectangle de l'élément → quadrilatère à l'écran
function matrix3d(p) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = p;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3;
  const d = y1 - y0 + g * y1, e = y3 - y0 + h * y3;
  const m = [a / EL_W, d / EL_W, 0, g / EL_W, b / EL_H, e / EL_H, 0, h / EL_H, 0, 0, 1, 0, x0, y0, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(",")})`;
}

const panels = sources.map((src) => {
  const el = document.createElement("div");
  el.className = "poster-panel";
  if (src) {
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.decoding = "async";
    el.appendChild(img);
  }
  const fog = document.createElement("span");
  fog.className = "poster-fog";
  el.appendChild(fog);
  poster.appendChild(el);
  return { el, fog };
});

const dotsCanvas = document.createElement("canvas");
dotsCanvas.className = "poster-floor";
poster.prepend(dotsCanvas);

let view = null;
let project = null;
let fogAt = null;

// Recalcule la caméra et redessine le sol (au chargement et au redimensionnement)
function layout() {
  if (!hero.clientWidth || !hero.clientHeight) return false;
  view = layoutHero(hero, inner, N);
  const w = hero.clientWidth;
  const h = hero.clientHeight;

  // repère de la caméra (lookAt)
  const eye = view.cam;
  const zc = norm(sub(eye, view.target));
  const xc = norm(cross([0, 1, 0], zc));
  const yc = cross(zc, xc);
  const f = 1 / Math.tan(((FOV / 2) * Math.PI) / 180);

  project = (pt) => {
    const v = sub(pt, eye);
    const vx = dot(v, xc), vy = dot(v, yc), vz = dot(v, zc);
    const depth = -vz;
    return {
      x: (((f / view.aspect) * vx) / depth + 1) * 0.5 * w,
      y: (1 - (f * vy) / depth) * 0.5 * h,
      depth,
    };
  };
  fogAt = (depth) => smoothstep(view.fog.near, view.fog.far, depth);

  // --- sol en points ---
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  dotsCanvas.width = Math.round(w * dpr);
  dotsCanvas.height = Math.round(h * dpr);
  const ctx = dotsCanvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const base = [0x4b, 0x54, 0x4b];
  const ink = [0x17, 0x1a, 0x18];
  for (let x = -FLOOR.extent; x <= FLOOR.extent + 1e-6; x += FLOOR.step) {
    for (let z = -FLOOR.extent; z <= FLOOR.extent + 1e-6; z += FLOOR.step) {
      const pt = project(rig([x, FLOOR.y, z], view.layout));
      if (pt.depth <= 0.1 || pt.x < -4 || pt.y < -4 || pt.x > w + 4 || pt.y > h + 4) continue;
      const k = fogAt(pt.depth);
      const size = (FLOOR.size * (h / 2)) / pt.depth; // même formule que PointsMaterial
      const c = base.map((v, j) => Math.round(v + (ink[j] - v) * k));
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(pt.x - size / 2, pt.y - size / 2, size, size);
    }
  }
  return true;
}

// Place les écrans
function place() {
  if (!view) return;
  let frontW = 0;
  const placed = panels.map(({ el, fog }, i) => {
    const a = i * STEP;
    const center = [Math.sin(a) * view.R, 0, Math.cos(a) * view.R];
    const corner = (lx, ly) => rig(rotY([lx, ly, 0], a).map((c, k) => c + center[k]), view.layout);
    const q = [corner(-W / 2, H / 2), corner(W / 2, H / 2), corner(W / 2, -H / 2), corner(-W / 2, -H / 2)].map(project);
    const area = (q[1].x - q[0].x) * (q[3].y - q[0].y) - (q[1].y - q[0].y) * (q[3].x - q[0].x);
    if (i === 0) frontW = Math.hypot(q[1].x - q[0].x, q[1].y - q[0].y);

    el.style.transform = matrix3d(q.map((pt) => [pt.x, pt.y]));
    el.classList.toggle("is-back", area < 0);
    el.classList.toggle("is-front", i === 0);
    // brouillard : plus sombre vers le fond, comme dans la scène
    const fl = fogAt((q[0].depth + q[3].depth) / 2);
    const fr = fogAt((q[1].depth + q[2].depth) / 2);
    fog.style.background = `linear-gradient(90deg, rgba(23,26,24,${fl.toFixed(3)}), rgba(23,26,24,${fr.toFixed(3)}))`;
    return { el, depth: (q[0].depth + q[1].depth + q[2].depth + q[3].depth) / 4 };
  });
  placed.sort((a, b) => b.depth - a.depth).forEach((pp, k) => (pp.el.style.zIndex = String(k + 1)));
  poster.style.setProperty("--edge", `${(EL_W / Math.max(frontW, 1)).toFixed(3)}px`);
}

function render() {
  if (layout()) place();
}

// --- Chargement ---
// Avec WebGL : un point vert pulse au centre de l'anneau, d'où la scène 3D jaillira.
// Sans WebGL (ou si la 3D n'arrive pas) : l'anneau fixe s'affiche à la place.
const forcePoster = new URLSearchParams(location.search).has("poster");
function webgl() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const loader = document.createElement("span");
loader.className = "hero-loader";
loader.setAttribute("aria-hidden", "true");

function placeLoader() {
  if (!view) return;
  const c = project(rig([0, 0, 0], view.layout));
  loader.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`;
}

function showPoster() {
  if (document.documentElement.classList.contains("has-ring")) return;
  poster.classList.add("is-shown");
}

if (hero && poster && N) {
  poster.style.setProperty("--radius", `${((RADIUS_CORNER / W) * 100).toFixed(2)}% / ${((RADIUS_CORNER / H) * 100).toFixed(2)}%`);
  hero.appendChild(loader);
  const refresh = () => {
    render();
    placeLoader();
  };
  refresh();
  window.addEventListener("resize", refresh);
  document.fonts?.ready.then(refresh);

  if (forcePoster || !webgl()) showPoster();
  else setTimeout(showPoster, 8000); // la 3D ne s'est pas chargée : on montre l'anneau fixe
  window.__heroPoster = { render: refresh };
}
