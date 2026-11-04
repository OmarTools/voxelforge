export type CameraMode = 'first' | 'third' | 'isometric' | 'topdown' | 'side';

export interface CameraModeInfo {
  key: CameraMode;
  label: string;
  short: string;
  description: string;
  glyph: string;
}

export const CAMERA_MODES: CameraModeInfo[] = [
  {
    key: 'first',
    label: 'First person',
    short: 'FPS',
    description: 'Eyes-on view with the held item. Best for shooters and exploration.',
    glyph: '◉',
  },
  {
    key: 'third',
    label: 'Third person',
    short: 'TPS',
    description: 'Over-the-shoulder chase camera. Best for action and racing.',
    glyph: '◍',
  },
  {
    key: 'isometric',
    label: 'Isometric',
    short: 'ISO',
    description: 'High angled camera for tactics, city builders and RPGs.',
    glyph: '◇',
  },
  {
    key: 'topdown',
    label: 'Top-down',
    short: 'TOP',
    description: 'Overhead view for twin-stick, strategy and dungeon games.',
    glyph: '▣',
  },
  {
    key: 'side',
    label: 'Side view',
    short: 'SIDE',
    description: 'Locked side-on camera for platformers. A/D run, Space jumps.',
    glyph: '▤',
  },
];

export const CAMERA_MODE_BY_KEY = new Map(CAMERA_MODES.map((mode) => [mode.key, mode]));

export function isCameraMode(value: unknown): value is CameraMode {
  return typeof value === 'string' && CAMERA_MODE_BY_KEY.has(value as CameraMode);
}

export function cameraModeLabel(mode: CameraMode): string {
  return CAMERA_MODE_BY_KEY.get(mode)?.label ?? 'First person';
}
