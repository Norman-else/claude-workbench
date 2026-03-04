import Anthropic from '@anthropic-ai/sdk';
import type { Express } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { readSettingsEnv, writeSettingsEnv, ensureFileExists, clearSettingsEnv } from './platform.js';

const HOME_DIR = os.homedir();
const CLAUDE_PROFILES_PATH = path.join(HOME_DIR, '.claude', 'env-profiles.json');
const CLAUDE_SETTINGS_PATH = path.join(HOME_DIR, '.claude', 'settings.json');
const CLAUDE_JSON_PATH = path.join(HOME_DIR, '.claude.json');
const CLAUDE_COMMANDS_DIR = path.join(HOME_DIR, '.claude', 'commands');
const CLAUDE_SKILLS_DIR = path.join(HOME_DIR, '.claude', 'skills');

export interface ActiveProfileCredentials {
  baseUrl: string;
  apiKey: string;
  authToken: string;
  models: {
    sonnet: string;
    opus: string;
    haiku: string;
    smallFast: string;
  };
}

export async function getActiveProfileCredentials(): Promise<ActiveProfileCredentials | null> {
  // Read settings.json for ANTHROPIC_PROFILE_ID, then read env-profiles.json
  // Return null if no active profile found
  try {
    const settingsRaw = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8').catch(() => '{}');
    const settings = JSON.parse(settingsRaw);
    const profileId = settings.env?.ANTHROPIC_PROFILE_ID;
    if (!profileId) return null;

    const profilesRaw = await fs.readFile(CLAUDE_PROFILES_PATH, 'utf-8').catch(() => '{"profiles":[],"activeProfileId":null}');
    const profilesData = JSON.parse(profilesRaw);
    const profile = profilesData.profiles?.find((p: { id: string }) => p.id === profileId);
    if (!profile) return null;

    return {
      baseUrl: profile.baseUrl || '',
      apiKey: profile.apiKey || '',
      authToken: profile.authToken || '',
      models: {
        sonnet: profile.sonnetModel || 'claude-sonnet-4-20250514',
        opus: profile.opusModel || 'claude-opus-4-20250514',
        haiku: profile.haikuModel || 'claude-haiku-3-5-20241022',
        smallFast: profile.smallFastModel || 'claude-haiku-3-5-20241022',
      },
    };
  } catch {
    return null;
  }
}

export function getAnthropicClient(creds: ActiveProfileCredentials): Anthropic {
  if (creds.apiKey) {
    return new Anthropic({
      apiKey: creds.apiKey,
      ...(creds.baseUrl ? { baseURL: creds.baseUrl } : {}),
    });
  }
  return new Anthropic({
    apiKey: creds.authToken,
    ...(creds.baseUrl ? { baseURL: creds.baseUrl } : {}),
    defaultHeaders: { 'Authorization': `Bearer ${creds.authToken}` },
  });
}

export function registerAIAssistantRoutes(_app: Express): void {
  // Routes will be implemented in subsequent tasks
}

// ============================================================
// Environment management types
// ============================================================

interface ProfilesData {
  profiles: EnvProfile[];
  activeProfileId: string | null;
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

// ============================================================
// Profile helpers
// ============================================================

export function redactProfile(profile: EnvProfile): EnvProfile {
  return {
    ...profile,
    apiKey: profile.apiKey ? '***' : '',
    authToken: profile.authToken ? '***' : '',
  };
}

async function readProfilesForAI(): Promise<ProfilesData> {
  try {
    await ensureFileExists(CLAUDE_PROFILES_PATH, JSON.stringify({ profiles: [], activeProfileId: null }, null, 2));
    const content = await fs.readFile(CLAUDE_PROFILES_PATH, 'utf-8');
    return JSON.parse(content) as ProfilesData;
  } catch {
    return { profiles: [], activeProfileId: null };
  }
}

async function writeProfilesForAI(data: ProfilesData): Promise<void> {
  const dir = path.dirname(CLAUDE_PROFILES_PATH);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(CLAUDE_PROFILES_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// ============================================================
// Tool definitions
// ============================================================

interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const toolDefinitions: AnthropicToolDefinition[] = [
  {
    name: 'list_environments',
    description: 'List all environment profiles. Returns all profiles with their activeProfileId. Credentials are redacted.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_environment',
    description: 'Get a single environment profile by ID. Credentials are redacted.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Profile ID' } },
      required: ['id'],
    },
  },
  {
    name: 'create_environment',
    description: 'Create a new environment profile.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Profile name' },
        baseUrl: { type: 'string', description: 'Base URL for Anthropic API' },
        apiKey: { type: 'string', description: 'API key' },
        authToken: { type: 'string', description: 'Auth token (alternative to API key)' },
        haikuModel: { type: 'string', description: 'Haiku model override' },
        opusModel: { type: 'string', description: 'Opus model override' },
        sonnetModel: { type: 'string', description: 'Sonnet model override' },
        smallFastModel: { type: 'string', description: 'Small/fast model override' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_environment',
    description: 'Update an existing environment profile by ID.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Profile ID to update' },
        name: { type: 'string' },
        baseUrl: { type: 'string' },
        apiKey: { type: 'string' },
        authToken: { type: 'string' },
        haikuModel: { type: 'string' },
        opusModel: { type: 'string' },
        sonnetModel: { type: 'string' },
        smallFastModel: { type: 'string' },
      },
      required: ['id'],
    },
  },
  {
    name: 'activate_environment',
    description: 'Activate an environment profile by ID. This sets it as the current active profile.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Profile ID to activate' } },
      required: ['id'],
    },
  },
  {
    name: 'deactivate_environment',
    description: 'Deactivate the currently active environment profile.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_mcp_server_statuses',
    description: 'Get the list of configured MCP servers from ~/.claude.json. Returns server names, commands, and whether env vars are configured.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_commands',
    description: 'List custom Claude CLI slash-commands stored in ~/.claude/commands/. Returns command names and their first line as description.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_skills',
    description: 'List agent skills stored in ~/.claude/skills/. Returns skill names and descriptions from SKILL.md files.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_app_config',
    description: 'Get a high-level overview of the app config: active profile name, MCP server count, command count, skill count. No credentials returned.',
    input_schema: { type: 'object', properties: {} },
  },
];

