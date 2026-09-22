# 📍 DescartesGuessr

Un GeoGuessr limité à la **Cité Descartes** (Champs-sur-Marne / Noisy-le-Grand), avec des photos
[Panoramax](https://panoramax.fr) affichées **très zoomées** : on peut regarder autour de soi, mais jamais dézoomer.

## Principe

- 5 manches par partie. À chaque manche, une photo Panoramax prise dans la zone est tirée au hasard, avec au moins 80 m entre deux lieux.
- **Photos 360°** : champ de vision verrouillé à 25°, orientation de départ aléatoire. On peut tourner la tête, pas zoomer.
- **Photos classiques** : image agrandie ×3,5, recadrage de départ aléatoire. On peut se déplacer dans l'image en la faisant glisser.
- On place sa réponse sur la carte (OpenStreetMap). Score : `5000 × exp(−d / 200 m)`, maximal sous 10 m.
- Le meilleur score est gardé dans le navigateur.

Les photos sont récupérées directement depuis le navigateur via l'API publique et fédérée de Panoramax
(`https://api.panoramax.xyz/api/search?bbox=…`), sans clé ni serveur.

## Développement

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests unitaires (vitest)
npm run build    # site statique dans dist/
```

## Réglages

Tout se trouve dans [`src/config.ts`](src/config.ts) :

| Constante | Rôle |
| --- | --- |
| `ZONE_POLYGON` | contour de la zone de jeu (les photos hors polygone sont ignorées) |
| `ROUNDS` | nombre de manches |
| `SPHERE_FOV` | champ de vision des photos 360° (plus petit = plus zoomé = plus dur) |
| `FLAT_ZOOM` | facteur de zoom des photos classiques |
| `SCORE_SCALE_METERS` | sévérité du barème |

## Déploiement

Le workflow `.github/workflows/deploy.yml` publie le site sur GitHub Pages à chaque push sur `main`.
Il faut d'abord activer Pages avec la source « GitHub Actions » dans les réglages du dépôt.

## Pourquoi pas Google Street View ?

L'API Street View exige une clé Google Maps avec facturation activée, et ses conditions d'utilisation
encadrent strictement la réutilisation des images. Panoramax est un commun libre (licences ouvertes), accessible sans clé.

## Crédits

Photos : contributeurs Panoramax (auteur et licence affichés pendant la partie). Fond de carte : © OpenStreetMap.
