import { defineConfig } from 'vite';

/**
 * Standalone player build. The resulting IIFE is copied into exported games and
 * also served from /engine/voxelforge-runtime.js so the in-app publisher can
 * bundle it without a network round-trip to a build server.
 */
export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'public/engine',
    emptyOutDir: true,
    cssCodeSplit: false,
    sourcemap: false,
    lib: {
      entry: 'src/runtime.ts',
      name: 'VoxelForgeRuntime',
      formats: ['iife'],
      fileName: () => 'voxelforge-runtime.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