// ============================================================
// Tool handlers
// ============================================================

type ToolInput = Record<string, unknown>;

async function handleListEnvironments(_input: ToolInput): Promise<string> {
  const data = await readProfilesForAI();
  return JSON.stringify({
    profiles: data.profiles.map(redactProfile),
    activeProfileId: data.activeProfileId,
  });
}

async function handleGetEnvironment(input: ToolInput): Promise<string> {
  const data = await readProfilesForAI();
  const profile = data.profiles.find((p) => p.id === input.id);
  if (!profile) return JSON.stringify({ error: `Profile not found: ${input.id}` });
  return JSON.stringify(redactProfile(profile));
}

async function handleCreateEnvironment(input: ToolInput): Promise<string> {
  const data = await readProfilesForAI();
  const now = new Date().toISOString();
  const newProfile: EnvProfile = {
    id: crypto.randomUUID(),
    name: (input.name as string) || 'New Profile',
    baseUrl: (input.baseUrl as string) || '',
    apiKey: (input.apiKey as string) || '',
    authToken: (input.authToken as string) || '',
    haikuModel: (input.haikuModel as string) || '',
    opusModel: (input.opusModel as string) || '',
    sonnetModel: (input.sonnetModel as string) || '',
    smallFastModel: (input.smallFastModel as string) || '',
    createdAt: now,
  };
  data.profiles.push(newProfile);
  await writeProfilesForAI(data);
  return JSON.stringify({ success: true, profile: redactProfile(newProfile) });
}

async function handleUpdateEnvironment(input: ToolInput): Promise<string> {
  const data = await readProfilesForAI();
  const idx = data.profiles.findIndex((p) => p.id === input.id);
  if (idx === -1) return JSON.stringify({ error: `Profile not found: ${input.id}` });
  const profile = data.profiles[idx];
  const updated: EnvProfile = {
    ...profile,
    ...(input.name !== undefined && { name: input.name as string }),
    ...(input.baseUrl !== undefined && { baseUrl: input.baseUrl as string }),
    ...(input.apiKey !== undefined && { apiKey: input.apiKey as string }),
    ...(input.authToken !== undefined && { authToken: input.authToken as string }),
    ...(input.haikuModel !== undefined && { haikuModel: input.haikuModel as string }),
    ...(input.opusModel !== undefined && { opusModel: input.opusModel as string }),
    ...(input.sonnetModel !== undefined && { sonnetModel: input.sonnetModel as string }),
    ...(input.smallFastModel !== undefined && { smallFastModel: input.smallFastModel as string }),
    updatedAt: new Date().toISOString(),
  };
  data.profiles[idx] = updated;
  await writeProfilesForAI(data);
  return JSON.stringify({ success: true, profile: redactProfile(updated) });
}

async function handleActivateEnvironment(input: ToolInput): Promise<string> {
  const data = await readProfilesForAI();
  const profile = data.profiles.find((p) => p.id === input.id);
  if (!profile) return JSON.stringify({ error: `Profile not found: ${input.id}` });
  data.activeProfileId = profile.id;
  await writeProfilesForAI(data);
  // Write env vars to settings.json
  try {
    const vars: Record<string, string> = { ANTHROPIC_PROFILE_ID: profile.id };
    if (profile.baseUrl) vars.ANTHROPIC_BASE_URL = profile.baseUrl;
    if (profile.apiKey) vars.ANTHROPIC_API_KEY = profile.apiKey;
    if (profile.authToken) vars.ANTHROPIC_AUTH_TOKEN = profile.authToken;
    if (profile.haikuModel) vars.ANTHROPIC_DEFAULT_HAIKU_MODEL = profile.haikuModel;
    if (profile.opusModel) vars.ANTHROPIC_DEFAULT_OPUS_MODEL = profile.opusModel;
    if (profile.sonnetModel) vars.ANTHROPIC_DEFAULT_SONNET_MODEL = profile.sonnetModel;
    if (profile.smallFastModel) vars.ANTHROPIC_DEFAULT_SMALL_FAST_MODEL = profile.smallFastModel;
    await writeSettingsEnv(CLAUDE_SETTINGS_PATH, vars);
  } catch {
    // Ignore settings write errors
  }
  return JSON.stringify({ success: true, message: `Activated profile: ${profile.name}` });
}

