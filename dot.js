/*
 * Le point vert qui accompagne la lecture, et le fil qu'il trace.
 * Les points du sol du hero se rassemblent en un seul (hero.js) ; ce point prend ensuite le relais
 * dans la page, comme la pointe d'un stylo : il laisse derrière lui un fil vert qui relie le hero,
 * chaque projet (un petit nœud à chaque numéro), l'expertise, et finit dans le voyant du contact.
 * Le fil est un tracé SVG en coordonnées de la PAGE ; le point se place à sa longueur « lissée ».
 */

// diamètre du point (px), identique dans la scène 3D et dans la page
export const dotSize = () => (window.innerWidth <= 800 ? 11 : 13);

const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);


// Cercle tracé au stylo autour du numéro d'un projet (« 01 », « 04 »…) : ellipse un peu inclinée,
// qui part de son point le plus à gauche (le fil y arrive à la verticale), fait un tour, puis dépasse
// son début d'une vingtaine de degrés avec un rayon qui grandit : la fin passe à l'extérieur du début.
const TILT = (-8 * Math.PI) / 180; // légèrement inclinée, comme un geste de poignet
const OVER = (19 * Math.PI) / 180; // dépassement de la fin sur le début
const RING_N = 26; // nombre de cubiques
function ring(cx, cy, a, b, SQ) {
  // SQ : exposant de la forme (1 = ellipse ; plus bas = plus carrée, quand le numéro est à l'étroit)
  // sens anti-horaire à l'écran ; u : avancement 0..1
  let th0 = Math.PI;
  const sweep = 2 * Math.PI + OVER;
  const at = (u) => {
    const th = th0 + sweep * u;
    const s = 0.93 + 0.2 * u + 0.022 * Math.sin(2 * th + 0.8); // petite variation de rayon
    const c = Math.cos(th);
    const sn = Math.sin(th);
    const ex = a * s * Math.sign(c) * Math.abs(c) ** SQ; // légèrement plus carré qu'une ellipse
    const ey = -b * s * Math.sign(sn) * Math.abs(sn) ** SQ;
    return [cx + ex * Math.cos(TILT) - ey * Math.sin(TILT), cy + ex * Math.sin(TILT) + ey * Math.cos(TILT)];
  };
  // départ au point le plus à gauche de l'ellipse inclinée : la tangente y est verticale
  let best = Infinity;
  let thL = th0;
  for (let k = -60; k <= 60; k++) {
    th0 = Math.PI + (k * Math.PI) / 360;
    const x = at(0)[0];
    if (x < best) {
      best = x;
      thL = th0;
    }
  }
  th0 = thL;
  const segs = [];
  const e = 1e-4;
  const der = (u) => {
    const p = at(Math.min(u + e, 1 + e));
    const q = at(u - e);
    return [(p[0] - q[0]) / (2 * e), (p[1] - q[1]) / (2 * e)];
  };
  for (let k = 0; k < RING_N; k++) {
    const u0 = k / RING_N;
    const u1 = (k + 1) / RING_N;
    const p0 = at(u0);
    const p1 = at(u1);
    const d0 = der(u0);
    const d1 = der(u1);
    const h = (u1 - u0) / 3;
    segs.push([p0[0] + d0[0] * h, p0[1] + d0[1] * h, p1[0] - d1[0] * h, p1[1] - d1[1] * h, p1[0], p1[1]]);
  }
  const end = at(1);
  const t1 = der(1);
  const n = Math.hypot(t1[0], t1[1]);
  const pts = [];
  for (let k = 0; k <= 120; k++) pts.push(at(k / 120));
  return { start: at(0), segs, end, tan: [t1[0] / n, t1[1] / n], pts };
}

const KAPPA = 0.5523; // quart d'ellipse en cubique

