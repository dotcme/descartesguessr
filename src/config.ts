/** Coordonnées au format [lon, lat]. */
export type LonLat = [number, number];

/**
 * Contour approximatif de la Cité Descartes (Champs-sur-Marne / Noisy-le-Grand) :
 * gare RER Noisy-Champs, ENPC, Université Gustave Eiffel, ESIEE, Descartes 2…
 */
export const ZONE_POLYGON: LonLat[] = [
  [2.5735, 48.8405],
  [2.5745, 48.8445],
  [2.5830, 48.8478],
  [2.5950, 48.8468],
  [2.6010, 48.8420],
  [2.6000, 48.8360],
  [2.5880, 48.8332],
  [2.5770, 48.8352],
];

/** Boîte englobante [minLon, minLat, maxLon, maxLat] dérivée du polygone. */
export const ZONE_BBOX: [number, number, number, number] = [
  Math.min(...ZONE_POLYGON.map((p) => p[0])),
  Math.min(...ZONE_POLYGON.map((p) => p[1])),
  Math.max(...ZONE_POLYGON.map((p) => p[0])),
  Math.max(...ZONE_POLYGON.map((p) => p[1])),
];

export const MAP_CENTER: [number, number] = [48.8405, 2.5870]; // [lat, lon] pour Leaflet

export const PANORAMAX_API = 'https://api.panoramax.xyz/api';
export const PANORAMAX_VIEWER = 'https://api.panoramax.xyz/';

export const ROUNDS = 5;
/** Distance minimale entre deux lieux tirés dans une même partie. */
export const MIN_SPREAD_METERS = 80;
/** Nombre max de pages de résultats à parcourir sur l'API. */
export const MAX_PAGES = 5;
export const PAGE_LIMIT = 1000;

/**
 * Champ de vision (degrés) verrouillé pour les photos 360°. Plus petit = plus dur,
 * mais en dessous de ~20° les panoramas (≈ 5 700 px de large) deviennent flous.
 */
export const SPHERE_FOV = 25;
/** Facteur de zoom appliqué aux photos classiques (non 360°). */
export const FLAT_ZOOM = 3.5;

export const MAX_SCORE = 5000;
/** Distance (m) à laquelle le score tombe à ~37 % du max. */
export const SCORE_SCALE_METERS = 200;
/** En dessous de cette distance, score maximal. */
export const PERFECT_METERS = 10;
