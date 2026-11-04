import { getTemplate } from '../../content/Templates';
import type { GameSaveData } from '../game/Game';
import { ZipWriter, slugify } from './Zip';

export type PublishTarget = 'web' | 'desktop' | 'android' | 'ios';

export interface PublishTargetInfo {
  key: PublishTarget;
  label: string;
  short: string;
  description: string;
  badge: string;
  glyph: string;
}

export const PUBLISH_TARGETS: PublishTargetInfo[] = [
  {
    key: 'web',
    label: 'Web / itch.io',
    short: 'WEB',
    description: 'A self-contained HTML5 build that runs from any static host or itch.io zip upload.',
    badge: 'HTML + JS',
    glyph: '◍',
  },
  {
    key: 'desktop',
    label: 'Desktop',
    short: 'PC',
    description: 'An Electron project for Windows, macOS and Linux. npm install, then npm start or build installers.',
    badge: 'Win · macOS · Linux',
    glyph: '▣',
  },
  {
    key: 'android',
    label: 'Android',
    short: 'ANDROID',
    description: 'A Capacitor scaffold with the game in www/. Add the native project with the Android SDK installed.',
    badge: 'Capacitor · APK / AAB',
    glyph: '⬢',
  },
  {
    key: 'ios',
    label: 'iPhone / iPad',
    short: 'iOS',
    description: 'A Capacitor scaffold for Xcode. Building signed iOS binaries requires macOS and an Apple account.',
    badge: 'Capacitor · Xcode',
    glyph: '◈',
  },
];

export interface PublishRequest {
  name: string;
  target: PublishTarget;
  save: GameSaveData;
}

export interface PublishFile {
  path: string;
  bytes: number;
}

export interface PublishResult {
  target: PublishTarget;
  filename: string;
  blob: Blob;
  fileCount: number;
  bytes: number;
  files: PublishFile[];
  notes: string[];
}

interface RuntimeAsset {
  /** Path inside the web root. */
  path: string;
  data: Uint8Array;
}

interface RuntimeBundle {
  kind: 'standalone' | 'app';
  files: RuntimeAsset[];
  entry: string;
  css?: string;
  note: string;
}

