import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

const HOME_DIR = os.homedir();
const CLAUDE_JSON_PATH = path.join(HOME_DIR, '.claude.json');
const CLAUDE_COMMANDS_DIR = path.join(HOME_DIR, '.claude', 'commands');

// Platform-specific configuration
const IS_WINDOWS = os.platform() === 'win32';

// Environment variable file paths based on platform
const getEnvConfigPath = async () => {
  if (IS_WINDOWS) {
    // Windows: Use a custom .claude-env file in home directory
    return path.join(HOME_DIR, '.claude-env');
  } else {
    // macOS/Linux: Use .zshrc or .bashrc
    const zshrcPath = path.join(HOME_DIR, '.zshrc');
    const bashrcPath = path.join(HOME_DIR, '.bashrc');
    
    // Check which shell config exists, prefer .zshrc
    try {
      await fs.access(zshrcPath);
      return zshrcPath;
    } catch {
      return bashrcPath;
    }
  }
};

// Get initial config path
let ENV_CONFIG_PATH = IS_WINDOWS ? path.join(HOME_DIR, '.claude-env') : path.join(HOME_DIR, '.zshrc');

// Helper function to ensure file exists
async function ensureFileExists(filePath, defaultContent = '') {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, defaultContent);
  }
}

// Get Claude JSON configuration
app.get('/api/claude-config', async (req, res) => {
  try {
    await ensureFileExists(CLAUDE_JSON_PATH, '{}');
    const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8');
    const config = JSON.parse(content || '{}');
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update Claude JSON configuration
app.post('/api/claude-config', async (req, res) => {
  try {
    const config = req.body;
    await fs.writeFile(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2));
    res.json({ success: true, message: 'Configuration saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to reload environment variables from shell profile
async function reloadEnvFromProfile() {
  if (IS_WINDOWS) {
    try {
      // Get PowerShell Profile path
      let profilePath;
      try {
        const { stdout } = await execPromise('pwsh -Command "$PROFILE"');
        profilePath = stdout.trim();
      } catch {
        const { stdout } = await execPromise('powershell -Command "$PROFILE"');
        profilePath = stdout.trim();
      }
      
      // Read profile and extract environment variables
      const profileContent = await fs.readFile(profilePath, 'utf-8');
      const lines = profileContent.split('\n');
      
      for (const line of lines) {
        // Match PowerShell environment variable syntax: $env:VAR_NAME = "value"
        const match = line.match(/\$env:(\w+)\s*=\s*["']([^"']+)["']/);
        if (match) {
          const [, varName, value] = match;
          process.env[varName] = value;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to reload env from PowerShell profile:', error);
      return false;
    }
  } else {
    // Unix: Reload from shell config file (.zshrc or .bashrc)
    try {
      const configPath = await getEnvConfigPath();
      const content = await fs.readFile(configPath, 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        // Match bash/zsh export syntax: export VAR_NAME="value" or export VAR_NAME='value'
        const match = line.match(/^\s*export\s+(\w+)=["']?([^"'\n]+)["']?/);
        if (match) {
          const [, varName, value] = match;
          // Remove quotes if present
          const cleanValue = value.replace(/^["']|["']$/g, '');
          process.env[varName] = cleanValue;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Failed to reload env from shell config:', error);
      return false;
    }
  }
}

// Reload environment variables endpoint
app.post('/api/reload-env', async (req, res) => {
  try {
    const success = await reloadEnvFromProfile();
    
    if (success) {
      const configSource = IS_WINDOWS ? 'PowerShell Profile' : 'Shell config file (.zshrc or .bashrc)';
      res.json({
        success: true,
        message: `Environment variables reloaded successfully from ${configSource}`,
        platform: IS_WINDOWS ? 'windows' : 'unix',
        variables: {
          ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || '',
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '***' : '',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '',
          ANTHROPIC_DEFAULT_OPUS_MODEL: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || '',
          ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || ''
        }
      });
    } else {
      res.json({
        success: false,
        message: 'Failed to reload environment variables'
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get environment variables
app.get('/api/env-vars', async (req, res) => {
  try {
    let baseUrl = '';
    let authToken = '';
    let haikuModel = '';
    let opusModel = '';
    let sonnetModel = '';
    
    if (IS_WINDOWS) {
      // Windows: Read from PowerShell Profile
      try {
        // Get PowerShell Profile path (try PowerShell Core first, then Windows PowerShell)
        let profilePath;
        try {
          const { stdout } = await execPromise('pwsh -Command "$PROFILE"');
          profilePath = stdout.trim();
        } catch {
          // Fallback to Windows PowerShell if pwsh is not available
          const { stdout } = await execPromise('powershell -Command "$PROFILE"');
          profilePath = stdout.trim();
        }
        const trimmedProfilePath = profilePath;
        
        // Check if profile exists and read it
        try {
          const profileContent = await fs.readFile(trimmedProfilePath, 'utf-8');
          const lines = profileContent.split('\n');
          
          for (const line of lines) {
            // Match PowerShell environment variable syntax: $env:VAR_NAME = "value"
            if (line.includes('$env:ANTHROPIC_BASE_URL')) {
              const match = line.match(/\$env:ANTHROPIC_BASE_URL\s*=\s*["']([^"']+)["']/);
              if (match) baseUrl = match[1];
            }
            if (line.includes('$env:ANTHROPIC_API_KEY')) {
              const match = line.match(/\$env:ANTHROPIC_API_KEY\s*=\s*["']([^"']+)["']/);
              if (match) authToken = match[1];
            }
            if (line.includes('$env:ANTHROPIC_DEFAULT_HAIKU_MODEL')) {
              const match = line.match(/\$env:ANTHROPIC_DEFAULT_HAIKU_MODEL\s*=\s*["']([^"']+)["']/);
              if (match) haikuModel = match[1];
            }
            if (line.includes('$env:ANTHROPIC_DEFAULT_OPUS_MODEL')) {
              const match = line.match(/\$env:ANTHROPIC_DEFAULT_OPUS_MODEL\s*=\s*["']([^"']+)["']/);
              if (match) opusModel = match[1];
            }
            if (line.includes('$env:ANTHROPIC_DEFAULT_SONNET_MODEL')) {
              const match = line.match(/\$env:ANTHROPIC_DEFAULT_SONNET_MODEL\s*=\s*["']([^"']+)["']/);
              if (match) sonnetModel = match[1];
            }
          }
          
          res.json({ 
            baseUrl, 
            authToken,
            haikuModel,
            opusModel,
            sonnetModel,
            platform: 'windows',
            source: 'PowerShell Profile ($PROFILE)',
            profilePath: trimmedProfilePath
          });
        } catch (readError) {
          // Profile doesn't exist or can't be read - return empty values
          res.json({ 
            baseUrl: '', 
            authToken: '',
            haikuModel: '',
            opusModel: '',
            sonnetModel: '',
            platform: 'windows',
            source: 'PowerShell Profile (not found)',
            profilePath: trimmedProfilePath,
            note: 'PowerShell Profile not found or empty'
          });
        }
      } catch (error) {
        // Fallback to process.env if PowerShell Profile can't be read
        console.error('Failed to read PowerShell Profile:', error);
        baseUrl = process.env.ANTHROPIC_BASE_URL || '';
        authToken = process.env.ANTHROPIC_API_KEY || '';
        haikuModel = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || '';
        opusModel = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || '';
        sonnetModel = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || '';
        
        res.json({ 
          baseUrl, 
          authToken,
          haikuModel,
          opusModel,
          sonnetModel,
          platform: 'windows',
          source: 'Process Environment (fallback)',
          error: 'Failed to read PowerShell Profile'
        });
      }
    } else {
      // Unix: Read from shell config file
      ENV_CONFIG_PATH = await getEnvConfigPath();
      await ensureFileExists(ENV_CONFIG_PATH, '');
      const content = await fs.readFile(ENV_CONFIG_PATH, 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        if (line.includes('ANTHROPIC_BASE_URL')) {
          const match = line.match(/export ANTHROPIC_BASE_URL=["']?([^"'\n]+)["']?/);
          if (match) baseUrl = match[1];
        }
        if (line.includes('ANTHROPIC_API_KEY')) {
          const match = line.match(/export ANTHROPIC_API_KEY=["']?([^"'\n]+)["']?/);
          if (match) authToken = match[1];
        }
        if (line.includes('ANTHROPIC_DEFAULT_HAIKU_MODEL')) {
          const match = line.match(/export ANTHROPIC_DEFAULT_HAIKU_MODEL=["']?([^"'\n]+)["']?/);
          if (match) haikuModel = match[1];
        }
        if (line.includes('ANTHROPIC_DEFAULT_OPUS_MODEL')) {
          const match = line.match(/export ANTHROPIC_DEFAULT_OPUS_MODEL=["']?([^"'\n]+)["']?/);
          if (match) opusModel = match[1];
        }
        if (line.includes('ANTHROPIC_DEFAULT_SONNET_MODEL')) {
          const match = line.match(/export ANTHROPIC_DEFAULT_SONNET_MODEL=["']?([^"'\n]+)["']?/);
          if (match) sonnetModel = match[1];
        }
      }
      
      res.json({ 
        baseUrl, 
        authToken,
        haikuModel,
        opusModel,
        sonnetModel,
        platform: 'unix', 
        configFile: ENV_CONFIG_PATH,
        source: 'Shell configuration file'
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update environment variables
app.post('/api/env-vars', async (req, res) => {
  try {
    const { baseUrl, authToken, haikuModel, opusModel, sonnetModel } = req.body;
    
    if (IS_WINDOWS) {
      // Windows: Write to PowerShell Profile (similar to .zshrc on Unix)
      try {
        // Get PowerShell Profile path (try PowerShell Core first, then Windows PowerShell)
        let profilePath;
        try {
          const { stdout } = await execPromise('pwsh -Command "$PROFILE"');
          profilePath = stdout.trim();
        } catch {
          // Fallback to Windows PowerShell if pwsh is not available
          const { stdout } = await execPromise('powershell -Command "$PROFILE"');
          profilePath = stdout.trim();
        }
        const trimmedProfilePath = profilePath;
        
        // Ensure the profile directory exists
        const profileDir = path.dirname(trimmedProfilePath);
        await fs.mkdir(profileDir, { recursive: true });
        
        // Ensure profile file exists
        await ensureFileExists(trimmedProfilePath, '');
        
        // Read existing profile content
        let profileContent = await fs.readFile(trimmedProfilePath, 'utf-8');
        
        // Remove old environment variable settings (if any)
        const varsToRemove = [
          'ANTHROPIC_BASE_URL',
          'ANTHROPIC_API_KEY',
          'ANTHROPIC_DEFAULT_HAIKU_MODEL',
          'ANTHROPIC_DEFAULT_OPUS_MODEL',
          'ANTHROPIC_DEFAULT_SONNET_MODEL'
        ];
        
        for (const varName of varsToRemove) {
          const regex = new RegExp(`^\\$env:${varName}\\s*=.*$`, 'gm');
          profileContent = profileContent.replace(regex, '');
        }
        
        // Remove Claude environment variables section marker if exists
        profileContent = profileContent.replace(/# Claude Code Environment Variables - START[\s\S]*?# Claude Code Environment Variables - END\n?/g, '');
        
        // Clean up multiple blank lines
        profileContent = profileContent.replace(/\n{3,}/g, '\n\n').trim();
        
        // Add new environment variables at the end
        const newVars = [
          '',
          '# Claude Code Environment Variables - START',
          `$env:ANTHROPIC_BASE_URL = "${baseUrl}"`,
          `$env:ANTHROPIC_API_KEY = "${authToken}"`,
          haikuModel ? `$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = "${haikuModel}"` : '',
          opusModel ? `$env:ANTHROPIC_DEFAULT_OPUS_MODEL = "${opusModel}"` : '',
          sonnetModel ? `$env:ANTHROPIC_DEFAULT_SONNET_MODEL = "${sonnetModel}"` : '',
          '# Claude Code Environment Variables - END',
          ''
        ].filter(line => line !== '').join('\n');
        
        profileContent = profileContent + '\n' + newVars;
        
        // Write updated profile
        await fs.writeFile(trimmedProfilePath, profileContent, 'utf-8');
        
        // Immediately reload environment variables from the updated profile (hot reload)
        await reloadEnvFromProfile();
        
        res.json({
          success: true,
          message: `Environment variables saved and reloaded! Profile: ${trimmedProfilePath}`,
          instructions: 'Environment variables are now active. No restart needed! New PowerShell sessions will also load these variables automatically.',
          platform: 'windows',
          method: 'PowerShell Profile ($PROFILE) - Hot Reloaded',
          profilePath: trimmedProfilePath,
          hotReloaded: true
        });
      } catch (error) {
        console.error('Failed to update PowerShell Profile:', error);
        
        // Fallback: write to a reference file
        ENV_CONFIG_PATH = await getEnvConfigPath();
        await ensureFileExists(ENV_CONFIG_PATH, '');
        
        const refContent = [
          '# Claude Code Environment Variables',
          '# Add these lines to your PowerShell $PROFILE file',
          '# Find your profile location by running: $PROFILE in PowerShell',
          '',
          `$env:ANTHROPIC_BASE_URL = "${baseUrl}"`,
          `$env:ANTHROPIC_API_KEY = "${authToken}"`,
          haikuModel ? `$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = "${haikuModel}"` : '',
          opusModel ? `$env:ANTHROPIC_DEFAULT_OPUS_MODEL = "${opusModel}"` : '',
          sonnetModel ? `$env:ANTHROPIC_DEFAULT_SONNET_MODEL = "${sonnetModel}"` : '',
        ].filter(line => line !== '').join('\n');
        
        await fs.writeFile(ENV_CONFIG_PATH, refContent);
        
        res.json({ 
          success: true, 
          message: `Failed to update PowerShell Profile automatically. Reference saved to ${ENV_CONFIG_PATH}`,
          instructions: 'Please add the environment variables manually to your PowerShell $PROFILE file. Run "$PROFILE" in PowerShell to find its location.',
          platform: 'windows',
          method: 'Manual setup required',
          error: error.message
        });
      }
    } else {
      // Unix: Write to shell config file
      ENV_CONFIG_PATH = await getEnvConfigPath();
      await ensureFileExists(ENV_CONFIG_PATH, '');
      let content = await fs.readFile(ENV_CONFIG_PATH, 'utf-8');
      let lines = content.split('\n');
      
      // Find the section markers
      const startMarker = '# Claude Code & Codex Environment Variables';
      const endMarker = '# End Claude Code & Codex Environment Variables';
      
      let startIndex = lines.findIndex(line => line.includes(startMarker));
      let endIndex = lines.findIndex(line => line.includes(endMarker));
      
      // Remove old section if exists
      if (startIndex !== -1 && endIndex !== -1) {
        lines.splice(startIndex, endIndex - startIndex + 1);
      }
      
      // Add new section (use ANTHROPIC_API_KEY as per official documentation)
      const newSection = [
        '',
        startMarker,
        `export ANTHROPIC_BASE_URL="${baseUrl}"`,
        `export ANTHROPIC_API_KEY="${authToken}"`,
      ];
      
      // Add model defaults if provided
      if (haikuModel) {
        newSection.push(`export ANTHROPIC_DEFAULT_HAIKU_MODEL="${haikuModel}"`);
      }
      if (opusModel) {
        newSection.push(`export ANTHROPIC_DEFAULT_OPUS_MODEL="${opusModel}"`);
      }
      if (sonnetModel) {
        newSection.push(`export ANTHROPIC_DEFAULT_SONNET_MODEL="${sonnetModel}"`);
      }
      
      newSection.push(endMarker);
      
      lines.push(...newSection);
      await fs.writeFile(ENV_CONFIG_PATH, lines.join('\n'));
      
      // Immediately reload environment variables from the updated config (hot reload)
      await reloadEnvFromProfile();
      
      res.json({ 
        success: true, 
        message: `Environment variables saved and reloaded! Config: ${ENV_CONFIG_PATH}`,
        instructions: 'Environment variables are now active. No restart needed! New terminal sessions will also load these variables automatically.',
        platform: 'unix',
        method: 'Shell configuration file - Hot Reloaded',
        configPath: ENV_CONFIG_PATH,
        hotReloaded: true
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get list of command files
app.get('/api/commands', async (req, res) => {
  try {
    await fs.mkdir(CLAUDE_COMMANDS_DIR, { recursive: true });
    const files = await fs.readdir(CLAUDE_COMMANDS_DIR);
    const commands = [];
    
    for (const file of files) {
      const filePath = path.join(CLAUDE_COMMANDS_DIR, file);
      const content = await fs.readFile(filePath, 'utf-8');
      commands.push({ name: file, content });
    }
    
    res.json(commands);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save a command file
app.post('/api/commands', async (req, res) => {
  try {
    const { name, content } = req.body;
    await fs.mkdir(CLAUDE_COMMANDS_DIR, { recursive: true });
    const filePath = path.join(CLAUDE_COMMANDS_DIR, name);
    await fs.writeFile(filePath, content);
    res.json({ success: true, message: 'Command saved successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a command file
app.delete('/api/commands/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const filePath = path.join(CLAUDE_COMMANDS_DIR, name);
    await fs.unlink(filePath);
    res.json({ success: true, message: 'Command deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to expand path placeholders (cross-platform)
function expandPath(inputPath) {
  let expandedPath = inputPath;
  
  // Handle ~ for Unix-like systems
  if (expandedPath.startsWith('~')) {
    expandedPath = expandedPath.replace('~', os.homedir());
  }
  
  // Handle Windows environment variables like %USERPROFILE%, %APPDATA%, etc.
  if (IS_WINDOWS && expandedPath.includes('%')) {
    expandedPath = expandedPath.replace(/%([^%]+)%/g, (_, envVar) => {
      return process.env[envVar] || `%${envVar}%`;
    });
  }
  
  // Normalize path separators for the current platform
  expandedPath = path.normalize(expandedPath);
  
  return expandedPath;
}

// Get available drives on Windows
async function getWindowsDrives() {
  if (!IS_WINDOWS) return [];
  
  try {
    const drives = [];
    // Check common drive letters
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    
    for (const letter of letters) {
      const drivePath = `${letter}:\\`;
      try {
        await fs.access(drivePath);
        drives.push(drivePath);
      } catch {
        // Drive doesn't exist or not accessible
      }
    }
    
    return drives;
  } catch (error) {
    console.error('Error getting Windows drives:', error);
    return [];
  }
}

// Get default paths (home directory, etc.)
app.get('/api/default-paths', async (req, res) => {
  try {
    const homeDir = os.homedir();
    const response = {
      homeDir: homeDir,
      // For display in UI: Windows uses %USERPROFILE%, Unix uses ~
      homeDirSymbol: IS_WINDOWS ? '%USERPROFILE%' : '~',
      platform: IS_WINDOWS ? 'windows' : 'unix',
    };

    // Add standard paths based on platform
    if (IS_WINDOWS) {
      response.quickPaths = {
        home: homeDir,
        desktop: path.join(homeDir, 'Desktop'),
        documents: path.join(homeDir, 'Documents'),
        downloads: path.join(homeDir, 'Downloads'),
      };
      response.drives = await getWindowsDrives();
    } else {
      response.quickPaths = {
        home: '~',
        desktop: '~/Desktop',
        documents: '~/Documents',
        downloads: '~/Downloads',
        root: '/',
      };
    }
    
    res.json(response);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List files in directory

app.post('/api/list-files', async (req, res) => {
  try {
    const { directory } = req.body;
    
    if (!directory) {
      return res.status(400).json({ error: 'Directory is required' });
    }
    
    // Expand path (handles ~, environment variables, etc.)
    const expandedDir = expandPath(directory);
    
    // Check if directory exists and is accessible
    try {
      const stats = await fs.stat(expandedDir);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Path is not a directory' });
      }
    } catch (err) {
      return res.status(404).json({ error: `Directory not found: ${expandedDir}` });
    }
    
    // Read directory contents
    const files = await fs.readdir(expandedDir, { withFileTypes: true });
    
    // Format the file list
    const fileList = files.map(file => ({
      name: file.name,
      isDirectory: file.isDirectory(),
      path: path.join(expandedDir, file.name)
    }));
    
    // Sort: directories first, then files, alphabetically
    fileList.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
    
    res.json({ files: fileList, directory: expandedDir });
  } catch (error) {
    res.status(500).json({ error: error.message, files: [] });
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Claude Config Service backend running on http://localhost:${PORT}`);
});

