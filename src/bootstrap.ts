import { Menus } from './engine/game/Menus';
import { Game, type GameSaveData } from './engine/game/Game';
import { getTemplate } from './content/Templates';
import { CommandAPI } from './engine/ai/CommandAPI';
import { McpBridge, loadMcpSettings, setSharedBridge } from './engine/ai/McpBridge';

export interface EmbeddedProject {
  format?: string;
  version?: number;
  name?: string;
  templateKey?: string;
  templateName?: string;
  save?: GameSaveData | null;
}

export interface VoxelForgeRuntime {
  game: Game;
  menus: Menus;
  commands: CommandAPI;
  bridge: McpBridge;
}

declare global {
  interface Window {
    voxelforge?: VoxelForgeRuntime;
    __VOXELFORGE_PROJECT__?: EmbeddedProject | null;
    __VOXELFORGE_READY__?: boolean;
  }
}

/**
 * Shared browser boot path for the editor and for exported standalone games.
 * Exported builds inject `window.__VOXELFORGE_PROJECT__` before the bundle runs
 * and go straight into that project instead of the template menu.
 */
export function boot(): VoxelForgeRuntime {
  const ui = document.getElementById('ui');
  if (!ui) throw new Error('VoxelForge: #ui root is missing from the page');

  const menus = new Menus(ui);
  const game = new Game(ui, menus);
  const commands = new CommandAPI(game);
  const bridge = new McpBridge(commands);
  setSharedBridge(bridge);

  function openMainMenu(): void {
    menus.showMain({
      onStart: (template) => {
        void game.launch(template);
      },
      onContinue: () => {
        void game.continueLatest();
      },
      onSettings: () => {
        menus.openSettings(game.settings, (settings) => game.applySettings(settings));
      },
      onGuide: () => {
        menus.openGuide();
      },
    });
  }

  game.onExitToMenu = () => {
    openMainMenu();
  };

  const runtime: VoxelForgeRuntime = { game, menus, commands, bridge };
  window.voxelforge = runtime;

  const embedded = window.__VOXELFORGE_PROJECT__;
  if (embedded?.templateKey) {
    const template = getTemplate(embedded.templateKey as Parameters<typeof getTemplate>[0]);
    const title = (embedded.name || embedded.templateName || template.name || 'VoxelForge Game').trim();
    game.projectName = title;
    document.title = title;
    void game.launch(template, embedded.save ?? undefined);
  } else {
    openMainMenu();
  }

  if (loadMcpSettings().enabled) bridge.start();

  window.__VOXELFORGE_READY__ = true;
  window.dispatchEvent(new CustomEvent('voxelforge:ready', { detail: runtime }));
  return runtime;
}
