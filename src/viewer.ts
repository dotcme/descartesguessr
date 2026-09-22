import { Viewer } from '@photo-sphere-viewer/core';
import '@photo-sphere-viewer/core/index.css';
import { FLAT_ZOOM, SPHERE_FOV } from './config';
import type { Picture } from './panoramax';

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
    window.addEventListener('resize', () => this.layoutFlat(false));
  }

  async show(pic: Picture): Promise<void> {
    if (pic.is360) {
      this.flatEl.hidden = true;
      this.sphereEl.hidden = false;
      await this.showSphere(pic);
    } else {
      this.sphereEl.hidden = true;
      this.flatEl.hidden = false;
      await this.showFlat(pic);
    }
  }

  private async showSphere(pic: Picture): Promise<void> {
    const position = {
      yaw: Math.random() * 2 * Math.PI,
      pitch: ((Math.random() * 16 - 8) * Math.PI) / 180,
    };
    if (!this.sphere) {
      this.sphere = new Viewer({
        container: this.sphereEl,
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
    try {
      await this.sphere.setPanorama(pic.hd, { position, transition: false, showLoader: true });
    } catch {
      if (!pic.sd) throw new Error('Image introuvable');
      await this.sphere.setPanorama(pic.sd, { position, transition: false, showLoader: true });
    }
  }

  private showFlat(pic: Picture): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = this.flatImg;
      img.style.visibility = 'hidden';
      img.onload = () => {
        this.layoutFlat(true);
        img.style.visibility = '';
        resolve();
      };
      img.onerror = () => {
        if (pic.sd && img.src !== pic.sd) img.src = pic.sd;
        else reject(new Error('Image introuvable'));
      };
      img.src = pic.hd;
    });
  }

  /** Dimensionne l'image en "cover" × FLAT_ZOOM, puis la positionne. */
  private layoutFlat(randomize: boolean): void {
    const img = this.flatImg;
    if (this.flatEl.hidden || !img.naturalWidth) return;
    const W = this.flatEl.clientWidth;
    const H = this.flatEl.clientHeight;
    const cover = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const dw = img.naturalWidth * cover * FLAT_ZOOM;
    const dh = img.naturalHeight * cover * FLAT_ZOOM;
    img.style.width = `${dw}px`;
    img.style.height = `${dh}px`;
    const f = this.flat;
    f.minX = W - dw;
    f.minY = H - dh;
    if (randomize) {
      f.tx = f.minX * Math.random();
      // On reste plutôt vers le milieu verticalement (ciel / sol peu intéressants)
      f.ty = f.minY * (0.3 + 0.4 * Math.random());
    }
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
