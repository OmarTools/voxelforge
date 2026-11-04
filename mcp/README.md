# VoxelForge MCP bridge

VoxelForge ships with a local MCP server that lets AI agents inspect and drive a
running game in the browser. It uses only Node.js built-ins, so there is nothing
to `npm install`.

```
AI client ──stdio JSON-RPC──▶ mcp/voxelforge-mcp.mjs ──HTTP queue──▶ VoxelForge tab
                                      ▲                                  │
                                      └──────── result POST ─────────────┘
```

The browser half lives in **Publish → AI control**. The server keeps a tiny
in-memory queue; the page polls it, executes commands through `CommandAPI`, and
posts the result back. No files are uploaded and nothing leaves the machine.

## 1. Start the server

From `voxelforge/`:

```bash
node mcp/voxelforge-mcp.mjs
```

Expected output:

```text
[voxelforge-mcp] HTTP bridge listening on http://127.0.0.1:8765
[voxelforge-mcp] Waiting for the browser bridge. Start it in VoxelForge → Publish → AI control.
```

Useful environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `VOXELFORGE_MCP_PORT` | `8765` | HTTP queue port |
| `VOXELFORGE_MCP_HOST` | `127.0.0.1` | Bind address |
| `VOXELFORGE_MCP_TOKEN` | empty | Optional shared secret |
| `VOXELFORGE_MCP_TIMEOUT` | `30000` | Per-command timeout in ms |

PowerShell example:

```powershell
$env:VOXELFORGE_MCP_TOKEN = "my-secret"
node mcp/voxelforge-mcp.mjs
```

### HTTP-only mode

If another process already owns stdio, or you only need the raw HTTP API, start
the server without the MCP transport:

```bash
node mcp/voxelforge-mcp.mjs --http-only
# or
$env:VOXELFORGE_MCP_HTTP_ONLY="1"; node mcp/voxelforge-mcp.mjs
```

In this mode the process never writes JSON-RPC to stdout, so it is safe to keep
running in a terminal or behind a script. `/health`, `/poll`, `/result`, and
`/command` behave exactly as described in section 5. To expose the same bridge
to an MCP client, run a second instance on another port or restart without the
flag.

## 2. Start the browser bridge

1. Open VoxelForge and launch any template.
2. Press `Esc` → **Publish** (or `B` → **Publish** in the studio).
3. Open the **AI control** tab.
4. Check the URL (`http://127.0.0.1:8765`) and token, then **Start bridge**.
5. The badge turns **ONLINE** and the log fills with command results.

The status is saved in `localStorage` under `voxelforge.mcp`, so the bridge
reconnects automatically the next time the game starts.

## 3. Add the server to an MCP client

### Claude Desktop

Edit `claude_desktop_config.json` (Windows:
`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "voxelforge": {
      "command": "node",
      "args": ["C:\\Users\\you\\Documents\\voxelforge\\mcp\\voxelforge-mcp.mjs"],
      "env": {
        "VOXELFORGE_MCP_PORT": "8765"
      }
    }
  }
}
```

### OpenCode

Add to `opencode.json` (project or global):

```json
{
  "mcp": {
    "voxelforge": {
      "type": "local",
      "command": ["node", "C:\\Users\\you\\Documents\\voxelforge\\mcp\\voxelforge-mcp.mjs"],
      "enabled": true
    }
  }
}
```

Restart the client and confirm that the `voxelforge_*` tools appear. The
companion skill at `skills/voxelforge-ai/SKILL.md` documents the workflow and
every command.

### Cursor / other clients

Use the same `command` + `args` pair. Any client that supports stdio MCP servers
works; the server needs no SDK.

## 4. Tools

| Tool | What it does |
| --- | --- |
| `voxelforge_state` | Player, camera, vehicle, race, sim, world, objectives, scripts |
| `voxelforge_list` | Templates, items, blocks, prefabs, entities, cameras, commands |
| `voxelforge_launch` | Launch a template from scratch |
| `voxelforge_camera` | First, third, isometric, top-down, side, or cycle |
| `voxelforge_vehicle` | Enter/exit kart or car |
| `voxelforge_teleport` / `voxelforge_look` | Move and aim |
| `voxelforge_give` / `voxelforge_spawn` | Items and entities |
| `voxelforge_set_time` / `voxelforge_set_weather` | Sky and weather |
| `voxelforge_get_scripts` / `voxelforge_run_script` | Read and replace VoxelScript |
| `voxelforge_set_rule` / `voxelforge_set_objective` | World rules and objectives |
| `voxelforge_set_block` / `voxelforge_stamp_prefab` | World building |
| `voxelforge_entities` | Living entity list |
| `voxelforge_export` / `voxelforge_publish` | Project JSON / downloadable package |
| `voxelforge_open_panel` | Studio, scripts, publish, inventory |
| `voxelforge_command` | Generic escape hatch (`{ type, payload }`); `type: "sim"` drives cooking/shop/lucky actions |

## 5. Raw HTTP API

The bridge is also usable without MCP:

```bash
curl http://127.0.0.1:8765/health
curl -X POST http://127.0.0.1:8765/command \
  -H "content-type: application/json" \
  -d '{"type":"toast","payload":{"message":"Hello from curl","kind":"good"}}'
```

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/health` | GET | Server + browser status |
| `/poll` | GET | Browser long-poll; returns `204` when idle |
| `/result` | POST | Browser posts `{ id, ok, message, data }` |
| `/command` | POST | Enqueue a command and wait for its result |

When `VOXELFORGE_MCP_TOKEN` is set, send `x-voxelforge-token` on every request
and enter the same token in the AI control tab.

## 6. Troubleshooting

- **`No response from VoxelForge after 30000 ms`** — the page is closed, the
  bridge is stopped, or the token does not match. Check `/health`; `browser`
  should read `online`.
- **`Failed to fetch` / CORS** — make sure you opened VoxelForge from the Vite
  dev server or the published build, not a `file://` URL, and that the port in
  the AI panel matches `VOXELFORGE_MCP_PORT`.
- **Port already in use** — start with another port:
  `$env:VOXELFORGE_MCP_PORT="8766"; node mcp/voxelforge-mcp.mjs`, then use
  `http://127.0.0.1:8766` in the AI panel.
- **Stale queue after a crash** — restart the MCP server. The queue is in memory
  only, so nothing persists.
