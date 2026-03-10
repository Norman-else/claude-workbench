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
import { registerAIAssistantRoutes } from './ai-assistant.js';

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
const CLAUDE_AGENTS_DIR = path.join(HOME_DIR, '.claude', 'agents');
const CLAUDE_PROFILES_PATH = path.join(HOME_DIR, '.claude', 'env-profiles.json');
const CLAUDE_SETTINGS_PATH = path.join(HOME_DIR, '.claude', 'settings.json');
const PLUGINS_DIR = path.join(HOME_DIR, '.claude', 'plugins');
const MARKETPLACES_DIR = path.join(PLUGINS_DIR, 'marketplaces');
const CACHE_DIR = path.join(PLUGINS_DIR, 'cache');
const KNOWN_MARKETPLACES_PATH = path.join(PLUGINS_DIR, 'known_marketplaces.json');
const INSTALLED_PLUGINS_PATH = path.join(PLUGINS_DIR, 'installed_plugins.json');
const PORT = 3001;
const WORKBENCH_PROJECTS_PATH = path.join(HOME_DIR, '.claude', 'workbench-projects.json');

// ============================================================
// Git Helpers
// ============================================================

let gitAvailableCache: boolean | null = null;

async function checkGitAvailable(): Promise<boolean> {
  if (gitAvailableCache !== null) return gitAvailableCache;
  try {
    await new Promise<void>((resolve, reject) => {
      const child = exec('git --version', (err) => (err ? reject(err) : resolve()));
      child.on('error', reject);
    });
    gitAvailableCache = true;
  } catch {
    gitAvailableCache = false;
  }
  return gitAvailableCache;
}

async function gitCloneShallow(url: string, destDir: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('git', ['clone', '--depth', '1', url, destDir], {
        stdio: 'pipe',
        signal: controller.signal,
      });
      child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`git clone exited with code ${code}`))));
      child.on('error', reject);
    });
  } catch (err) {
    // Clean up partial clone on failure
    try { await fs.rm(destDir, { recursive: true, force: true }); } catch { /* ignore */ }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function gitPull(repoDir: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn('git', ['-C', repoDir, 'pull'], {
        stdio: 'pipe',
        signal: controller.signal,
      });
      child.on('close', async (code) => {
        if (code === 0) { resolve(); return; }
        // On conflict, fetch first then hard reset to FETCH_HEAD and retry
        try {
          await new Promise<void>((res2, rej2) => {
            const fetch = spawn('git', ['-C', repoDir, 'fetch', 'origin'], { stdio: 'pipe' });
            fetch.on('close', (c) => (c === 0 ? res2() : rej2(new Error(`git fetch exited ${c}`))));
            fetch.on('error', rej2);
          });
          await new Promise<void>((res2, rej2) => {
            const reset = spawn('git', ['-C', repoDir, 'reset', '--hard', 'FETCH_HEAD'], { stdio: 'pipe' });
            reset.on('close', (c) => (c === 0 ? res2() : rej2(new Error(`git reset exited ${c}`))));
            reset.on('error', rej2);
          });
          await new Promise<void>((res2, rej2) => {
            const pull2 = spawn('git', ['-C', repoDir, 'pull'], { stdio: 'pipe' });
            pull2.on('close', (c) => (c === 0 ? res2() : rej2(new Error(`git pull retry exited ${c}`))));
            pull2.on('error', rej2);
          });
          resolve();
        } catch (retryErr) {
          reject(retryErr);
        }
      });
      child.on('error', reject);
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function getGitCommitSha(repoDir: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    exec(`git -C "${repoDir}" rev-parse --short HEAD`, (err, stdout) => {
      if (err) { reject(err); return; }
      resolve(stdout.trim());
    });
  });
}

function normalizeGitUrl(input: string): string {
  // If it matches owner/repo pattern (no protocol, no dots before slash), convert to GitHub URL
  if (/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+$/.test(input)) {
    const repo = input.endsWith('.git') ? input : `${input}.git`;
    return `https://github.com/${repo}`;
  }
  return input;
}

function extractMarketplaceName(url: string): string {
  // Get last path segment, remove .git suffix
  const normalized = normalizeGitUrl(url);
  const segments = normalized.replace(/\.git$/, '').split('/');
  return segments[segments.length - 1] || url;
}

// ============================================================
// Marketplace JSON Managers
// ============================================================

