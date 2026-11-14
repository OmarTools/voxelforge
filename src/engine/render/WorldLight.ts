import * as THREE from 'three';

/**
 * Shared lighting uniforms for chunk materials.
 *
 * Chunk meshes bake two light values per vertex (`aLight`: x = sky, y = block).
 * Three's Lambert shader handles the sun/moon/ambient rig; the patch below adds:
 *   - the sky term, which dims surfaces that can't see the sky (caves, overhangs)
 *   - a warm "block light" term that makes torches, lanterns, glowstone and lava
 *     actually light up their surroundings, fading out under strong daylight
 *
 * Sky updates `WORLD_LIGHT.uDay` every frame; all four chunk materials share the
 * same uniform objects, so there is nothing to push per material.
 */
export const WORLD_LIGHT = {
  /** 0 at night … 1 at midday (matches the sun light strength). */
  uDay: { value: 1 },
  /** Colour of block-emitted light. */
  uBlockTint: { value: new THREE.Color(1.0, 0.78, 0.5) },
};

const CACHE_KEY = 'voxelforge-world-light-v1';
const warned = new Set<string>();

function patch(source: string, search: string, replacement: string, label: string): string {
  if (!source.includes(search)) {
    if (!warned.has(label)) {
      warned.add(label);
      console.warn(`[VoxelForge] World lighting patch could not find "${search}" in ${label}; block light is disabled for this material.`);
    }
    return source;
  }
  return source.replace(search, replacement);
}

export function applyWorldLighting<T extends THREE.MeshLambertMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uDay = WORLD_LIGHT.uDay;
    shader.uniforms.uBlockTint = WORLD_LIGHT.uBlockTint;

    let vertex = shader.vertexShader;
    vertex = patch(vertex, '#include <common>', '#include <common>\nattribute vec2 aLight;\nvarying vec2 vLight;', 'vertex/common');
    vertex = patch(vertex, '#include <color_vertex>', '#include <color_vertex>\n\tvLight = aLight;', 'vertex/color_vertex');
    shader.vertexShader = vertex;

    let fragment = shader.fragmentShader;
    fragment = patch(
      fragment,
      '#include <common>',
      '#include <common>\nuniform float uDay;\nuniform vec3 uBlockTint;\nvarying vec2 vLight;',
      'fragment/common',
    );
    fragment = patch(
      fragment,
      '#include <color_fragment>',
      `#include <color_fragment>
\tvec3 vfAlbedo = diffuseColor.rgb;
\tdiffuseColor.rgb *= 0.2 + 0.8 * vLight.x;`,
      'fragment/color_fragment',
    );
    fragment = patch(
      fragment,
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
\t{
\t\tfloat vfBlock = vLight.y;
\t\tfloat vfTorch = vfBlock * vfBlock * (1.35 - 0.35 * vfBlock);
\t\tfloat vfSun = vLight.x * uDay;
\t\ttotalEmissiveRadiance += vfAlbedo * uBlockTint * vfTorch * (1.0 - 0.85 * vfSun);
\t}`,
      'fragment/emissivemap_fragment',
    );
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => CACHE_KEY;
  return material;
}
