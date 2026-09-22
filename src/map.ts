import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MAP_CENTER, ZONE_POLYGON, type LonLat } from './config';

const toLatLng = (p: LonLat): L.LatLngTuple => [p[1], p[0]];

/** Carte de la Cité Descartes sur laquelle le joueur place sa réponse. */
export class GuessMap {
  readonly map: L.Map;
  private guess?: L.CircleMarker;
  private result = L.layerGroup();
  private locked = false;
  private zoneBounds: L.LatLngBounds;
  onGuess?: (coords: LonLat) => void;

  constructor(el: HTMLElement) {
    const zone = L.polygon(ZONE_POLYGON.map(toLatLng));
    const bounds = zone.getBounds();
    this.zoneBounds = bounds;
    this.map = L.map(el, {
      center: MAP_CENTER,
      zoom: 16,
      minZoom: 15,
      maxZoom: 19,
      maxBounds: bounds.pad(0.4),
      maxBoundsViscosity: 1,
      zoomControl: true,
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(this.map);
    zone.setStyle({ color: '#6c5ce7', weight: 2, fill: false, dashArray: '6 6', interactive: false }).addTo(this.map);
    this.result.addTo(this.map);
    this.map.fitBounds(bounds);

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      if (this.locked) return;
      const ll = e.latlng;
      if (!this.guess) {
        this.guess = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#e17055', fillOpacity: 1 }).addTo(this.map);
      } else {
        this.guess.setLatLng(ll);
      }
      this.onGuess?.([ll.lng, ll.lat]);
    });
  }

  invalidate(): void {
    this.map.invalidateSize();
  }

  /** Affiche la vraie position et la ligne entre la réponse et la solution. */
  showResult(answer: LonLat, guess: LonLat): void {
    this.locked = true;
    const a = toLatLng(answer);
    const g = toLatLng(guess);
    L.polyline([g, a], { color: '#2d3436', weight: 3, dashArray: '8 8' }).addTo(this.result);
    L.circleMarker(a, { radius: 9, color: '#fff', weight: 3, fillColor: '#00b894', fillOpacity: 1 })
      .bindTooltip('Ici !', { permanent: true, direction: 'top', offset: [0, -8] })
      .addTo(this.result);
    this.map.fitBounds(L.latLngBounds([a, g]).pad(0.3), { maxZoom: 18 });
  }

  /** Récapitulatif de fin de partie : toutes les manches. */
  showSummary(rounds: { answer: LonLat; guess: LonLat }[]): void {
    this.reset();
    this.locked = true;
    const pts: L.LatLngTuple[] = [];
    rounds.forEach(({ answer, guess }, i) => {
      const a = toLatLng(answer);
      const g = toLatLng(guess);
      pts.push(a, g);
      L.polyline([g, a], { color: '#2d3436', weight: 2, dashArray: '6 6' }).addTo(this.result);
      L.circleMarker(g, { radius: 6, color: '#fff', weight: 2, fillColor: '#e17055', fillOpacity: 1 }).addTo(this.result);
      L.circleMarker(a, { radius: 7, color: '#fff', weight: 2, fillColor: '#00b894', fillOpacity: 1 })
        .bindTooltip(String(i + 1), { permanent: true, direction: 'top', offset: [0, -6] })
        .addTo(this.result);
    });
    if (pts.length) this.map.fitBounds(L.latLngBounds(pts).pad(0.2), { maxZoom: 18 });
  }

  reset(): void {
    this.locked = false;
    this.result.clearLayers();
    this.guess?.remove();
    this.guess = undefined;
    this.map.fitBounds(this.zoneBounds, { animate: false });
  }
}
