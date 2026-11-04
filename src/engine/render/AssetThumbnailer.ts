import * as THREE from 'three';
import { loadBlockbenchModel, type LoadedModel } from '../blockbench/BBModelLoader';
import { buildAssetModel, getAsset } from '../../content/Models';

/**
 * Lazily renders inventory-quality 3D portraits for catalog assets with a
 * single hidden WebGL renderer. The queue keeps the studio and menus smooth
 * while hundreds of thumbnails are requested.
 */
export class AssetThumbnailer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  private cache = new Map<string, string>();
  private pending = new Map<string, Promise<string>>();
  private queue: Array<{ key: string; resolve: (url: string) => void; reject: (err: unknown) => void }> = [];
  private running = 0;
  private maxConcurrent = 2;
  private loaded = new Map<string, LoadedModel>();

  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(192, 192, false);
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.9));
    const key = new THREE.DirectionalLight(0xfff3de, 2.4);
    key.position.set(4, 7, 5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb8ff, 0.9);
    rim.position.set(-5, 2.5, -4);
    this.scene.add(rim);
  }

  cached(key: string): string | undefined {
    return this.cache.get(key);
  }

  get(key: string): Promise<string> {
    const hit = this.cache.get(key);
    if (hit) return Promise.resolve(hit);
    const active = this.pending.get(key);
    if (active) return active;
    const promise = new Promise<string>((resolve, reject) => {
      this.queue.push({ key, resolve, reject });
      this.pump();
    });
    this.pending.set(key, promise);
    return promise;
  }

  prefetch(keys: string[]) {
    for (const key of keys) void this.get(key).catch(() => undefined);
  }

  private pump() {
    while (this.running < this.maxConcurrent && this.queue.length) {
      const job = this.queue.shift()!;
      this.running++;
      void this.renderJob(job.key)
        .then((url) => {
          this.cache.set(job.key, url);
          job.resolve(url);
        })
        .catch((err) => job.reject(err))
        .finally(() => {
          this.running--;
          this.pending.delete(job.key);
          this.pump();
        });
    }
  }

  private async renderJob(key: string): Promise<string> {
    const entry = getAsset(key);
    if (!entry) throw new Error(`Unknown asset ${key}`);
    let loaded = this.loaded.get(key);
    if (!loaded) {
      loaded = loadBlockbenchModel(buildAssetModel(key), { name: entry.name });
      this.loaded.set(key, loaded);
    }
    const root = loaded.root;
    root.updateMatrixWorld(true);
    this.scene.add(root);

    // Give data-URL textures a moment to decode before the first frame.
    await new Promise<void>((r) => setTimeout(r, 40));
    root.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.62;
    const aspect = 1;
    const halfHeight = Math.max(0.5, radius / Math.max(0.35, Math.min(1, size.y / Math.max(size.x, size.z) + 0.55)));
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight * 1.04;
    this.camera.bottom = -halfHeight * 1.04;
    this.camera.near = 0.01;
    this.camera.far = 200;
    this.camera.position.set(center.x + radius * 2.4, center.y + radius * 1.7, center.z + radius * 3.0);
    this.camera.lookAt(center.x, center.y - size.y * 0.02, center.z);
    this.camera.updateProjectionMatrix();

    this.renderer.render(this.scene, this.camera);
    // A second frame settles any lazy texture upload.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(root);
    return url;
  }

  dispose() {
    this.renderer.dispose();
    this.cache.clear();
    this.loaded.clear();
  }
}

let singleton: AssetThumbnailer | null = null;
export function assetThumbnailer(): AssetThumbnailer {
  if (!singleton) singleton = new AssetThumbnailer();
  return singleton;
}

/** Immediate placeholder while the queue renders a real thumbnail. */
export function assetThumbnailUrl(key: string): string | undefined {
  return assetThumbnailer().cached(key);
}