const RUNTIME_JS = 'engine/voxelforge-runtime.js';
const ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<path fill="#7ed957" d="M16 2 30 10v12L16 30 2 22V10z"/>
<path fill="#9aef70" d="M16 2 30 10l-14 8L2 10z"/>
<path fill="#4b9f3d" d="M2 10v12l14 8V18z"/>
<path fill="#367a2f" d="M16 18v12l14-8V10z"/>
</svg>`;

const TEXT_ENCODER = new TextEncoder();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** JSON that is safe to inline inside a <script> element. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function appId(name: string): string {
  const slug = slugify(name, 'game').replace(/-/g, '');
  return `com.voxelforge.${slug || 'game'}`;
}

async function fetchRuntime(): Promise<RuntimeBundle> {
  const notes: string[] = [];
  const candidates = [
    new URL(RUNTIME_JS, document.baseURI).href,
    new URL('voxelforge-runtime.js', document.baseURI).href,
  ];
  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) continue;
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.byteLength < 4096) continue;
      return {
        kind: 'standalone',
        files: [{ path: RUNTIME_JS, data }],
        entry: RUNTIME_JS,
        note: 'Bundled standalone runtime.',
      };
    } catch {
      // Try the next location.
    }
  }

  // Production fallback: reuse the app's own hashed bundle. It boots through
  // main.ts, which honours window.__VOXELFORGE_PROJECT__.
  const script = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  const scriptUrl = script?.src ? new URL(script.src, document.baseURI) : null;
  if (scriptUrl && /\/assets\//.test(scriptUrl.pathname)) {
    try {
      const response = await fetch(scriptUrl.href, { cache: 'no-store' });
      if (response.ok) {
        const jsData = new Uint8Array(await response.arrayBuffer());
        const files: RuntimeAsset[] = [{ path: `assets/${scriptUrl.pathname.split('/').pop()}`, data: jsData }];
        let css: string | undefined;
        const cssLink = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"][href]');
        if (cssLink?.href) {
          const cssUrl = new URL(cssLink.href, document.baseURI);
          const cssResponse = await fetch(cssUrl.href, { cache: 'no-store' });
          if (cssResponse.ok) {
            const cssPath = `assets/${cssUrl.pathname.split('/').pop()}`;
            files.push({ path: cssPath, data: new Uint8Array(await cssResponse.arrayBuffer()) });
            css = cssPath;
          }
        }
        notes.push('Standalone runtime was not found; used the production app bundle instead.');
        return {
          kind: 'app',
          files,
          entry: files[0].path,
          css,
          note: notes[0],
        };
      }
    } catch {
      // Fall through to the explicit error.
    }
  }

  throw new Error(
    'The standalone player bundle is missing. Run "npm run build:runtime" once (or "npm run build") and reopen VoxelForge.',
  );
}

function projectPayload(request: PublishRequest) {
  const template = getTemplate(request.save.templateKey);
  return {
    format: 'voxelforge-project',
    version: 1,
    name: request.name || template.name,
    templateKey: request.save.templateKey,
    templateName: template.name,
    engine: { name: 'VoxelForge', version: '1.1.0' },
    createdAt: new Date().toISOString(),
    save: request.save,
  };
}

function indexHtml(request: PublishRequest, runtime: RuntimeBundle): string {
  const payload = inlineJson(projectPayload(request));
  const title = escapeHtml(request.name || getTemplate(request.save.templateKey).name);
  const runtimeTag =
    runtime.kind === 'standalone'
      ? `<script src="./${runtime.entry}"></script>`
      : `${runtime.css ? `<link rel="stylesheet" href="./${runtime.css}">` : ''}
    <script type="module" src="./${runtime.entry}"></script>`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#0b1017">
  <title>${title}</title>
  <meta name="description" content="${title} — a VoxelForge game.">
  <link rel="icon" href="./icon.svg">
  <style>
    html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; background: #0b1017; }
    #app { position: fixed; inset: 0; overflow: hidden; }
    #game-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; background: #0b1118; }
    #ui { position: absolute; inset: 0; }
  </style>
  ${runtime.kind === 'standalone' && runtime.css ? `<link rel="stylesheet" href="./${runtime.css}">` : ''}
</head>
<body>
  <div id="app">
    <canvas id="game-canvas" aria-label="Game viewport"></canvas>
    <div id="ui"></div>
  </div>
  <script>window.__VOXELFORGE_PROJECT__ = ${payload};</script>
  ${runtimeTag}
</body>
</html>
`;
}

function webReadme(name: string, templateName: string, notes: string[]): string {
  return `# ${name}

A standalone **VoxelForge** game built from the **${templateName}** template.

## Run it

Because the build is plain HTML/JS, any static server works:

\`\`\`bash
npx serve .
# or: python -m http.server 8080
\`\`\`

Opening \`index.html\` directly from disk usually works too, but some browsers
restrict local module/asset loading. A tiny static server is the safest choice.

## Publish it

- **itch.io**: zip this folder's contents and upload it as an HTML game.
- **Netlify / Vercel / GitHub Pages**: drop the folder in as-is.
- **Desktop**: use the Desktop target in VoxelForge's Publish panel.
- **Android / iOS**: use the Capacitor targets in the Publish panel.

## Controls

| Action | Key |
| --- | --- |
| Move | WASD |
| Jump / swim | Space |
| Sprint | Shift |
| Mine / attack | Left mouse |
| Place / interact | Right mouse |
| Inventory | E |
| Studio | B |
| Change camera | F5 |
| Enter / exit vehicle | F6 |
| Pause | Esc |

The whole game is defined by \`project.json\` (world seed, edits, rules, scripts,
camera and vehicle setup). Replace it and the build becomes a different game.

${notes.length ? `\n> ${notes.join('\n> ')}\n` : ''}`;
}

