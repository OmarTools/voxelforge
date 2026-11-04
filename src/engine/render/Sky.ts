import * as THREE from 'three';
import { clamp } from '../core/Utils';

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'ash';

const DAY_SECONDS = 240;

function smooth01(x: number): number {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

function radialSprite(inner: string, outer: string, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(0.42, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const SKY_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz - cameraPosition;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uSunGlow;
  varying vec3 vWorld;

  void main() {
    vec3 dir = normalize(vWorld);
    float h = dir.y;
    vec3 col;
    if (h >= 0.0) {
      float t = pow(smoothstep(0.0, 0.82, h), 0.72);
      col = mix(uHorizon, uTop, t);
    } else {
      float t = smoothstep(0.0, -0.65, h);
      col = mix(uHorizon, uBottom, t);
    }

    float sd = max(dot(dir, normalize(uSunDir)), 0.0);
    // Broad atmospheric bloom plus a tight core around the sun.
    col += uSunColor * pow(sd, 5.0) * 0.22 * uSunGlow;
    col += uSunColor * pow(sd, 90.0) * 0.85 * uSunGlow;

    // Subtle dithering keeps the gradient from banding on 8-bit displays.
    float dither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) * 0.006;
    gl_FragColor = vec4(col + dither, 1.0);
  }
`;

export class Sky {
  readonly group = new THREE.Group();
  readonly fog: THREE.Fog;
  readonly sunLight: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly ambient: THREE.AmbientLight;

  time = 9;
  weather: WeatherKind = 'clear';
  dayCycle = true;
  mood: 'normal' | 'horror' = 'normal';
  renderDistance = 5;

  private dome: THREE.Mesh;
  private uniforms: {
    uTop: { value: THREE.Color };
    uHorizon: { value: THREE.Color };
    uBottom: { value: THREE.Color };
    uSunDir: { value: THREE.Vector3 };
    uSunColor: { value: THREE.Color };
    uSunGlow: { value: number };
  };
  private sunSprite: THREE.Sprite;
  private moonSprite: THREE.Sprite;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private cloudGroup = new THREE.Group();
  private clouds: Array<{ mesh: THREE.Mesh; speed: number }> = [];
  private rain: THREE.LineSegments;
  private rainPositions: Float32Array;
  private snow: THREE.Points;
  private snowPositions: Float32Array;
  private ash: THREE.Points;
  private ashPositions: Float32Array;
  private weatherGroup = new THREE.Group();
  private elapsed = 0;

  private topColor = new THREE.Color();
  private horizonColor = new THREE.Color();
  private bottomColor = new THREE.Color();
  private sunColor = new THREE.Color();
  private nightColor = new THREE.Color('#050a17');
  private nightHorizon = new THREE.Color('#101b36');
  private dayTop = new THREE.Color('#3f86cf');
  private dayHorizon = new THREE.Color('#b9dff4');
  private duskColor = new THREE.Color('#f08a52');
  private dawnColor = new THREE.Color('#ff9d61');

  constructor() {
    this.group.name = 'sky';
    this.fog = new THREE.Fog(0x9fc8e0, 48, 160);

    this.uniforms = {
      uTop: { value: new THREE.Color('#3f86cf') },
      uHorizon: { value: new THREE.Color('#b9dff4') },
      uBottom: { value: new THREE.Color('#22354a') },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color('#fff3d6') },
      uSunGlow: { value: 1 },
    };

    const domeMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 20), domeMat);
    this.dome.renderOrder = -100;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    const sunTex = radialSprite('rgba(255,250,224,1)', 'rgba(255,214,140,0)');
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      blending: THREE.AdditiveBlending,
    }));
    this.sunSprite.scale.setScalar(56);
    this.sunSprite.renderOrder = -98;
    this.group.add(this.sunSprite);

    const moonTex = radialSprite('rgba(236,244,255,1)', 'rgba(146,182,224,0)', 96);
    this.moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
    }));
    this.moonSprite.scale.setScalar(34);
    this.moonSprite.renderOrder = -97;
    this.group.add(this.moonSprite);

    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(1400 * 3);
    for (let i = 0; i < 1400; i++) {
      const theta = Math.random() * Math.PI * 2;
      const y = Math.pow(Math.random(), 0.65);
      const r = Math.sqrt(1 - y * y);
      const radius = 420;
      starPositions[i * 3] = Math.cos(theta) * r * radius;
      starPositions[i * 3 + 1] = y * radius;
      starPositions[i * 3 + 2] = Math.sin(theta) * r * radius;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    this.starMat = new THREE.PointsMaterial({
      color: 0xe8f2ff,
      size: 1.9,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      fog: false,
    });
    this.stars = new THREE.Points(starGeo, this.starMat);
    this.stars.renderOrder = -96;
    this.stars.frustumCulled = false;
    this.group.add(this.stars);

    this.buildClouds();

    this.rain = this.buildRain();
    this.snow = this.buildSnow();
    this.ash = this.buildAsh();
    this.weatherGroup.add(this.rain, this.snow, this.ash);
    this.group.add(this.weatherGroup);
    this.rainPositions = (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    this.snowPositions = (this.snow.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    this.ashPositions = (this.ash.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;

    this.sunLight = new THREE.DirectionalLight(0xfff1d0, 1.35);
    this.sunLight.name = 'sun';
    this.sunLight.castShadow = false;
    this.hemi = new THREE.HemisphereLight(0xbcd9ef, 0x4a5b3c, 0.72);
    this.ambient = new THREE.AmbientLight(0x6f8aa0, 0.24);

    this.setTime(this.time);
    this.setWeather('clear');
  }

  private buildClouds(): void {
    this.cloudGroup.name = 'clouds';
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      fog: false,
    });
    for (let i = 0; i < 34; i++) {
      const mesh = new THREE.Mesh(geometry, material.clone());
      const scaleX = 10 + Math.random() * 26;
      const scaleY = 1.2 + Math.random() * 2.4;
      const scaleZ = 7 + Math.random() * 18;
      mesh.scale.set(scaleX, scaleY, scaleZ);
      const angle = Math.random() * Math.PI * 2;
      const dist = 45 + Math.random() * 230;
      mesh.position.set(Math.cos(angle) * dist, 78 + Math.random() * 16, Math.sin(angle) * dist);
      mesh.rotation.y = Math.random() * Math.PI;
      mesh.renderOrder = -50;
      this.cloudGroup.add(mesh);
      this.clouds.push({ mesh, speed: 0.6 + Math.random() * 1.1 });
    }
    this.group.add(this.cloudGroup);
  }

  private buildRain(): THREE.LineSegments {
    const count = 850;
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 44;
      const y = Math.random() * 30 - 4;
      const z = (Math.random() - 0.5) * 44;
      positions[i * 6] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x + 0.06;
      positions[i * 6 + 4] = y + 0.85;
      positions[i * 6 + 5] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.LineBasicMaterial({
      color: 0x9fc6e8,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: false,
    });
    const rain = new THREE.LineSegments(geo, mat);
    rain.frustumCulled = false;
    rain.renderOrder = 2;
    return rain;
  }

  private buildSnow(): THREE.Points {
    const count = 900;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 46;
      positions[i * 3 + 1] = Math.random() * 30 - 3;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 46;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.17,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      fog: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  private buildAsh(): THREE.Points {
    const count = 500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = Math.random() * 24 - 2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xb0a49b,
      size: 0.11,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      fog: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  setTime(hours: number): void {
    this.time = ((hours % 24) + 24) % 24;
  }

  get isNight(): boolean {
    return this.time < 6.15 || this.time > 19.15;
  }

  get nightFactor(): number {
    const elevation = this.sunElevation;
    return 1 - smooth01((elevation + 0.12) / 0.34);
  }

  get sunElevation(): number {
    return Math.sin(((this.time - 6) / 12) * Math.PI);
  }

  setWeather(weather: WeatherKind): void {
    this.weather = weather;
    this.rain.visible = weather === 'rain';
    this.snow.visible = weather === 'snow';
    this.ash.visible = weather === 'ash';
  }

  setMood(mood: 'normal' | 'horror'): void {
    this.mood = mood;
  }

  setRenderDistance(rd: number): void {
    this.renderDistance = rd;
  }

  advance(dt: number): void {
    if (!this.dayCycle) return;
    this.time = (this.time + (dt * 24) / DAY_SECONDS) % 24;
  }

  update(dt: number, cameraPosition: THREE.Vector3): void {
    this.elapsed += dt;
    if (this.dayCycle) this.advance(dt);

    const elevation = this.sunElevation;
    const day = smooth01((elevation + 0.08) / 0.5);
    const night = 1 - day;
    const dawn = Math.exp(-Math.pow((this.time - 6.25) / 1.15, 2));
    const dusk = Math.exp(-Math.pow((this.time - 18.3) / 1.35, 2));
    const twilight = Math.min(1, (dawn + dusk) * 0.95);

    this.topColor.copy(this.nightColor).lerp(this.dayTop, day);
    this.topColor.lerp(new THREE.Color('#38507f'), twilight * 0.28);
    this.horizonColor.copy(this.nightHorizon).lerp(this.dayHorizon, day);
    const warm = dawn > dusk ? this.dawnColor : this.duskColor;
    this.horizonColor.lerp(warm, twilight * 0.82);
    this.bottomColor.copy(this.horizonColor).multiplyScalar(0.35).lerp(this.nightColor, 0.55);
    this.sunColor.setHSL(0.11 - Math.max(0, 1 - Math.abs(elevation) * 4) * 0.055, 0.55 + twilight * 0.35, 0.72 + day * 0.16);

    this.uniforms.uTop.value.copy(this.topColor);
    this.uniforms.uHorizon.value.copy(this.horizonColor);
    this.uniforms.uBottom.value.copy(this.bottomColor);
    this.uniforms.uSunColor.value.copy(this.sunColor);
    this.uniforms.uSunGlow.value = 0.35 + day * 0.9;

    const angle = ((this.time - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0.32).normalize();
    this.uniforms.uSunDir.value.copy(sunDir);

    this.sunSprite.position.copy(sunDir).multiplyScalar(400);
    this.sunSprite.material.opacity = smooth01((sunDir.y + 0.12) * 3);
    this.sunSprite.material.color.copy(this.sunColor);
    this.sunSprite.visible = this.sunSprite.material.opacity > 0.01;

    const moonDir = sunDir.clone().multiplyScalar(-1);
    this.moonSprite.position.copy(moonDir).multiplyScalar(390);
    this.moonSprite.material.opacity = clamp(night * 0.95, 0, 1);
    this.moonSprite.visible = this.moonSprite.material.opacity > 0.02;

    this.stars.position.copy(cameraPosition).setY(0);
    this.starMat.opacity = night * 0.88;
    this.stars.rotation.y = this.elapsed * 0.004;
    this.stars.visible = night > 0.05;

    this.dome.position.copy(cameraPosition);
    this.sunSprite.position.add(cameraPosition);
    this.moonSprite.position.add(cameraPosition);

    // Lighting.
    this.sunLight.position.copy(sunDir).multiplyScalar(90).add(cameraPosition);
    this.sunLight.target.position.copy(cameraPosition);
    this.sunLight.target.updateMatrixWorld();
    const lightStrength = smooth01((sunDir.y + 0.15) / 0.55);
    this.sunLight.intensity = 0.12 + lightStrength * 1.25;
    this.sunLight.color.copy(this.sunColor);

    this.hemi.intensity = 0.26 + lightStrength * 0.55;
    this.hemi.color.copy(this.horizonColor).lerp(new THREE.Color('#c9e2f5'), 0.45);
    this.hemi.groundColor.set('#3d4a33').lerp(new THREE.Color('#171d2b'), night * 0.8);
    this.ambient.intensity = 0.13 + lightStrength * 0.18;
    this.ambient.color.copy(this.horizonColor).lerp(new THREE.Color('#8ba4bd'), 0.5);

    // Fog.
    const rd = this.renderDistance;
    let near = this.mood === 'horror' ? 7 : 34;
    let far = this.mood === 'horror' ? 62 : Math.max(110, rd * 30);
    if (this.weather === 'rain') { near *= 0.64; far *= 0.72; }
    if (this.weather === 'snow') { near *= 0.55; far *= 0.58; }
    if (this.weather === 'ash') { near *= 0.42; far *= 0.52; }
    this.fog.near = near;
    this.fog.far = far;
    this.fog.color.copy(this.horizonColor)
      .lerp(new THREE.Color('#8798a4'), 0.28)
      .multiplyScalar(0.42 + day * 0.45);

    // Clouds drift and wrap around the player.
    const cloudColor = new THREE.Color('#ffffff').multiplyScalar(0.18 + day * 0.82);
    cloudColor.lerp(warm, twilight * 0.36);
    for (const cloud of this.clouds) {
      cloud.mesh.position.x += cloud.speed * dt;
      const dx = cloud.mesh.position.x - cameraPosition.x;
      const dz = cloud.mesh.position.z - cameraPosition.z;
      if (dx > 270) cloud.mesh.position.x -= 540;
      if (dx < -270) cloud.mesh.position.x += 540;
      if (dz > 270) cloud.mesh.position.z -= 540;
      if (dz < -270) cloud.mesh.position.z += 540;
      cloud.mesh.position.y = 78 + (cloud.mesh.position.y - 78);
      const mat = cloud.mesh.material as THREE.MeshLambertMaterial;
      mat.color.copy(cloudColor);
      mat.opacity = (this.weather === 'clear' ? 0.55 : 0.72) * (0.5 + day * 0.5);
    }

    this.updateWeather(dt, cameraPosition, day);
  }

  private updateWeather(dt: number, camera: THREE.Vector3, day: number): void {
    if (this.weather === 'rain') {
      for (let i = 0; i < this.rainPositions.length; i += 6) {
        this.rainPositions[i + 1] -= 32 * dt;
        this.rainPositions[i + 4] -= 32 * dt;
        this.rainPositions[i] -= 2.2 * dt;
        this.rainPositions[i + 3] -= 2.2 * dt;
        if (this.rainPositions[i + 1] < -5) {
          const x = (Math.random() - 0.5) * 44;
          const z = (Math.random() - 0.5) * 44;
          this.rainPositions[i] = x;
          this.rainPositions[i + 1] = 26 + Math.random() * 4;
          this.rainPositions[i + 2] = z;
          this.rainPositions[i + 3] = x + 0.06;
          this.rainPositions[i + 4] = this.rainPositions[i + 1] + 0.85;
          this.rainPositions[i + 5] = z;
        }
      }
      (this.rain.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      this.rain.position.set(camera.x, camera.y, camera.z);
    } else if (this.weather === 'snow') {
      for (let i = 0; i < this.snowPositions.length; i += 3) {
        this.snowPositions[i + 1] -= 2.7 * dt;
        this.snowPositions[i] += Math.sin(this.elapsed * 0.8 + i) * 0.35 * dt;
        if (this.snowPositions[i + 1] < -4) {
          this.snowPositions[i] = (Math.random() - 0.5) * 46;
          this.snowPositions[i + 1] = 26 + Math.random() * 4;
          this.snowPositions[i + 2] = (Math.random() - 0.5) * 46;
        }
      }
      (this.snow.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      this.snow.position.set(camera.x, camera.y, camera.z);
    } else if (this.weather === 'ash') {
      for (let i = 0; i < this.ashPositions.length; i += 3) {
        this.ashPositions[i + 1] -= 1.1 * dt;
        this.ashPositions[i] += Math.sin(this.elapsed * 0.35 + i * 0.7) * 0.25 * dt;
        if (this.ashPositions[i + 1] < -3) {
          this.ashPositions[i] = (Math.random() - 0.5) * 40;
          this.ashPositions[i + 1] = 22 + Math.random() * 4;
          this.ashPositions[i + 2] = (Math.random() - 0.5) * 40;
        }
      }
      (this.ash.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      this.ash.position.set(camera.x, camera.y, camera.z);
    }
    void day;
  }

  /** Apply fog to a scene and keep the clear colour in sync. */
  applyToScene(scene: THREE.Scene): void {
    scene.fog = this.fog;
    scene.background = null;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.dome.geometry.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.stars.geometry.dispose();
    this.starMat.dispose();
    this.sunSprite.material.dispose();
    this.sunSprite.material.map?.dispose();
    this.moonSprite.material.dispose();
    this.moonSprite.material.map?.dispose();
    for (const cloud of this.clouds) {
      const mat = cloud.mesh.material as THREE.Material;
      mat.dispose();
    }
    this.rain.geometry.dispose();
    (this.rain.material as THREE.Material).dispose();
    this.snow.geometry.dispose();
    (this.snow.material as THREE.Material).dispose();
    this.ash.geometry.dispose();
    (this.ash.material as THREE.Material).dispose();
  }
}
