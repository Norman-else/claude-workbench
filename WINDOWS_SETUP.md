# Windows Setup Guide for Claude Workbench

This guide provides Windows-specific instructions for setting up and using Claude Workbench.

## Prerequisites

### 1. Install Node.js

Download and install Node.js from [https://nodejs.org/](https://nodejs.org/) (LTS version recommended).

Verify installation:
```powershell
node --version
npm --version
```

### 2. Install Claude Code CLI

Follow the official installation guide for Claude Code CLI on Windows.

Verify installation:
```powershell
claude --version
```

## Installation

1. **Clone or download this repository**

2. **Install dependencies:**
   ```powershell
   npm run install:all
   ```

3. **Start the application:**
   ```powershell
   npm run dev
   ```

   This will start:
   - Frontend: http://localhost:3000
   - Backend: http://localhost:3001

## Windows-Specific Configuration

### Environment Variables

On Windows, Claude Workbench **directly sets Windows User Environment Variables** - the same place where you would manually configure them in Windows Settings.

**How it works:**

#### Option 1: Using the Web Interface (Recommended ✨)
1. Navigate to the **Environment Variables** tab in Claude Workbench
2. Enter the required variables:
   - `ANTHROPIC_BASE_URL`
   - `ANTHROPIC_API_KEY`
3. (Optional) Configure default models:
   - `ANTHROPIC_DEFAULT_HAIKU_MODEL`
   - `ANTHROPIC_DEFAULT_OPUS_MODEL`
   - `ANTHROPIC_DEFAULT_SONNET_MODEL`
4. Click **Save Changes**
5. The application will automatically set these as **Windows User Environment Variables** using the `setx` command
6. **Restart any open terminals or applications** to use the new environment variables
7. These variables are now persistent and available to ALL applications on your system

**What happens behind the scenes:**
- The application runs `setx ANTHROPIC_API_KEY "your-value"` 
- This sets the environment variable at the Windows User level
- It's exactly the same as setting it in: Windows Settings > System > About > Advanced system settings > Environment Variables

#### Option 2: Manual Setup (Windows Settings)
If you prefer to set them manually or if the automatic method fails:

1. Press `Windows + X` and select "System"
2. Click "Advanced system settings"
3. Click "Environment Variables"
4. Under "User variables", click "New"
5. Add the required variables:
   - `ANTHROPIC_BASE_URL` = your base URL
   - `ANTHROPIC_API_KEY` = your API key
6. (Optional) Add model defaults:
   - `ANTHROPIC_DEFAULT_HAIKU_MODEL` = e.g., `claude-3-5-haiku-20241022`
   - `ANTHROPIC_DEFAULT_OPUS_MODEL` = e.g., `claude-3-opus-20240229`
   - `ANTHROPIC_DEFAULT_SONNET_MODEL` = e.g., `claude-3-5-sonnet-20241022`
7. For compatibility, also add:
   - `OPENAI_BASE_URL` = your base URL + `/v1`
   - `OPENAI_API_KEY` = your API key

#### Option 3: Using PowerShell (Alternative)
If you want to set them via command line:
```powershell
# Required
setx ANTHROPIC_BASE_URL "your-base-url"
setx ANTHROPIC_API_KEY "your-api-key"

# Optional - Model defaults
setx ANTHROPIC_DEFAULT_HAIKU_MODEL "claude-3-5-haiku-20241022"
setx ANTHROPIC_DEFAULT_OPUS_MODEL "claude-3-opus-20240229"
setx ANTHROPIC_DEFAULT_SONNET_MODEL "claude-3-5-sonnet-20241022"

# For compatibility
setx OPENAI_BASE_URL "your-base-url/v1"
setx OPENAI_API_KEY "your-api-key"
```

**Note:** After running `setx`, restart your terminal for the changes to take effect.

### File Paths

On Windows, file paths use backslashes (`\`) by default, but the application will handle this automatically. You can use either format:
- Windows format: `C:\Users\YourName\Documents`
- Unix format: `C:/Users/YourName/Documents`

### Troubleshooting

#### Claude command not found
Make sure Claude CLI is installed and accessible:
```powershell
where.exe claude
```

If not found, reinstall Claude CLI and ensure it's added to your PATH.

#### Permission Errors
If you get permission errors when running scripts:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Environment Variables Not Loading
Check if they're set correctly:
```powershell
# View current environment variables
Get-ChildItem Env: | Where-Object { $_.Name -like "*ANTHROPIC*" }
```

If they're not showing up, try:
1. Restart your terminal/PowerShell window
2. Check Windows Settings > System > About > Advanced system settings > Environment Variables
3. Use the web interface to set them again

## Differences from macOS/Linux

| Feature | Windows | macOS/Linux |
|---------|---------|-------------|
| Env Variable Storage | Windows User Environment Variables (via `setx`) | `~/.zshrc` or `~/.bashrc` file |
| Shell | PowerShell | bash/zsh |
| Env Var Setting Method | System-level (persistent across all apps) | Shell config file (loaded per terminal session) |
| Path Separator | `\` or `/` | `/` |
| Home Directory | `C:\Users\YourName` | `/Users/YourName` or `/home/YourName` |
| Changes Take Effect | After restarting apps/terminals | After running `source ~/.zshrc` |

## Performance Notes

- The application automatically detects your operating system and adjusts accordingly
- File operations and command execution are optimized for Windows
- No performance differences expected compared to macOS/Linux

## Getting Help

If you encounter issues specific to Windows:
1. Check the main [README.md](README.md) for general troubleshooting
2. Verify your Node.js and Claude CLI installations
3. Check PowerShell execution policy and permissions
4. Review the console output for detailed error messages

---

Made with ❤️ for Windows users

