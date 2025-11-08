# Desktop Application Source

This directory contains the Electron-based desktop application for Claude Workbench.

## Structure

```
desktop/
├── main/              # Electron main process (Node.js)
│   ├── index.ts       # Application entry point
│   ├── window.ts      # BrowserWindow management
│   ├── tray.ts        # System tray integration
│   ├── autoLaunch.ts  # Launch at startup functionality
│   └── backend.ts     # Backend server integration
│
├── preload/           # Preload scripts (security boundary)
│   └── index.ts       # Exposed APIs to renderer process
│
├── build/             # Build configuration and scripts
│   ├── electron-builder.yml   # electron-builder configuration
│   ├── build.js              # Build automation script
│   └── entitlements.mac.plist # macOS code signing entitlements
│
├── assets/            # Application resources
│   ├── icon.svg       # Main icon (source)
│   ├── icon.png       # Main icon (1024x1024)
│   ├── tray-icon.*    # Tray icons for different platforms
│   └── README.md      # Icon guidelines
│
├── dist/              # Compiled TypeScript (generated)
└── tsconfig.json      # TypeScript configuration
```

## Development

### Prerequisites

- Node.js LTS
- All project dependencies installed (`npm run install:all`)

### Run in Development Mode

From the project root:

```bash
npm run dev:desktop
```

This starts:
1. Frontend dev server (Vite) on port 3000
2. Backend API server (Express) on port 3001
3. Electron app loading from dev server

### Compile TypeScript

```bash
npm run compile:desktop
```

Compiles TypeScript to `desktop/dist/`

## Building

### Build for Current Platform

```bash
npm run build:desktop
```

### Build for Specific Platform

```bash
npm run build:desktop:mac    # macOS (.dmg, .zip)
npm run build:desktop:win    # Windows (.exe, portable)
npm run build:desktop:linux  # Linux (.AppImage, .deb)
```

Output: `dist-electron/`

## Architecture

### Main Process (main/)

The main process is the Electron app's "backend". It:
- Creates and manages application windows
- Handles system tray integration
- Manages the Express backend server
- Provides native OS integrations (notifications, auto-launch)
- Communicates with renderer via IPC

**Key files:**
- `index.ts` - App lifecycle, IPC handlers
- `window.ts` - Window creation and management
- `tray.ts` - System tray menu and events
- `autoLaunch.ts` - Launch at startup settings
- `backend.ts` - Express server startup/shutdown

### Preload Scripts (preload/)

The preload script runs before the renderer process and:
- Exposes safe APIs via `contextBridge`
- Acts as security boundary between main and renderer
- Prevents direct Node.js access from renderer

**Exposed APIs:**
```typescript
window.electronAPI = {
  getPlatform()        // Get OS platform
  isElectron()         // Check if running in Electron
  minimizeWindow()     // Minimize window
  toggleAutoLaunch()   // Toggle auto-launch
  getAutoLaunch()      // Get auto-launch status
  setAutoLaunch()      // Set auto-launch status
  showNotification()   // Show system notification
}
```

### Renderer Process

The renderer process is the frontend React app (`frontend/`):
- Same codebase as web version
- Detects Electron environment
- Uses `window.electronAPI` for desktop features
- Shows desktop-only UI when in Electron

## Security

Following Electron security best practices:

- ✅ **Context Isolation**: Enabled
- ✅ **Node Integration**: Disabled in renderer
- ✅ **Preload Scripts**: Using `contextBridge`
- ✅ **CSP**: Content Security Policy enforced
- ✅ **No Remote**: Remote module disabled
- ✅ **Sandbox**: Renderer runs in sandbox

## Platform-Specific Notes

### macOS

- Uses template images for tray icon (adapts to light/dark menu bar)
- Requires code signing for distribution
- App menu in system menu bar
- DMG and ZIP installer formats

### Windows

- Tray icon in system tray (bottom-right)
- NSIS installer with custom options
- Portable version available
- Auto-start via registry

### Linux

- AppImage (universal)
- .deb package for Debian/Ubuntu
- Tray icon depends on desktop environment

## Icons

Icons are located in `assets/`:

1. **Source**: `icon.svg` (edit this for changes)
2. **Main Icon**: `icon.png` (1024x1024, auto-converted by electron-builder)
3. **Tray Icons**: Platform-specific sizes and formats

To update icons:
1. Edit `icon.svg` in a vector editor
2. Export to PNG: `icon.png` (1024x1024)
3. Run build - electron-builder auto-generates platform icons

See `assets/README.md` for detailed icon guidelines.

## Troubleshooting

### TypeScript Errors

```bash
cd desktop && npx tsc --noEmit
```

### Clean Build

```bash
rm -rf desktop/dist dist-electron
npm run compile:desktop
npm run build:desktop
```

### Debug Main Process

Add `--inspect` to electron launch:

```bash
electron --inspect desktop/main/index.ts
```

Then attach debugger (Chrome DevTools or VS Code)

### Debug Renderer Process

Open DevTools in app:
- macOS: `Cmd + Option + I`
- Windows/Linux: `Ctrl + Shift + I`

Or add to code:
```typescript
mainWindow.webContents.openDevTools();
```

## Configuration

### electron-builder.yml

Main configuration for building installers. Key settings:

- `appId`: App identifier
- `directories`: Build output locations
- `files`: What to include in app
- `mac/win/linux`: Platform-specific options

### tsconfig.json

TypeScript compilation settings:
- `target`: ES2020
- `module`: CommonJS (required for Electron main process)
- `outDir`: ./dist

## Testing

### Manual Testing Checklist

- [ ] App launches successfully
- [ ] Window shows correctly
- [ ] System tray icon appears
- [ ] Tray menu works
- [ ] Close minimizes to tray
- [ ] Tray icon click shows/hides window
- [ ] Quit from tray menu exits app
- [ ] Auto-launch toggle works
- [ ] System notifications show
- [ ] All web features work (MCP, commands, etc.)

### Platform Testing

Test on each target platform before release:
- [ ] macOS 12+ (Intel and Apple Silicon)
- [ ] Windows 10/11
- [ ] Ubuntu 20.04+

## Release Process

1. Update version in `package.json`
2. Build for all platforms
3. Test installers on each platform
4. Create GitHub release
5. Upload installers
6. Update documentation

## Contributing

When adding desktop features:

1. Add IPC handler in `main/index.ts`
2. Expose API in `preload/index.ts`
3. Use API in frontend via `window.electronAPI`
4. Update TypeScript types
5. Test on all platforms
6. Document in DESKTOP.md

## Resources

- [Electron Documentation](https://www.electronjs.org/docs)
- [electron-builder](https://www.electron.build/)
- [Electron Security](https://www.electronjs.org/docs/tutorial/security)

---

Built with Electron + TypeScript + React

