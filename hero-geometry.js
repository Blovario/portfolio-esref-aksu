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

/**
 * Caméra et position de l'anneau pour une taille de hero donnée.
 * @param {{ w: number, h: number, padTop: number, innerTop: number, n: number }} p
 */
export function heroView({ w, h, padTop, innerTop, n }) {
  const R = ringRadius(n);
  const aspect = w / h;
  const tan = Math.tan(((FOV / 2) * Math.PI) / 180);
  const narrow = aspect < 0.95;
  let dist;
  let cam;
  let target;
  let layout;

  if (narrow) {
    // Mobile : l'anneau tient dans l'espace libre entre le menu et le texte.
    const bottom = (innerTop ?? h * 0.5) - 12;
    const free = Math.max(bottom - padTop, 80);
    const ppu = Math.min((w * 0.84) / W, (free * 0.8) / H); // pixels par unité à l'écran de face
    const front = h / (2 * tan * ppu);
    dist = front + R;
    const eye = 0.6;
    cam = [0, eye, dist];
    target = [0, eye, 0];
    const centerPx = padTop + free / 2;
    layout = { x: 0, y: eye + (h / 2 - centerPx) / ppu + R * Math.sin(RIG_TILT.x) };
  } else {
    dist = 14;
    cam = [0, 1.3, dist];
    target = [0, 0, 0];
    const visibleW = 2 * tan * dist * aspect;
    layout = { x: Math.min(visibleW * 0.19, 3.2), y: 0.4 };
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

// Version de capture à utiliser pour les textures : la même que celle que le navigateur
// choisira pour la page (srcset/sizes), pour ne jamais télécharger deux fois une image.
export function pickSrc(img) {
  if (!img) return null;
  const vw = window.innerWidth;
  const needPx = vw * (vw <= 800 ? 1 : 0.6) * (window.devicePixelRatio || 1);
  const light = needPx <= 800 && img.getAttribute("srcset")?.split(",")[0]?.trim().split(" ")[0];
  return light || img.getAttribute("src");
}
