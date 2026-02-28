import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { spawn, exec } from 'child_process';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import {
  IS_WINDOWS,
  HOME_DIR,
  ensureFileExists,
  getEnvConfigPath,
  readEnvFromShellConfig,
  writeEnvToShellConfig,
  clearEnvFromShellConfig,
  readActiveProfileIdFromShellConfig,
  readSettingsEnv,
  writeSettingsEnv,
  clearSettingsEnv,
  expandPath,
  getWindowsDrives,
} from './platform.js';

// ============================================================
// Types
// ============================================================

interface McpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ClaudeConfig {
  mcpServers?: Record<string, McpServer>;
  [key: string]: unknown;
}

interface McpProcessInfo {
  process: ReturnType<typeof spawn> | null;
  pid: number | null;
  status: 'running' | 'stopped' | 'stopping' | 'error';
  startTime: string;
  command: string;
  args: string[];
  exitCode?: number | null;
  exitSignal?: NodeJS.Signals | null;
  error?: string;
  keepAliveInterval: ReturnType<typeof setInterval> | null;
}

interface LogEntry {
  timestamp: string;
  type: 'info' | 'error' | 'stdout' | 'stderr' | 'warn';
  message: string;
}

interface EnvProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  authToken: string;
  haikuModel: string;
  opusModel: string;
  sonnetModel: string;
  smallFastModel: string;
  createdAt: string;
  updatedAt?: string;
}

interface ProfilesData {
  profiles: EnvProfile[];
  activeProfileId: string | null;
}

// ============================================================
// Constants
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLAUDE_JSON_PATH = path.join(HOME_DIR, '.claude.json');
const CLAUDE_COMMANDS_DIR = path.join(HOME_DIR, '.claude', 'commands');
const CLAUDE_SKILLS_DIR = path.join(HOME_DIR, '.claude', 'skills');
const CLAUDE_PROFILES_PATH = path.join(HOME_DIR, '.claude', 'env-profiles.json');
const CLAUDE_SETTINGS_PATH = path.join(HOME_DIR, '.claude', 'settings.json');
const PORT = 3001;

// ============================================================
// MCP process manager state
// ============================================================

const mcpProcesses = new Map<string, McpProcessInfo>();
const mcpLogs = new Map<string, LogEntry[]>();

function addLog(
  serverName: string,
  type: LogEntry['type'],
  message: string
): void {
  if (!mcpLogs.has(serverName)) mcpLogs.set(serverName, []);
  const logs = mcpLogs.get(serverName)!;
  logs.push({ timestamp: new Date().toISOString(), type, message });
  if (logs.length > 100) logs.shift();
}

// ============================================================
// App setup
// ============================================================

const app = express();
const isElectron = !!(process.versions as Record<string, string>).electron;

app.use(cors());
app.use(bodyParser.json());

if (isElectron) {
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  console.log(`[Server] Serving frontend static files from: ${frontendPath}`);
  app.use(express.static(frontendPath));
}

// ============================================================
// Env reload helper
// ============================================================

async function reloadEnvFromProfile(): Promise<boolean> {
  try {
    // Priority 1: settings.json
    const settingsEnv = await readSettingsEnv(CLAUDE_SETTINGS_PATH);
    if (settingsEnv) {
      Object.assign(process.env, settingsEnv);
      console.log('Environment variables loaded from settings.json');
      return true;
    }
  } catch {
    // fall through to shell config
  }

  // Priority 2: shell config
  try {
    const vars = await readEnvFromShellConfig();
    Object.assign(process.env, vars);
    return true;
  } catch (err) {
    console.error('Failed to reload env from shell config:', err);
    return false;
  }
}

// ============================================================
// Profile helpers
// ============================================================

