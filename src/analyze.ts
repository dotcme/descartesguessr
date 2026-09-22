/**
 * Analyse de luminosité des photos : permet d'écarter les images noires ou de nuit,
 * et de choisir un cadrage zoomé qui montre vraiment quelque chose (pas un bout
 * de ciel uni, de bitume ou d'ombre).
 */

/** Carte de luminance réduite (valeurs 0–1, ligne par ligne). */
export interface LumaGrid {
  w: number;
  h: number;
  data: Float32Array;
}

export interface RegionStats {
  mean: number;
  std: number;
  /** Proportion de pixels quasi noirs. */
  dark: number;
}

/** Luminance sous laquelle un pixel est considéré comme noir. */
export const DARK_PIXEL = 0.08;
/** Proportion maximale de pixels noirs dans un cadrage. */
export const MAX_VIEW_DARK = 0.25;

/** Luminance moyenne en dessous de laquelle une photo est jugée inexploitable. */
export const MIN_IMAGE_MEAN = 0.12;
/** Écart-type global minimal : en dessous, l'image est quasi uniforme (noire, grise…). */
export const MIN_IMAGE_STD = 0.04;
/** Un cadrage doit être au moins aussi lumineux et contrasté que ça. */
export const MIN_VIEW_MEAN = 0.15;
export const MAX_VIEW_MEAN = 0.92;
export const MIN_VIEW_STD = 0.05;

export function lumaFromRgba(rgba: Uint8ClampedArray, w: number, h: number): LumaGrid {
  const data = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    data[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  return { w, h, data };
}

/**
 * Statistiques sur une région en coordonnées normalisées [0, 1].
 * En x, la région peut déborder et boucler (utile pour les panoramas 360°).
 */
export function regionStats(g: LumaGrid, x0: number, y0: number, x1: number, y1: number, wrapX = false): RegionStats {
  const py0 = Math.max(0, Math.floor(y0 * g.h));
  const py1 = Math.min(g.h, Math.max(py0 + 1, Math.ceil(y1 * g.h)));
  let px0 = Math.floor(x0 * g.w);
  let px1 = Math.max(px0 + 1, Math.ceil(x1 * g.w));
  if (!wrapX) {
    px0 = Math.max(0, px0);
    px1 = Math.min(g.w, px1);
  }
  let sum = 0;
  let sum2 = 0;
  let dark = 0;
  let n = 0;
  for (let y = py0; y < py1; y++) {
    for (let x = px0; x < px1; x++) {
      const xx = ((x % g.w) + g.w) % g.w;
      const v = g.data[y * g.w + xx];
      sum += v;
      sum2 += v * v;
      if (v < DARK_PIXEL) dark++;
      n++;
    }
  }
  if (!n) return { mean: 0, std: 0, dark: 1 };
  const mean = sum / n;
  return { mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), dark: dark / n };
}

/** La photo entière est-elle exploitable (ni noire, ni uniforme) ? */
export function isUsableImage(g: LumaGrid): boolean {
  const s = regionStats(g, 0, 0, 1, 1);
  return s.mean >= MIN_IMAGE_MEAN && s.std >= MIN_IMAGE_STD;
}

/**
 * Note d'intérêt d'un cadrage : 0 s'il est trop sombre / cramé / uniforme
 * ou s'il contient trop de noir (le contraste noir/clair ne doit pas être récompensé).
 */
export function viewScore(s: RegionStats): number {
  if (s.mean < MIN_VIEW_MEAN || s.mean > MAX_VIEW_MEAN || s.std < MIN_VIEW_STD || s.dark > MAX_VIEW_DARK) return 0;
  return s.std * (1 - s.dark / MAX_VIEW_DARK);
}

/**
 * Choisit au hasard parmi les meilleurs candidats (on garde de la variété
 * plutôt que de toujours prendre le cadrage le plus contrasté).
 */
export function pickGood<T>(candidates: { item: T; score: number }[], random: () => number = Math.random): T | null {
  const ok = candidates.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  if (!ok.length) return null;
  const top = ok.slice(0, Math.max(1, Math.ceil(ok.length * 0.4)));
  return top[Math.floor(random() * top.length)].item;
}

/**
 * Pour un panorama équirectangulaire : choisit une orientation (yaw, pitch en radians)
 * dont la vue zoomée (champ vertical `fovDeg`, rapport d'aspect `aspect`) est intéressante.
 * Convention Photo Sphere Viewer : yaw 0 = centre de l'image.
 */
export function chooseSphereView(
  g: LumaGrid,
  fovDeg: number,
  aspect: number,
  random: () => number = Math.random,
): { yaw: number; pitch: number } | null {
  const vSpan = fovDeg / 180;
  const hSpan = Math.min(1, (fovDeg * aspect) / 360);
  const candidates: { item: { yaw: number; pitch: number }; score: number }[] = [];
  const steps = 36;
  for (let i = 0; i < steps; i++) {
    const yaw = ((i + random() * 0.5) / steps) * 2 * Math.PI;
    for (const pitchDeg of [-6, -2, 2, 6]) {
      const pitch = (pitchDeg * Math.PI) / 180;
      const cx = (yaw / (2 * Math.PI) + 0.5) % 1;
      const cy = 0.5 - pitch / Math.PI;
      const s = regionStats(g, cx - hSpan / 2, cy - vSpan / 2, cx + hSpan / 2, cy + vSpan / 2, true);
      candidates.push({ item: { yaw, pitch }, score: viewScore(s) });
    }
  }
  return pickGood(candidates, random);
}

/**
 * Pour une photo classique : choisit le centre (u, v) normalisé d'une fenêtre
 * de taille relative (fw, fh).
 */
export function chooseFlatView(
  g: LumaGrid,
  fw: number,
  fh: number,
  random: () => number = Math.random,
): { u: number; v: number } | null {
  const candidates: { item: { u: number; v: number }; score: number }[] = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const u = fw / 2 + ((i + 0.5) / n) * Math.max(0, 1 - fw);
      const v = fh / 2 + ((j + 0.5) / n) * Math.max(0, 1 - fh);
      const s = regionStats(g, u - fw / 2, v - fh / 2, u + fw / 2, v + fh / 2);
      candidates.push({ item: { u, v }, score: viewScore(s) });
    }
  }
  return pickGood(candidates, random);
}

/**
 * Télécharge une image et calcule sa carte de luminance réduite.
 * Renvoie aussi une URL locale (blob:) pour ne pas retélécharger l'image.
 * Lève une erreur si le téléchargement échoue (CORS, 404…).
 */
export async function loadWithLuma(url: string, gridWidth = 256): Promise<{ objectUrl: string; luma: LumaGrid }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const w = gridWidth;
  const h = Math.max(1, Math.round((bitmap.height / bitmap.width) * gridWidth));
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const luma = lumaFromRgba(ctx.getImageData(0, 0, w, h).data, w, h);
  return { objectUrl: URL.createObjectURL(blob), luma };
}
