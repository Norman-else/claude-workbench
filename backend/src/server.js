import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';

const execPromise = promisify(exec);

// MCP Process Manager
const mcpProcesses = new Map(); // Map<serverName, { process, pid, status, startTime, logs }>
const mcpLogs = new Map(); // Map<serverName, Array<logEntry>>

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json());

const HOME_DIR = os.homedir();
const CLAUDE_JSON_PATH = path.join(HOME_DIR, '.claude.json');
const CLAUDE_COMMANDS_DIR = path.join(HOME_DIR, '.claude', 'commands');
const CLAUDE_PROFILES_PATH = path.join(HOME_DIR, '.claude', 'env-profiles.json');

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

// ============================================
// Environment Profiles API
// ============================================

// Helper: Read profiles from disk
async function readProfiles() {
  try {
    await ensureFileExists(CLAUDE_PROFILES_PATH, JSON.stringify({ profiles: [], activeProfileId: null }, null, 2));
    const content = await fs.readFile(CLAUDE_PROFILES_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    return { profiles: [], activeProfileId: null };
  }
}

// Helper: Write profiles to disk
async function writeProfiles(data) {
  const profileDir = path.dirname(CLAUDE_PROFILES_PATH);
  await fs.mkdir(profileDir, { recursive: true });
  await fs.writeFile(CLAUDE_PROFILES_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// Helper: Get current active profile ID from environment
async function getCurrentActiveProfileId() {
  try {
    // Read from current environment variable
    const profileId = process.env.ANTHROPIC_PROFILE_ID;
    if (profileId) return profileId;

    // Read from shell config file
    if (IS_WINDOWS) {
      let profilePath;
      try {
        const { stdout } = await execPromise('pwsh -Command "$PROFILE"');
        profilePath = stdout.trim();
      } catch {
        const { stdout } = await execPromise('powershell -Command "$PROFILE"');
        profilePath = stdout.trim();
      }
      
      const content = await fs.readFile(profilePath, 'utf-8');
      const match = content.match(/\$env:ANTHROPIC_PROFILE_ID\s*=\s*"([^"]+)"/);
      if (match) return match[1];
    } else {
      const configPath = await getEnvConfigPath();
      const content = await fs.readFile(configPath, 'utf-8');
      const match = content.match(/export ANTHROPIC_PROFILE_ID="([^"]+)"/);
      if (match) return match[1];
    }
  } catch (error) {
    console.error('Failed to get active profile ID:', error);
  }
  return null;
}

// Get all environment profiles
app.get('/api/env-profiles', async (req, res) => {
  try {
    const data = await readProfiles();
    const activeProfileId = await getCurrentActiveProfileId();
    
    res.json({
      profiles: data.profiles || [],
      activeProfileId: activeProfileId || data.activeProfileId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new environment profile
app.post('/api/env-profiles', async (req, res) => {
  try {
    const { name, baseUrl, authToken, haikuModel, opusModel, sonnetModel, smallFastModel } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Profile name is required' });
    }
    
    const data = await readProfiles();
    
    // Check for duplicate names
    if (data.profiles.some(p => p.name === name)) {
      return res.status(400).json({ error: 'Profile name already exists' });
    }
    
    // Generate unique ID
    const id = crypto.randomUUID();
    
    const newProfile = {
      id,
      name,
      baseUrl: baseUrl || '',
      authToken: authToken || '',
      haikuModel: haikuModel || '',
      opusModel: opusModel || '',
      sonnetModel: sonnetModel || '',
      smallFastModel: smallFastModel || '',
      createdAt: new Date().toISOString()
    };
    
    data.profiles.push(newProfile);
    await writeProfiles(data);
    
    res.json({ success: true, profile: newProfile, message: 'Profile created successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update an environment profile
app.put('/api/env-profiles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, baseUrl, authToken, haikuModel, opusModel, sonnetModel, smallFastModel } = req.body;
    
    const data = await readProfiles();
    const profileIndex = data.profiles.findIndex(p => p.id === id);
    
    if (profileIndex === -1) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Check for duplicate names (excluding current profile)
    if (name && data.profiles.some((p, idx) => p.name === name && idx !== profileIndex)) {
      return res.status(400).json({ error: 'Profile name already exists' });
    }
    
    // Update profile
    data.profiles[profileIndex] = {
      ...data.profiles[profileIndex],
      name: name || data.profiles[profileIndex].name,
      baseUrl: baseUrl !== undefined ? baseUrl : data.profiles[profileIndex].baseUrl,
      authToken: authToken !== undefined ? authToken : data.profiles[profileIndex].authToken,
      haikuModel: haikuModel !== undefined ? haikuModel : data.profiles[profileIndex].haikuModel,
      opusModel: opusModel !== undefined ? opusModel : data.profiles[profileIndex].opusModel,
      sonnetModel: sonnetModel !== undefined ? sonnetModel : data.profiles[profileIndex].sonnetModel,
      smallFastModel: smallFastModel !== undefined ? smallFastModel : data.profiles[profileIndex].smallFastModel,
      updatedAt: new Date().toISOString()
    };
    
    await writeProfiles(data);
    
    res.json({ success: true, profile: data.profiles[profileIndex], message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an environment profile
app.delete('/api/env-profiles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readProfiles();
    
    const profileIndex = data.profiles.findIndex(p => p.id === id);
    if (profileIndex === -1) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Don't allow deleting the active profile
    const activeProfileId = await getCurrentActiveProfileId();
    if (activeProfileId === id) {
      return res.status(400).json({ error: 'Cannot delete the active profile. Please activate another profile first.' });
    }
    
    data.profiles.splice(profileIndex, 1);
    await writeProfiles(data);
    
    res.json({ success: true, message: 'Profile deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activate an environment profile (apply to system)
app.post('/api/env-profiles/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readProfiles();
    
    const profile = data.profiles.find(p => p.id === id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Apply environment variables to system
    if (IS_WINDOWS) {
      // Windows: Write to PowerShell Profile
      try {
        let profilePath;
        try {
          const { stdout } = await execPromise('pwsh -Command "$PROFILE"');
          profilePath = stdout.trim();
        } catch {
          const { stdout } = await execPromise('powershell -Command "$PROFILE"');
          profilePath = stdout.trim();
        }
        
        const profileDir = path.dirname(profilePath);
        await fs.mkdir(profileDir, { recursive: true });
        await ensureFileExists(profilePath, '');
        
        let profileContent = await fs.readFile(profilePath, 'utf-8');
        
        // Remove old environment variable settings
        const varsToRemove = [
          'ANTHROPIC_BASE_URL',
          'ANTHROPIC_API_KEY',
          'ANTHROPIC_DEFAULT_HAIKU_MODEL',
          'ANTHROPIC_DEFAULT_OPUS_MODEL',
          'ANTHROPIC_DEFAULT_SONNET_MODEL',
          'ANTHROPIC_PROFILE_ID'
        ];
        
        for (const varName of varsToRemove) {
          const regex = new RegExp(`^\\$env:${varName}\\s*=.*$`, 'gm');
          profileContent = profileContent.replace(regex, '');
        }
        
        profileContent = profileContent.replace(/# Claude Code Environment Variables - START[\s\S]*?# Claude Code Environment Variables - END\n?/g, '');
        profileContent = profileContent.replace(/\n{3,}/g, '\n\n').trim();
        
        // Add new environment variables
        const newVars = [
          '',
          '# Claude Code Environment Variables - START',
          `$env:ANTHROPIC_PROFILE_ID = "${id}"`,
          `$env:ANTHROPIC_BASE_URL = "${profile.baseUrl}"`,
          `$env:ANTHROPIC_API_KEY = "${profile.authToken}"`,
          profile.haikuModel ? `$env:ANTHROPIC_DEFAULT_HAIKU_MODEL = "${profile.haikuModel}"` : '',
          profile.opusModel ? `$env:ANTHROPIC_DEFAULT_OPUS_MODEL = "${profile.opusModel}"` : '',
          profile.sonnetModel ? `$env:ANTHROPIC_DEFAULT_SONNET_MODEL = "${profile.sonnetModel}"` : '',
          profile.smallFastModel ? `$env:ANTHROPIC_DEFAULT_SMALL_FAST_MODEL = "${profile.smallFastModel}"` : '',
          '# Claude Code Environment Variables - END',
          ''
        ].filter(line => line !== '').join('\n');
        
        profileContent = profileContent + '\n' + newVars;
        await fs.writeFile(profilePath, profileContent, 'utf-8');
        
        // Hot reload
        await reloadEnvFromProfile();
        
        // Update active profile in data
        data.activeProfileId = id;
        await writeProfiles(data);
        
        res.json({
          success: true,
          message: `Profile "${profile.name}" activated and reloaded!`,
          profilePath,
          hotReloaded: true
        });
      } catch (error) {
        console.error('Failed to activate profile:', error);
        res.status(500).json({ error: error.message });
      }
    } else {
      // Unix: Write to shell config file
      const configPath = await getEnvConfigPath();
      await ensureFileExists(configPath, '');
      let content = await fs.readFile(configPath, 'utf-8');
      let lines = content.split('\n');
      
      const startMarker = '# Claude Code & Codex Environment Variables';
      const endMarker = '# End Claude Code & Codex Environment Variables';
      
      let startIndex = lines.findIndex(line => line.includes(startMarker));
      let endIndex = lines.findIndex(line => line.includes(endMarker));
      
      if (startIndex !== -1 && endIndex !== -1) {
        lines.splice(startIndex, endIndex - startIndex + 1);
      }
      
      const newSection = [
        '',
        startMarker,
        `export ANTHROPIC_PROFILE_ID="${id}"`,
        `export ANTHROPIC_BASE_URL="${profile.baseUrl}"`,
        `export ANTHROPIC_API_KEY="${profile.authToken}"`,
      ];
      
      if (profile.haikuModel) {
        newSection.push(`export ANTHROPIC_DEFAULT_HAIKU_MODEL="${profile.haikuModel}"`);
      }
      if (profile.opusModel) {
        newSection.push(`export ANTHROPIC_DEFAULT_OPUS_MODEL="${profile.opusModel}"`);
      }
      if (profile.sonnetModel) {
        newSection.push(`export ANTHROPIC_DEFAULT_SONNET_MODEL="${profile.sonnetModel}"`);
      }
      if (profile.smallFastModel) {
        newSection.push(`export ANTHROPIC_DEFAULT_SMALL_FAST_MODEL="${profile.smallFastModel}"`);
      }
      
      newSection.push(endMarker);
      lines.push(...newSection);
      await fs.writeFile(configPath, lines.join('\n'));
      
      // Hot reload
      await reloadEnvFromProfile();
      
      // Update active profile in data
      data.activeProfileId = id;
      await writeProfiles(data);
      
      res.json({
        success: true,
        message: `Profile "${profile.name}" activated and reloaded!`,
        configPath,
        hotReloaded: true
      });
    }
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

// ============================================
// MCP Process Management APIs
// ============================================

// Helper function to add log entry
function addLog(serverName, type, message) {
  if (!mcpLogs.has(serverName)) {
    mcpLogs.set(serverName, []);
  }
  const logs = mcpLogs.get(serverName);
  logs.push({
    timestamp: new Date().toISOString(),
    type, // 'info', 'error', 'stdout', 'stderr'
    message
  });
  // Keep only last 100 logs
  if (logs.length > 100) {
    logs.shift();
  }
}

// Start MCP Server
app.post('/api/mcp/:name/start', async (req, res) => {
  const serverName = req.params.name;
  
  try {
    // Check if already running
    if (mcpProcesses.has(serverName)) {
      const processInfo = mcpProcesses.get(serverName);
      if (processInfo.status === 'running') {
        return res.status(400).json({ error: 'Server already running' });
      }
    }

    // Read config to get server details
    const configContent = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8');
    const config = JSON.parse(configContent);
    const serverConfig = config.mcpServers?.[serverName];
    
    if (!serverConfig) {
      return res.status(404).json({ error: 'Server not found in config' });
    }

    // Prepare command
    const { command, args = [], env = {} } = serverConfig;
    
    addLog(serverName, 'info', `Starting MCP server: ${serverName}`);
    addLog(serverName, 'info', `Command: ${command} ${args.join(' ')}`);

    // Spawn process
    const childProcess = spawn(command, args, {
      env: { ...process.env, ...env },
      shell: IS_WINDOWS,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const processInfo = {
      process: childProcess,
      pid: childProcess.pid,
      status: 'running',
      startTime: new Date().toISOString(),
      command,
      args
    };

    mcpProcesses.set(serverName, processInfo);

    // Handle stdout
    childProcess.stdout.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        addLog(serverName, 'stdout', message);
      }
    });

    // Handle stderr
    childProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      if (message) {
        addLog(serverName, 'stderr', message);
      }
    });

    // Handle process exit
    childProcess.on('exit', (code, signal) => {
      const message = `Process exited with code ${code} ${signal ? `and signal ${signal}` : ''}`;
      addLog(serverName, 'info', message);
      
      if (mcpProcesses.has(serverName)) {
        const info = mcpProcesses.get(serverName);
        info.status = 'stopped';
        info.exitCode = code;
        info.exitSignal = signal;
      }
    });

    // Handle errors
    childProcess.on('error', (error) => {
      addLog(serverName, 'error', `Process error: ${error.message}`);
      if (mcpProcesses.has(serverName)) {
        const info = mcpProcesses.get(serverName);
        info.status = 'error';
        info.error = error.message;
      }
    });

    res.json({
      message: 'Server started successfully',
      pid: childProcess.pid,
      status: 'running'
    });

  } catch (error) {
    addLog(serverName, 'error', `Failed to start: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Stop MCP Server
app.post('/api/mcp/:name/stop', (req, res) => {
  const serverName = req.params.name;
  
  try {
    if (!mcpProcesses.has(serverName)) {
      return res.status(404).json({ error: 'Server not running' });
    }

    const processInfo = mcpProcesses.get(serverName);
    
    if (processInfo.status !== 'running') {
      return res.status(400).json({ error: 'Server is not running' });
    }

    addLog(serverName, 'info', 'Stopping server...');

    // Kill process
    if (IS_WINDOWS) {
      // Windows: use taskkill
      exec(`taskkill /pid ${processInfo.pid} /T /F`, (error) => {
        if (error) {
          addLog(serverName, 'error', `Error stopping process: ${error.message}`);
        }
      });
    } else {
      // Unix: use kill
      processInfo.process.kill('SIGTERM');
    }

    processInfo.status = 'stopping';

    // Force kill after 5 seconds if not stopped
    setTimeout(() => {
      if (mcpProcesses.has(serverName)) {
        const info = mcpProcesses.get(serverName);
        if (info.status === 'stopping') {
          addLog(serverName, 'info', 'Force killing process...');
          info.process.kill('SIGKILL');
          info.status = 'stopped';
        }
      }
    }, 5000);

    res.json({ message: 'Server stop initiated', status: 'stopping' });

  } catch (error) {
    addLog(serverName, 'error', `Failed to stop: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get MCP Server Status
app.get('/api/mcp/:name/status', (req, res) => {
  const serverName = req.params.name;
  
  if (!mcpProcesses.has(serverName)) {
    return res.json({
      status: 'stopped',
      running: false
    });
  }

  const processInfo = mcpProcesses.get(serverName);
  
  res.json({
    status: processInfo.status,
    running: processInfo.status === 'running',
    pid: processInfo.pid,
    startTime: processInfo.startTime,
    command: processInfo.command,
    args: processInfo.args,
    exitCode: processInfo.exitCode,
    exitSignal: processInfo.exitSignal,
    error: processInfo.error
  });
});

// Get all MCP servers status
app.get('/api/mcp/status/all', async (req, res) => {
  try {
    const configContent = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8');
    const config = JSON.parse(configContent);
    const servers = config.mcpServers || {};
    
    const statuses = {};
    
    for (const serverName of Object.keys(servers)) {
      if (mcpProcesses.has(serverName)) {
        const processInfo = mcpProcesses.get(serverName);
        statuses[serverName] = {
          status: processInfo.status,
          running: processInfo.status === 'running',
          pid: processInfo.pid,
          startTime: processInfo.startTime
      };
    } else {
        statuses[serverName] = {
          status: 'stopped',
          running: false
        };
      }
    }
    
    res.json(statuses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get MCP Server Logs
app.get('/api/mcp/:name/logs', (req, res) => {
  const serverName = req.params.name;
  const limit = parseInt(req.query.limit) || 50;
  
  if (!mcpLogs.has(serverName)) {
    return res.json({ logs: [] });
  }

  const logs = mcpLogs.get(serverName);
  const recentLogs = logs.slice(-limit);
  
  res.json({ logs: recentLogs });
});

// Restart MCP Server
app.post('/api/mcp/:name/restart', async (req, res) => {
  const serverName = req.params.name;
  
  try {
    // Stop if running
    if (mcpProcesses.has(serverName)) {
      const processInfo = mcpProcesses.get(serverName);
      if (processInfo.status === 'running') {
        processInfo.process.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Start
    const response = await fetch(`http://localhost:${PORT}/api/mcp/${serverName}/start`, {
      method: 'POST'
    });
    
    const result = await response.json();
    res.json(result);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


app.listen(PORT, () => {
  console.log(`🚀 Claude Config Service backend running on http://localhost:${PORT}`);
  console.log(`📡 MCP Process Manager ready`);
});

