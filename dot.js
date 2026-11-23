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


// Nœud tracé à chaque numéro : boucle de cycloïde allongée, le fil entre et sort à la verticale.
// Points relatifs au centre de la boucle (le fil descend à gauche de celui-ci).
const LOOP = (() => {
  const a = 3, b = 10, sv = 1.6; // sv : étire la boucle pour qu'elle soit ronde
  let ps = Math.PI / 2;
  for (let i = 0; i < 40; i++) ps -= (a * ps - b * Math.sin(ps)) / (a - b * Math.cos(ps)); // croisement
  const raw = [];
  for (let k = 0; k <= 48; k++) {
    const p = -Math.PI + (2 * Math.PI * k) / 48;
    raw.push([a * p - b * Math.sin(p), -b * Math.cos(p), Math.abs(p) <= ps]);
  }
  const ws = raw.filter((r) => r[2]).map((r) => r[1]);
  const wc = (Math.min(...ws) + Math.max(...ws)) / 2;
  return raw.map(([u, w]) => [(wc - w) * 1.4, u * sv]); // [dx, dy]
})();

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
  const probe = document.createElementNS(NS, "path"); // pour mesurer des tronçons du tracé

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
  const STEP = 4; // pas d'échantillonnage (px de longueur)
  let G = null; // { L, n, len, px, py, maxY, ends, marks, first }

  function compute() {
    dirty = false;
    G = null;
    if (!source) return;
    const sx = window.scrollX;
    const sy = window.scrollY;
    const mob = window.innerWidth <= 800;
    const sc = mob ? 0.5 : 1; // boucle plus petite sur mobile (marge étroite)
    const loopHalf = LOOP[0][1] * -sc; // demi-hauteur de la boucle
    const xl = LOOP[0][0] * sc; // décalage du fil par rapport au centre de la boucle

    // points de passage : { x, y, pass (hauteur de traversée après lui), loop }
    const wp = [{ x: source.x, y: source.y, pass: hero.getBoundingClientRect().bottom + sy - 1 }];
    anchors.forEach((a, i) => {
      const r = lineOf(i);
      const top = r.top + sy - revealDy(a);
      const left = r.left + sx;
      const y = top + r.height / 2;
      const isK = a.classList.contains("project-kicker");
      const voyant = hasVoyant && i === lastI;
      let x = voyant ? left + r.width / 2 : Math.max(left - (size / 2 + 7 + r.height * 0.1), size / 2 + 3);
      let cx = x;
      if (isK) {
        cx = Math.max(x, 4 - xl); // le fil ne sort pas de la page
        x = cx + xl;
      }
      const box = a.closest(".project") || a.closest("section");
      const pass = box ? box.getBoundingClientRect().bottom + sy - revealDy(box) - 1 : y;
      wp.push({ x, y, cx, pass, loop: isK });
    });

    const f = (v) => v.toFixed(1);
    let d = `M${f(wp[0].x)} ${f(wp[0].y)}`;
    const ends = [];
    const vline = (x, y1, y2) => {
      if (!mob || y2 - y1 < 160) return (d += `L${f(x)} ${f(y2)}`);
      // sur mobile : très légère ondulation, comme tracée à la main
      const n = Math.round((y2 - y1) / 100);
      let px = x;
      for (let k = 1; k <= n; k++) {
        const y0 = y1 + ((y2 - y1) * (k - 1)) / n;
        const y = y1 + ((y2 - y1) * k) / n;
        const nx = k === n ? x : x + 2 * Math.sin(y * 0.017 + 1.3);
        d += `C${f(px)} ${f((y0 + y) / 2)} ${f(nx)} ${f((y0 + y) / 2)} ${f(nx)} ${f(y)}`;
        px = nx;
      }
    };
    for (let k = 0; k < wp.length - 1; k++) {
      const A = wp[k];
      const B = wp[k + 1];
      const yA = k === 0 ? A.y : A.loop ? A.y + loopHalf : A.y;
      const yB = B.loop ? B.y - loopHalf : B.y;
      const dx = B.x - A.x;
      const pass = Math.max(A.pass, yA + 20);
      if (Math.abs(dx) < 1.5 || pass > yB - 20) {
        vline(A.x, yA, yB);
      } else {
        const sg = Math.sign(dx);
        const r = Math.min(40, Math.abs(dx) / 2, (pass - yA) / 2, (yB - pass) / 2);
        vline(A.x, yA, pass - r);
        d += `Q${f(A.x)} ${f(pass)} ${f(A.x + sg * r)} ${f(pass)}L${f(B.x - sg * r)} ${f(pass)}Q${f(B.x)} ${f(pass)} ${f(B.x)} ${f(pass + r)}`;
        vline(B.x, pass + r, yB);
      }
      if (B.loop) {
        for (const [lx, ly] of LOOP) d += `L${f(B.cx + lx * sc)} ${f(B.y + ly * sc)}`;
        ends[k] = d; // le nœud est fermé ici
      }
    }
    path.setAttribute("d", d);
    const L = path.getTotalLength();
    const n = Math.ceil(L / STEP) + 1;
    const len = new Float32Array(n);
    const maxY = new Float32Array(n);
    let m = -Infinity;
    for (let i = 0; i < n; i++) {
      len[i] = Math.min(i * STEP, L);
      const p = path.getPointAtLength(len[i]);
      m = Math.max(m, p.y);
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
      return len[lo];
    };
    // repères : longueur à partir de laquelle chacun est « dépassé » ; fins de nœuds pour l'anneau
    G2.marks = wp.slice(1).map((w, i) => (hasVoyant && i === lastI ? L - 1 : G2.at(w.y)));
    G2.ends = [];
    ends.forEach((s, k) => {
      probe.setAttribute("d", s);
      G2.ends.push(probe.getTotalLength());
    });
    G2.first = G2.marks[0];
    G2.firstY = wp[1].y;
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
      const lo = G.at(sy + 110);
      const hi = G.at(sy + vh - 40);
      return clamp(G.first * e, Math.min(lo, G.first * e), hi);
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
    lenS = clamp(lenS, 0, G.L);
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
