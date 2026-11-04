import * as THREE from 'three';

/**
 * Reusable shader materials for VoxelForge.
 *
 * These materials are intentionally self-contained (no external textures) so
 * they can be dropped onto props, signs, portals and water planes in any
 * template. Each material exposes `material.userData.tick(elapsed)` for time
 * based animation.
 */

function timeMaterial(uniforms: Record<string, THREE.IUniform>, vertex: string, fragment: string, extra: THREE.ShaderMaterialParameters = {}): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, ...uniforms },
    vertexShader: vertex,
    fragmentShader: fragment,
    ...extra,
  });
  material.userData.tick = (elapsed: number) => {
    material.uniforms.uTime.value = elapsed;
  };
  return material;
}

const BASIC_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalW;
  varying vec3 vViewDir;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** Animated neon sign / trim material with a soft pulse and scanlines. */
export function createNeonMaterial(color: string | number, options: { intensity?: number; speed?: number } = {}): THREE.ShaderMaterial {
  const c = new THREE.Color(color);
  return timeMaterial(
    { uColor: { value: c }, uIntensity: { value: options.intensity ?? 1 }, uSpeed: { value: options.speed ?? 1 } },
    BASIC_VERT,
    /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uSpeed;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float pulse = 0.82 + 0.18 * sin(uTime * 3.1 * uSpeed + vUv.y * 14.0);
        float scan = 0.9 + 0.1 * sin(vUv.y * 180.0 + uTime * 16.0);
        float rim = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), 2.0);
        vec3 col = uColor * (pulse * scan * uIntensity) + vec3(rim * 0.55 * uIntensity);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  );
}

/** Transparent hologram panel: scanlines, flicker and a bright edge. */
export function createHologramMaterial(color: string | number): THREE.ShaderMaterial {
  const c = new THREE.Color(color);
  return timeMaterial(
    { uColor: { value: c } },
    BASIC_VERT,
    /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float flicker = 0.86 + 0.14 * sin(uTime * 21.0) * sin(uTime * 7.3);
        float scan = 0.55 + 0.45 * sin(vUv.y * 240.0 - uTime * 12.0);
        float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x) *
                     smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        float alpha = (0.16 + 0.18 * scan) * flicker * (0.5 + 0.5 * edge);
        vec3 col = uColor * (0.8 + 0.6 * scan) + vec3(0.2) * edge;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide },
  );
}

/** Curtain-like aurora ribbon for night skies. */
export function createAuroraMaterial(colorA: string | number, colorB: string | number): THREE.ShaderMaterial {
  return timeMaterial(
    { uA: { value: new THREE.Color(colorA) }, uB: { value: new THREE.Color(colorB) } },
    /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    /* glsl */ `
      uniform vec3 uA;
      uniform vec3 uB;
      uniform float uTime;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
      }
      void main() {
        float t = uTime * 0.055;
        vec2 p = vec2(vUv.x * 4.0 + t, vUv.y * 2.0 - t * 0.5);
        float band = noise(p) * 0.55 + noise(p * 2.3 + 4.1) * 0.3;
        band += 0.18 * sin(vUv.x * 22.0 + uTime * 0.6);
        float curtain = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.35, vUv.y);
        float alpha = smoothstep(0.36, 0.78, band) * curtain * 0.42;
        vec3 col = mix(uA, uB, vUv.x + 0.18 * sin(uTime * 0.3));
        gl_FragColor = vec4(col * (0.8 + band * 0.8), alpha);
      }
    `,
    { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide },
  );
}

/** Stylised water surface with moving waves and a fresnel sky reflection. */
export function createWaterMaterial(deep: string | number, shallow: string | number): THREE.ShaderMaterial {
  return timeMaterial(
    {
      uDeep: { value: new THREE.Color(deep) },
      uShallow: { value: new THREE.Color(shallow) },
      uSun: { value: new THREE.Vector3(0.4, 0.8, 0.2) },
    },
    /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec3 pos = position;
        pos.z += sin(pos.x * 0.55 + uTime * 1.4) * 0.055;
        pos.z += cos(pos.y * 0.7 - uTime * 1.1) * 0.045;
        vec4 world = modelMatrix * vec4(pos, 1.0);
        vWorld = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    /* glsl */ `
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform vec3 uSun;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float w = sin(vWorld.x * 0.8 + uTime * 1.6) * 0.5 + cos(vWorld.z * 0.65 - uTime * 1.2) * 0.5;
        vec3 normal = normalize(vNormalW + vec3(w * 0.08, 0.0, w * 0.06));
        float fres = pow(1.0 - max(dot(normal, normalize(vViewDir)), 0.0), 2.2);
        vec3 col = mix(uDeep, uShallow, 0.35 + 0.4 * w);
        float spec = pow(max(dot(reflect(-normalize(uSun), normal), normalize(vViewDir)), 0.0), 42.0);
        float foam = smoothstep(0.72, 1.0, w * 0.5 + 0.5) * 0.18;
        col = mix(col, vec3(0.85, 0.95, 1.0), fres * 0.55 + foam);
        col += vec3(1.0, 0.92, 0.72) * spec * 0.8;
        gl_FragColor = vec4(col, 0.86);
      }
    `,
    { transparent: true, depthWrite: false, side: THREE.DoubleSide },
  );
}

/** Swirling energy portal for dungeon / arena props. */
export function createEnergyMaterial(color: string | number): THREE.ShaderMaterial {
  return timeMaterial(
    { uColor: { value: new THREE.Color(color) } },
    BASIC_VERT,
    /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        float a = atan(p.y, p.x);
        float swirl = sin(a * 6.0 + r * 22.0 - uTime * 3.4) * 0.5 + 0.5;
        float ring = smoothstep(0.5, 0.22, r);
        vec3 col = mix(uColor * 0.35, uColor * 1.8, swirl) * ring;
        float alpha = (0.45 + swirl * 0.5) * ring;
        gl_FragColor = vec4(col, alpha);
      }
    `,
    { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide },
  );
}

/** Simple additive crystal glow used for pickups and beacons. */
export function createBeaconMaterial(color: string | number): THREE.ShaderMaterial {
  return timeMaterial(
    { uColor: { value: new THREE.Color(color) } },
    BASIC_VERT,
    /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float band = 0.6 + 0.4 * sin(vUv.y * 30.0 - uTime * 4.0);
        float rim = pow(1.0 - abs(dot(normalize(vNormalW), normalize(vViewDir))), 1.6);
        gl_FragColor = vec4(uColor * (0.55 + band * 0.5 + rim), 0.72);
      }
    `,
    { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide },
  );
}

export type ShaderMaterialKind = 'neon' | 'hologram' | 'aurora' | 'water' | 'energy' | 'beacon';
