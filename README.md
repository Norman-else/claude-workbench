# Claude Workbench

<div align="center">

🚀 **A modern workbench for Claude Code CLI**

Easily manage your Claude CLI configurations and custom commands through an intuitive interface.

**Available as both Web App and Desktop App!**

[Web Version](#web-version) • [Desktop Version](#desktop-version) • [Features](#features)

</div>

## ✨ Features

- **📝 MCP Servers Management**: Configure Model Context Protocol servers with a visual interface
- **⚙️ Environment Variables**: Manage ANTHROPIC_BASE_URL and ANTHROPIC_API_KEY (cross-platform)
- **📜 Custom Commands**: Create and manage custom command scripts
- **🎨 Modern UI**: Beautiful, responsive interface built with React and Tailwind CSS
- **💾 Real-time Saving**: Instant configuration updates with visual feedback
- **🔄 Auto Refresh**: Easily reload configurations from disk
- **🖥️ Cross-Platform**: Works seamlessly on Windows, macOS, and Linux

## 🛠️ Tech Stack

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- Lucide React (icons)

### Backend
- Node.js
- Express
- CORS support

## 🎯 Choose Your Version

### Desktop Version (Recommended) 🖥️

**Native desktop application with additional features:**
- System tray integration
- System notifications
- Launch at startup
- Better performance

👉 **[Download Desktop App →](DESKTOP.md)**

### Web Version 🌐

**Browser-based version for quick access:**
- No installation required
- Cross-platform
- Lightweight

Continue reading below for web version setup.

---

## 📦 Web Version Installation

### Prerequisites
- Node.js (LTS version recommended)
- Claude Code CLI installed and accessible via `claude` command

### Setup

1. **Install all dependencies:**
   ```bash
   npm run install:all
   ```

2. **Start the development servers:**
   ```bash
   npm run dev
   ```

   This will start:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001

### Platform-Specific Setup

**For Windows users:** Please see [WINDOWS_SETUP.md](WINDOWS_SETUP.md) for detailed Windows-specific instructions and troubleshooting.

## 🚀 Usage

### Managing MCP Servers

1. Navigate to the **MCP Servers** tab
2. Click **Add Server** to create a new MCP server configuration
3. Fill in:
   - **Server Name**: Unique identifier (e.g., `mcp-atlassian`)
   - **Command**: The command to run (e.g., `npx`)
   - **Arguments**: Comma-separated arguments
   - **Environment Variables**: JSON format environment variables
4. Click **Save Changes** to update `~/.claude.json`

### Managing Environment Variables

1. Navigate to the **Environment Variables** tab
2. Configure the required variables:
   - **ANTHROPIC_BASE_URL**: Your API base URL
   - **ANTHROPIC_API_KEY**: Your API key
3. (Optional) Configure default models:
   - **ANTHROPIC_DEFAULT_HAIKU_MODEL**: Default Haiku model (e.g., `claude-3-5-haiku-20241022`)
   - **ANTHROPIC_DEFAULT_OPUS_MODEL**: Default Opus model (e.g., `claude-3-opus-20240229`)
   - **ANTHROPIC_DEFAULT_SONNET_MODEL**: Default Sonnet model (e.g., `claude-3-5-sonnet-20241022`)
4. Click **Save Changes**:
   - **Windows**: Automatically sets **Windows User Environment Variables** (system-wide, persistent)
   - **macOS/Linux**: Updates `~/.zshrc` or `~/.bashrc` (shell config file)
5. Apply the changes:
   - **Windows**: Restart your terminals or applications to load the new environment variables
   - **macOS/Linux**: Restart terminal or run `source ~/.zshrc`

**Windows users:** Environment variables are set using the `setx` command, making them persistent and available to all applications. This is the same as manually setting them in Windows Settings > Environment Variables. See [WINDOWS_SETUP.md](WINDOWS_SETUP.md) for details.

### Managing Commands

1. Navigate to the **Commands** tab
2. Click **Add Command** to create a new command
3. Enter command name and script content
4. Click **Create Command** to save to `~/.claude/commands/`
5. Click any command card to edit or delete

## 📁 File Structure

```
claude-config-service/
├── frontend/              # React frontend application
│   ├── src/
│   │   ├── App.tsx       # Main application component
│   │   ├── main.tsx      # Entry point
│   │   └── index.css     # Global styles
│   └── package.json
├── backend/              # Express backend server
│   ├── src/
│   │   └── server.js     # API endpoints
│   └── package.json
├── package.json          # Root package with scripts
└── README.md
```

## 🔧 API Endpoints

- `GET /api/claude-config` - Get Claude JSON configuration
- `POST /api/claude-config` - Update Claude JSON configuration
- `GET /api/env-vars` - Get environment variables
- `POST /api/env-vars` - Update environment variables
- `GET /api/commands` - Get all command files
- `POST /api/commands` - Create/update a command file
- `DELETE /api/commands/:name` - Delete a command file
- `POST /api/mcp/:name/start` - Start an MCP server
- `POST /api/mcp/:name/stop` - Stop an MCP server
- `GET /api/mcp/:name/status` - Get server status
- `GET /api/mcp/:name/logs` - Get server logs
- `POST /api/mcp/:name/logs/clear` - Clear server logs
- `POST /api/mcp/:name/restart` - Restart server

## 🎨 Screenshots

The interface features:
- Clean, modern design with a gradient background
- Tab-based navigation for different configuration sections
- Color-coded save status (orange → green for success, red for errors)
- Responsive layout that works on all screen sizes

## 🚨 Troubleshooting: MCP Server Start Failure

If you see "start MCP server failed" without detailed logs, follow these steps:

### 1. Check Browser Console (F12)
Open your browser's developer tools and check the Console tab for detailed error messages. These will show:
- Network errors
- Error response details from the backend
- Full stack traces

### 2. View Server Logs in UI
When a server fails to start:
- Look for the **"Error"** status indicator (red dot) on the server card
- If you clicked "Start" before, the logs modal might show error details
- The error message will appear as a notification at the top of the screen

### 3. Check Backend Terminal Output
The Express server logs to console. Look for:
```
[error] Failed to spawn process: command not found
[error] Process error: ENOENT
```

### 4. Common Causes and Solutions

#### Issue: "Command not found"
**Cause**: The command specified in the MCP server configuration doesn't exist or is not in PATH.

**Solution**:
- Verify the command exists: Run `which npx` or `command -v npx` in your terminal
- Use full path: Instead of `npx`, try `/usr/local/bin/npx`
- Check if package is installed: For npm packages, verify they're installed globally

#### Issue: "ENOENT" or "spawn ENOENT"
**Cause**: The executable file cannot be found.

**Solution**:
- Ensure PATH is properly set
- Try with shell enabled (on macOS/Linux)
- Use absolute paths instead of relative paths

#### Issue: Process exits immediately with exit code 127
**Cause**: Command not found by shell.

**Solution**:
- Add `shell: true` behavior (already enabled on Windows)
- Try with bash explicitly: Change command to `/bin/bash` with args `['-c', 'your-command']`

#### Issue: Permission denied
**Cause**: File doesn't have execute permissions.

**Solution**:
```bash
chmod +x /path/to/executable
```

### 5. Enable Detailed Logging
Add debug information to the server configuration:

1. Go to **MCP Servers** tab
2. Edit the server
3. Add environment variables:
```json
{
  "DEBUG": "true",
  "VERBOSE": "true"
}
```

### 6. Test Command Manually
Open a terminal and run the command directly:
```bash
npx @modelcontextprotocol/server-filesystem
```

If it works in terminal but fails in the app:
- Check if environment variables are properly set
- Verify PATH is the same in the application
- Check file permissions

### 7. Clear Logs
If logs become cluttered, you can clear them via:
```bash
curl -X POST http://localhost:3001/api/mcp/YOUR_SERVER_NAME/logs/clear
```

### 8. Restart Application
Sometimes a full restart helps:
```bash
# Stop both frontend and backend
npm run dev  # or restart your running process

# In another terminal, check backend is running
curl http://localhost:3001/api/mcp/status/all
```

## 🚨 MCP Server Auto-Stop Issue

If you notice that your MCP server is automatically stopping after a short period, it might be due to a memory leak or resource exhaustion. Here are some potential solutions:

1. **Increase Memory Limits**:
   - For Node.js applications, you can increase the memory limit by setting the `NODE_OPTIONS` environment variable.
   - On macOS/Linux, you can set it in your shell profile (`.zshrc`, `.bashrc`, etc.) or use `ulimit -m` to set a soft limit.
   - Example: `export NODE_OPTIONS="--max-old-space-size=4096"`

2. **Optimize Command**:
   - Ensure your command is lightweight and doesn't consume excessive resources.
   - For example, if you're running a development server, try using `nodemon` or `ts-node` for hot-reloading.

3. **Check for Memory Leaks**:
   - Use tools like `node --inspect` to debug memory issues.
   - If you suspect a memory leak, you might need to restart the application or investigate the command's dependencies.

## ⚠️ Important Notes

- **The application modifies system configurations:**
  - `~/.claude.json` - MCP server configuration (all platforms)
  - `~/.claude/commands/` - Custom commands directory (all platforms)
  - **Windows**: Sets User Environment Variables via `setx` command (system-wide)
  - **macOS/Linux**: Modifies `~/.zshrc` or `~/.bashrc` shell config file
- Always backup your configuration files before making changes
- **After updating environment variables:**
  - **Windows**: Restart terminals/applications (variables are set system-wide)
  - **macOS/Linux**: Restart terminal or run `source ~/.zshrc`
- The application automatically detects your platform and uses the appropriate configuration method

## 🤝 Contributing

Feel free to submit issues and enhancement requests!

## 📝 License

MIT

---

Made with ❤️ for easier Claude CLI configuration management

## 🖥️ Desktop Version

Want a native desktop experience? Check out our [Desktop App documentation](DESKTOP.md)!

**Desktop-exclusive features:**
- 🔔 System notifications
- 🖥️ System tray integration
- 🚀 Launch at startup
- ⚡ Better performance
- 📦 Standalone installer

**Quick links:**
- [Desktop Installation Guide](DESKTOP.md#installation)
- [Desktop Quickstart (中文)](DESKTOP_QUICKSTART.md)
- [Build from Source](#building-desktop-app-from-source)

### Building Desktop App from Source

#### Prerequisites
- Node.js (LTS version recommended)
- All project dependencies installed: `npm run install:all`

#### Build for macOS

```bash
# Build macOS application (.dmg and .zip)
npm run build:desktop:mac
```

**Output files** (in `dist-electron/` directory):
- `Claude Workbench-1.0.0-arm64.dmg` - macOS installer (Apple Silicon)
- `Claude Workbench-1.0.0-arm64-mac.zip` - Portable version (Apple Silicon)
- `Claude Workbench-1.0.0-x64.dmg` - macOS installer (Intel)
- `Claude Workbench-1.0.0-x64-mac.zip` - Portable version (Intel)

**Installation:**
1. Open the `.dmg` file
2. Drag "Claude Workbench" to Applications folder
3. First launch: Right-click → Open (to bypass unsigned app warning)

#### Build for Windows

```bash
# Build Windows application (.exe installer and portable)
npm run build:desktop:win
```

**Output files** (in `dist-electron/` directory):
- `Claude Workbench-1.0.0-Setup.exe` - Windows installer (NSIS)
- `Claude Workbench-1.0.0-Portable.exe` - Portable executable

**Installation:**
- **Installer**: Double-click `.exe` and follow setup wizard
- **Portable**: Run directly without installation

#### Build for Linux

```bash
# Build Linux application (.AppImage and .deb)
npm run build:desktop:linux
```

**Output files** (in `dist-electron/` directory):
- `Claude Workbench-1.0.0.AppImage` - Universal Linux package
- `claude-workbench_1.0.0_amd64.deb` - Debian/Ubuntu package

#### Build for All Platforms

```bash
# Build for all platforms (requires macOS for building .dmg)
npm run build:desktop
```

#### Development Mode

To run the desktop app in development mode with hot reload:

```bash
npm run dev:desktop
```

This will:
1. Start the frontend dev server (http://localhost:3000)
2. Start the backend server (http://localhost:3001)
3. Launch Electron window with live reload

#### Version Management

The desktop app version is controlled by the `version` field in the root `package.json`:

```json
{
  "version": "1.0.0"
}
```

**To upgrade the version:**

1. Edit `package.json` and change the version number:
   ```json
   {
     "version": "1.1.0"  // or 2.0.0, 1.0.1, etc.
   }
   ```

2. Rebuild the desktop app:
   ```bash
   npm run build:desktop:mac  # or :win, :linux
   ```

3. The output files will automatically use the new version:
   - `Claude Workbench-1.1.0-arm64.dmg`
   - `Claude Workbench-1.1.0-Setup.exe`
   - etc.

**Version Numbering Guidelines** (Semantic Versioning):

- **Major version** (`2.0.0`) - Breaking changes, incompatible updates
- **Minor version** (`1.1.0`) - New features, backward compatible
- **Patch version** (`1.0.1`) - Bug fixes, backward compatible

**Example upgrade scenarios:**

```bash
# Bug fix release
1.0.0 → 1.0.1

# New feature release
1.0.1 → 1.1.0

# Breaking change release
1.1.0 → 2.0.0
```

#### Troubleshooting Build Issues

**macOS Code Signing Warning:**
```
skipped macOS application code signing
```
This is normal for local builds. The app will still work, but users need to right-click → Open on first launch.

**To sign the app** (requires Apple Developer account):
```bash
export CSC_IDENTITY_AUTO_DISCOVERY=true
npm run build:desktop:mac
```

**Windows Smart Screen Warning:**
Windows may show a warning for unsigned apps. Users can click "More info" → "Run anyway".

**To sign Windows builds** (requires code signing certificate):
```bash
export WIN_CSC_LINK=/path/to/certificate.pfx
export WIN_CSC_KEY_PASSWORD=your_password
npm run build:desktop:win
```

