# Cross-Platform Support Implementation

This document summarizes the changes made to support both Windows and macOS/Linux platforms.

## Overview

The Claude Workbench application now fully supports Windows, macOS, and Linux operating systems with automatic platform detection and appropriate configuration.

## Key Changes

### 1. Platform Detection

Added automatic platform detection at startup:

```javascript
const IS_WINDOWS = os.platform() === 'win32';
```

### 2. Environment Variable File Management

**Before (macOS only):**
- Hardcoded to use `~/.zshrc`
- Unix-style `export` commands only

**After (Cross-platform):**
- **Windows**: Uses `~/.claude-env` with PowerShell syntax (`$env:VAR = "value"`)
- **macOS/Linux**: Uses `~/.zshrc` or `~/.bashrc` with bash/zsh syntax (`export VAR="value"`)
- Automatic detection of which shell config file exists

### 3. Shell Command Execution

**Before (macOS only):**
- Hardcoded to use `/bin/bash`
- Unix-style command escaping

**After (Cross-platform):**
- **Windows**: Uses `powershell.exe` with PowerShell-style escaping
- **macOS/Linux**: Uses `/bin/bash` with Unix-style escaping
- Platform-specific command construction and escaping

### 4. File Path Handling

- Already cross-platform using Node.js `path` module
- Handles both Windows (`\`) and Unix (`/`) path separators
- Proper home directory expansion (`~` to full path)

## Technical Details

### Environment Variable Parsing

The application now supports both formats when reading configuration:

**Unix Format:**
```bash
export ANTHROPIC_BASE_URL="https://api.anthropic.com"
export ANTHROPIC_API_KEY="sk-xxx"
```

**Windows PowerShell Format:**
```powershell
$env:ANTHROPIC_BASE_URL = "https://api.anthropic.com"
$env:ANTHROPIC_API_KEY = "sk-xxx"
```

### Command Execution

#### Windows (PowerShell)
```powershell
cd "C:\path\to\dir"; echo "message" | claude
```

#### Unix (bash/zsh)
```bash
cd '/path/to/dir' && printf '%s\n' 'message' | claude
```

### API Response Enhancements

Environment variable endpoints now return platform information:

```json
{
  "baseUrl": "https://api.anthropic.com",
  "authToken": "sk-xxx",
  "platform": "windows",
  "configFile": "C:\\Users\\YourName\\.claude-env"
}
```

## File Structure

```
Claude Workbench Configuration Files
├── All Platforms
│   ├── ~/.claude.json          (MCP server configuration)
│   └── ~/.claude/commands/     (Custom commands)
│
├── Windows
│   └── ~/.claude-env           (Environment variables - PowerShell format)
│
└── macOS/Linux
    └── ~/.zshrc or ~/.bashrc   (Environment variables - bash/zsh format)
```

## Testing Checklist

- [x] Platform detection works correctly
- [x] Environment variable file creation on Windows
- [x] Environment variable file creation on macOS/Linux
- [x] Reading environment variables in both formats
- [x] Writing environment variables in platform-specific format
- [x] Command execution on Windows (PowerShell)
- [x] Command execution on macOS/Linux (bash)
- [x] File path handling across platforms
- [x] API responses include platform information

## User-Facing Changes

### Windows Users

1. **New file**: `~/.claude-env` stores environment variables in PowerShell format
2. **Instructions**: Clear guidance on how to apply environment variables in PowerShell
3. **Documentation**: New `WINDOWS_SETUP.md` with Windows-specific setup instructions

### macOS/Linux Users

1. **No breaking changes**: Existing `.zshrc` or `.bashrc` files continue to work
2. **Automatic detection**: Application detects which shell config file to use
3. **Backward compatible**: Existing configurations work without modification

## Migration Guide

### For Existing Users (macOS/Linux)

No action required. The application will continue to use your existing `.zshrc` or `.bashrc` file.

### For New Windows Users

1. Install Node.js and Claude Code CLI
2. Run `npm run install:all`
3. Configure environment variables via the web interface
4. Manually add variables to PowerShell `$PROFILE` for persistence (see `WINDOWS_SETUP.md`)

## Future Enhancements

Potential improvements for future versions:

1. **Automatic PowerShell profile update**: Directly modify `$PROFILE` on Windows
2. **GUI notification**: Show platform-specific instructions in the web interface
3. **Environment variable testing**: Test button to verify Claude CLI can access the variables
4. **Multi-shell support**: Support for cmd.exe, Fish shell, etc.
5. **Visual platform indicator**: Show current platform in the UI

## Troubleshooting

### Windows

**Issue**: Environment variables not persisting after PowerShell restart
**Solution**: Add variables to `$PROFILE` (see `WINDOWS_SETUP.md`)

**Issue**: "claude: command not found"
**Solution**: Ensure Claude CLI is installed and in PATH

### macOS/Linux

**Issue**: Variables not loading
**Solution**: Check if using zsh or bash, ensure correct file is being modified

## Code References

Key files modified:
- `backend/src/server.js` - Main platform detection and environment variable handling
- `README.md` - Updated with cross-platform instructions
- `WINDOWS_SETUP.md` - New Windows-specific guide
- `CROSS_PLATFORM_CHANGES.md` - This document

## Version History

- **v1.1.0** - Added cross-platform support (Windows, macOS, Linux)
- **v1.0.0** - Initial release (macOS only)

---

**Note**: This implementation maintains backward compatibility while adding Windows support. No existing macOS/Linux configurations will be affected.

