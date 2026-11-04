import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type PostPreset = 'default' | 'racing' | 'neon' | 'horror' | 'frost' | 'desert';

export interface PostFrameOptions {
  /** 0..1 — camera speed for radial blur + chroma. */
  speed?: number;
  underwater?: boolean;
}

interface PresetValues {
  tint: [number, number, number];
  saturation: number;
  contrast: number;
  vignette: number;
  grain: number;
  aberration: number;
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
}

const PRESETS: Record<PostPreset, PresetValues> = {
  default: { tint: [1, 1, 1], saturation: 1.03, contrast: 1.02, vignette: 0.3, grain: 0.018, aberration: 0.00035, bloomStrength: 0.16, bloomRadius: 0.35, bloomThreshold: 0.9 },
  racing: { tint: [1.05, 0.99, 0.9], saturation: 1.1, contrast: 1.04, vignette: 0.42, grain: 0.02, aberration: 0.00045, bloomStrength: 0.24, bloomRadius: 0.5, bloomThreshold: 0.82 },
  neon: { tint: [0.94, 1.0, 1.08], saturation: 1.16, contrast: 1.06, vignette: 0.4, grain: 0.03, aberration: 0.0007, bloomStrength: 0.62, bloomRadius: 0.6, bloomThreshold: 0.58 },
  horror: { tint: [0.94, 0.9, 0.96], saturation: 0.58, contrast: 1.08, vignette: 0.68, grain: 0.065, aberration: 0.0011, bloomStrength: 0.28, bloomRadius: 0.4, bloomThreshold: 0.78 },
  frost: { tint: [0.92, 0.99, 1.08], saturation: 0.95, contrast: 1.03, vignette: 0.36, grain: 0.022, aberration: 0.0004, bloomStrength: 0.26, bloomRadius: 0.55, bloomThreshold: 0.8 },
  desert: { tint: [1.08, 1.0, 0.88], saturation: 1.06, contrast: 1.05, vignette: 0.4, grain: 0.028, aberration: 0.0005, bloomStrength: 0.2, bloomRadius: 0.45, bloomThreshold: 0.86 },
};

const compositeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uUnderwater: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uVignette: { value: 0.3 },
    uGrain: { value: 0.02 },
    uAberration: { value: 0.0005 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uSpeed;
    uniform float uUnderwater;
    uniform vec3 uTint;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float radius = length(centered);

      // Subtle underwater refraction.
      uv += vec2(sin(uv.y * 26.0 + uTime * 2.1), cos(uv.x * 22.0 - uTime * 1.7)) * 0.0022 * uUnderwater;

      // Radial speed blur.
      float speed = clamp(uSpeed, 0.0, 1.0);
      vec3 col = vec3(0.0);
      if (speed > 0.015) {
        float sum = 0.0;
        for (int i = 0; i < 7; i++) {
          float t = float(i) / 6.0;
          vec2 dir = centered * (t * speed * 0.075);
          float w = 1.0 - t * 0.55;
          col += texture2D(tDiffuse, uv - dir).rgb * w;
          sum += w;
        }
        col /= sum;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }

      // Chromatic aberration towards the edges.
      float ab = uAberration * (0.25 + radius * 2.2) * (1.0 + speed * 2.0);
      col.r = mix(col.r, texture2D(tDiffuse, uv + centered * ab).r, 0.65);
      col.b = mix(col.b, texture2D(tDiffuse, uv - centered * ab).b, 0.65);

      // Underwater blue-green wash.
      vec3 under = vec3(0.22, 0.55, 0.66);
      col = mix(col, col * under + under * 0.18, uUnderwater * 0.75);

      // Grade.
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = (col - 0.5) * uContrast + 0.5;
      col *= uTint;

      // Vignette.
      float vig = smoothstep(0.88, 0.28, radius);
      col *= mix(1.0, vig, uVignette);

      // Film grain.
      float grain = hash(uv * uResolution + uTime * 71.3) - 0.5;
      col += grain * uGrain;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

/**
 * Post-processing stack: render → bloom → grade/speed/grain → output.
 * A single reusable pipeline keeps the exported build lean while giving each
 * template its own look (sunset race, neon city, horror manor, frost peaks).
 */
export class PostFX {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private composite: ShaderPass;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private preset: PostPreset = 'default';
  private elapsed = 0;
  private speed = 0;
  private underwater = 0;
  private width = 1;
  private height = 1;
  enabled = true;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.16, 0.35, 0.9);
    this.composer.addPass(this.bloom);
    this.composite = new ShaderPass(compositeShader as unknown as THREE.ShaderMaterial);
    this.composer.addPass(this.composite);
    this.composer.addPass(new OutputPass());
    this.setSize(window.innerWidth, Math.max(1, window.innerHeight));
    this.applyPreset('default');
  }

  setSize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.composer.setSize(this.width, this.height);
    this.bloom.setSize(this.width, this.height);
    (this.composite.uniforms.uResolution.value as THREE.Vector2).set(this.width, this.height);
  }

  setPreset(preset: PostPreset): void {
    this.applyPreset(preset);
  }

  private applyPreset(preset: PostPreset): void {
    this.preset = preset;
    const p = PRESETS[preset];
    const u = this.composite.uniforms;
    (u.uTint.value as THREE.Vector3).set(...p.tint);
    u.uSaturation.value = p.saturation;
    u.uContrast.value = p.contrast;
    u.uVignette.value = p.vignette;
    u.uGrain.value = p.grain;
    u.uAberration.value = p.aberration;
    this.bloom.strength = p.bloomStrength;
    this.bloom.radius = p.bloomRadius;
    this.bloom.threshold = p.bloomThreshold;
    this.bloom.enabled = p.bloomStrength > 0.01;
  }

  render(dt: number, options: PostFrameOptions = {}): void {
    this.elapsed += dt;
    const u = this.composite.uniforms;
    u.uTime.value = this.elapsed;
    const targetSpeed = options.speed ?? 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 5);
    this.underwater += ((options.underwater ? 1 : 0) - this.underwater) * Math.min(1, dt * 6);
    u.uSpeed.value = this.speed * (this.preset === 'racing' ? 1 : 0.55);
    u.uUnderwater.value = this.underwater;
    if (!this.enabled) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
    this.bloom.dispose();
    this.composite.dispose();
  }
}