async function handleDeactivateEnvironment(_input: ToolInput): Promise<string> {
  const data = await readProfilesForAI();
  data.activeProfileId = null;
  await writeProfilesForAI(data);
  try {
    await clearSettingsEnv(CLAUDE_SETTINGS_PATH);
  } catch {
    // Ignore
  }
  return JSON.stringify({ success: true, message: 'Deactivated active profile' });
}

async function handleGetMcpServerStatuses(_input: ToolInput): Promise<string> {
  try {
    const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8').catch(() => '{}');
    const config = JSON.parse(content) as { mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }> };
    const servers = config.mcpServers || {};
    const result = Object.entries(servers).map(([name, srv]) => ({
      name,
      command: srv.command,
      args: srv.args || [],
      hasEnvVars: !!(srv.env && Object.keys(srv.env).length > 0),
    }));
    return JSON.stringify({ servers: result, count: result.length });
  } catch {
    return JSON.stringify({ servers: [], count: 0 });
  }
}

async function handleListCommands(_input: ToolInput): Promise<string> {
  try {
    const entries = await fs.readdir(CLAUDE_COMMANDS_DIR).catch(() => [] as string[]);
    const commands = [];
    for (const entry of entries.filter((e) => e.endsWith('.md'))) {
      try {
        const content = await fs.readFile(path.join(CLAUDE_COMMANDS_DIR, entry), 'utf-8');
        const firstLine = content.split('\n').find((l) => l.trim()) || '';
        commands.push({ name: entry.replace(/\.md$/, ''), description: firstLine.replace(/^#+\s*/, '') });
      } catch {
        commands.push({ name: entry.replace(/\.md$/, ''), description: '' });
      }
    }
    return JSON.stringify({ commands, count: commands.length });
  } catch {
    return JSON.stringify({ commands: [], count: 0 });
  }
}

async function handleListSkills(_input: ToolInput): Promise<string> {
  try {
    const entries = await fs.readdir(CLAUDE_SKILLS_DIR, { withFileTypes: true }).catch(() => [] as import('fs').Dirent[]);
    const skills = [];
    for (const entry of entries.filter((e) => e.isDirectory())) {
      try {
        const skillMdPath = path.join(CLAUDE_SKILLS_DIR, entry.name, 'SKILL.md');
        const content = await fs.readFile(skillMdPath, 'utf-8');
        const lines = content.split('\n').slice(0, 5).filter((l) => l.trim());
        const description = lines.find((l) => !l.startsWith('#') && !l.startsWith('---')) || '';
        skills.push({ name: entry.name, description });
      } catch {
        skills.push({ name: entry.name, description: '' });
      }
    }
    return JSON.stringify({ skills, count: skills.length });
  } catch {
    return JSON.stringify({ skills: [], count: 0 });
  }
}

async function handleGetAppConfig(_input: ToolInput): Promise<string> {
  const creds = await getActiveProfileCredentials();
  const activeProfileName = creds ? 'Active profile found' : null;

  let mcpCount = 0;
  try {
    const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8').catch(() => '{}');
    const config = JSON.parse(content) as { mcpServers?: Record<string, unknown> };
    mcpCount = Object.keys(config.mcpServers || {}).length;
  } catch { /* ignore */ }

  let commandCount = 0;
  try {
    const entries = await fs.readdir(CLAUDE_COMMANDS_DIR).catch(() => [] as string[]);
    commandCount = entries.filter((e) => e.endsWith('.md')).length;
  } catch { /* ignore */ }

  let skillCount = 0;
  try {
    const entries = await fs.readdir(CLAUDE_SKILLS_DIR, { withFileTypes: true }).catch(() => [] as import('fs').Dirent[]);
    skillCount = entries.filter((e) => e.isDirectory()).length;
  } catch { /* ignore */ }

  return JSON.stringify({
    activeProfile: activeProfileName,
    mcpServers: mcpCount,
    commandCount,
    skillCount,
  });
}

export async function executeToolHandler(name: string, input: ToolInput): Promise<string> {
  switch (name) {
    case 'list_environments': return handleListEnvironments(input);
    case 'get_environment': return handleGetEnvironment(input);
    case 'create_environment': return handleCreateEnvironment(input);
    case 'update_environment': return handleUpdateEnvironment(input);
    case 'activate_environment': return handleActivateEnvironment(input);
    case 'deactivate_environment': return handleDeactivateEnvironment(input);
    case 'get_mcp_server_statuses': return handleGetMcpServerStatuses(input);
    case 'list_commands': return handleListCommands(input);
    case 'list_skills': return handleListSkills(input);
    case 'get_app_config': return handleGetAppConfig(input);
    default: return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
