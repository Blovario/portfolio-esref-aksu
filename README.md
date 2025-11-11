# Portfolio Eşref Aksu

Site portfolio personnel de Eşref Aksu, développeur Full Stack spécialisé en backend, frontend, dApps Solidity et prompt engineering.

## 🚀 Fonctionnalités

- **Design responsive** : Optimisé mobile-first
- **Thème sombre/clair** : Toggle avec persistance localStorage
- **Navigation fluide** : Menu burger mobile + navigation par ancres
- **Accessibilité** : ARIA labels, focus visible, contraste optimisé
- **Performance** : CSS/JS optimisés, sans dépendances externes
- **SEO** : Meta tags, Open Graph, structure sémantique

## 📁 Structure

```
portfolio-frontend/
├── index.html          # Page principale
├── styles.css          # Styles CSS avec thème sombre
├── script.js           # JavaScript (menu, thème, interactions)
├── assets/
│   └── favicon.svg     # Icône du site
├── cv/
│   └── cv-esref-aksu.pdf # CV téléchargeable
└── README.md           # Documentation
```

## 🎨 Personnalisation

### Modifier les couleurs

Dans `styles.css`, modifiez les variables CSS :

```css
:root {
  --accent: #6366f1; /* Couleur principale */
  --accent-hover: #4f46e5; /* Couleur hover */
  --bg-primary: #ffffff; /* Arrière-plan principal */
  --text-primary: #1e293b; /* Texte principal */
}
```

### Modifier les textes

Éditez directement `index.html` :

- **Nom/titre** : Sections `.hero-title` et `.hero-subtitle`
- **Description** : Section `.hero-description`
- **Expérience** : Section `#experience`
- **Formation** : Section `#formation`
- **Compétences** : Section `#competences`
- **Projets** : Section `#projets`
- **Contact** : Section `#contact`

### Ajouter un projet

1. Dans `index.html`, section `#projets` :

```html
<div class="project-card">
  <h3 class="project-title">Mon Nouveau Projet</h3>
  <p class="project-description">Description du projet...</p>
  <a
    href="https://lien-projet.com"
    class="project-link"
    target="_blank"
    rel="noopener noreferrer"
  >
    Voir le projet
    <svg><!-- icône externe --></svg>
  </a>
</div>
```

### Modifier les réseaux sociaux

Dans `index.html`, section contact :

```html
<a href="https://github.com/VOTRE-USERNAME" class="social-link">
  <a href="https://linkedin.com/in/VOTRE-USERNAME" class="social-link"></a
></a>
```

## 🚀 Déploiement

### GitHub Pages

1. Poussez le code sur GitHub
2. Allez dans Settings > Pages
3. Sélectionnez la branche `main`
4. Votre site sera disponible à `https://username.github.io/portfolio-frontend`

### Netlify

1. Connectez votre repo GitHub à Netlify
2. Build command : laisser vide
3. Publish directory : `/`
4. Déployement automatique à chaque push

### Vercel

1. Importez votre repo GitHub sur Vercel
2. Framework Preset : Other
3. Build Command : laisser vide
4. Output Directory : laisser vide

## 🔧 Développement local

```bash
# Cloner le repo
git clone https://github.com/username/portfolio-frontend.git
cd portfolio-frontend

# Servir localement (Python)
python -m http.server 8000

# Ou avec Node.js
npx serve .

# Ou avec PHP
php -S localhost:8000
```

Ouvrez `http://localhost:8000` dans votre navigateur.

## 📱 Tests

### Lighthouse (Chrome DevTools)

1. Ouvrir DevTools (F12)
2. Onglet Lighthouse
3. Lancer l'audit mobile
4. Score attendu : ≥90 pour Performance, Accessibilité, SEO

### Tests manuels

- [ ] Navigation mobile (menu burger)
- [ ] Toggle thème sombre/clair
- [ ] Liens de navigation (ancres)
- [ ] Téléchargement CV
- [ ] Liens externes (GitHub, LinkedIn)
- [ ] Responsive design (mobile, tablette, desktop)

## 🎯 Optimisations incluses

- **CSS** : Variables CSS, Grid/Flexbox, animations optimisées
- **JavaScript** : Modules ES6, gestion d'erreurs, performance
- **HTML** : Sémantique HTML5, ARIA labels, meta tags
- **Images** : SVG optimisé, lazy loading ready
- **Accessibilité** : Focus management, keyboard navigation
- **Performance** : Code minifié, pas de dépendances

## 📞 Support

Pour toute question ou suggestion :

- Email : esref.aksu.pro@gmail.com
- GitHub : [Issues](https://github.com/username/portfolio-frontend/issues)

## 📄 Licence

MIT License - Libre d'utilisation et modification.

