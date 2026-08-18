# Portfolio — Esref Aksu

Portfolio statique d’Esref Aksu, ingénieur et développeur full stack freelance.

## Direction

Le site transpose l’identité de la carte de visite imprimée — charbon, vert et
monogramme `<EA/>` — dans une mise en page éditoriale plus claire. Les projets
et leur contexte métier structurent la page ; les effets décoratifs restent
volontairement limités.

## Structure

```text
portfolio-frontend/
├── index.html
├── mentions-legales.html
├── styles.css
├── script.js
├── CNAME
└── assets/
    ├── favicon.svg
    ├── og-image.jpg
    └── projets/
```

## Développement local

Le projet ne nécessite ni compilation ni dépendance JavaScript.

```bash
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000`.

## Points à vérifier avant publication

- navigation et formulaire au clavier ;
- mises en page à 320, 375, 768, 1024 et 1440 px ;
- envoi réel du formulaire Web3Forms ;
- liens externes et métadonnées sociales ;
- résultats Lighthouse mobile.

Le domaine de production est configuré par `CNAME` pour GitHub Pages.
