/*
 * Le point vert qui accompagne la lecture.
 * Les points du sol du hero se rassemblent en un seul (hero.js) ; ce point prend ensuite le relais
 * dans la page : il descend jusqu'au projet 01, se pose à côté de son numéro,
 * puis glisse de projet en projet au fil du défilement.
 */

// diamètre du point (px), identique dans la scène 3D et dans la page
export const dotSize = () => (window.innerWidth <= 800 ? 11 : 13);

const smooth = (t) => t * t * (3 - 2 * t);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);

export function createDot({ getVh }) {
  const anchors = [...document.querySelectorAll(".project-kicker, #expertise-title, .contact-dot")];
  if (!anchors.length) return null;
  const header = document.querySelector(".site-header");
  const clock = document.querySelector(".contact-clock");
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

  // première ligne de texte de chaque repère (le bloc peut être plus large que le texte)
  const ranges = anchors.map((a) => {
    const r = document.createRange();
    r.selectNodeContents(a);
    return r;
  });
  const lineOf = (i) => ranges[i].getClientRects()[0] || anchors[i].getBoundingClientRect();

  let source = null; // point de rassemblement des points du sol, en coordonnées de la PAGE
  let handoff = Infinity; // défilement à partir duquel le point quitte la scène 3D

  // Où le point devrait être maintenant (coordonnées de la fenêtre)
  function target() {
    const sy = window.scrollY;
    if (sy < handoff) return null;
    const vh = getVh();
    const lines = anchors.map((_, i) => lineOf(i));

    // repère en cours : le dernier dont le texte est passé au-dessus des 62 % de l'écran
    let active = 0;
    lines.forEach((r, i) => {
      if (r.top < vh * 0.62) active = i;
    });
    const r = lines[active];
    const voyant = hasVoyant && active === lastI; // cible : le centre du voyant, pas « à gauche du texte »
    let x = voyant ? r.left + r.width / 2 : Math.max(r.left - (size / 2 + 7 + r.height * 0.1), size / 2 + 3);
    let y = r.top + r.height / 2;
    let travel = false;

    // trajet depuis le hero : piloté par le défilement jusqu'à ce que « 01 » atteigne sa place
    if (source && active === 0) {
      const arrive = sy + r.top - vh * 0.62;
      if (sy < arrive) {
        const e = smooth(clamp((sy - handoff) / (arrive - handoff), 0, 1));
        const sx = source.x - window.scrollX;
        const syv = source.y - sy;
        // petit arc vers l'intérieur de la page en chemin
        x = sx + (x - sx) * e + Math.sin(Math.PI * e) * Math.min(window.innerWidth * 0.06, 60) * Math.sign(window.innerWidth / 2 - sx);
        y = syv + (y - syv) * e;
        travel = true;
      }
    }

    // pas de bornage s'il vise le voyant tant que celui-ci n'est pas sous le bas de l'écran :
    // rien ne doit le décoller (si le voyant remonte sous le header, le point le suit)
    const vx = x;
    const vy = y;
    if (!(voyant && y <= window.innerHeight)) {
      const top = (header?.getBoundingClientRect().bottom || 0) + 18;
      y = clamp(y, top, window.innerHeight - 26);
    }
    return { x, y, key: travel ? -1 : active, vSize: voyant ? anchors[active].offsetWidth : 0, vx, vy };
  }

  // --- Mouvement ---
  // Le point suit sa cible avec un décalage qui revient à zéro comme un ressort :
  // collé au texte quand on lit, il glisse avec un peu d'inertie d'un repère à l'autre.
  const K = 140; // raideur
  const C = 2 * Math.sqrt(K) * 0.7; // amortissement (léger rebond)
  const DRAG = 0.22; // part du défilement qu'il « rate » en suivant la page
  let on = false;
  let raf = 0;
  let last = 0;
  let prev = null; // cible à l'image précédente
  const off = { x: 0, y: 0, vx: 0, vy: 0 };
  let px = 0;
  let py = 0;
  let stretch = 0;
  let pulse = false;
  let shrink = 1; // échelle du point (il rétrécit en approchant du voyant)
  let fed = false; // fondu dans le voyant
  let kind = undefined; // dernier état émis (dot:active)

  // annonce le repère actif (compteur du header) ; kind : project | expertise | contact | travel | null
  function announce(t) {
    const k = !t ? null : t.key < 0 ? "travel" : t.key < nProjects ? "project" : t.key === nProjects ? "expertise" : "contact";
    const index = !t || t.key < 0 ? null : t.key;
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
    const t = target();
    announce(t);
    if (!t) {
      setOn(false);
      setFed(false);
      prev = null;
      return;
    }

    if (!on || !prev) {
      off.x = off.y = off.vx = off.vy = 0;
      px = t.x;
      py = t.y;
      // il sort tout juste du noyau de la scène 3D : petite éclosion
      if (t.key < 0) {
        el.classList.remove("is-born");
        void el.offsetWidth;
        el.classList.add("is-born");
      }
      setOn(true);
    } else {
      const dx = t.x - prev.x;
      const dy = t.y - prev.y;
      if (t.key !== prev.key) {
        // nouveau repère : le point part de là où il était
        off.x -= dx;
        off.y -= dy;
        if (t.key >= 0) pulse = true;
      } else {
        const drag = t.key < 0 ? 0.08 : DRAG;
        off.x -= dx * drag;
        off.y -= dy * drag;
      }
    }
    prev = t;

    for (let s = dt; s > 1e-6; s -= 1 / 240) {
      const h = Math.min(s, 1 / 240);
      off.vx += (-K * off.x - C * off.vx) * h;
      off.vy += (-K * off.y - C * off.vy) * h;
      off.x += off.vx * h;
      off.y += off.vy * h;
    }

    const settled = Math.hypot(off.x, off.y) < 0.3 && Math.hypot(off.vx, off.vy) < 4;
    if (settled) off.x = off.y = off.vx = off.vy = 0;

    const x = t.x + off.x;
    const y = t.y + off.y;
    // il s'étire dans le sens de sa course quand il va vite
    const vx = dt > 0 ? (x - px) / dt : 0;
    const vy = dt > 0 ? (y - py) / dt : 0;
    px = x;
    py = y;
    const speed = Math.hypot(vx, vy);
    stretch += (Math.min(speed / 2600, 0.8) - stretch) * Math.min(dt * 14, 1);
    const angle = Math.atan2(vy, vx);

    el.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;

    // vers le voyant : il rétrécit à sa taille selon la distance restante (lissé, donc sans saut au départ)
    const dv = t.vSize ? Math.hypot(x - t.vx, y - t.vy) : Infinity;
    const wantShrink = t.vSize ? 1 - (1 - t.vSize / size) * (1 - smooth(clamp(dv / 220, 0, 1))) : 1;
    shrink += (wantShrink - shrink) * Math.min(dt * 12, 1);
    if (Math.abs(shrink - wantShrink) < 0.002) shrink = wantShrink;

    // posé sur le voyant : il s'y fond (hystérésis pour ne pas clignoter pendant un petit défilement)
    setFed(t.vSize ? (fed ? dv < 14 : settled && dv < 1.5) : false);

    const sq = stretch > 0.01 ? `rotate(${angle.toFixed(3)}rad) scale(${(1 + stretch).toFixed(3)}, ${(1 / (1 + stretch * 0.6)).toFixed(3)})` : "";
    body.style.transform = shrink !== 1 ? `scale(${shrink.toFixed(3)}) ${sq}` : sq;

    if (settled && pulse) {
      pulse = false;
      if (!fed) land();
    }
    if (!settled || stretch > 0.01 || shrink !== wantShrink || now - lastScroll < 120) raf = requestAnimationFrame(tick);
  }

  let lastScroll = 0;
  function kick() {
    lastScroll = performance.now();
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  window.addEventListener("scroll", kick, { passive: true });
  window.addEventListener("resize", () => {
    setSize();
    kick();
  });
  // la page bouge aussi sans défilement : apparition des projets, images qui se chargent
  document.addEventListener("transitionend", kick, true);
  if ("ResizeObserver" in window) new ResizeObserver(kick).observe(document.body);
  el.addEventListener("animationend", (e) => {
    if (e.animationName === "scroll-dot-ring") el.classList.remove("is-landing", "is-born");
  });
  kick();

  return {
    setSource(x, y) {
      source = { x, y };
      if (window.scrollY >= handoff) kick();
    },
    setHandoff(s) {
      if (s === handoff) return;
      handoff = s;
      kick();
    },
  };
}
