import {
  MAX_PAGES,
  PAGE_LIMIT,
  PANORAMAX_API,
  PANORAMAX_VIEWER,
  ZONE_BBOX,
  ZONE_POLYGON,
  type LonLat,
} from './config';
import { pointInPolygon } from './geo';

export interface Picture {
  id: string;
  sequence?: string;
  coords: LonLat;
  /** URL de l'image en haute définition. */
  hd: string;
  /** URL de secours en définition standard. */
  sd?: string;
  is360: boolean;
  azimuth?: number;
  date?: string;
  author?: string;
  license?: string;
}

interface StacLink {
  rel: string;
  href: string;
}

interface StacItem {
  id: string;
  collection?: string;
  geometry?: { type: string; coordinates: number[] };
  properties?: Record<string, any>;
  providers?: { name?: string; roles?: string[] }[];
  assets?: Record<string, { href?: string } | undefined>;
  links?: StacLink[];
}

interface StacCollection {
  features?: StacItem[];
  links?: StacLink[];
}

export function parseItem(item: StacItem): Picture | null {
  const c = item.geometry?.coordinates;
  const hd = item.assets?.hd?.href ?? item.assets?.sd?.href;
  if (!c || c.length < 2 || !hd) return null;
  const props = item.properties ?? {};
  const fov = props['pers:interior_orientation']?.field_of_view;
  const producer =
    props['geovisio:producer'] ??
    item.providers?.find((p) => p.roles?.includes('producer'))?.name ??
    item.providers?.[0]?.name;
  return {
    id: item.id,
    sequence: item.collection,
    coords: [c[0], c[1]],
    hd,
    sd: item.assets?.sd?.href,
    is360: fov === 360,
    azimuth: typeof props['view:azimuth'] === 'number' ? props['view:azimuth'] : undefined,
    date: props.datetime,
    author: producer,
    license: props.license ?? (item as any).license,
  };
}

/** Récupère toutes les photos Panoramax situées dans la zone de jeu. */
export async function fetchZonePictures(signal?: AbortSignal): Promise<Picture[]> {
  const params = new URLSearchParams({ bbox: ZONE_BBOX.join(','), limit: String(PAGE_LIMIT) });
  let url: string | undefined = `${PANORAMAX_API}/search?${params}`;
  const byId = new Map<string, Picture>();

  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res = await fetch(url, { signal, headers: { Accept: 'application/geo+json, application/json' } });
    if (!res.ok) throw new Error(`Panoramax a répondu ${res.status}`);
    const data: StacCollection = await res.json();
    for (const f of data.features ?? []) {
      const pic = parseItem(f);
      if (pic && pointInPolygon(pic.coords, ZONE_POLYGON)) byId.set(pic.id, pic);
    }
    const next = data.links?.find((l) => l.rel === 'next')?.href;
    url = next && next !== url && (data.features?.length ?? 0) > 0 ? next : undefined;
  }
  return [...byId.values()];
}

export function viewerLink(pic: Picture): string {
  return `${PANORAMAX_VIEWER}#focus=pic&pic=${encodeURIComponent(pic.id)}&map=18/${pic.coords[1]}/${pic.coords[0]}`;
}
