// Portfolio JavaScript
(function () {
  "use strict";

  // DOM Elements
  const navToggle = document.querySelector(".nav-toggle");
  const navMenu = document.querySelector(".nav-menu");
  const themeToggle = document.querySelector(".theme-toggle");
  const navLinks = document.querySelectorAll(".nav-link");

  // Theme Management
  class ThemeManager {
    constructor() {
      this.init();
    }

    init() {
      // Déterminer le thème initial
      const savedTheme = localStorage.getItem("theme");
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;

      // Utiliser le thème sauvegardé, sinon détecter la préférence système
      this.currentTheme = savedTheme || (prefersDark ? "dark" : "light");

      this.applyTheme(this.currentTheme);
      this.setupEventListeners();
      this.watchSystemTheme();
    }

    applyTheme(theme) {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);
      this.currentTheme = theme;
    }

    toggleTheme() {
      const newTheme = this.currentTheme === "light" ? "dark" : "light";
      this.applyTheme(newTheme);
    }

    watchSystemTheme() {
      // Écouter les changements de préférence système
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

      mediaQuery.addEventListener("change", (e) => {
        // Ne changer automatiquement que si l'utilisateur n'a pas de préférence sauvegardée
        const savedTheme = localStorage.getItem("theme");
        if (!savedTheme) {
          const newTheme = e.matches ? "dark" : "light";
          this.applyTheme(newTheme);
        }
      });
    }

    setupEventListeners() {
      if (themeToggle) {
        themeToggle.addEventListener("click", () => this.toggleTheme());
      }
    }
  }

  // Navigation Management
  class NavigationManager {
    constructor() {
      this.isMenuOpen = false;
      this.init();
    }

    init() {
      this.setupEventListeners();
      this.setupSmoothScrolling();
    }

    setupEventListeners() {
      if (navToggle) {
        navToggle.addEventListener("click", () => this.toggleMenu());
      }

      // Close menu when clicking on nav links
      navLinks.forEach((link) => {
        link.addEventListener("click", () => {
          if (window.innerWidth < 768) {
            this.closeMenu();
          }
        });
      });

      // Close menu when clicking outside
      document.addEventListener("click", (e) => {
        if (
          this.isMenuOpen &&
          !navMenu.contains(e.target) &&
          !navToggle.contains(e.target)
        ) {
          this.closeMenu();
        }
      });

      // Close menu on escape key
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.isMenuOpen) {
          this.closeMenu();
        }
      });

      // Handle window resize
      window.addEventListener("resize", () => {
        if (window.innerWidth >= 768) {
          this.closeMenu();
        }
      });
    }

    toggleMenu() {
      this.isMenuOpen ? this.closeMenu() : this.openMenu();
    }

    openMenu() {
      navMenu.classList.add("active");
      navToggle.setAttribute("aria-expanded", "true");
      this.isMenuOpen = true;

      // Prevent body scroll
      document.body.style.overflow = "hidden";
    }

    closeMenu() {
      navMenu.classList.remove("active");
      navToggle.setAttribute("aria-expanded", "false");
      this.isMenuOpen = false;

      // Restore body scroll
      document.body.style.overflow = "";
    }

    setupSmoothScrolling() {
      navLinks.forEach((link) => {
        link.addEventListener("click", (e) => {
          const href = link.getAttribute("href");

          // Only handle anchor links
          if (href && href.startsWith("#")) {
            e.preventDefault();
            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
              const headerHeight =
                document.querySelector(".header").offsetHeight;
              const targetPosition = targetElement.offsetTop - headerHeight;

              window.scrollTo({
                top: targetPosition,
                behavior: "smooth",
              });
            }
          }
        });
      });
    }
  }

  // Scroll Effects
  class ScrollEffects {
    constructor() {
      this.init();
    }

    init() {
      this.setupHeaderScroll();
      this.setupActiveSection();
    }

    setupHeaderScroll() {
      let lastScrollTop = 0;
      const header = document.querySelector(".header");

      window.addEventListener("scroll", () => {
        const scrollTop =
          window.pageYOffset || document.documentElement.scrollTop;

        // Add shadow when scrolled
        if (scrollTop > 10) {
          header.style.boxShadow = "0 2px 20px rgba(0, 0, 0, 0.1)";
        } else {
          header.style.boxShadow = "none";
        }

        lastScrollTop = scrollTop;
      });
    }

    setupActiveSection() {
      const sections = document.querySelectorAll(".section");
      const navLinks = document.querySelectorAll(".nav-link");

      const observerOptions = {
        root: null,
        rootMargin: "-20% 0px -70% 0px",
        threshold: 0,
      };

      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const sectionId = entry.target.id;

            // Update active nav link
            navLinks.forEach((link) => {
              link.classList.remove("active");
              if (link.getAttribute("href") === `#${sectionId}`) {
                link.classList.add("active");
              }
            });
          }
        });
      }, observerOptions);

      sections.forEach((section) => {
        observer.observe(section);
      });
    }
  }

  // Performance Optimizations
  class PerformanceManager {
    constructor() {
      this.init();
    }

    init() {
      this.lazyLoadImages();
      this.optimizeAnimations();
    }

    lazyLoadImages() {
      const images = document.querySelectorAll("img[data-src]");

      if ("IntersectionObserver" in window) {
        const imageObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const img = entry.target;
              img.src = img.dataset.src;
              img.classList.remove("lazy");
              imageObserver.unobserve(img);
            }
          });
        });

        images.forEach((img) => imageObserver.observe(img));
      } else {
        // Fallback for browsers without IntersectionObserver
        images.forEach((img) => {
          img.src = img.dataset.src;
          img.classList.remove("lazy");
        });
      }
    }

    optimizeAnimations() {
      // Reduce animations on low-end devices
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) {
        document.documentElement.style.setProperty(
          "--animation-duration",
          "0.1s"
        );
      }

      // Respect user's motion preferences
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        document.documentElement.style.setProperty(
          "--animation-duration",
          "0.01ms"
        );
      }
    }
  }

  // Form Handling (for contact forms if added later)
  class FormManager {
    constructor() {
      this.init();
    }

    init() {
      this.setupFormValidation();
    }

    setupFormValidation() {
      const forms = document.querySelectorAll("form");

      forms.forEach((form) => {
        form.addEventListener("submit", async (e) => {
          e.preventDefault();
          if (this.validateForm(form)) {
            const submitBtn = form.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn.textContent;
            const resultDiv = document.getElementById("form-result");

            try {
              submitBtn.disabled = true;
              submitBtn.textContent = "Envoi en cours...";

              const formData = new FormData(form);
              const object = Object.fromEntries(formData);
              const json = JSON.stringify(object);

              const response = await fetch("https://api.web3forms.com/submit", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
                body: json,
              });

              const jsonResponse = await response.json();

              if (response.status === 200) {
                if (resultDiv) {
                  resultDiv.innerHTML =
                    '<div class="success-message" style="color: #10b981; margin-bottom: 1rem; padding: 0.5rem; background: rgba(16, 185, 129, 0.1); border-radius: 4px;">Message envoyé avec succès ! Je vous répondrai très bientôt.</div>';
                }
                form.reset();
              } else {
                console.log(response);
                if (resultDiv) {
                  resultDiv.innerHTML =
                    '<div class="error-message" style="color: #ef4444; margin-bottom: 1rem;">Une erreur est survenue. Veuillez réessayer.</div>';
                }
              }
            } catch (error) {
              console.log(error);
              if (resultDiv) {
                resultDiv.innerHTML =
                  '<div class="error-message" style="color: #ef4444; margin-bottom: 1rem;">Une erreur est survenue. Veuillez réessayer.</div>';
              }
            } finally {
              submitBtn.disabled = false;
              submitBtn.textContent = originalBtnText;
              setTimeout(() => {
                if (resultDiv) {
                  resultDiv.innerHTML = "";
                }
              }, 5000);
            }
          }
        });

        // Real-time validation
        const inputs = form.querySelectorAll("input, textarea");
        inputs.forEach((input) => {
          input.addEventListener("blur", () => this.validateField(input));
          input.addEventListener("input", () => this.clearFieldError(input));
        });
      });
    }

    validateForm(form) {
      let isValid = true;
      const inputs = form.querySelectorAll(
        "input[required], textarea[required]"
      );

      inputs.forEach((input) => {
        if (!this.validateField(input)) {
          isValid = false;
        }
      });

      return isValid;
    }

    validateField(field) {
      const value = field.value.trim();
      const type = field.type;
      let isValid = true;
      let errorMessage = "";

      // Required field check
      if (field.hasAttribute("required") && !value) {
        isValid = false;
        errorMessage = "Ce champ est requis";
      }

      // Email validation
      if (type === "email" && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          isValid = false;
          errorMessage = "Veuillez entrer une adresse email valide";
        }
      }

      // Phone validation
      if (type === "tel" && value) {
        const phoneRegex = /^[\+]?[0-9\s\-\(\)]{10,}$/;
        if (!phoneRegex.test(value)) {
          isValid = false;
          errorMessage = "Veuillez entrer un numéro de téléphone valide";
        }
      }

      this.showFieldError(field, errorMessage);
      return isValid;
    }

    showFieldError(field, message) {
      this.clearFieldError(field);

      if (message) {
        field.classList.add("error");
        const errorElement = document.createElement("span");
        errorElement.className = "field-error";
        errorElement.textContent = message;
        field.parentNode.appendChild(errorElement);
      }
    }

    clearFieldError(field) {
      field.classList.remove("error");
      const existingError = field.parentNode.querySelector(".field-error");
      if (existingError) {
        existingError.remove();
      }
    }
  }

  // Accessibility Enhancements
  class AccessibilityManager {
    constructor() {
      this.init();
    }

    init() {
      this.setupKeyboardNavigation();
      this.setupFocusManagement();
      this.setupAriaLabels();
    }

    setupKeyboardNavigation() {
      // Skip link functionality
      const skipLink = document.querySelector(".skip-link");
      if (skipLink) {
        skipLink.addEventListener("click", (e) => {
          e.preventDefault();
          const target = document.querySelector(skipLink.getAttribute("href"));
          if (target) {
            target.focus();
            target.scrollIntoView();
          }
        });
      }
    }

    setupFocusManagement() {
      // Trap focus in mobile menu when open
      const focusableElements =
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

      document.addEventListener("keydown", (e) => {
        if (e.key === "Tab" && navMenu.classList.contains("active")) {
          const focusableContent = navMenu.querySelectorAll(focusableElements);
          const firstFocusableElement = focusableContent[0];
          const lastFocusableElement =
            focusableContent[focusableContent.length - 1];

          if (e.shiftKey) {
            if (document.activeElement === firstFocusableElement) {
              lastFocusableElement.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastFocusableElement) {
              firstFocusableElement.focus();
              e.preventDefault();
            }
          }
        }
      });
    }

    setupAriaLabels() {
      // Ensure all interactive elements have proper ARIA labels
      const buttons = document.querySelectorAll(
        "button:not([aria-label]):not([aria-labelledby])"
      );
      buttons.forEach((button) => {
        if (!button.textContent.trim()) {
          button.setAttribute("aria-label", "Bouton");
        }
      });
    }
  }

  // Error Handling
  class ErrorManager {
    constructor() {
      this.init();
    }

    init() {
      this.setupGlobalErrorHandling();
    }

    setupGlobalErrorHandling() {
      window.addEventListener("error", (e) => {
        console.error("Erreur JavaScript:", e.error);
        // In production, you might want to send this to an error tracking service
      });

      window.addEventListener("unhandledrejection", (e) => {
        console.error("Promesse rejetée non gérée:", e.reason);
        e.preventDefault();
      });
    }
  }

  // Initialize all managers when DOM is ready
  function init() {
    try {
      new ThemeManager();
      new NavigationManager();
      new ScrollEffects();
      new PerformanceManager();
      new FormManager();
      new AccessibilityManager();
      new ErrorManager();

      console.log("Portfolio initialisé avec succès");
    } catch (error) {
      console.error("Erreur lors de l'initialisation:", error);
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Service Worker registration (for PWA features if needed)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("SW enregistré:", registration);
        })
        .catch((registrationError) => {
          console.log("Échec enregistrement SW:", registrationError);
        });
    });
  }
})();