function desktopReadme(name: string, notes: string[]): string {
  return `# ${name} — Desktop build

This folder is an **Electron** wrapper around the exported VoxelForge game.

## Run

\`\`\`bash
npm install
npm start
\`\`\`

## Build installers

\`\`\`bash
npm run dist
\`\`\`

\`electron-builder\` writes installers to \`release/\`:

- **Windows** — NSIS installer (built on Windows)
- **Linux** — AppImage (built on Linux)
- **macOS** — DMG (must be built on macOS; sign/notarise with an Apple account)

Set \`build.appId\`, \`build.productName\` and icons in \`package.json\` before shipping.
Code signing is optional for personal builds and required for most stores.

The game files are \`index.html\`, \`engine/\` and \`project.json\`. Keep them next to
\`main.cjs\` when repackaging.

${notes.length ? `\n> ${notes.join('\n> ')}\n` : ''}`;
}

function capacitorReadme(name: string, platform: 'android' | 'ios'): string {
  if (platform === 'android') {
    return `# ${name} — Android build

This is a **Capacitor** project. The playable game lives in \`www/\`.

## Requirements

- Node.js 18+
- Android Studio with an Android SDK (API 34+) and a JDK 17

## Add the native project

\`\`\`bash
npm install
npx cap add android
npx cap sync android
npx cap open android
\`\`\`

Then press **Run** in Android Studio, or build a signed App Bundle with
**Build → Generate Signed Bundle / APK**. The APK/AAB is written under
\`android/app/build/outputs/\`.

## Update the game

Replace \`www/\` with a newer export from VoxelForge, then run:

\`\`\`bash
npx cap sync android
\`\`\`

The app id lives in \`capacitor.config.json\`. Change it before publishing to
Google Play. Touch controls are not included by default — add on-screen
buttons through the VoxelScript API or a Capacitor plugin if the game needs them.
`;
  }
  return `# ${name} — iPhone / iPad build

This is a **Capacitor** project. The playable game lives in \`www/\`.

## Requirements

- macOS with **Xcode 15+**
- Node.js 18+
- An Apple Developer account for device / App Store builds

## Add the native project

\`\`\`bash
npm install
npx cap add ios
npx cap sync ios
npx cap open ios
\`\`\`

Select a signing team in Xcode, then **Run** on a simulator or device.
For the App Store use **Product → Archive**.

> iOS binaries can only be produced on macOS. The web game itself is identical
> to the Web target, so you can test it in Safari before adding the native shell.

The app id lives in \`capacitor.config.json\`. Change it before publishing.
`;
}

function capacitorConfig(name: string): string {
  return `${JSON.stringify(
    {
      appId: appId(name),
      appName: name,
      webDir: 'www',
      bundledWebRuntime: false,
      backgroundColor: '#0b1017',
      allowNavigation: [],
    },
    null,
    2,
  )}\n`;
}

function capacitorPackage(name: string, platform: 'android' | 'ios'): string {
  return `${JSON.stringify(
    {
      name: slugify(name, 'voxelforge-game'),
      version: '1.0.0',
      private: true,
      description: `${name} — a VoxelForge game.`,
      scripts: {
        sync: `cap sync ${platform}`,
        open: `cap open ${platform}`,
        android: 'cap add android && cap sync android && cap open android',
        ios: 'cap add ios && cap sync ios && cap open ios',
      },
      dependencies: {
        '@capacitor/core': '^6.2.0',
        [platform === 'android' ? '@capacitor/android' : '@capacitor/ios']: '^6.2.0',
      },
      devDependencies: {
        '@capacitor/cli': '^6.2.0',
      },
    },
    null,
    2,
  )}\n`;
}

function electronMain(): string {
  return `'use strict';

const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0b1017',
    autoHideMenuBar: true,
    title: 'VoxelForge Game',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  window.loadFile(path.join(__dirname, 'index.html'));
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`;
}

