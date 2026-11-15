import { Menus } from './engine/game/Menus';
import { Game, type GameSaveData } from './engine/game/Game';
import { getTemplate } from './content/Templates';
import { CommandAPI } from './engine/ai/CommandAPI';
import { McpBridge, loadMcpSettings, setSharedBridge } from './engine/ai/McpBridge';
import { MultiplayerRuntime, configuredServerUrl } from './net/MultiplayerRuntime';

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
  multiplayer?: MultiplayerRuntime;
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

  // Multiplayer is strictly opt-in: no server URL means no extra UI or socket.
  const serverUrl = configuredServerUrl();
  const multiplayer = serverUrl ? new MultiplayerRuntime(game, serverUrl) : undefined;

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
      ...(multiplayer
        ? {
            onMultiplayer: () => multiplayer.openLobby(),
            multiplayerNote: 'invite rooms',
          }
        : {}),
    });
  }

  game.onExitToMenu = () => {
    multiplayer?.handleGameExit();
    openMainMenu();
  };

  const runtime: VoxelForgeRuntime = { game, menus, commands, bridge, ...(multiplayer ? { multiplayer } : {}) };
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
    const invitedRoom = new URLSearchParams(window.location.search).get('room');
    if (multiplayer && invitedRoom) multiplayer.openLobby(invitedRoom);
  }

  if (loadMcpSettings().enabled) bridge.start();

  window.__VOXELFORGE_READY__ = true;
  window.dispatchEvent(new CustomEvent('voxelforge:ready', { detail: runtime }));
  return runtime;
}
