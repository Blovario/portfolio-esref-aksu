document.documentElement.classList.add("js");

(function () {
  "use strict";

  const header = document.querySelector(".site-header");
  const menuToggle = document.querySelector(".menu-toggle");
  const navigation = document.querySelector(".nav-list");
  const navLinks = [...document.querySelectorAll(".nav-link")];

  function closeMenu({ restoreFocus = false } = {}) {
    if (!menuToggle || !navigation) return;

    navigation.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    menuToggle.setAttribute("aria-label", "Ouvrir le menu");
    document.body.classList.remove("nav-open");

    if (restoreFocus) menuToggle.focus();
  }

  function openMenu() {
    if (!menuToggle || !navigation) return;

    navigation.classList.add("is-open");
    menuToggle.setAttribute("aria-expanded", "true");
    menuToggle.setAttribute("aria-label", "Fermer le menu");
    document.body.classList.add("nav-open");
    navigation.querySelector("a")?.focus();
  }

  menuToggle?.addEventListener("click", () => {
    const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
    isOpen ? closeMenu() : openMenu();
  });

  navLinks.forEach((link) => link.addEventListener("click", () => closeMenu()));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navigation?.classList.contains("is-open")) {
      closeMenu({ restoreFocus: true });
      return;
    }

    if (event.key !== "Tab" || !navigation?.classList.contains("is-open")) return;

    const focusable = [menuToggle, ...navigation.querySelectorAll("a")].filter(Boolean);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 800) closeMenu();
  });

  function updateHeader() {
    header?.classList.toggle("is-scrolled", window.scrollY > 12);
  }

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const revealElements = document.querySelectorAll("[data-reveal]");

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -5%" }
    );

    revealElements.forEach((element) => revealObserver.observe(element));
  } else {
    revealElements.forEach((element) => element.classList.add("is-visible"));
  }

  const observedSections = document.querySelectorAll("main section[id]");

  if ("IntersectionObserver" in window && navLinks.length) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          navLinks.forEach((link) => {
            const isCurrent = link.getAttribute("href") === `#${entry.target.id}`;
            link.classList.toggle("is-active", isCurrent);
            if (isCurrent) link.setAttribute("aria-current", "location");
            else link.removeAttribute("aria-current");
          });
        });
      },
      { rootMargin: "-30% 0px -60%", threshold: 0 }
    );

    observedSections.forEach((section) => sectionObserver.observe(section));
  }

  // Heure locale à Vendôme, mise à jour chaque minute
  const localTime = document.querySelector("#local-time");

  function updateClock() {
    if (!localTime) return;
    const now = new Date();
    const time = new Intl.DateTimeFormat("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    }).format(now);
    const hour = Number(
      new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Paris" }).format(now)
    );
    localTime.textContent = `il est ${time.replace(":", " h ")}`;
    localTime.setAttribute("datetime", now.toISOString());
    document.querySelector(".contact-clock")?.classList.toggle("is-night", hour >= 21 || hour < 8);
  }

  updateClock();
  setInterval(updateClock, 30000);

  const form = document.querySelector("#contact-form");
  const formResult = document.querySelector("#form-result");

  function showFormResult(message, type) {
    if (!formResult) return;
    formResult.textContent = message;
    formResult.className = `form-result is-${type}`;
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    const submitButton = form.querySelector('button[type="submit"]');
    const initialLabel = submitButton?.innerHTML;

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Envoi en cours…";
      }

      showFormResult("", "success");

      const response = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });

      const data = await response.json();

      if (!response.ok || data.success === false) {
        throw new Error("Le service de contact a refusé la demande.");
      }

      form.reset();
      window.umami?.track("Formulaire envoyé");
      showFormResult("Message envoyé. Merci — je vous répondrai rapidement.", "success");
    } catch (error) {
      showFormResult(
        "L’envoi n’a pas abouti. Vous pouvez m’écrire directement à contact@esref-aksu.com.",
        "error"
      );
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.innerHTML = initialLabel;
      }
    }
  });
  // Compteur de projet du header : suit le repère actif du point vert (événement dot:active de dot.js).
  // Sans effet si l'événement n'arrive jamais (mouvements réduits : le point n'existe pas).
  const headerCount = document.querySelector(".header-count");
  const countRoll = headerCount ? [...headerCount.querySelectorAll(".header-roll span")] : [];

  if (headerCount && countRoll.length === 2) {
    const total = document.querySelectorAll(".project-kicker").length;
    const pad = (n) => String(n).padStart(2, "0");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    headerCount.querySelector(".header-total").textContent = pad(total);
    let shown = countRoll[0];
    let hidden = countRoll[1];
    let current = 0;
    let token = 0;
    hidden.style.visibility = "hidden";

    document.addEventListener("dot:active", (e) => {
      const { index, kind } = e.detail || {};
      const isProject = kind === "project" && index >= 0 && index < total;
      headerCount.classList.toggle("is-visible", isProject);
      if (!isProject) return;
      const n = index + 1;
      if (n === current) return;
      const from = current;
      current = n;
      if (!from || reduced.matches) {
        shown.textContent = pad(n);
        return;
      }
      // l'ancien chiffre sort vers le haut, le nouveau entre par le bas (sens inverse en remontant)
      const dir = n > from ? 1 : -1;
      const mine = ++token;
      countRoll.forEach((c) => c.getAnimations().forEach((a) => a.cancel()));
      hidden.textContent = pad(n);
      hidden.style.visibility = "";
      const opts = { duration: 350, easing: "cubic-bezier(0.5, 0, 0.2, 1)", fill: "forwards" };
      const out = shown;
      const incoming = hidden;
      out.animate([{ transform: "none" }, { transform: `translateY(${-dir * 100}%)` }], opts);
      incoming.animate([{ transform: `translateY(${dir * 100}%)` }, { transform: "none" }], opts).finished.then(
        () => {
          if (mine !== token) return;
          out.getAnimations().forEach((a) => a.cancel());
          incoming.getAnimations().forEach((a) => a.cancel());
          out.style.visibility = "hidden";
        },
        () => {}
      );
      shown = incoming;
      hidden = out;
    });
  }
})();
