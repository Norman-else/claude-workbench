# Claude Workbench

A modern GUI management tool for the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) with a built-in **AI Assistant**. It provides a visual interface to manage MCP servers, API credential profiles, custom slash-commands, agent skills, and community plugins — all without manually editing JSON or shell config files. The integrated AI Assistant lets you interact with Claude directly inside the app, with support for tool use, file/image uploads, web search, and streaming responses.

Available as a **web app** (runs in your browser) or a **desktop app** (native Electron wrapper for Windows and macOS).

---

## Features

### AI Assistant
- Built-in conversational AI assistant powered by Claude, accessible from any tab via floating panel
- Real-time streaming responses with smooth token-by-token rendering
- **Tool use**: Slash commands (`/tool-name`) to invoke Claude Workbench management tools directly from chat — browse MCP servers, manage environment profiles, explore skills and plugins
- **File & image uploads**: Attach images (PNG, JPEG, GIF, WebP), PDFs, and text-based files (Markdown, JSON, YAML, code files) via paperclip button or paste from clipboard
- **Web search**: Claude can search the web in real time when answering questions about current events or external topics
- **Multi-conversation management**: Create, switch, rename, and delete conversations with auto-generated titles
- **Model selection**: Switch between available Claude models on the fly, including via `/model-name` slash command
- **Stop generation**: Abort in-progress responses at any time with the stop button; partial output is preserved
- **Auto-continue**: Long responses that exceed token limits are automatically continued without user intervention
- **Light & dark theme**: Full theme support matching the rest of the application

### Environment Profiles
- Create and manage multiple named API credential profiles (e.g., Production, Development)
- Configure `ANTHROPIC_BASE_URL`, `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, and model overrides per profile
- One-click activate/deactivate — writes env vars to `~/.claude/settings.json` instantly without restarting
- Drag-and-drop reordering
- View and edit raw shell config and `~/.claude/settings.json` directly in the app

### MCP Servers
- Visual server cards with real-time status indicators (Running, Stopping, Error, Stopped)
- Start, stop, and restart individual servers
- Live log viewer with color-coded output (stdout/stderr)
- Add servers manually or bulk-import via JSON paste
- Copy a server's JSON config to clipboard

### Custom Commands
- Create and manage Claude CLI slash-command scripts stored in `~/.claude/commands/`
- Full in-app editor for each command file

### Plugin Commands
- View and browse commands provided by installed plugins
- Read-only view of plugin command scripts with syntax highlighting
- Commands tab splits into **My Commands** (user-created) and **Plugin Commands** (from plugins)

### Skills
- Create and manage agent skill definitions in SKILL.md format stored in `~/.claude/skills/`
- Built-in SKILL.md template scaffold with frontmatter, instructions, and examples sections
- Browse and install plugins from community marketplaces via the Skills Marketplace

### Skills Marketplace
- Browse plugins from community marketplace repositories hosted on GitHub
- Add any GitHub repository as a marketplace source with a single URL
- Install/uninstall plugins with one click — plugins can include commands, skills, and agents
- Update marketplace to get the latest plugin listings
- Installed plugins are tracked in `~/.claude/plugins/installed_plugins.json`
- Marketplace sources are saved in `~/.claude/plugins/known_marketplaces.json`

### Desktop App Extras
- System tray with show/hide and quit controls
- Minimize to tray instead of closing
- Launch at startup toggle
- Native OS notifications
- Single instance enforcement

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, @dnd-kit |
| Backend | Node.js, Express, TypeScript |
| Desktop | Electron, electron-builder |
| Package manager | npm (monorepo) |

---

## Prerequisites

- **Node.js** v20 or later
- **npm**
- **Claude Code CLI** installed and available in `PATH`

---

## Getting Started

### Install dependencies

```bash
npm run install:all
```

### Run in web mode

```bash
npm run dev
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

### Run as desktop app (dev mode)

```bash
npm run dev:desktop
```

Starts the frontend and backend dev servers, then launches an Electron window once both are ready.

### macOS Post-Install

After installing the `.dmg` on macOS, you may need to clear the quarantine attribute before launching:

```bash
xattr -cr /Applications/Claude\ Workbench.app/
```

This is required because the app is not code-signed with an Apple Developer certificate. Without this step, macOS Gatekeeper may block the app from opening.

---

## Building

### Windows

```bash
npm run build:desktop:win
```

Output in `dist-electron/`:
- `Claude Workbench-x.x.x-Setup.exe` — NSIS installer
- `Claude Workbench-x.x.x-Portable.exe` — Portable executable

### macOS

Must be run on a macOS machine.

```bash
npm run build:desktop:mac
```

Output in `dist-electron/`:
- `Claude Workbench-x.x.x-arm64.dmg` — Apple Silicon
- `Claude Workbench-x.x.x-x64.dmg` — Intel
- Matching `.zip` files for both architectures

### Linux

```bash
npm run build:desktop:linux
```

Output in `dist-electron/`:
- `Claude Workbench-x.x.x.AppImage`
- `claude-workbench_x.x.x_amd64.deb`

> **Note:** macOS builds require macOS. Windows and Linux builds can be run from any platform.

### Code signing

Unsigned builds work but will trigger OS security warnings (SmartScreen on Windows, Gatekeeper on macOS). To sign:

**Windows**
```powershell
$env:WIN_CSC_LINK = "C:\path\to\certificate.pfx"
$env:WIN_CSC_KEY_PASSWORD = "your_password"
npm run build:desktop:win
```

**macOS**
```bash
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="your_password"
npm run build:desktop:mac
```

---

## Automated Releases (GitHub Actions)

The repository includes a workflow that builds Windows and macOS installers and publishes a GitHub Release automatically.

**Trigger:** Go to **Actions → Build and Release → Run workflow**, enter the version (e.g. `v1.0.1`) and optional release notes.

The workflow will:
1. Build the Windows installer on a Windows runner
2. Build the macOS installer on a macOS runner
3. Create a GitHub Release with both installers attached and an auto-generated changelog

---

## Project Structure

```
claude-workbench/
├── frontend/               # React SPA (Vite + TypeScript + Tailwind)
│   └── src/
│       ├── components/
│       │   ├── tabs/         # EnvTab, McpTab, CommandsTab, SkillsTab
│       │   ├── SkillsMarketplace.tsx  # Marketplace drawer UI
│       │   └── AddMarketplaceModal.tsx # Add marketplace source modal
│       ├── App.tsx
│       └── api.ts
├── backend/                # Express REST API (Node.js + TypeScript)
├── desktop/
│   ├── main/               # Electron main process (window, tray, IPC)
│   ├── preload/            # Context bridge (exposes IPC to renderer)
│   ├── assets/             # App icons
│   └── build/              # electron-builder config + build script
└── .github/
    └── workflows/
        └── release.yml     # Automated build and release workflow
```

---

## Files Managed by the App

| File | Description |
|---|---|
| `~/.claude.json` | MCP server definitions |
| `~/.claude/env-profiles.json` | All environment profiles |
| `~/.claude/settings.json` | Active profile env vars |
| `~/.claude/commands/*.md` | Custom Claude CLI slash-commands |
| `~/.claude/skills/<name>/SKILL.md` | Agent skill definitions |
| `~/.zshrc` / `~/.bashrc` / PowerShell `$PROFILE` | Shell env var blocks (fallback) |
| `~/.claude/plugins/known_marketplaces.json` | Registered marketplace sources |
| `~/.claude/plugins/installed_plugins.json` | Installed plugin registry |

---

## License

MIT
