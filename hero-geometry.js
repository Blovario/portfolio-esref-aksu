/*
 * Géométrie de l'anneau du hero, partagée par :
 * - hero.js (la scène Three.js)
 * - hero-poster.js (l'image de remplacement, sans Three.js)
 * Les deux doivent rester identiques au pixel près.
 */

export const FOV = 32;
export const W = 3.2;
export const H = 2.0;
export const RADIUS_CORNER = 0.09;
export const RIG_TILT = { x: 0.1, z: -0.045 };
export const FLOOR = { y: -H / 2 - 0.55, step: 0.7, extent: 14, size: 0.035, color: "#4b544b" };
export const INK = "#171a18";

export function ringRadius(n) {
  return (W * 1.18 * n) / (2 * Math.PI);
}

const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
const GAP = 28; // espace minimum entre le texte et l'anneau (px)
const EDGE = 20; // marge à droite de l'écran de face (px)

// Coins de tous les écrans, pour toutes les positions de rotation de l'anneau : [x, z]
function ringPoints(n, R) {
  const pts = [];
  const step = (Math.PI * 2) / n;
  for (let phase = 0; phase < step; phase += step / 6) {
    for (let i = 0; i < n; i++) {
      const a = i * step + phase;
      for (const lx of [-W / 2, W / 2]) {
        pts.push([Math.sin(a) * R + lx * Math.cos(a), Math.cos(a) * R - lx * Math.sin(a)]);
      }
    }
  }
  return pts;
}

/**
 * Cherche une place pour l'anneau à droite du texte, sans chevauchement.
 * Renvoie null s'il n'y en a pas : on passe alors à la mise en page empilée.
 */
function fitBeside({ w, h, textRight, R, n }) {
  const pts = ringPoints(n, R);
  for (let dist = 14; dist <= 21; dist += 0.5) {
    const ppu = (depth) => h / (2 * TAN * depth); // pixels par unité à une profondeur donnée
    // l'écran de face doit rester entier à droite
    const hi = (w - EDGE - w / 2) / ppu(dist - R) - W / 2;
    // aucun coin d'écran ne doit passer sur le texte
    const lo = Math.max(...pts.map(([x, z]) => (textRight + GAP - w / 2) / ppu(dist - z) - x));
    if (lo <= hi) return { dist, x: lo + (hi - lo) * 0.45 };
  }
  return null;
}

/**
 * Caméra et position de l'anneau pour une taille de hero donnée.
 * @param {{ w: number, h: number, padTop: number, innerTop: number, textRight: number, stacked: boolean, n: number }} p
 */
export function heroView({ w, h, padTop, innerTop, textRight, stacked, n }) {
  const R = ringRadius(n);
  const aspect = w / h;
  let dist;
  let cam;
  let target;
  let layout;

  if (stacked) {
    // L'anneau tient dans l'espace libre entre le menu et le texte.
    const bottom = (innerTop ?? h * 0.5) - 12;
    const free = Math.max(bottom - padTop, 80);
    const ppu = Math.min((w * 0.84) / W, (free * 0.8) / H); // pixels par unité à l'écran de face
    const front = h / (2 * TAN * ppu);
    dist = front + R;
    const eye = 0.6;
    cam = [0, eye, dist];
    target = [0, eye, 0];
    const centerPx = padTop + free / 2;
    layout = { x: 0, y: eye + (h / 2 - centerPx) / ppu + R * Math.sin(RIG_TILT.x) };
  } else {
    const fit = fitBeside({ w, h, textRight, R, n });
    dist = fit.dist;
    cam = [0, 1.3, dist];
    target = [0, 0, 0];
    layout = { x: fit.x, y: 0.4 };
  }

  return {
    aspect,
    R,
    cam,
    target,
    layout,
    fog: { near: dist - R + 0.3, far: dist + R * 0.9 },
  };
}

/**
 * Mesure le hero, choisit la mise en page (à côté du texte ou empilée)
 * et renvoie la vue. Utilisé à l'identique par la scène 3D et l'image de remplacement.
 */
export function layoutHero(hero, inner, n) {
  const box = hero.getBoundingClientRect();
  const w = hero.clientWidth;
  const h = hero.clientHeight;
  // fin réelle du texte (le titre est un bloc pleine largeur, on mesure ses lettres)
  const textRight = Math.max(
    0,
    ...[...hero.querySelectorAll(".hero-tag, .hero h1, .hero-line")].map((el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().right - box.left;
    })
  );
  const R = ringRadius(n);
  const stacked = w / h < 0.95 || !fitBeside({ w, h, textRight, R, n });
  hero.classList.toggle("is-stacked", stacked);
  return heroView({
    w: hero.clientWidth,
    h: hero.clientHeight,
    padTop: parseFloat(getComputedStyle(hero).paddingTop) || 0,
    innerTop: inner?.offsetTop,
    textRight,
    stacked,
    n,
  });
}

// Version de capture à utiliser pour les textures : la même que celle que le navigateur
// choisira pour la page (srcset/sizes), pour ne jamais télécharger deux fois une image.
export function pickSrc(img) {
  if (!img) return null;
  const vw = window.innerWidth;
  const needPx = vw * (vw <= 800 ? 1 : 0.6) * (window.devicePixelRatio || 1);
  const light = needPx <= 800 && img.getAttribute("srcset")?.split(",")[0]?.trim().split(" ")[0];
  return light || img.getAttribute("src");
}
