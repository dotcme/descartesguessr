import { describe, expect, it } from 'vitest';
import { MAX_SCORE, ZONE_POLYGON, type LonLat } from '../src/config';
import { formatDistance, haversine, pickSpread, pointInPolygon, score } from '../src/geo';
import { parseItem } from '../src/panoramax';

const ENPC: LonLat = [2.5874, 48.841];
const RER_NOISY_CHAMPS: LonLat = [2.579, 48.843];

describe('haversine', () => {
  it('vaut 0 pour un même point', () => {
    expect(haversine(ENPC, ENPC)).toBe(0);
  });
  it('donne une distance plausible entre ENPC et la gare RER', () => {
    const d = haversine(ENPC, RER_NOISY_CHAMPS);
    expect(d).toBeGreaterThan(600);
    expect(d).toBeLessThan(700);
  });
  it('est symétrique', () => {
    expect(haversine(ENPC, RER_NOISY_CHAMPS)).toBeCloseTo(haversine(RER_NOISY_CHAMPS, ENPC), 6);
  });
});

describe('pointInPolygon', () => {
  it('inclut les lieux de la Cité Descartes', () => {
    expect(pointInPolygon(ENPC, ZONE_POLYGON)).toBe(true);
    expect(pointInPolygon(RER_NOISY_CHAMPS, ZONE_POLYGON)).toBe(true);
  });
  it('exclut Paris', () => {
    expect(pointInPolygon([2.3522, 48.8566], ZONE_POLYGON)).toBe(false);
  });
});

describe('score', () => {
  it('donne le max pour une réponse quasi parfaite', () => {
    expect(score(0)).toBe(MAX_SCORE);
    expect(score(10)).toBe(MAX_SCORE);
  });
  it('décroît avec la distance', () => {
    expect(score(50)).toBeGreaterThan(score(200));
    expect(score(200)).toBeGreaterThan(score(1000));
    expect(score(3000)).toBeLessThan(10);
  });
});

describe('formatDistance', () => {
  it('affiche en m ou en km', () => {
    expect(formatDistance(42.4)).toBe('42 m');
    expect(formatDistance(1234)).toBe('1.23 km');
  });
});

describe('pickSpread', () => {
  it('respecte la distance minimale entre les lieux tirés', () => {
    const pts: LonLat[] = Array.from({ length: 200 }, (_, i) => [2.58 + (i % 20) * 0.0005, 48.838 + Math.floor(i / 20) * 0.0005]);
    const picked = pickSpread(pts, 5, 80, (p) => p);
    expect(picked).toHaveLength(5);
    for (let i = 0; i < picked.length; i++)
      for (let j = i + 1; j < picked.length; j++) expect(haversine(picked[i], picked[j])).toBeGreaterThanOrEqual(80);
  });
  it('renvoie moins d’éléments si la contrainte est impossible', () => {
    const pts: LonLat[] = [ENPC, [2.58741, 48.84101]];
    expect(pickSpread(pts, 5, 80, (p) => p)).toHaveLength(1);
  });
});

describe('parseItem', () => {
  it('lit un item STAC Panoramax', () => {
    const pic = parseItem({
      id: 'abc',
      collection: 'seq',
      geometry: { type: 'Point', coordinates: ENPC },
      properties: {
        datetime: '2024-05-01T10:00:00Z',
        'view:azimuth': 90,
        'pers:interior_orientation': { field_of_view: 360 },
        'geovisio:producer': 'Alice',
        license: 'CC-BY-SA-4.0',
      },
      assets: { hd: { href: 'https://x/hd.jpg' }, sd: { href: 'https://x/sd.jpg' } },
    });
    expect(pic).toMatchObject({ id: 'abc', coords: ENPC, hd: 'https://x/hd.jpg', is360: true, author: 'Alice', license: 'CC-BY-SA-4.0' });
  });
  it('ignore un item sans image', () => {
    expect(parseItem({ id: 'x', geometry: { type: 'Point', coordinates: ENPC } })).toBeNull();
  });
});
