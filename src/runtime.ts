/**
 * Standalone player entry. Built by `vite.runtime.config.ts` into
 * `public/engine/voxelforge-runtime.js` and bundled into exported games.
 *
 * CSS is inlined so the exported zip only needs one script file.
 */
import css from './style.css?inline';
import { boot } from './bootstrap';

const style = document.createElement('style');
style.dataset.voxelforge = 'runtime';
style.textContent = css;
document.head.appendChild(style);

boot();
