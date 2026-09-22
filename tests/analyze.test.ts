import { describe, expect, it } from 'vitest';
import { chooseFlatView, chooseSphereView, isUsableImage, regionStats, type LumaGrid } from '../src/analyze';

/** Grille w×h remplie par une fonction (x, y normalisés) → luminance. */
function grid(w: number, h: number, f: (x: number, y: number) => number): LumaGrid {
  const data = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data[y * w + x] = f(x / w, y / h);
  return { w, h, data };
}

/** Motif en damier (contrasté) sur une zone, noir ailleurs. */
const checker = (x: number, y: number) => ((Math.floor(x * 200) + Math.floor(y * 100)) % 2 ? 0.8 : 0.3);

describe('isUsableImage', () => {
  it('rejette une image noire', () => {
    expect(isUsableImage(grid(64, 32, () => 0))).toBe(false);
  });
  it('rejette une image uniforme', () => {
    expect(isUsableImage(grid(64, 32, () => 0.5))).toBe(false);
  });
  it('rejette une photo de nuit', () => {
    expect(isUsableImage(grid(64, 32, (x, y) => checker(x, y) * 0.1))).toBe(false);
  });
  it('accepte une image contrastée', () => {
    expect(isUsableImage(grid(64, 32, checker))).toBe(true);
  });
});

describe('regionStats', () => {
  it('boucle en x pour les panoramas', () => {
    const g = grid(100, 10, (x) => (x < 0.1 ? 1 : 0));
    expect(regionStats(g, -0.05, 0, 0.05, 1, true).mean).toBeCloseTo(0.5, 1);
    expect(regionStats(g, 0.5, 0, 0.6, 1, true).mean).toBe(0);
  });
});

describe('chooseSphereView', () => {
  it('vise la seule zone détaillée du panorama', () => {
    // Détails uniquement sur x ∈ [0.70, 0.85] : yaw attendu ≈ (0.775 − 0.5) × 2π
    const g = grid(512, 256, (x, y) => (x > 0.7 && x < 0.85 ? checker(x, y) : 0.02));
    for (let i = 0; i < 20; i++) {
      const v = chooseSphereView(g, 25, 1.6)!;
      const cx = (v.yaw / (2 * Math.PI) + 0.5) % 1;
      expect(cx).toBeGreaterThan(0.68);
      expect(cx).toBeLessThan(0.87);
    }
  });
  it('renvoie null si rien n’est exploitable', () => {
    expect(chooseSphereView(grid(128, 64, () => 0.03), 25, 1.6)).toBeNull();
  });
});

describe('chooseFlatView', () => {
  it('évite les zones noires', () => {
    const g = grid(256, 192, (x, y) => (x < 0.4 && y > 0.5 ? checker(x, y) : 0));
    for (let i = 0; i < 20; i++) {
      const v = chooseFlatView(g, 0.28, 0.28)!;
      expect(v.u).toBeLessThan(0.4);
      expect(v.v).toBeGreaterThan(0.5);
    }
  });
});