async function readProfiles(): Promise<ProfilesData> {
  try {
    await ensureFileExists(
      CLAUDE_PROFILES_PATH,
      JSON.stringify({ profiles: [], activeProfileId: null }, null, 2)
    );
    const content = await fs.readFile(CLAUDE_PROFILES_PATH, 'utf-8');
    const data = JSON.parse(content) as ProfilesData;

    // Data migration: authToken → apiKey
    let dirty = false;
    data.profiles = data.profiles.map((p) => {
      const anyP = p as unknown as Record<string, unknown>;
      if (anyP.authToken !== undefined && anyP.apiKey === undefined) {
        p.apiKey = anyP.authToken as string;
        delete anyP.authToken;
        dirty = true;
      }
      if ((p as unknown as Record<string, unknown>).authToken === undefined) {
        p.authToken = '';
      }
      return p;
    });

    if (dirty) {
      await writeProfiles(data);
      console.log('Migrated profile data: authToken → apiKey');
    }
    return data;
  } catch {
    return { profiles: [], activeProfileId: null };
  }
}

async function writeProfiles(data: ProfilesData): Promise<void> {
  const dir = path.dirname(CLAUDE_PROFILES_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(CLAUDE_PROFILES_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function getCurrentActiveProfileId(): Promise<string | null> {
  try {
    const settingsEnv = await readSettingsEnv(CLAUDE_SETTINGS_PATH);
    if (settingsEnv?.ANTHROPIC_PROFILE_ID) {
      return settingsEnv.ANTHROPIC_PROFILE_ID;
    }
  } catch {
    // fall through
  }
  return readActiveProfileIdFromShellConfig();
}

function buildProfileEnvVars(
  profile: EnvProfile
): Record<string, string> {
  const vars: Record<string, string> = {
    ANTHROPIC_PROFILE_ID: profile.id,
  };
  if (profile.baseUrl) vars.ANTHROPIC_BASE_URL = profile.baseUrl;
  if (profile.apiKey) vars.ANTHROPIC_API_KEY = profile.apiKey;
  if (profile.authToken) vars.ANTHROPIC_AUTH_TOKEN = profile.authToken;
  if (profile.haikuModel) vars.ANTHROPIC_DEFAULT_HAIKU_MODEL = profile.haikuModel;
  if (profile.opusModel) vars.ANTHROPIC_DEFAULT_OPUS_MODEL = profile.opusModel;
  if (profile.sonnetModel) vars.ANTHROPIC_DEFAULT_SONNET_MODEL = profile.sonnetModel;
  if (profile.smallFastModel)
    vars.ANTHROPIC_DEFAULT_SMALL_FAST_MODEL = profile.smallFastModel;
  return vars;
}

/** Write profile env vars – tries settings.json first, falls back to shell. */
async function persistProfileEnvVars(
  profile: EnvProfile
): Promise<'settings' | 'shell'> {
  const vars = buildProfileEnvVars(profile);
  try {
    await writeSettingsEnv(CLAUDE_SETTINGS_PATH, vars);
    await reloadEnvFromProfile();
    return 'settings';
  } catch {
    await writeEnvToShellConfig(vars);
    await reloadEnvFromProfile();
    return 'shell';
  }
}

// ============================================================
// Skills helpers
// ============================================================

interface Frontmatter {
  [key: string]: string;
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const frontmatter: Frontmatter = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      frontmatter[line.substring(0, colonIdx).trim()] = line
        .substring(colonIdx + 1)
        .trim();
    }
  }
  return { frontmatter, body: match[2] };
}

function validateSkillName(name: string): boolean {
  return /^[a-z0-9-]{1,64}$/.test(name);
}

// ============================================================
// Routes: Claude config
// ============================================================

app.get('/api/claude-config', async (_req: Request, res: Response) => {
  try {
    await ensureFileExists(CLAUDE_JSON_PATH, '{}');
    const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8');
    res.json(JSON.parse(content || '{}') as ClaudeConfig);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/claude-config', async (req: Request, res: Response) => {
  try {
    const config = req.body as ClaudeConfig;
    await fs.writeFile(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2));
    res.json({ success: true, message: 'Configuration saved successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================
// Routes: Environment variables (legacy single-profile API)
// ============================================================

app.get('/api/env-vars', async (_req: Request, res: Response) => {
  try {
    const vars = await readEnvFromShellConfig();
    const platform = IS_WINDOWS ? 'windows' : 'unix';

    if (IS_WINDOWS) {
      res.json({
        baseUrl: vars.ANTHROPIC_BASE_URL ?? '',
        authToken: vars.ANTHROPIC_API_KEY ?? '',
        haikuModel: vars.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? '',
        opusModel: vars.ANTHROPIC_DEFAULT_OPUS_MODEL ?? '',
        sonnetModel: vars.ANTHROPIC_DEFAULT_SONNET_MODEL ?? '',
        platform,
        source: 'PowerShell Profile ($PROFILE)',
      });
    } else {
      const configFile = await getEnvConfigPath();
      res.json({
        baseUrl: vars.ANTHROPIC_BASE_URL ?? '',
        authToken: vars.ANTHROPIC_API_KEY ?? '',
        haikuModel: vars.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? '',
        opusModel: vars.ANTHROPIC_DEFAULT_OPUS_MODEL ?? '',
        sonnetModel: vars.ANTHROPIC_DEFAULT_SONNET_MODEL ?? '',
        platform,
        configFile,
        source: 'Shell configuration file',
      });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/env-vars', async (req: Request, res: Response) => {
  try {
    const {
      baseUrl,
      authToken,
      haikuModel,
      opusModel,
      sonnetModel,
    } = req.body as {
      baseUrl: string;
      authToken: string;
      haikuModel?: string;
      opusModel?: string;
      sonnetModel?: string;
    };

    const vars: Record<string, string> = {
      ANTHROPIC_BASE_URL: baseUrl ?? '',
      ANTHROPIC_API_KEY: authToken ?? '',
    };
    if (haikuModel) vars.ANTHROPIC_DEFAULT_HAIKU_MODEL = haikuModel;
    if (opusModel) vars.ANTHROPIC_DEFAULT_OPUS_MODEL = opusModel;
    if (sonnetModel) vars.ANTHROPIC_DEFAULT_SONNET_MODEL = sonnetModel;

    await writeEnvToShellConfig(vars);
    await reloadEnvFromProfile();

    const configPath = IS_WINDOWS ? 'PowerShell $PROFILE' : await getEnvConfigPath();
    res.json({
      success: true,
      message: `Environment variables saved and reloaded! Config: ${configPath}`,
      instructions: 'Environment variables are now active.',
      platform: IS_WINDOWS ? 'windows' : 'unix',
      hotReloaded: true,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/reload-env', async (_req: Request, res: Response) => {
  try {
    const success = await reloadEnvFromProfile();
    if (success) {
      res.json({
        success: true,
        message: 'Environment variables reloaded successfully',
        platform: IS_WINDOWS ? 'windows' : 'unix',
        variables: {
          ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL ?? '',
          ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ? '***' : '',
          ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? '',
          ANTHROPIC_DEFAULT_OPUS_MODEL: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? '',
          ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? '',
        },
      });
    } else {
      res.json({ success: false, message: 'Failed to reload environment variables' });
    }
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/shell-config-content', async (_req: Request, res: Response) => {
  try {
    let configPath = '';
    let content = '';
    const platform = IS_WINDOWS ? 'windows' : 'unix';

    if (IS_WINDOWS) {
      try {
        // We can't call getPowerShellProfile directly (it's unexported from platform),
        // so we re-use readEnvFromShellConfig path logic via exec
        const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
          exec('pwsh -Command "$PROFILE" 2>$null || powershell -Command "$PROFILE"', (err, stdout) => {
            if (err) reject(err); else resolve({ stdout });
          });
        });
        configPath = stdout.trim();
        try {
          content = await fs.readFile(configPath, 'utf-8');
        } catch {
          content = '# PowerShell Profile not found or empty';
        }
      } catch {
        configPath = 'PowerShell $PROFILE';
        content = '# Error reading PowerShell Profile';
      }
    } else {
      configPath = await getEnvConfigPath();
      await ensureFileExists(configPath, '');
      content = await fs.readFile(configPath, 'utf-8');
      if (!content.trim()) {
        content = `# ${configPath} is empty\n# Add environment variables using:\n# export VARIABLE_NAME="value"`;
      }
    }

    res.json({ configPath, content, platform });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/claude-settings-content', async (_req: Request, res: Response) => {
  try {
    let content = '';
    try {
      content = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
    } catch {
      content = '# ~/.claude/settings.json not found or empty';
    }
    res.json({ configPath: CLAUDE_SETTINGS_PATH, content });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  });

app.post('/api/shell-config-content', async (req: Request, res: Response) => {
  try {
    const { content } = req.body as { content: string };
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'content must be a string' });
      return;
    }
    let configPath = '';
    if (IS_WINDOWS) {
      const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
        exec('pwsh -Command "$PROFILE" 2>$null || powershell -Command "$PROFILE"', (err, stdout) => {
          if (err) reject(err); else resolve({ stdout });
        });
      });
      configPath = stdout.trim();
    } else {
      configPath = await getEnvConfigPath();
      await ensureFileExists(configPath, '');
    }
    await fs.writeFile(configPath, content, 'utf-8');
    res.json({ success: true, configPath });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/claude-settings-content', async (req: Request, res: Response) => {
  try {
    const { content } = req.body as { content: string };
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'content must be a string' });
      return;
    }
    await fs.mkdir(path.dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
    await fs.writeFile(CLAUDE_SETTINGS_PATH, content, 'utf-8');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================
// Routes: Commands
// ============================================================

app.get('/api/commands', async (_req: Request, res: Response) => {
  try {
    await fs.mkdir(CLAUDE_COMMANDS_DIR, { recursive: true });
    const files = await fs.readdir(CLAUDE_COMMANDS_DIR);
    const commands = await Promise.all(
      files.map(async (file) => ({
        name: file,
        content: await fs.readFile(path.join(CLAUDE_COMMANDS_DIR, file), 'utf-8'),
      }))
    );
    res.json(commands);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/commands', async (req: Request, res: Response) => {
  try {
    const { name, content } = req.body as { name: string; content: string };
    await fs.mkdir(CLAUDE_COMMANDS_DIR, { recursive: true });
    await fs.writeFile(path.join(CLAUDE_COMMANDS_DIR, name), content);
    res.json({ success: true, message: 'Command saved successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/commands/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    await fs.unlink(path.join(CLAUDE_COMMANDS_DIR, name));
    res.json({ success: true, message: 'Command deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================
// Routes: Skills
// ============================================================

app.get('/api/skills', async (_req: Request, res: Response) => {
  try {
    await fs.mkdir(CLAUDE_SKILLS_DIR, { recursive: true });
    const dirs = await fs.readdir(CLAUDE_SKILLS_DIR, { withFileTypes: true });
    const skills = (
      await Promise.all(
        dirs
          .filter((d) => d.isDirectory())
          .map(async (dir) => {
            try {
              const skillFile = path.join(CLAUDE_SKILLS_DIR, dir.name, 'SKILL.md');
              const content = await fs.readFile(skillFile, 'utf-8');
              const { frontmatter } = parseFrontmatter(content);
              return {
                name: dir.name,
                content,
                description: frontmatter.description ?? '',
                allowedTools: frontmatter['allowed-tools'] ?? '',
              };
            } catch {
              return null;
            }
          })
      )
    ).filter(Boolean);
    res.json(skills);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/skills', async (req: Request, res: Response) => {
  try {
    const { name, content } = req.body as { name: string; content: string };
    if (!name || !content)
      return res.status(400).json({ error: 'Name and content are required' });
    if (!validateSkillName(name))
      return res.status(400).json({
        error: 'Invalid skill name. Must use lowercase letters, numbers, and hyphens only (max 64 characters)',
      });

    const skillPath = path.join(CLAUDE_SKILLS_DIR, name);
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), content, 'utf-8');
    res.json({ success: true, message: 'Skill saved successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/skills/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    await fs.rm(path.join(CLAUDE_SKILLS_DIR, name), {
      recursive: true,
      force: true,
    });
    res.json({ success: true, message: 'Skill deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================
// Routes: Environment profiles
// ============================================================

app.get('/api/env-profiles', async (_req: Request, res: Response) => {
  try {
    const data = await readProfiles();
    const activeProfileId = await getCurrentActiveProfileId();
    res.json({ profiles: data.profiles, activeProfileId });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/env-profiles', async (req: Request, res: Response) => {
  try {
    const {
      name,
      baseUrl = '',
      apiKey = '',
      authToken = '',
      haikuModel = '',
      opusModel = '',
      sonnetModel = '',
      smallFastModel = '',
    } = req.body as Partial<EnvProfile>;

    if (!name) return res.status(400).json({ error: 'Profile name is required' });

    const data = await readProfiles();
    if (data.profiles.some((p) => p.name === name))
      return res.status(400).json({ error: 'Profile name already exists' });

    const newProfile: EnvProfile = {
      id: crypto.randomUUID(),
      name,
      baseUrl,
      apiKey,
      authToken,
      haikuModel,
      opusModel,
      sonnetModel,
      smallFastModel,
      createdAt: new Date().toISOString(),
    };

    data.profiles.push(newProfile);
    await writeProfiles(data);
    res.json({ success: true, profile: newProfile, message: 'Profile created successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.put('/api/env-profiles/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body as Partial<EnvProfile>;
    const data = await readProfiles();
    const idx = data.profiles.findIndex((p) => p.id === id);

    if (idx === -1) return res.status(404).json({ error: 'Profile not found' });
    if (
      updates.name &&
      data.profiles.some((p, i) => p.name === updates.name && i !== idx)
    )
      return res.status(400).json({ error: 'Profile name already exists' });

    data.profiles[idx] = {
      ...data.profiles[idx],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await writeProfiles(data);

    // If active, sync env
    const activeId = await getCurrentActiveProfileId();
    if (activeId === id) {
      await persistProfileEnvVars(data.profiles[idx]);
    }

    res.json({
      success: true,
      profile: data.profiles[idx],
      message:
        activeId === id
          ? 'Profile updated and shell config synchronized successfully'
          : 'Profile updated successfully',
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/env-profiles/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await readProfiles();
    const idx = data.profiles.findIndex((p) => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'Profile not found' });

    const activeId = await getCurrentActiveProfileId();
    if (activeId === id)
      return res
        .status(400)
        .json({ error: 'Cannot delete the active profile. Please activate another profile first.' });

    data.profiles.splice(idx, 1);
    await writeProfiles(data);
    res.json({ success: true, message: 'Profile deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/env-profiles/:id/activate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await readProfiles();
    const profile = data.profiles.find((p) => p.id === id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const method = await persistProfileEnvVars(profile);
    data.activeProfileId = id;
    await writeProfiles(data);

    res.json({
      success: true,
      message: `Profile "${profile.name}" activated and reloaded!`,
      method,
      hotReloaded: true,
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/env-profiles/:id/deactivate', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const data = await readProfiles();
    const profile = data.profiles.find((p) => p.id === id);
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    // Clear from settings.json
    await clearSettingsEnv(CLAUDE_SETTINGS_PATH);
    // Clear from shell config
    await clearEnvFromShellConfig();
    await reloadEnvFromProfile();

    data.activeProfileId = null;
    await writeProfiles(data);

    res.json({ success: true, message: `Profile "${profile.name}" deactivated!`, hotReloaded: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/env-profiles/reorder', async (req: Request, res: Response) => {
  try {
    const { orderedIds } = req.body as { orderedIds: string[] };
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });

    const data = await readProfiles();
    const profileMap = new Map(data.profiles.map((p) => [p.id, p]));
    const reordered = orderedIds.map((id) => profileMap.get(id)).filter((p): p is EnvProfile => p !== undefined);
    // Preserve any profiles not in orderedIds at the end
    const remaining = data.profiles.filter((p) => !orderedIds.includes(p.id));
    data.profiles = [...reordered, ...remaining];
    await writeProfiles(data);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================
// Routes: File system helpers
// ============================================================

app.get('/api/default-paths', async (_req: Request, res: Response) => {
  try {
    const homeDir = os.homedir();
    const response: Record<string, unknown> = {
      homeDir,
      homeDirSymbol: IS_WINDOWS ? '%USERPROFILE%' : '~',
      platform: IS_WINDOWS ? 'windows' : 'unix',
    };

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
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/list-files', async (req: Request, res: Response) => {
  try {
    const { directory } = req.body as { directory: string };
    if (!directory) return res.status(400).json({ error: 'Directory is required' });

    const expandedDir = expandPath(directory);

    try {
      const stats = await fs.stat(expandedDir);
      if (!stats.isDirectory())
        return res.status(400).json({ error: 'Path is not a directory' });
    } catch {
      return res.status(404).json({ error: `Directory not found: ${expandedDir}` });
    }

    const files = await fs.readdir(expandedDir, { withFileTypes: true });
    const fileList = files
      .map((f) => ({
        name: f.name,
        isDirectory: f.isDirectory(),
        path: path.join(expandedDir, f.name),
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    res.json({ files: fileList, directory: expandedDir });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message, files: [] });
  }
});

// ============================================================
// Routes: MCP process management
// ============================================================

app.post('/api/mcp/:name/start', async (req: Request, res: Response) => {
  const serverName = req.params.name;
  try {
    if (mcpProcesses.get(serverName)?.status === 'running')
      return res.status(400).json({ error: 'Server already running' });

    const configContent = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8');
    const config = JSON.parse(configContent) as ClaudeConfig;
    const serverConfig = config.mcpServers?.[serverName];

    if (!serverConfig)
      return res.status(404).json({ error: 'Server not found in config' });

    const { command, args = [], env = {} } = serverConfig;
    addLog(serverName, 'info', `Starting MCP server: ${serverName}`);
    addLog(serverName, 'info', `Command: ${command} ${args.join(' ')}`);

    let childProcess: ReturnType<typeof spawn>;
    try {
      childProcess = spawn(command, args, {
        env: { ...process.env, ...env },
        shell: IS_WINDOWS,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (spawnErr) {
      const msg = (spawnErr as Error).message;
      addLog(serverName, 'error', `Failed to spawn: ${msg}`);
      mcpProcesses.set(serverName, {
        process: null,
        pid: null,
        status: 'error',
        startTime: new Date().toISOString(),
        command,
        args,
        error: msg,
        keepAliveInterval: null,
      });
      return res.status(500).json({ error: `Failed to start server: ${msg}`, details: msg });
    }

    const processInfo: McpProcessInfo = {
      process: childProcess,
      pid: childProcess.pid ?? null,
      status: 'running',
      startTime: new Date().toISOString(),
      command,
      args,
      keepAliveInterval: null,
    };
    mcpProcesses.set(serverName, processInfo);

    childProcess.stdout?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) addLog(serverName, 'stdout', msg);
    });
    childProcess.stderr?.on('data', (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) addLog(serverName, 'stderr', msg);
    });
    childProcess.on('exit', (code, signal) => {
      addLog(serverName, 'info', `Process exited with code ${code} ${signal ? `and signal ${signal}` : ''}`);
      const info = mcpProcesses.get(serverName);
      if (info) {
        info.status = 'stopped';
        info.exitCode = code;
        info.exitSignal = signal;
        if (info.keepAliveInterval) {
          clearInterval(info.keepAliveInterval);
          info.keepAliveInterval = null;
        }
      }
    });
    childProcess.on('error', (error) => {
      addLog(serverName, 'error', `Process error: ${error.message}`);
      const info = mcpProcesses.get(serverName);
      if (info) {
        info.status = 'error';
        info.error = error.message;
        if (info.keepAliveInterval) {
          clearInterval(info.keepAliveInterval);
          info.keepAliveInterval = null;
        }
      }
    });
    childProcess.stdin?.on('error', (error) => {
      addLog(serverName, 'warn', `stdin error: ${error.message}`);
    });

    // Keep-alive timer (keeps the interval tracked so we can clear it)
    const keepAliveInterval = setInterval(() => {
      // Connection is kept alive by keeping stdin open
    }, 30000);
    processInfo.keepAliveInterval = keepAliveInterval;

    addLog(serverName, 'info', `Process started with PID ${childProcess.pid}`);
    res.json({
      message: 'Server started successfully',
      pid: childProcess.pid,
      status: 'running',
      logs: mcpLogs.get(serverName) ?? [],
    });
  } catch (err) {
    addLog(serverName, 'error', `Failed to start: ${(err as Error).message}`);
    res.status(500).json({ error: (err as Error).message, details: (err as Error).stack });
  }
});

app.post('/api/mcp/:name/stop', (req: Request, res: Response) => {
  const serverName = req.params.name;
  try {
    const processInfo = mcpProcesses.get(serverName);
    if (!processInfo) return res.status(404).json({ error: 'Server not running' });
    if (processInfo.status !== 'running')
      return res.status(400).json({ error: 'Server is not running' });

    addLog(serverName, 'info', 'Stopping server...');

    if (processInfo.keepAliveInterval) {
      clearInterval(processInfo.keepAliveInterval);
      processInfo.keepAliveInterval = null;
    }

    try {
      processInfo.process?.stdin?.end();
      addLog(serverName, 'info', 'Closed stdin, waiting for graceful shutdown...');
    } catch (e) {
      addLog(serverName, 'warn', `Error closing stdin: ${(e as Error).message}`);
    }

    if (IS_WINDOWS) {
      exec(`taskkill /pid ${processInfo.pid} /T /F`, (error) => {
        if (error) addLog(serverName, 'error', `Error stopping: ${error.message}`);
      });
    } else {
      processInfo.process?.kill('SIGTERM');
    }

    processInfo.status = 'stopping';

    setTimeout(() => {
      const info = mcpProcesses.get(serverName);
      if (info?.status === 'stopping') {
        addLog(serverName, 'info', 'Force killing process...');
        info.process?.kill('SIGKILL');
        info.status = 'stopped';
      }
      if (info?.keepAliveInterval) {
        clearInterval(info.keepAliveInterval);
        info.keepAliveInterval = null;
      }
    }, 5000);

    res.json({ message: 'Server stop initiated', status: 'stopping' });
  } catch (err) {
    addLog(serverName, 'error', `Failed to stop: ${(err as Error).message}`);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/mcp/:name/status', (req: Request, res: Response) => {
  const serverName = req.params.name;
  const processInfo = mcpProcesses.get(serverName);
  if (!processInfo) {
    return res.json({ status: 'stopped', running: false });
  }
  res.json({
    status: processInfo.status,
    running: processInfo.status === 'running',
    pid: processInfo.pid,
    startTime: processInfo.startTime,
    command: processInfo.command,
    args: processInfo.args,
    exitCode: processInfo.exitCode,
    exitSignal: processInfo.exitSignal,
    error: processInfo.error,
  });
});

app.get('/api/mcp/status/all', async (_req: Request, res: Response) => {
  try {
    const configContent = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8');
    const config = JSON.parse(configContent) as ClaudeConfig;
    const servers = config.mcpServers ?? {};
    const statuses: Record<string, unknown> = {};

    for (const serverName of Object.keys(servers)) {
      const info = mcpProcesses.get(serverName);
      statuses[serverName] = info
        ? {
            status: info.status,
            running: info.status === 'running',
            pid: info.pid,
            startTime: info.startTime,
          }
        : { status: 'stopped', running: false };
    }

    res.json(statuses);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/mcp/:name/logs', (req: Request, res: Response) => {
  const serverName = req.params.name;
  const limit = parseInt((req.query.limit as string) ?? '50', 10);
  const logs = mcpLogs.get(serverName) ?? [];
  const recent = logs.slice(-limit);
  res.json({ logs: recent, total: logs.length, displayed: recent.length });
});

app.post('/api/mcp/:name/logs/clear', (req: Request, res: Response) => {
  mcpLogs.delete(req.params.name);
  res.json({ success: true, message: 'Logs cleared' });
});

app.post('/api/mcp/:name/restart', async (req: Request, res: Response) => {
  const serverName = req.params.name;
  try {
    const info = mcpProcesses.get(serverName);
    if (info?.status === 'running') {
      if (info.keepAliveInterval) {
        clearInterval(info.keepAliveInterval);
        info.keepAliveInterval = null;
      }
      try { info.process?.stdin?.end(); } catch { /* ignore */ }
      info.process?.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 2000));
    }

    const response = await fetch(`http://localhost:${PORT}/api/mcp/${serverName}/start`, {
      method: 'POST',
    });
    const result = await response.json() as unknown;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================
// Start
// ============================================================

const server = app.listen(PORT, () => {
  console.log(`🚀 Claude Config Service backend running on http://localhost:${PORT}`);
  console.log('📡 MCP Process Manager ready');
  if (isElectron) console.log(`📱 Frontend available at http://localhost:${PORT}`);
});

export default server;