async function ensurePluginsDirs(): Promise<void> {
  await fs.mkdir(PLUGINS_DIR, { recursive: true });
  await fs.mkdir(MARKETPLACES_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

async function readKnownMarketplaces(): Promise<Record<string, { source: { source: string; repo: string }; installLocation: string; lastUpdated: string }>> {
  try {
    await fs.mkdir(PLUGINS_DIR, { recursive: true });
    const raw = await fs.readFile(KNOWN_MARKETPLACES_PATH, 'utf-8');
    return JSON.parse(raw) as Record<string, { source: { source: string; repo: string }; installLocation: string; lastUpdated: string }>;
  } catch {
    return {};
  }
}

async function writeKnownMarketplaces(data: Record<string, unknown>): Promise<void> {
  await fs.mkdir(PLUGINS_DIR, { recursive: true });
  await fs.writeFile(KNOWN_MARKETPLACES_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function readInstalledPlugins(): Promise<{ version: number; plugins: Record<string, unknown[]> }> {
  try {
    const raw = await fs.readFile(INSTALLED_PLUGINS_PATH, 'utf-8');
    return JSON.parse(raw) as { version: number; plugins: Record<string, unknown[]> };
  } catch {
    return { version: 2, plugins: {} };
  }
}

async function writeInstalledPlugins(data: { version: number; plugins: Record<string, unknown[]> }): Promise<void> {
  await fs.mkdir(PLUGINS_DIR, { recursive: true });
  await fs.writeFile(INSTALLED_PLUGINS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

async function readMarketplaceManifest(marketplaceName: string): Promise<{ name: string; description?: string; version?: string; owner?: { name: string; email: string }; metadata?: { description: string; version: string }; plugins: Array<{ name: string; description?: string; source: string; strict?: boolean; skills?: string[]; version?: string; category?: string }> } | null> {
  try {
    const manifestPath = path.join(MARKETPLACES_DIR, marketplaceName, '.claude-plugin', 'marketplace.json');
    const raw = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(raw) as { name: string; plugins: Array<{ name: string; source: string; skills?: string[] }> };
    // Validate: no path traversal in skills
    for (const plugin of manifest.plugins || []) {
      for (const skill of plugin.skills || []) {
        if (skill.includes('..') || path.isAbsolute(skill)) {
          throw new Error(`Path traversal detected in skill path: ${skill}`);
        }
      }
      if (plugin.source && typeof plugin.source === 'string' && (plugin.source.includes('..') || (path.isAbsolute(plugin.source) && !plugin.source.startsWith('./')))) {
        // Allow "./" relative paths
      }
    }
    return manifest as ReturnType<typeof readMarketplaceManifest> extends Promise<infer T> ? Exclude<T, null> : never;
  } catch {
    return null;
  }
}
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
app.use(bodyParser.json({ limit: '50mb' }));

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

function validateAgentName(name: string): boolean {
  return /^[a-z0-9-]{1,64}$/.test(name);
}

// ============================================================
// Project-level config helper
// ============================================================

function resolveConfigPaths(projectPath?: string) {
  if (!projectPath) {
    return {
      commandsDir: CLAUDE_COMMANDS_DIR,
      skillsDir: CLAUDE_SKILLS_DIR,
      agentsDir: CLAUDE_AGENTS_DIR,
      mcpConfigPath: CLAUDE_JSON_PATH,
    };
  }
  // Validate path safety
  const resolved = path.resolve(projectPath);
  if (resolved.includes('..')) throw new Error('Invalid project path');
  return {
    commandsDir: path.join(resolved, '.claude', 'commands'),
    skillsDir: path.join(resolved, '.claude', 'skills'),
    agentsDir: path.join(resolved, '.claude', 'agents'),
    mcpConfigPath: path.join(resolved, '.mcp.json'),
  };
}

// ============================================================
// Routes: Claude config
// ============================================================

app.get('/api/claude-config', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const { mcpConfigPath } = resolveConfigPaths(projectPath);
    await ensureFileExists(mcpConfigPath, '{}');
    const content = await fs.readFile(mcpConfigPath, 'utf-8');
    res.json(JSON.parse(content || '{}') as ClaudeConfig);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/claude-config', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const { mcpConfigPath } = resolveConfigPaths(projectPath);
    const config = req.body as ClaudeConfig;
    await fs.mkdir(path.dirname(mcpConfigPath), { recursive: true });
    await fs.writeFile(mcpConfigPath, JSON.stringify(config, null, 2));
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
  }
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
// Routes: Projects
// ============================================================

app.get('/api/projects', async (_req: Request, res: Response) => {
  try {
    let projects: Array<{ path: string; name: string; addedAt: string }> = [];
    try {
      const raw = await fs.readFile(WORKBENCH_PROJECTS_PATH, 'utf-8');
      const data = JSON.parse(raw) as { projects: typeof projects };
      projects = data.projects ?? [];
    } catch {
      // File doesn't exist yet
    }
    res.json({ projects });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/projects', async (req: Request, res: Response) => {
  try {
    const { path: projectPath } = req.body as { path: string };
    if (!projectPath) return res.status(400).json({ error: 'path is required' });

    const resolved = path.resolve(projectPath);
    if (resolved.includes('..')) return res.status(400).json({ error: 'Invalid project path' });

    try {
      const stats = await fs.stat(resolved);
      if (!stats.isDirectory()) return res.status(400).json({ error: 'Path is not a directory' });
    } catch {
      return res.status(400).json({ error: `Directory not found: ${resolved}` });
    }

    let projects: Array<{ path: string; name: string; addedAt: string }> = [];
    try {
      const raw = await fs.readFile(WORKBENCH_PROJECTS_PATH, 'utf-8');
      const data = JSON.parse(raw) as { projects: typeof projects };
      projects = data.projects ?? [];
    } catch {
      // File doesn't exist yet
    }

    if (projects.some((p) => p.path === resolved)) {
      return res.status(409).json({ error: 'Project already exists' });
    }

    const name = path.basename(resolved);
    const newProject = { path: resolved, name, addedAt: new Date().toISOString() };
    projects.push(newProject);

    await fs.mkdir(path.dirname(WORKBENCH_PROJECTS_PATH), { recursive: true });
    await fs.writeFile(WORKBENCH_PROJECTS_PATH, JSON.stringify({ projects }, null, 2), 'utf-8');
    res.json({ success: true, project: newProject });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/projects/:encodedPath', async (req: Request, res: Response) => {
  try {
    const decodedPath = Buffer.from(req.params.encodedPath, 'base64').toString('utf-8');
    let projects: Array<{ path: string; name: string; addedAt: string }> = [];
    try {
      const raw = await fs.readFile(WORKBENCH_PROJECTS_PATH, 'utf-8');
      const data = JSON.parse(raw) as { projects: typeof projects };
      projects = data.projects ?? [];
    } catch {
      return res.status(404).json({ error: 'No projects found' });
    }

    const idx = projects.findIndex((p) => p.path === decodedPath);
    if (idx === -1) return res.status(404).json({ error: 'Project not found' });

    projects.splice(idx, 1);
    await fs.writeFile(WORKBENCH_PROJECTS_PATH, JSON.stringify({ projects }, null, 2), 'utf-8');
    res.json({ success: true, message: 'Project removed' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/projects/validate', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.path as string;
    if (!projectPath) return res.status(400).json({ error: 'path query parameter is required' });

    const resolved = path.resolve(projectPath);
    let exists = false;
    let hasClaudeDir = false;

    try {
      const stats = await fs.stat(resolved);
      exists = stats.isDirectory();
    } catch {
      // Directory doesn't exist
    }

    if (exists) {
      try {
        await fs.access(path.join(resolved, '.claude'));
        hasClaudeDir = true;
      } catch {
        // No .claude directory
      }
    }

    res.json({ exists, hasClaudeDir, resolvedPath: resolved });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================
// Routes: Commands
// ============================================================

app.get('/api/commands', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const { commandsDir } = resolveConfigPaths(projectPath);
    await fs.mkdir(commandsDir, { recursive: true });
    const files = await fs.readdir(commandsDir);
    const commands = await Promise.all(
      files.map(async (file) => ({
        name: file,
        content: await fs.readFile(path.join(commandsDir, file), 'utf-8'),
      }))
    );
    res.json(commands);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/commands', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const { commandsDir } = resolveConfigPaths(projectPath);
    const { name, content } = req.body as { name: string; content: string };
    await fs.mkdir(commandsDir, { recursive: true });
    await fs.writeFile(path.join(commandsDir, name), content);
    res.json({ success: true, message: 'Command saved successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/commands/:name', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const { commandsDir } = resolveConfigPaths(projectPath);
    const { name } = req.params;
    await fs.unlink(path.join(commandsDir, name));
    res.json({ success: true, message: 'Command deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================
// Routes: Skills
// ============================================================

app.get('/api/skills', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const { skillsDir } = resolveConfigPaths(projectPath);
    await fs.mkdir(skillsDir, { recursive: true });
    const dirs = await fs.readdir(skillsDir, { withFileTypes: true });
    const skills = (
      await Promise.all(
        dirs
          .filter((d) => d.isDirectory())
          .map(async (dir) => {
            try {
              const skillFile = path.join(skillsDir, dir.name, 'SKILL.md');
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
    const projectPath = req.query.projectPath as string | undefined;
    const { skillsDir } = resolveConfigPaths(projectPath);
    const { name, content } = req.body as { name: string; content: string };
    if (!name || !content)
      return res.status(400).json({ error: 'Name and content are required' });
    if (!validateSkillName(name))
      return res.status(400).json({
        error: 'Invalid skill name. Must use lowercase letters, numbers, and hyphens only (max 64 characters)',
      });

    const skillPath = path.join(skillsDir, name);
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(path.join(skillPath, 'SKILL.md'), content, 'utf-8');
    res.json({ success: true, message: 'Skill saved successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/skills/:name', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const { skillsDir } = resolveConfigPaths(projectPath);
    const { name } = req.params;
    await fs.rm(path.join(skillsDir, name), {
      recursive: true,
      force: true,
    });
    res.json({ success: true, message: 'Skill deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================
// Routes: Agents
// ============================================================

app.get('/api/agents', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const { agentsDir } = resolveConfigPaths(projectPath);
    await fs.mkdir(agentsDir, { recursive: true });
    const files = await fs.readdir(agentsDir);
    const agents = (
      await Promise.all(
        files
          .filter((f) => f.endsWith('.md'))
          .map(async (file) => {
            try {
              const content = await fs.readFile(path.join(agentsDir, file), 'utf-8');
              const { frontmatter } = parseFrontmatter(content);
              return {
                name: file.replace(/\.md$/, ''),
                content,
                description: frontmatter.description ?? '',
                model: frontmatter.model ?? '',
              };
            } catch {
              return null;
            }
          })
      )
    ).filter(Boolean);
    res.json(agents);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/agents', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const { agentsDir } = resolveConfigPaths(projectPath);
    const { name, content } = req.body as { name: string; content: string };
    if (!name || !content)
      return res.status(400).json({ error: 'Name and content are required' });
    if (!validateAgentName(name))
      return res.status(400).json({
        error: 'Invalid agent name. Must use lowercase letters, numbers, and hyphens only (max 64 characters)',
      });

    await fs.mkdir(agentsDir, { recursive: true });
    await fs.writeFile(path.join(agentsDir, `${name}.md`), content, 'utf-8');
    res.json({ success: true, message: 'Agent saved successfully' });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/agents/:name', async (req: Request, res: Response) => {
  try {
    const projectPath = req.query.projectPath as string | undefined;
    const { agentsDir } = resolveConfigPaths(projectPath);
    const { name } = req.params;
    await fs.unlink(path.join(agentsDir, `${name}.md`));
    res.json({ success: true, message: 'Agent deleted successfully' });
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
// Routes: Marketplace
// ============================================================

app.get('/api/plugins/marketplaces', async (_req: Request, res: Response) => {
  try {
    const marketplaces = await readKnownMarketplaces();
    const installedPlugins = await readInstalledPlugins();
    const result = await Promise.all(
      Object.entries(marketplaces).map(async ([name, info]) => {
        const manifest = await readMarketplaceManifest(name);
        return {
          name,
          source: info.source,
          lastUpdated: info.lastUpdated,
          manifest: manifest ?? { name, plugins: [], description: 'Manifest unavailable' },
          installedPlugins: installedPlugins.plugins,
        };
      })
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/plugins/marketplaces', async (req: Request, res: Response) => {
  try {
    const { url } = req.body as { url: string };
    if (!url) return res.status(400).json({ error: 'url is required' });

    const gitAvailable = await checkGitAvailable();
    if (!gitAvailable) {
      return res.status(400).json({ error: 'Git is not installed. Please install git to use marketplaces.' });
    }

    const normalizedUrl = normalizeGitUrl(url);
    const name = extractMarketplaceName(url);

    const existing = await readKnownMarketplaces();
    if (existing[name]) {
      return res.status(409).json({ error: `Marketplace '${name}' is already added.` });
    }

    await ensurePluginsDirs();
    const destDir = path.join(MARKETPLACES_DIR, name);

    await gitCloneShallow(normalizedUrl, destDir);

    const manifest = await readMarketplaceManifest(name);
    if (!manifest) {
      try { await fs.rm(destDir, { recursive: true, force: true }); } catch { /* ignore */ }
      return res.status(400).json({ error: 'Repository does not contain a valid .claude-plugin/marketplace.json file.' });
    }

    const sha = await getGitCommitSha(destDir);
    const updated = {
      ...existing,
      [name]: {
        source: { source: 'github', repo: normalizedUrl.replace(/https:\/\/github\.com\//, '').replace(/\.git$/, '') },
        installLocation: destDir,
        lastUpdated: new Date().toISOString(),
        sha,
      },
    };
    await writeKnownMarketplaces(updated);

    res.json({ name, source: updated[name].source, lastUpdated: updated[name].lastUpdated, manifest });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/plugins/marketplaces/:name/update', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const marketplaces = await readKnownMarketplaces();
    if (!marketplaces[name]) {
      return res.status(404).json({ error: `Marketplace '${name}' not found.` });
    }

    const repoDir = path.join(MARKETPLACES_DIR, name);
    await gitPull(repoDir);

    const updated = {
      ...marketplaces,
      [name]: { ...marketplaces[name], lastUpdated: new Date().toISOString() },
    };
    await writeKnownMarketplaces(updated);

    const manifest = await readMarketplaceManifest(name);
    res.json({ name, source: updated[name].source, lastUpdated: updated[name].lastUpdated, manifest });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.delete('/api/plugins/marketplaces/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const marketplaces = await readKnownMarketplaces();
    if (!marketplaces[name]) {
      return res.status(404).json({ error: `Marketplace '${name}' not found.` });
    }

    await fs.rm(path.join(MARKETPLACES_DIR, name), { recursive: true, force: true });

    const updated = { ...marketplaces };
    delete updated[name];
    await writeKnownMarketplaces(updated);

    res.json({ success: true, message: `Marketplace '${name}' removed.` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/plugins/install', async (req: Request, res: Response) => {
  try {
    const { marketplace, plugin } = req.body as { marketplace: string; plugin: string };
    if (!marketplace || !plugin) {
      return res.status(400).json({ error: 'marketplace and plugin are required' });
    }

    const marketplaces = await readKnownMarketplaces();
    if (!marketplaces[marketplace]) {
      return res.status(404).json({ error: `Marketplace '${marketplace}' not found.` });
    }

    const manifest = await readMarketplaceManifest(marketplace);
    if (!manifest) {
      return res.status(404).json({ error: `Cannot read manifest for marketplace '${marketplace}'.` });
    }

    const pluginEntry = manifest.plugins.find((p) => p.name === plugin);
    if (!pluginEntry) {
      return res.status(404).json({ error: `Plugin '${plugin}' not found in marketplace '${marketplace}'.` });
    }

    const marketplaceDir = path.join(MARKETPLACES_DIR, marketplace);
    const sha = await getGitCommitSha(marketplaceDir);

    const installedData = await readInstalledPlugins();
    const key = `${plugin}@${marketplace}`;
    const existing = installedData.plugins[key] || [];
    if (existing.some((e) => (e as { gitCommitSha: string }).gitCommitSha === sha)) {
      return res.json({ success: true, message: 'Plugin already installed at this version.', alreadyInstalled: true });
    }

    const cacheDir = path.join(CACHE_DIR, marketplace, plugin, sha);
    await fs.mkdir(cacheDir, { recursive: true });

    if (pluginEntry.skills && pluginEntry.skills.length > 0) {
      for (const skillPath of pluginEntry.skills) {
        const relativePath = skillPath.replace(/^\.\//, '');
        const srcDir = path.join(marketplaceDir, relativePath);
        const skillName = path.basename(relativePath);
        const destDir = path.join(cacheDir, skillName);
        try {
          await fs.cp(srcDir, destDir, { recursive: true });
        } catch (copyErr) {
          console.error(`Failed to copy skill ${skillPath}:`, copyErr);
        }
      }
    } else if (pluginEntry.source && typeof pluginEntry.source === 'string') {
      const relativeSrc = pluginEntry.source.replace(/^\.\//,  '');
      const srcDir = path.join(marketplaceDir, relativeSrc);
      try {
        await fs.cp(srcDir, cacheDir, { recursive: true });
      } catch (copyErr) {
        console.error(`Failed to copy plugin source ${pluginEntry.source}:`, copyErr);
      }
    } else if (pluginEntry.source && typeof pluginEntry.source === 'object') {
      const srcObj = pluginEntry.source as { source?: string; url?: string };
      if (srcObj.url) {
        try {
          const { execSync } = await import('child_process');
          execSync(`git clone --depth 1 ${srcObj.url} "${cacheDir}"`, { timeout: 60000 });
        } catch (cloneErr) {
          return res.status(500).json({ error: `Failed to clone plugin from ${srcObj.url}` });
        }
      }
    }

    const now = new Date().toISOString();
    const installRecord = {
      scope: 'user',
      installPath: cacheDir,
      version: sha,
      installedAt: now,
      lastUpdated: now,
      gitCommitSha: sha,
    };
    const updatedInstalled = {
      ...installedData,
      plugins: {
        ...installedData.plugins,
        [key]: [...existing, installRecord],
      },
    };
    await writeInstalledPlugins(updatedInstalled);

    // Add to enabledPlugins in settings.json so the CLI picks it up
    try {
      const settingsRaw = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
      const settings = JSON.parse(settingsRaw) as Record<string, unknown>;
      const enabledPlugins = (settings.enabledPlugins ?? {}) as Record<string, boolean>;
      enabledPlugins[key] = true;
      settings.enabledPlugins = enabledPlugins;
      await fs.writeFile(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 4), 'utf-8');
    } catch { /* settings.json missing or malformed — ignore */ }

    res.json({ success: true, installPath: cacheDir, sha, plugin, marketplace });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.post('/api/plugins/uninstall', async (req: Request, res: Response) => {
  try {
    const { marketplace, plugin } = req.body as { marketplace: string; plugin: string };
    if (!marketplace || !plugin) {
      return res.status(400).json({ error: 'marketplace and plugin are required' });
    }

    const key = `${plugin}@${marketplace}`;
    const installedData = await readInstalledPlugins();
    const records = installedData.plugins[key];

    if (!records || records.length === 0) {
      return res.status(404).json({ error: `Plugin '${plugin}' from '${marketplace}' is not installed.` });
    }

    for (const record of records) {
      try {
        await fs.rm((record as { installPath: string }).installPath, { recursive: true, force: true });
      } catch { /* ignore */ }
    }

    const pluginCacheDir = path.join(CACHE_DIR, marketplace, plugin);
    const marketplaceCacheDir = path.join(CACHE_DIR, marketplace);
    try {
      await fs.rm(pluginCacheDir, { recursive: true, force: true });
    } catch { /* ignore */ }
    try {
      const marketplaceContents = await fs.readdir(marketplaceCacheDir);
      if (marketplaceContents.length === 0) await fs.rm(marketplaceCacheDir, { recursive: true, force: true });
    } catch { /* ignore */ }

    const updatedPlugins = { ...installedData.plugins };
    delete updatedPlugins[key];
    await writeInstalledPlugins({ ...installedData, plugins: updatedPlugins });

    // Also remove from enabledPlugins in settings.json (the CLI's authoritative source).
    // Use regex line-deletion to avoid touching any other content in the file.
    try {
      const settingsRaw = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8');
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linePattern = new RegExp(`^[ \\t]*"${escapedKey}"[ \\t]*:[ \\t]*(true|false),?[ \\t]*(\\r?\\n|$)`, 'm');
      let updated = settingsRaw.replace(linePattern, '');
      // Fix trailing comma on the new last entry inside enabledPlugins (makes JSON invalid)
      updated = updated.replace(/(true|false),(?=\s*\n[ \t]*})/g, '$1');
      if (updated !== settingsRaw) {
        await fs.writeFile(CLAUDE_SETTINGS_PATH, updated, 'utf-8');
      }
    } catch { /* settings.json missing or unreadable — ignore */ }

    res.json({ success: true, message: `Plugin '${plugin}' uninstalled.` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/plugins/installed-details', async (_req: Request, res: Response) => {
  try {
    const installedData = await readInstalledPlugins();
    const results: Array<{
      key: string;
      pluginName: string;
      marketplaceName: string;
      installPath: string;
      version: string;
      commands: Array<{ name: string; filename: string }>;
      skills: Array<{ name: string; filename: string }>;
      agents: Array<{ name: string; filename: string; model?: string }>;
    }> = [];

    for (const [key, records] of Object.entries(installedData.plugins)) {
      if (!records || records.length === 0) continue;

      const atIndex = key.lastIndexOf('@');
      if (atIndex <= 0) continue;
      const pluginName = key.substring(0, atIndex);
      const marketplaceName = key.substring(atIndex + 1);

      const latest = records[records.length - 1] as { installPath: string; version: string };
      const installPath = latest.installPath;
      const version = latest.version || '';

      try {
        await fs.access(installPath);
      } catch {
        continue;
      }

      const commands: Array<{ name: string; filename: string }> = [];
      const skills: Array<{ name: string; filename: string }> = [];
      const agents: Array<{ name: string; filename: string; model?: string }> = [];

      // Scan commands/
      try {
        const commandsDir = path.join(installPath, 'commands');
        const commandEntries = await fs.readdir(commandsDir);
        for (const entry of commandEntries) {
          if (entry.endsWith('.md')) {
            commands.push({ name: entry.replace(/\.md$/, ''), filename: entry });
          }
        }
      } catch { /* directory doesn't exist */ }

      // Scan skills/
      try {
        const skillsDir = path.join(installPath, 'skills');
        const skillEntries = await fs.readdir(skillsDir);
        for (const entry of skillEntries) {
          const entryPath = path.join(skillsDir, entry);
          const stat = await fs.stat(entryPath);
          if (stat.isDirectory()) {
            try {
              await fs.access(path.join(entryPath, 'SKILL.md'));
              skills.push({ name: entry, filename: 'SKILL.md' });
            } catch { /* no SKILL.md in this subdir */ }
          }
        }
      } catch { /* directory doesn't exist */ }

      // Scan agents/
      try {
        const agentsDir = path.join(installPath, 'agents');
        const agentEntries = await fs.readdir(agentsDir);
        for (const entry of agentEntries) {
          if (entry.endsWith('.md')) {
            let model = '';
            try {
              const agentContent = await fs.readFile(path.join(agentsDir, entry), 'utf-8');
              const { frontmatter } = parseFrontmatter(agentContent);
              model = frontmatter.model ?? '';
            } catch { /* ignore read errors */ }
            agents.push({ name: entry.replace(/\.md$/, ''), filename: entry, model });
          }
        }
      } catch { /* directory doesn't exist */ }

      results.push({ key, pluginName, marketplaceName, installPath, version, commands, skills, agents });
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get details (commands/skills/agents) for a marketplace plugin by scanning its source directory
app.get('/api/plugins/marketplace-plugin-details', async (req: Request, res: Response) => {
  try {
    const marketplace = req.query.marketplace as string;
    const plugin = req.query.plugin as string;
    if (!marketplace || !plugin) {
      res.status(400).json({ error: 'marketplace and plugin query params are required' });
      return;
    }

    const manifest = await readMarketplaceManifest(marketplace);
    if (!manifest) {
      res.status(404).json({ error: `Marketplace "${marketplace}" manifest not found` });
      return;
    }

    const pluginEntry = manifest.plugins.find((p) => p.name === plugin);
    if (!pluginEntry) {
      res.status(404).json({ error: `Plugin "${plugin}" not found in marketplace "${marketplace}"` });
      return;
    }

    const marketplaceDir = path.join(MARKETPLACES_DIR, marketplace);
    const commands: Array<{ name: string; filename: string }> = [];
    const skills: Array<{ name: string; filename: string }> = [];
    const agents: Array<{ name: string; filename: string; model?: string }> = [];

    // Helper: scan a directory for standard commands/, skills/, agents/ layout + root-level skills
    async function scanPluginDirectory(dir: string): Promise<void> {
      // Scan commands/
      try {
        const commandsDir = path.join(dir, 'commands');
        const commandEntries = await fs.readdir(commandsDir);
        for (const entry of commandEntries) {
          if (entry.endsWith('.md')) {
            commands.push({ name: entry.replace(/\.md$/, ''), filename: entry });
          }
        }
      } catch { /* directory doesn't exist */ }

      // Scan skills/ subdirectory (standard layout)
      try {
        const skillsDir = path.join(dir, 'skills');
        const skillEntries = await fs.readdir(skillsDir);
        for (const entry of skillEntries) {
          const entryPath = path.join(skillsDir, entry);
          const stat = await fs.stat(entryPath);
          if (stat.isDirectory()) {
            try {
              await fs.access(path.join(entryPath, 'SKILL.md'));
              skills.push({ name: entry, filename: 'SKILL.md' });
            } catch { /* no SKILL.md */ }
          }
        }
      } catch { /* directory doesn't exist */ }

      // Scan root-level for skills: subdirectories containing SKILL.md directly in pluginDir
      try {
        const rootEntries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of rootEntries) {
          if (entry.isDirectory() && !['commands', 'skills', 'agents', '.git', 'node_modules'].includes(entry.name) && !entry.name.startsWith('.')) {
            try {
              await fs.access(path.join(dir, entry.name, 'SKILL.md'));
              if (!skills.some(s => s.name === entry.name)) {
                skills.push({ name: entry.name, filename: 'SKILL.md' });
              }
            } catch { /* no SKILL.md in this subdir */ }
          }
        }
      } catch { /* can't read directory */ }

      // Check if root itself has SKILL.md (the plugin directory is itself a skill)
      try {
        await fs.access(path.join(dir, 'SKILL.md'));
        const rootSkillName = path.basename(dir);
        if (!skills.some(s => s.name === rootSkillName)) {
          skills.push({ name: rootSkillName, filename: 'SKILL.md' });
        }
      } catch { /* no root SKILL.md */ }

      // Scan agents/
      try {
        const agentsDir = path.join(dir, 'agents');
        const agentEntries = await fs.readdir(agentsDir);
        for (const entry of agentEntries) {
          if (entry.endsWith('.md')) {
            let model = '';
            try {
              const agentContent = await fs.readFile(path.join(agentsDir, entry), 'utf-8');
              const { frontmatter } = parseFrontmatter(agentContent);
              model = frontmatter.model ?? '';
            } catch { /* ignore */ }
            agents.push({ name: entry.replace(/\.md$/, ''), filename: entry, model });
          }
        }
      } catch { /* directory doesn't exist */ }
    }

    // Case 1: Plugin has explicit skills array in manifest
    if (pluginEntry.skills && pluginEntry.skills.length > 0) {
      for (const skillPath of pluginEntry.skills) {
        const relativePath = skillPath.replace(/^\.\//,  '');
        const srcDir = path.join(marketplaceDir, relativePath);
        try {
          await fs.access(srcDir);
          // Check if this path is a skill itself (has SKILL.md)
          try {
            await fs.access(path.join(srcDir, 'SKILL.md'));
            const skillName = path.basename(relativePath);
            if (!skills.some(s => s.name === skillName)) {
              skills.push({ name: skillName, filename: 'SKILL.md' });
            }
          } catch { /* not a direct skill */ }
          // Also scan it as a plugin directory (may contain commands/skills/agents)
          await scanPluginDirectory(srcDir);
        } catch { /* source dir doesn't exist */ }
      }
    }
    // Case 2: String source — local directory within marketplace repo
    else if (typeof pluginEntry.source === 'string') {
      const pluginDir = path.join(marketplaceDir, pluginEntry.source);
      try {
        await fs.access(pluginDir);
        await scanPluginDirectory(pluginDir);
      } catch { /* source dir doesn't exist — continue to return manifest-level data */ }
    }
    // Case 3: Object source (e.g. { source: 'url', url: '...' }) — remote plugin
    // Cannot scan locally; we'll return manifest-level data only (lspServers, etc.)

    // Extract lspServers from manifest (works for all source types including remote)
    const lspServers: Array<{ name: string; command: string; extensions: string[] }> = [];
    const rawLsp = (pluginEntry as Record<string, unknown>).lspServers;
    if (rawLsp && typeof rawLsp === 'object') {
      for (const [name, cfg] of Object.entries(rawLsp as Record<string, Record<string, unknown>>)) {
        const command = (cfg.command as string) || '';
        const extMap = (cfg.extensionToLanguage || {}) as Record<string, string>;
        lspServers.push({ name, command, extensions: Object.keys(extMap) });
      }
    }

    // Determine source type for frontend messaging
    const sourceType: 'local' | 'remote' | 'skills-array' =
      (pluginEntry.skills && pluginEntry.skills.length > 0) ? 'skills-array'
      : (typeof pluginEntry.source === 'string') ? 'local'
      : 'remote';

    res.json({ commands, skills, agents, lspServers, sourceType });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/plugins/command-content', async (req: Request, res: Response) => {
  try {
    const { installPath, filename } = req.query as { installPath: string; filename: string };
    if (!installPath || !filename) {
      res.status(400).json({ error: 'installPath and filename are required' });
      return;
    }
    const filePath = path.join(installPath, 'commands', filename);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/plugins/agent-content', async (req: Request, res: Response) => {
  try {
    const { installPath, filename } = req.query as { installPath: string; filename: string };
    if (!installPath || !filename) {
      res.status(400).json({ error: 'installPath and filename are required' });
      return;
    }
    const filePath = path.join(installPath, 'agents', filename);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

app.get('/api/plugins/skill-content', async (req: Request, res: Response) => {
  try {
    const { installPath, skillName } = req.query as { installPath: string; skillName: string };
    if (!installPath || !skillName) {
      res.status(400).json({ error: 'installPath and skillName are required' });
      return;
    }
    const filePath = path.join(installPath, 'skills', skillName, 'SKILL.md');
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ content });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ============================================================
// Start
// ============================================================

registerAIAssistantRoutes(app);
const server = app.listen(PORT, () => {
  console.log(`🚀 Claude Config Service backend running on http://localhost:${PORT}`);
  console.log('📡 MCP Process Manager ready');
  if (isElectron) console.log(`📱 Frontend available at http://localhost:${PORT}`);
});

export default server;