export function createDot({ getVh }) {
  const anchors = [...document.querySelectorAll(".project-kicker, #expertise-title, .contact-dot")];
  if (!anchors.length) return null;
  const clock = document.querySelector(".contact-clock");
  const hero = document.querySelector(".hero");
  const lastI = anchors.length - 1; // dernier repère : le voyant de l'horloge du contact
  const hasVoyant = anchors[lastI].classList.contains("contact-dot");
  const nProjects = anchors.filter((a) => a.classList.contains("project-kicker")).length;

  const el = document.createElement("div");
  el.className = "scroll-dot";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = "<b><s><i></i></s></b>";
  document.body.appendChild(el);
  const body = el.firstChild;
  let size = 0;
  const setSize = () => {
    if (size === dotSize()) return;
    size = dotSize();
    el.style.setProperty("--dot", `${size}px`);
  };
  setSize();

  // le fil : un seul tracé SVG, grand comme le document, ajouté au body
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "scroll-thread");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  svg.appendChild(path);
  document.body.appendChild(svg);

  // première ligne de texte de chaque repère (le bloc peut être plus large que le texte)
  const ranges = anchors.map((a) => {
    const r = document.createRange();
    r.selectNodeContents(a);
    return r;
  });
  const lineOf = (i) => ranges[i].getClientRects()[0] || anchors[i].getBoundingClientRect();
  // les blocs [data-reveal] sont décalés tant qu'ils n'ont pas paru : on mesure à leur place finale
  const revealDy = (e) => {
    const r = e.closest("[data-reveal]");
    const t = r && getComputedStyle(r).transform;
    return t && t !== "none" ? new DOMMatrix(t).f : 0;
  };

  let source = null; // point de rassemblement des points du sol, en coordonnées de la PAGE
  let handoff = Infinity; // défilement à partir duquel le point quitte la scène 3D
  let dirty = true; // la page a bougé : tracé à recalculer

  // --- Tracé (coordonnées de la page) ---
  let G = null; // { L, n, len, px, py, maxY, ends, marks, first }

  function compute() {
    dirty = false;
    G = null;
    if (!source) return;
    const sx = window.scrollX;
    const sy = window.scrollY;
    const mob = window.innerWidth <= 800;
    const Wd = document.documentElement.clientWidth;
    // rectangle en coordonnées de la PAGE, à la place finale des blocs [data-reveal]
    const box = (e) => {
      const r = e.getBoundingClientRect();
      const dy = revealDy(e);
      return { l: r.left + sx, r: r.right + sx, t: r.top + sy - dy, b: r.bottom + sy - dy };
    };
    const textBox = (rg, dy) => {
      const q = rg.getBoundingClientRect();
      return { l: q.left + sx, r: q.right + sx, t: q.top + sy - dy, b: q.bottom + sy - dy };
    };

    // repères : position, colonnes de descente du fil, cercle éventuel
    const items = anchors.map((a, i) => {
      const dy = revealDy(a);
      const r = lineOf(i);
      const top = r.top + sy - dy;
      const left = r.left + sx;
      const it = { cy: top + r.height / 2, top, kicker: a.classList.contains("project-kicker") };
      it.voyant = hasVoyant && i === lastI;
      if (it.voyant) {
        it.inX = it.outX = left + r.width / 2;
      } else if (!it.kicker) {
        it.inX = it.outX = Math.max(left - (size / 2 + 7 + r.height * 0.1), size / 2 + 3);
        it.bottom = a.closest(".shell")?.lastElementChild ? box(a.closest(".shell").lastElementChild).b : it.cy;
        // la ligne « Avant … » qui clôt la section projets : on traverse au-dessus d'elle
        const wb = document.querySelector(".work-before");
        if (wb) it.top = Math.min(it.top, box(wb).t);
      } else {
        const proj = a.closest(".project");
        const m = box(proj.querySelector(".project-media"));
        const c = box(proj.querySelector(".project-copy"));
        it.stacked = c.t >= m.b - 2; // mobile : la capture, puis le texte dessous
        it.m = m;
        it.top = Math.min(m.t, c.t);
        it.bottom = Math.max(m.b, c.b);
        // les deux chiffres, et le premier caractère visible qui les suit
        const t = a.firstChild;
        let dr = null;
        let lim = Infinity;
        if (t && t.nodeType === 3 && t.length >= 3) {
          const rg = document.createRange();
          rg.setStart(t, 0);
          rg.setEnd(t, 2);
          dr = textBox(rg, dy);
          for (let k = 2; k < Math.min(t.length, 8); k++) {
            if (/\s/.test(t.data[k])) continue;
            rg.setStart(t, k);
            rg.setEnd(t, k + 1);
            lim = textBox(rg, dy).l;
            break;
          }
        } else {
          dr = { l: left, r: left + 16, t: top, b: top + r.height };
        }
        // ellipse : demi-axes ~ chiffres + 7 px / 6 px, ajustée pour ne toucher ni les chiffres,
        // ni le caractère qui suit, ni le titre juste dessous
        const nx = a.nextElementSibling;
        let nextTop = Infinity;
        if (nx) {
          const rg2 = document.createRange();
          rg2.selectNodeContents(nx);
          const q0 = rg2.getClientRects()[0];
          if (q0) nextTop = q0.top + sy - dy;
        }
        // marge de 7 px à gauche pour que le disque et le trait ne soient jamais coupés par le bord
        let a2 = Math.min((dr.r - dr.l) / 2 + 7, (lim - 3.4 - 7) / 2.21);
        const botT = Math.min(dr.b + 6.5, nextTop - 3.6); // bas du cercle
        const topT = dr.t - 6.5; // haut du cercle
        let b2 = (botT - topT) / 2;
        let cx = (dr.l + dr.r) / 2;
        cx -= Math.max(0, cx + a2 * 1.04 - (lim - 3.3)); // sans toucher le caractère suivant
        cx = Math.max(cx, a2 * 1.16 + 7); // ni sortir de la page
        let cy = (topT + botT) / 2;
        let rg0 = null;
        // ellipse d'abord ; si les coins des chiffres sont trop près, la forme devient plus carrée
        for (const sq of [1, 0.9, 0.8, 0.7, 0.62, 0.55, 0.5]) {
          let md = 0;
          for (let k = 0; k < 10; k++) {
            rg0 = ring(cx, cy, a2, b2, sq);
            let ymax = -Infinity;
            let xmax = -Infinity;
            md = Infinity;
            for (const [px, py] of rg0.pts) {
              ymax = Math.max(ymax, py);
              xmax = Math.max(xmax, px);
              md = Math.min(md, Math.hypot(Math.max(dr.l - px, 0, px - dr.r), Math.max(dr.t - py, 0, py - dr.b)));
            }
            const ex = xmax - (lim - 3.4); // ne déborde pas sur le caractère suivant
            if (ex > 0.2) {
              cx -= ex;
              const xmin = Math.min(...rg0.pts.map((q) => q[0])) - ex;
              if (xmin < 7) {
                // plus de place à gauche (bord de la page) : le cercle se resserre
                a2 -= (7 - xmin) / 2;
                cx += (7 - xmin) / 2;
              }
              continue;
            }
            if (Math.abs(ymax - botT) < 0.3) break;
            cy -= (ymax - botT) * 0.9; // cale le bas du cercle
          }
          if (md >= 3.6) break;
        }
        it.cy = (dr.t + dr.b) / 2 - 0.5; // repère de lecture : milieu des chiffres
        it.ring = rg0;
        it.b2 = b2;
        if (it.stacked) {
          // le fil arrive par la marge droite, repart par la marge gauche
          it.inX = Wd - Math.max(10, (Wd - c.r) / 2);
          it.outX = Math.max(10, c.l / 2);
        } else if (c.l > m.l) {
          it.inX = it.outX = (m.r + c.l) / 2; // texte à droite : gouttière entre la capture et lui
        } else {
          it.inX = it.outX = Math.max(10, c.l / 2); // texte à gauche : marge de la page
        }
      }
      return it;
    });

    const f = (v) => v.toFixed(1);
    let d = "";
    let cx0 = source.x;
    let cy0 = source.y;
    // le tracé est aussi échantillonné ici (longueur cumulée, y) : getPointAtLength serait trop lent
    const xs = [];
    const ys = [];
    const cum = [];
    const add = (x, y) => {
      const k = xs.length;
      xs.push(x);
      ys.push(y);
      cum.push(k ? cum[k - 1] + Math.hypot(x - xs[k - 1], y - ys[k - 1]) : 0);
    };
    const M = (x, y) => {
      d += `M${f(x)} ${f(y)}`;
      cx0 = x;
      cy0 = y;
      add(x, y);
    };
    const Lt = (x, y) => {
      d += `L${f(x)} ${f(y)}`;
      add(x, y);
      cx0 = x;
      cy0 = y;
    };
    const Cb = (x1, y1, x2, y2, x, y) => {
      d += `C${f(x1)} ${f(y1)} ${f(x2)} ${f(y2)} ${f(x)} ${f(y)}`;
      for (let k = 1; k <= 12; k++) {
        const t = k / 12;
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const c = 3 * u * t * t;
        const e = t * t * t;
        add(a * cx0 + b * x1 + c * x2 + e * x, a * cy0 + b * y1 + c * y2 + e * y);
      }
      cx0 = x;
      cy0 = y;
    };
    // descente verticale jusqu'à y2 ; sur mobile, très légère ondulation comme tracée à la main
    const vline = (y2) => {
      const x = cx0;
      const y1 = cy0;
      if (y2 <= y1 + 0.5) return;
      if (!mob || y2 - y1 < 160) return Lt(x, y2);
      const n = Math.round((y2 - y1) / 100);
      let px = x;
      for (let k = 1; k <= n; k++) {
        const y0 = y1 + ((y2 - y1) * (k - 1)) / n;
        const y = y1 + ((y2 - y1) * k) / n;
        const nx = k === n ? x : x + 1.5 * Math.sin(y * 0.017 + 1.3);
        Cb(px, (y0 + y) / 2, nx, (y0 + y) / 2, nx, y);
        px = nx;
      }
    };
    // traversée en S : descend, part sur le côté en quart d'ellipse, traverse à hauteur yMid, redescend
    const zig = (x2, yMid, ry1, ry2) => {
      const dx = x2 - cx0;
      if (Math.abs(dx) < 1.5) return;
      const sg = Math.sign(dx);
      const rx = Math.abs(dx) / 2;
      vline(yMid - ry1);
      const x1 = cx0;
      Cb(x1, cy0 + KAPPA * ry1, x1 + sg * rx * (1 - KAPPA), yMid, x1 + sg * rx, yMid);
      Cb(x2 - sg * rx * (1 - KAPPA), yMid, x2, yMid + ry2 - KAPPA * ry2, x2, yMid + ry2);
    };

    // même traversée dans un espace étroit : coins ronds et course presque droite
    // (un quart d'ellipse large et plat ferait un angle sec au bord de l'écran)
    const run = (x2, yMid, r1, r2) => {
      const x1 = cx0;
      const sg = Math.sign(x2 - x1);
      vline(yMid - r1);
      Cb(cx0, cy0 + KAPPA * r1, x1 + sg * r1 * (1 - KAPPA), yMid, x1 + sg * r1, yMid);
      const xa = cx0;
      const xb = x2 - sg * r2;
      const third = (xb - xa) / 3;
      Cb(xa + third, yMid, xb - third, yMid, xb, yMid);
      Cb(xb + sg * r2 * KAPPA, yMid, x2, yMid + r2 * (1 - KAPPA), x2, yMid + r2);
    };

    // --- premier tronçon : de la source du hero jusqu'au premier repère, sans toucher au texte ---
    const heroBottom = hero.getBoundingClientRect().bottom + sy - 1;
    const first = items[0];
    M(source.x, source.y);
    if (hero.classList.contains("is-stacked")) {
      // la source est à droite du titre : le fil part souplement vers la marge droite, puis y descend
      // jusqu'au bas du hero, sans toucher le texte du hero (ligne d'accroche, projet en cours et sa flèche, indice)
      const rects = [];
      for (const e of hero.querySelectorAll(".hero-line, .hero-current, .hero-hint")) {
        const tf = getComputedStyle(e).transform; // décalage de l'animation d'entrée
        const dy = tf && tf !== "none" ? new DOMMatrix(tf).f : 0;
        const rg = document.createRange();
        rg.selectNodeContents(e);
        for (const r of rg.getClientRects()) {
          if (r.width >= 1 && r.height >= 1 && r.bottom + sy - dy > source.y) rects.push({ l: r.left + sx, r: r.right + sx });
        }
      }
      const room = (x) => Math.min(Infinity, ...rects.map((q) => Math.max(q.l - x, x - q.r, 0)));
      // colonne de descente : celle du premier repère si elle est dégagée, sinon la plus proche colonne dégagée
      // (plus dégagée que 12 px si possible), pas trop loin à gauche de la source
      let xR = first.inX;
      if (room(xR) < 6 || xR < source.x - 120 || xR > Wd - 8) {
        let best = null;
        let bestRoom = -1;
        for (let x = Math.max(source.x - 120, 24); x <= Wd - 8; x += 1) {
          const rm = Math.min(room(x), 12);
          if (rm > bestRoom + 0.01 || (Math.abs(rm - bestRoom) <= 0.01 && Math.abs(x - first.inX) < Math.abs(best - first.inX))) {
            best = x;
            bestRoom = rm;
          }
        }
        if (best !== null) xR = best;
      }
      const dx = xR - source.x;
      const yEnd = source.y + clamp(Math.abs(dx) * 0.9, 36, 90);
      // part à l'horizontale, arrive à la verticale : courbe douce, sans angle
      Cb(source.x + dx * 0.6, source.y, xR, yEnd - (yEnd - source.y) * 0.55, xR, yEnd);
      vline(heroBottom);
    } else {
      // à gauche du « Glissez pour tourner », qui est sous le point
      const hint = document.querySelector(".hero-hint");
      let xH = source.x;
      if (hint) {
        const hb = box(hint);
        if (hb.b > source.y && hb.r > source.x - 40) xH = Math.min(xH, hb.l - 55);
      }
      if (Math.abs(xH - source.x) > 1.5) {
        const yH = source.y + 80;
        const k = 0.55 * (yH - source.y);
        Cb(source.x, source.y + k, xH, yH - k, xH, yH);
      }
    }

    // --- repère par repère ---
    const ends = [];
    let prevBottom = heroBottom;
    items.forEach((it, i) => {
      // traversée jusqu'à la colonne d'arrivée, entre la fin du bloc précédent et le début de celui-ci
      const gap = it.top - prevBottom;
      if (it.voyant) {
        const ry = Math.max(0, Math.min(40, gap / 2 - 8));
        zig(it.inX, (prevBottom + it.top) / 2, ry, ry);
        vline(it.cy);
      } else {
        const ry = Math.max(0, Math.min(mob ? 60 : 110, gap / 2 - 12));
        zig(it.inX, (prevBottom + it.top) / 2, ry, ry);
        if (!it.kicker) vline(it.cy);
      }
      if (it.kicker) {
        // approche du cercle : arrive au point le plus à gauche, à la verticale
        const S = it.ring.start;
        if (it.stacked) {
          // sous la capture : course souple de la marge droite vers la gauche
          const topC = Math.min(...it.ring.pts.map((q) => q[1]));
          const yMid = (it.m.b + topC) / 2;
          const ry1 = Math.max(4, Math.min(24, yMid - it.m.b + 12)); // l'arrondi peut commencer dans la marge, à côté du bas de la capture
          const ry2 = Math.max(4, Math.min(24, S[1] - 2 - yMid));
          run(S[0], yMid, ry1, ry2);
        } else {
          // de la gouttière au cercle : une seule courbe, sans décrochement
          const h = clamp(S[1] - cy0, 10, 120);
          vline(S[1] - h);
          Cb(cx0, cy0 + h * 0.5, S[0], S[1] - h * 0.5, S[0], S[1]);
        }
        Lt(S[0], S[1]);
        for (const s of it.ring.segs) Cb(...s);
        ends[i] = xs.length - 1; // le cercle est fermé ici
        // sortie : repart vers le bas par la marge ou la gouttière, sans repasser sur le texte
        const E = it.ring.end;
        const T = it.ring.tan;
        const yo = E[1] + (it.stacked ? 60 : 90);
        Cb(E[0] + T[0] * 26, E[1] + T[1] * 26, it.outX, yo - 36, it.outX, yo);
      }
      prevBottom = it.bottom ?? it.cy;
    });
    path.setAttribute("d", d);
    const L = path.getTotalLength();
    const n = xs.length;
    const kL = L / (cum[n - 1] || 1); // les longueurs du navigateur font foi
    const len = new Float32Array(n);
    const maxY = new Float32Array(n);
    let m = -Infinity;
    for (let i = 0; i < n; i++) {
      len[i] = cum[i] * kL;
      m = Math.max(m, ys[i]);
      maxY[i] = m;
    }
    const W = Math.max(document.documentElement.clientWidth, document.body.scrollWidth);
    const H = document.body.getBoundingClientRect().height + document.body.getBoundingClientRect().top + sy;
    svg.setAttribute("width", W);
    svg.setAttribute("height", Math.ceil(H));
    path.style.strokeDasharray = L.toFixed(2);

    const G2 = { L, n, len, maxY };
    // longueur à laquelle la pointe atteint une hauteur de page (cumul croissant de y)
    G2.at = (line) => {
      let lo = 0;
      let hi = n - 1;
      if (maxY[hi] < line) return L;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (maxY[mid] >= line) hi = mid;
        else lo = mid + 1;
      }
      if (lo === 0 || maxY[lo] === maxY[lo - 1]) return len[lo];
      return len[lo - 1] + ((line - maxY[lo - 1]) / (maxY[lo] - maxY[lo - 1])) * (len[lo] - len[lo - 1]);
    };
    // repères : longueur à partir de laquelle chacun est « dépassé » ; fins de cercles pour l'anneau
    G2.marks = items.map((it, i) => (it.voyant ? L - 1 : G2.at(it.cy)));
    G2.ends = [];
    ends.forEach((k) => G2.ends.push(len[k]));
    G2.first = G2.marks[0];
    G2.firstY = items[0].cy;
    G = G2;
    lenS = Math.min(lenS, L);
  }

  // Où la pointe devrait être (longueur sur le fil)
  function targetLen(sy, vh) {
    const line = sy + vh * 0.62;
    // trajet depuis le hero : piloté par le défilement jusqu'à ce que « 01 » atteigne sa place
    const arrive = G.firstY - vh * 0.62;
    if (sy < arrive) {
      const e = smooth(clamp((sy - handoff) / (arrive - handoff), 0, 1));
      const lo = G.at(sy + 125);
      const hi = G.at(sy + vh - 40);
      // jamais sous le header (lo) ni sous le bas de l'écran (hi)
      return clamp(G.first * e, lo, hi);
    }
    // ensuite : la pointe suit la ligne de lecture
    return G.at(line);
  }

  // --- Mouvement ---
  // La longueur dessinée suit sa cible comme un ressort : vive au défilement,
  // avec une glissade visible quand la cible saute (traversée, nœud).
  const K = 260; // raideur
  const C = 2 * Math.sqrt(K) * 0.85; // amortissement
  let on = false;
  let raf = 0;
  let last = 0;
  let lenS = 0; // longueur lissée
  let vel = 0;
  let prevLen = 0;
  let px = 0;
  let py = 0;
  let stretch = 0;
  let shrink = 1; // échelle du point (il rétrécit en approchant du voyant)
  let fed = false; // fondu dans le voyant
  let kind = undefined; // dernier état émis (dot:active)
  let lastScroll = 0;

  // annonce le repère actif (compteur du header) ; kind : project | expertise | contact | travel | null
  function announce(key) {
    // key : null (caché), -1 (trajet depuis le hero) ou index du dernier repère dépassé
    const k = key === null ? null : key < 0 ? "travel" : key < nProjects ? "project" : key === nProjects ? "expertise" : "contact";
    const index = key === null || key < 0 ? null : key;
    const sig = `${k}:${index}`;
    if (sig === kind) return;
    kind = sig;
    document.dispatchEvent(new CustomEvent("dot:active", { detail: { index, kind: k } }));
  }

  function setFed(v) {
    if (fed === v) return;
    fed = v;
    el.classList.toggle("is-fed", v);
    clock?.classList.toggle("is-fed", v);
  }

  function setOn(v) {
    if (on === v) return;
    on = v;
    el.classList.toggle("is-on", v);
    svg.classList.toggle("is-on", v);
  }

  function land() {
    el.classList.remove("is-landing");
    void el.offsetWidth;
    el.classList.add("is-landing");
  }

  function tick(now) {
    raf = 0;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const sy = window.scrollY;
    if (sy >= handoff && dirty) compute();
    if (sy < handoff || !G) {
      setOn(false);
      setFed(false);
      lenS = vel = 0;
      announce(null);
      return;
    }
    const vh = getVh();
    const tl = targetLen(sy, vh);

    if (!on) {
      lenS = tl;
      vel = 0;
      prevLen = lenS;
      // il sort tout juste du noyau de la scène 3D : petite éclosion
      if (lenS < G.first) {
        el.classList.remove("is-born");
        void el.offsetWidth;
        el.classList.add("is-born");
      }
      setOn(true);
    } else {
      for (let s = dt; s > 1e-6; s -= 1 / 240) {
        const h = Math.min(s, 1 / 240);
        vel += (K * (tl - lenS) - C * vel) * h;
        lenS += vel * h;
      }
    }
    // le point reste toujours entre le bas du header et le bas de l'écran, même si le ressort a du retard
    lenS = clamp(lenS, clamp(G.at(sy + 96), 0, G.L), Math.max(G.at(sy + vh - 24), G.at(sy + 96)));
    const settled = Math.abs(tl - lenS) < 0.3 && Math.abs(vel) < 4;
    if (settled) {
      lenS = tl;
      vel = 0;
    }

    // le trait s'arrête exactement là où est le point
    path.style.strokeDashoffset = (G.L - lenS).toFixed(2);
    const p = path.getPointAtLength(lenS);
    const x = p.x - window.scrollX;
    const y = p.y - sy;
    el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;

    // il s'étire dans le sens de sa course quand il va vite
    const vx = dt > 0 ? (x - px) / dt : 0;
    const vy = dt > 0 ? (y - py) / dt : 0;
    px = x;
    py = y;
    const speed = Math.hypot(vx, vy);
    stretch += (Math.min(speed / 2600, 0.8) - stretch) * Math.min(dt * 14, 1);
    const angle = Math.atan2(vy, vx);

    // vers le voyant : il rétrécit à sa taille selon la longueur restante (lissé, donc sans saut au départ)
    const vSize = hasVoyant ? anchors[lastI].offsetWidth : 0;
    const rem = G.L - lenS;
    const wantShrink = vSize ? 1 - (1 - vSize / size) * (1 - smooth(clamp(rem / 220, 0, 1))) : 1;
    shrink += (wantShrink - shrink) * Math.min(dt * 12, 1);
    if (Math.abs(shrink - wantShrink) < 0.002) shrink = wantShrink;

    // au bout du fil : il se fond dans le voyant (hystérésis pour ne pas clignoter pendant un petit défilement)
    setFed(vSize ? (fed ? rem < 14 : rem < 1.5) : false);

    const sq = stretch > 0.01 ? `rotate(${angle.toFixed(3)}rad) scale(${(1 + stretch).toFixed(3)}, ${(1 / (1 + stretch * 0.6)).toFixed(3)})` : "";
    body.style.transform = shrink !== 1 ? `scale(${shrink.toFixed(3)}) ${sq}` : sq;

    // repère actif et anneau quand la pointe boucle un nœud en descendant
    let key = -1;
    G.marks.forEach((m, i) => {
      if (lenS >= m) key = i;
    });
    announce(key);
    if (!fed && G.ends.some((e) => prevLen < e && lenS >= e)) land();
    prevLen = lenS;

    if (!settled || stretch > 0.01 || shrink !== wantShrink || now - lastScroll < 120) raf = requestAnimationFrame(tick);
  }

  function kick() {
    lastScroll = performance.now();
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
  const invalidate = () => {
    dirty = true;
    kick();
  };

  window.addEventListener("scroll", kick, { passive: true });
  window.addEventListener("resize", () => {
    setSize();
    invalidate();
  });
  // la page bouge sans défilement : images qui se chargent, polices, hauteur du document
  document.addEventListener("load", (e) => e.target.tagName === "IMG" && invalidate(), true);
  document.fonts?.ready.then(invalidate);
  if ("ResizeObserver" in window) new ResizeObserver(invalidate).observe(document.body);
  el.addEventListener("animationend", (e) => {
    if (e.animationName === "scroll-dot-ring") el.classList.remove("is-landing", "is-born");
  });
  kick();

  return {
    setSource(x, y) {
      // figé une fois le point sorti du hero : le tracé ne doit plus bouger en cours de lecture
      if (source && window.scrollY >= handoff) return;
      if (source && Math.abs(source.x - x) < 1 && Math.abs(source.y - y) < 1) return;
      source = { x, y };
      dirty = true;
      if (window.scrollY >= handoff) kick();
    },
    setHandoff(s) {
      if (s === handoff) return;
      handoff = s;
      kick();
    },
  };
}
