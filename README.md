# Claude Workbench

A modern GUI management tool for the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code). It provides a visual interface to manage MCP servers, API credential profiles, custom slash-commands, and agent skills — all without manually editing JSON or shell config files.

Available as a **web app** (runs in your browser) or a **desktop app** (native Electron wrapper for Windows and macOS).

---

## Features

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

### Skills
- Create and manage agent skill definitions in SKILL.md format stored in `~/.claude/skills/`
- Built-in SKILL.md template scaffold with frontmatter, instructions, and examples sections

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
│       ├── components/tabs/  # EnvTab, McpTab, CommandsTab, SkillsTab
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

---

## License

MIT
