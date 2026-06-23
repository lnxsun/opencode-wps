# AGENTS.md

## Project

OpenCode WPS — WPS Office plugin embedding an AI chat sidebar (OpenCode AI) into WPS Writer, Spreadsheet, and Presentation.

## Architecture (critical)

Source files (git-tracked) are installed to user directories (not git-tracked):

```
opencode-wps/          → %APPDATA%\kingsoft\wps\jsaddons\opencode-wps_\
wps-office-mcp/        → ~/.config/opencode/opencode.json (MCP config entry)
skills/                → ~/.opencode/skills/
agents/                → ~/.config/opencode/agents/ + ~/.opencode/agents/
.opencode/plugins/     → ~/.config/opencode/plugins/
```

**Rules:**
- Edit source files only, then run `node install-addons.js` to sync
- Never edit files in `~/.opencode/skills/`, `%APPDATA%\kingsoft\wps\jsaddons\`, `~/.config/opencode/opencode.json`, or `~/.config/opencode/agents/` — these are install artifacts
- Verify with `git status` after every change to avoid editing the wrong directory

## Key Commands

```bash
node install-addons.js          # One-shot install: WPS plugin + MCP build + skills/agents/plugins sync
npm run build                   # Build MCP server (cd wps-office-mcp && npm run build, or root shortcut)
npm run mcp:install             # Install MCP dependencies
npm run mcp:test                # Run MCP tests (cd wps-office-mcp && npm test)
npm run format                  # Format with Prettier
npm run format:check            # Check formatting
```

**Order matters**: Edit source → `node install-addons.js` → restart WPS / OpenCode service.

## Project Structure

```
opencode-wps/              # WPS JS add-in (main.js, taskpane.html, ribbon.xml, config.js, launcher.js)
wps-office-mcp/            # MCP server (TypeScript, 240 COM Actions + 12 built-in tools)
  src/                     # Server, client, tools, types, utils
skills/                    # 5 OpenCode Skills (wps-excel/word/ppt/office/proofread)
  README.md                # MUST READ before modifying skills
agents/                    # 4 agent definitions (wps-expert, wps-word, wps-excel, wps-ppt)
.opencode/
  plugins/governance.js    # Execution governance plugin (G1-G7 + P1-P16 + T1-T11 rules)
  opencode.jsonc           # OpenCode config template (merged into ~/.config/opencode/opencode.json)
install-addons.js          # One-shot install script (7 steps)
```

## MCP Server

`wps-office-mcp/` is a TypeScript MCP server. Key commands:
```bash
cd wps-office-mcp && npm install && npm run build   # Must build before MCP works
cd wps-office-mcp && npm test                        # Jest tests
cd wps-office-mcp && npm run test:unit               # Unit tests only
cd wps-office-mcp && npm run dev                     # Dev mode (ts-node)
```

Three-tier tool system:
- **12 built-in tools** (`wps_xxx`) — always registered via MCP
- **238 registered tools** (`wps_xxx_xxx`) — TypeScript handlers, routed via Gateway
- **240 COM Actions** — discovered on-demand via `wps_office_search`/`wps_office_execute` Gateway tools

WPS must be running for any MCP operation.

## WPS Plugin

`opencode-wps/` contains the JS add-in. Key files:
- `config.js` — global config hub (`CONFIG` object: OpenCode port 14096, Launcher port 14097, user home)
- `main.js` — ribbon callbacks, state management, OpenCode connection
- `taskpane.html` — chat UI (SSE streaming, Markdown rendering, session/agent management)
- `launcher.js` — background process managing OpenCode service lifecycle

All file paths in WPS operations must be absolute.

## Governance Plugin

`.opencode/plugins/governance.js` intercepts all MCP tool calls at runtime via OpenCode Plugin Hooks (`tool.execute.before`/`after`):
- **G1-G7**: Gateway enforcement, destructive confirmation, path safety, password protection, parameter validation
- **P1-P16**: Proofreading rules (batch ≤200, strict sequential proofread→confirm→fix)
- **T1-T11**: Template filling rules (evaluate doc, batch ≤200, track revisions, no fabricated fields)

Modify in `.opencode/plugins/governance.js`, then `node install-addons.js` to sync.

## Agents

Defined in `agents/` (installed to `~/.config/opencode/agents/`). Invoke via `@wps-expert`, `@wps-word`, `@wps-excel`, `@wps-ppt` in messages.

## Gotchas

1. **Platform**: Windows only (WPS COM, `%APPDATA%`, `schtasks`)
2. **WPS Chromium**: Bundled Chromium 103 — no modern web features
3. **Launcher**: Runs at `http://127.0.0.1:14097`, manages `opencode serve` on port 14096
4. **MCP won't connect** → `cd wps-office-mcp && npm install && npm run build`
5. **Plugin not visible** → Check `%APPDATA%\kingsoft\wps\jsaddons\opencode-wps_` exists
6. **Skills/agents not loaded** → Re-run `node install-addons.js` + restart OpenCode
7. **Always use absolute file paths** — WPS COM requires them
