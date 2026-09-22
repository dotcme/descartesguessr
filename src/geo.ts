import { MAX_SCORE, PERFECT_METERS, SCORE_SCALE_METERS, type LonLat } from './config';

const EARTH_RADIUS = 6371008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Distance en mètres entre deux points [lon, lat]. */
export function haversine(a: LonLat, b: LonLat): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Test point-dans-polygone (ray casting). */
export function pointInPolygon(point: LonLat, polygon: LonLat[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function score(distanceMeters: number): number {
  if (distanceMeters <= PERFECT_METERS) return MAX_SCORE;
  return Math.round(MAX_SCORE * Math.exp(-(distanceMeters - PERFECT_METERS) / SCORE_SCALE_METERS));
}

export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

/**
 * Tire jusqu'à `count` éléments au hasard, en garantissant qu'ils soient
 * espacés d'au moins `minSpread` mètres (si possible).
 */
export function pickSpread<T>(
  items: T[],
  count: number,
  minSpread: number,
  coords: (item: T) => LonLat,
  random: () => number = Math.random,
): T[] {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked: T[] = [];
  for (const item of pool) {
    if (picked.length >= count) break;
    if (picked.every((p) => haversine(coords(p), coords(item)) >= minSpread)) picked.push(item);
  }
  return picked;
}
