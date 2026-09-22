import { Cache, EquirectangularAdapter, Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import { chooseFlatView, chooseSphereView, isUsableImage, loadWithLuma, type LumaGrid } from './analyze';
import { FLAT_ZOOM, SPHERE_FOV } from './config';
import type { Picture } from './panoramax';

// On charge nous-mêmes les images en blob: ; inutile que PSV les garde en cache
Cache.enabled = false;

/** Photo écartée volontairement (trop sombre, rien d'intéressant à montrer…). */
export class RejectedPicture extends Error {}

/**
 * Affiche une photo Panoramax très zoomée : on peut regarder autour
 * (rotation pour les 360°, déplacement pour les photos classiques) mais
 * jamais dézoomer.
 */
export class ZoomedViewer {
  private sphereEl: HTMLDivElement;
  private flatEl: HTMLDivElement;
  private flatImg: HTMLImageElement;
  private sphere?: Viewer;
  private flat = { tx: 0, ty: 0, minX: 0, minY: 0 };
  private objectUrl?: string;

  constructor(root: HTMLElement) {
    this.sphereEl = document.createElement('div');
    this.sphereEl.className = 'viewer-sphere';
    this.flatEl = document.createElement('div');
    this.flatEl.className = 'viewer-flat';
    this.flatImg = document.createElement('img');
    this.flatImg.alt = 'Détail à localiser';
    this.flatImg.draggable = false;
    this.flatEl.append(this.flatImg);
    root.append(this.sphereEl, this.flatEl);
    this.setupFlatDrag();
    window.addEventListener('resize', () => this.layoutFlat());
  }

  async show(pic: Picture): Promise<void> {
    const loaded = await this.load(pic);
    if (loaded && !isUsableImage(loaded.luma)) {
      URL.revokeObjectURL(loaded.objectUrl);
      throw new RejectedPicture('Photo trop sombre ou vide');
    }
    try {
      if (pic.is360) {
        if (!loaded) throw new Error('Image introuvable');
        await this.showSphere(loaded.objectUrl, loaded.luma);
      } else {
        await this.showFlat(loaded?.objectUrl ?? pic.hd, loaded?.luma);
      }
    } catch (e) {
      if (loaded) URL.revokeObjectURL(loaded.objectUrl);
      throw e;
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = loaded?.objectUrl;
  }

  /** Télécharge l'image (HD, sinon SD) et l'analyse ; null si le navigateur refuse (CORS…). */
  private async load(pic: Picture): Promise<{ objectUrl: string; luma: LumaGrid } | null> {
    for (const url of [pic.hd, pic.sd]) {
      if (!url) continue;
      try {
        return await loadWithLuma(url);
      } catch (e) {
        console.warn('Chargement impossible', url, e);
      }
    }
    return null;
  }

  private async showSphere(url: string, luma: LumaGrid): Promise<void> {
    const aspect = Math.max(1, this.root().clientWidth / Math.max(1, this.root().clientHeight));
    const position = chooseSphereView(luma, SPHERE_FOV, aspect);
    if (!position) throw new RejectedPicture('Aucun cadrage exploitable');

    this.flatEl.hidden = true;
    this.sphereEl.hidden = false;
    if (!this.sphere) {
      this.sphere = new Viewer({
        container: this.sphereEl,
        // Les métadonnées XMP de certaines caméras décrivent un recadrage erroné,
        // ce qui laissait des zones noires : on considère toujours l'image entière.
        adapter: EquirectangularAdapter.withConfig({ useXmpData: false }),
        // Zoom verrouillé : minFov === maxFov
        minFov: SPHERE_FOV,
        maxFov: SPHERE_FOV,
        defaultZoomLvl: 50,
        mousewheel: false,
        keyboard: false,
        navbar: false,
        loadingTxt: 'Chargement…',
      });
    } else {
      // Le conteneur a pu être masqué entre-temps : on recalcule sa taille
      this.sphere.autoSize();
    }
    await this.sphere.setPanorama(url, { position, transition: false, showLoader: true });
  }

  private showFlat(url: string, luma?: LumaGrid): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = this.flatImg;
      img.onload = () => {
        this.sphereEl.hidden = true;
        this.flatEl.hidden = false;
        const size = this.flatSize();
        let view: { u: number; v: number } | null;
        if (luma) {
          view = chooseFlatView(luma, size.W / size.dw, size.H / size.dh);
          if (!view) return reject(new RejectedPicture('Aucun cadrage exploitable'));
        } else {
          // Pas d'analyse possible : on reste plutôt vers le milieu (ciel / sol peu intéressants)
          view = { u: Math.random(), v: 0.35 + 0.3 * Math.random() };
        }
        this.flat.tx = size.W / 2 - view.u * size.dw;
        this.flat.ty = size.H / 2 - view.v * size.dh;
        this.layoutFlat();
        resolve();
      };
      img.onerror = () => reject(new Error('Image introuvable'));
      img.src = url;
    });
  }

  private root(): HTMLElement {
    return this.sphereEl.parentElement!;
  }

  /** Taille d'affichage : l'image en "cover" × FLAT_ZOOM. */
  private flatSize() {
    const img = this.flatImg;
    const W = this.root().clientWidth;
    const H = this.root().clientHeight;
    const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    return { W, H, dw: img.naturalWidth * cover * FLAT_ZOOM, dh: img.naturalHeight * cover * FLAT_ZOOM };
  }

  private layoutFlat(): void {
    const img = this.flatImg;
    if (this.flatEl.hidden || !img.naturalWidth) return;
    const { W, H, dw, dh } = this.flatSize();
    img.style.width = `${dw}px`;
    img.style.height = `${dh}px`;
    this.flat.minX = W - dw;
    this.flat.minY = H - dh;
    this.applyFlat();
  }

  private applyFlat(): void {
    const f = this.flat;
    f.tx = Math.min(0, Math.max(f.minX, f.tx));
    f.ty = Math.min(0, Math.max(f.minY, f.ty));
    this.flatImg.style.transform = `translate(${f.tx}px, ${f.ty}px)`;
  }

  private setupFlatDrag(): void {
    let last: { x: number; y: number } | null = null;
    this.flatEl.addEventListener('pointerdown', (e) => {
      last = { x: e.clientX, y: e.clientY };
      this.flatEl.setPointerCapture(e.pointerId);
      this.flatEl.classList.add('dragging');
    });
    this.flatEl.addEventListener('pointermove', (e) => {
      if (!last) return;
      this.flat.tx += e.clientX - last.x;
      this.flat.ty += e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      this.applyFlat();
    });
    const end = () => {
      last = null;
      this.flatEl.classList.remove('dragging');
    };
    this.flatEl.addEventListener('pointerup', end);
    this.flatEl.addEventListener('pointercancel', end);
  }
}