function electronPackage(name: string, id: string): string {
  return `${JSON.stringify(
    {
      name: slugify(name, 'voxelforge-game'),
      version: '1.0.0',
      private: true,
      description: `${name} — a VoxelForge game.`,
      main: 'main.cjs',
      scripts: {
        start: 'electron .',
        dist: 'electron-builder',
      },
      devDependencies: {
        electron: '^31.7.7',
        'electron-builder': '^24.13.3',
      },
      build: {
        appId: id,
        productName: name,
        directories: { output: 'release' },
        files: ['index.html', 'main.cjs', 'engine/**/*', 'project.json', 'icon.svg'],
        win: { target: 'nsis' },
        linux: { target: ['AppImage'], category: 'Game' },
        mac: { target: 'dmg', category: 'public.app-category.games' },
      },
    },
    null,
    2,
  )}\n`;
}

function addWebFiles(files: Map<string, Uint8Array>, request: PublishRequest, runtime: RuntimeBundle, prefix = ''): void {
  const addText = (path: string, content: string) => files.set(`${prefix}${path}`, TEXT_ENCODER.encode(content));
  addText('index.html', indexHtml(request, runtime));
  for (const asset of runtime.files) files.set(`${prefix}${asset.path}`, asset.data);
  addText('project.json', `${JSON.stringify(projectPayload(request), null, 2)}\n`);
  addText('icon.svg', ICON);
}

export class Publisher {
  constructor(private onChange?: (message: string) => void) {}

  async build(request: PublishRequest): Promise<PublishResult> {
    if (!request.save || typeof request.save.templateKey !== 'string') {
      throw new Error('There is no running world to publish yet.');
    }
    const name = (request.name || 'Untitled Game').trim().slice(0, 60) || 'Untitled Game';
    const safeName = name.replace(/[<>:"/\\|?*]+/g, '').trim() || 'VoxelForge Game';
    const template = getTemplate(request.save.templateKey);
    const notes: string[] = [];
    this.onChange?.('Collecting the player runtime…');
    const runtime = await fetchRuntime();
    if (runtime.note) notes.push(runtime.note);

    const files = new Map<string, Uint8Array>();
    const prefix = request.target === 'android' || request.target === 'ios' ? 'www/' : '';
    addWebFiles(files, { ...request, name: safeName }, runtime, prefix);

    if (request.target === 'desktop') {
      files.set('main.cjs', TEXT_ENCODER.encode(electronMain()));
      files.set('package.json', TEXT_ENCODER.encode(electronPackage(safeName, appId(safeName))));
      files.set('README.md', TEXT_ENCODER.encode(desktopReadme(safeName, notes)));
      files.set('.gitignore', TEXT_ENCODER.encode('node_modules/\nrelease/\n'));
    } else if (request.target === 'web') {
      files.set('README.md', TEXT_ENCODER.encode(webReadme(safeName, template.name, notes)));
    } else {
      const platform = request.target;
      files.set('capacitor.config.json', TEXT_ENCODER.encode(capacitorConfig(safeName)));
      files.set('package.json', TEXT_ENCODER.encode(capacitorPackage(safeName, platform)));
      files.set('README.md', TEXT_ENCODER.encode(capacitorReadme(safeName, platform)));
      files.set('.gitignore', TEXT_ENCODER.encode('node_modules/\nandroid/\nios/\ndist/\n'));
    }

    this.onChange?.('Writing package files…');
    const zip = new ZipWriter();
    for (const [path, data] of files) zip.add(path, data);

    const blob = zip.build();
    const suffix =
      request.target === 'desktop' ? 'desktop' : request.target === 'android' ? 'android' : request.target === 'ios' ? 'ios' : 'web';
    const filename = `${slugify(safeName)}-${suffix}.zip`;
    const list = [...files.entries()].map(([path, data]) => ({ path, bytes: data.length })).sort((a, b) => a.path.localeCompare(b.path));

    if (request.target === 'ios') notes.push('iOS packaging requires macOS + Xcode to produce a signed app.');
    if (request.target === 'android') notes.push('Android packaging requires Android Studio / SDK to produce an APK or AAB.');
    if (request.target === 'desktop') notes.push('Installers are built with electron-builder on each target OS.');

    return {
      target: request.target,
      filename,
      blob,
      fileCount: files.size,
      bytes: blob.size,
      files: list,
      notes,
    };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
