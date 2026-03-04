import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { writeSettingsEnv, ensureFileExists, clearSettingsEnv } from './platform.js';
const HOME_DIR = os.homedir();
const CLAUDE_PROFILES_PATH = path.join(HOME_DIR, '.claude', 'env-profiles.json');
const CLAUDE_SETTINGS_PATH = path.join(HOME_DIR, '.claude', 'settings.json');
const CLAUDE_JSON_PATH = path.join(HOME_DIR, '.claude.json');
const CLAUDE_COMMANDS_DIR = path.join(HOME_DIR, '.claude', 'commands');
const CLAUDE_SKILLS_DIR = path.join(HOME_DIR, '.claude', 'skills');
const AI_HISTORY_PATH = path.join(HOME_DIR, '.claude', 'ai-assistant-history.json');
export async function getActiveProfileCredentials() {
    // Read settings.json for ANTHROPIC_PROFILE_ID, then read env-profiles.json
    // Return null if no active profile found
    try {
        const settingsRaw = await fs.readFile(CLAUDE_SETTINGS_PATH, 'utf-8').catch(() => '{}');
        const settings = JSON.parse(settingsRaw);
        const profileId = settings.env?.ANTHROPIC_PROFILE_ID;
        if (!profileId)
            return null;
        const profilesRaw = await fs.readFile(CLAUDE_PROFILES_PATH, 'utf-8').catch(() => '{"profiles":[],"activeProfileId":null}');
        const profilesData = JSON.parse(profilesRaw);
        const profile = profilesData.profiles?.find((p) => p.id === profileId);
        if (!profile)
            return null;
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
    }
    catch {
        return null;
    }
}
export function getAnthropicClient(creds) {
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
export function registerAIAssistantRoutes(app) {
    // GET /api/ai/history
    app.get('/api/ai/history', async (_req, res) => {
        try {
            const history = await loadHistory();
            res.json(history);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // DELETE /api/ai/history
    app.delete('/api/ai/history', async (_req, res) => {
        try {
            await fs.unlink(AI_HISTORY_PATH).catch(() => { });
            res.json({ success: true });
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // GET /api/ai/models
    app.get('/api/ai/models', async (_req, res) => {
        try {
            const creds = await getActiveProfileCredentials();
            if (!creds) {
                res.status(400).json({ error: 'No active environment profile' });
                return;
            }
            const models = [
                { id: creds.models.sonnet, label: 'Sonnet', source: 'profile' },
                { id: creds.models.opus, label: 'Opus', source: 'profile' },
                { id: creds.models.haiku, label: 'Haiku', source: 'profile' },
                { id: creds.models.smallFast, label: 'Small/Fast', source: 'profile' },
            ];
            res.json(models);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    });
    // POST /api/ai/chat — SSE streaming with tool use loop
    app.post('/api/ai/chat', async (req, res) => {
        const { message, model } = req.body;
        // Validate active profile BEFORE opening SSE
        const creds = await getActiveProfileCredentials();
        if (!creds) {
            res.status(400).json({ error: 'No active environment profile' });
            return;
        }
        // Set SSE headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders();
        // AbortController for client disconnect
        const abortController = new AbortController();
        req.on('close', () => abortController.abort());
        const client = getAnthropicClient(creds);
        function sendSSE(event) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        try {
            // Load history and append user message
            const historyFile = await loadHistory();
            const userMsg = {
                id: crypto.randomUUID(),
                role: 'user',
                content: message,
                timestamp: new Date().toISOString(),
            };
            historyFile.messages.push(userMsg);
            // Build conversation for Anthropic API (convert history format)
            const conversationMessages = historyFile.messages.map((m) => ({
                role: m.role,
                content: m.content,
            }));
            const SYSTEM_PROMPT = `You are an AI assistant for Claude Workbench, a GUI management tool for Claude Code CLI.
You help users manage their Claude Code environment through natural language.

You have access to these tools:

Environment Profiles:
- list_environments: List all environment profiles
- get_environment: Get details of a specific profile by ID
- create_environment: Create a new profile
- update_environment: Update an existing profile
- activate_environment: Activate a profile
- deactivate_environment: Deactivate the current profile
- delete_environment: Delete a profile by ID
- reorder_environments: Reorder profiles (provide ordered list of IDs)

MCP Servers:
- get_mcp_server_statuses: Get MCP server config from ~/.claude.json
- get_mcp_runtime_status: Get live runtime status (running/stopped) of MCP servers
- start_mcp_server: Start an MCP server by name
- stop_mcp_server: Stop an MCP server by name
- restart_mcp_server: Restart an MCP server by name
- get_mcp_server_logs: Get logs for an MCP server

Commands:
- list_commands: List all custom commands
- get_command: Get full content of a specific command
- create_command: Create a new command
- update_command: Update an existing command's content
- delete_command: Delete a command

Skills:
- list_skills: List all agent skills
- get_skill: Get full SKILL.md content for a specific skill
- create_skill: Create a new skill
- delete_skill: Delete a skill

Marketplace:
- list_marketplaces: List registered marketplace sources
- list_installed_plugins: List all installed plugins
- install_plugin: Install a plugin from a marketplace
- uninstall_plugin: Uninstall a plugin

App Overview:
- get_app_config: Get high-level app config overview

Use tools to answer questions accurately. Be concise and helpful. Never expose API keys or auth tokens.`;
            let iteration = 0;
            const MAX_ITERATIONS = 10;
            // Track current assistant message for history
            let currentAssistantContent = '';
            const toolCallsForHistory = [];
            while (iteration < MAX_ITERATIONS) {
                iteration++;
                // Stream from Anthropic
                const stream = client.messages.stream({
                    model,
                    max_tokens: 4096,
                    system: SYSTEM_PROMPT,
                    messages: conversationMessages,
                    tools: toolDefinitions,
                }, { signal: abortController.signal });
                let hasToolUse = false;
                const toolUseBlocks = [];
                for await (const event of stream) {
                    if (abortController.signal.aborted)
                        break;
                    if (event.type === 'content_block_delta') {
                        if (event.delta.type === 'text_delta') {
                            currentAssistantContent += event.delta.text;
                            sendSSE({ type: 'text_delta', text: event.delta.text });
                        }
                    }
                }
                if (abortController.signal.aborted)
                    break;
                // Get the final message to check stop_reason and tool use blocks
                const finalMessage = await stream.finalMessage();
                // Collect tool_use blocks from content
                for (const block of finalMessage.content) {
                    if (block.type === 'tool_use') {
                        hasToolUse = true;
                        toolUseBlocks.push(block);
                    }
                }
                if (hasToolUse) {
                    // Add assistant turn to conversation
                    conversationMessages.push({
                        role: 'assistant',
                        content: finalMessage.content,
                    });
                    // Execute each tool and collect results
                    const toolResultContents = [];
                    for (const toolBlock of toolUseBlocks) {
                        const result = await executeToolHandler(toolBlock.name, toolBlock.input);
                        toolCallsForHistory.push({
                            name: toolBlock.name,
                            input: toolBlock.input,
                            result,
                        });
                        sendSSE({
                            type: 'tool_call',
                            tool: {
                                name: toolBlock.name,
                                input: toolBlock.input,
                                result,
                            },
                        });
                        toolResultContents.push({
                            type: 'tool_result',
                            tool_use_id: toolBlock.id,
                            content: result,
                        });
                    }
                    // Add tool results to conversation
                    conversationMessages.push({
                        role: 'user',
                        content: toolResultContents,
                    });
                    // Continue loop for next AI response
                    continue;
                }
                // No tool use — we're done
                break;
            }
            // Save updated history
            const assistantMsg = {
                id: crypto.randomUUID(),
                role: 'assistant',
                content: currentAssistantContent,
                timestamp: new Date().toISOString(),
                toolCalls: toolCallsForHistory.length > 0 ? toolCallsForHistory : undefined,
            };
            historyFile.messages.push(assistantMsg);
            historyFile.updatedAt = new Date().toISOString();
            await saveHistory(historyFile);
            sendSSE({ type: 'done' });
            res.end();
        }
        catch (err) {
            if (err.name === 'AbortError') {
                res.end();
                return;
            }
            sendSSE({ type: 'error', error: err.message });
            res.end();
        }
    });
}
// ============================================================
// Profile helpers
// ============================================================
export function redactProfile(profile) {
    return {
        ...profile,
        apiKey: profile.apiKey ? '***' : '',
        authToken: profile.authToken ? '***' : '',
    };
}
async function readProfilesForAI() {
    try {
        await ensureFileExists(CLAUDE_PROFILES_PATH, JSON.stringify({ profiles: [], activeProfileId: null }, null, 2));
        const content = await fs.readFile(CLAUDE_PROFILES_PATH, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return { profiles: [], activeProfileId: null };
    }
}
async function writeProfilesForAI(data) {
    const dir = path.dirname(CLAUDE_PROFILES_PATH);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(CLAUDE_PROFILES_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
export async function loadHistory() {
    try {
        const content = await fs.readFile(AI_HISTORY_PATH, 'utf-8');
        return JSON.parse(content);
    }
    catch {
        return { messages: [], updatedAt: '' };
    }
}
export async function saveHistory(history) {
    const trimmed = trimHistory(history);
    const redacted = redactHistoryCredentials(trimmed);
    const dir = path.dirname(AI_HISTORY_PATH);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(AI_HISTORY_PATH, JSON.stringify(redacted, null, 2), 'utf-8');
}
export function trimHistory(history) {
    const MAX_MESSAGES = 100;
    if (history.messages.length <= MAX_MESSAGES)
        return history;
    return {
        ...history,
        messages: history.messages.slice(history.messages.length - MAX_MESSAGES),
    };
}
function redactHistoryCredentials(history) {
    // Redact any potential credential leakage in tool call results
    return {
        ...history,
        messages: history.messages.map((msg) => ({
            ...msg,
            toolCalls: msg.toolCalls?.map((tc) => ({
                ...tc,
                result: tc.result
                    ? tc.result.replace(/"apiKey"\s*:\s*"[^"]*"/g, '"apiKey":"***"')
                        .replace(/"authToken"\s*:\s*"[^"]*"/g, '"authToken":"***"')
                    : tc.result,
            })),
        })),
    };
}
export const toolDefinitions = [
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
    {
        name: 'start_mcp_server',
        description: 'Start an MCP server by name.',
        input_schema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'MCP server name' } },
            required: ['name'],
        },
    },
    {
        name: 'stop_mcp_server',
        description: 'Stop a running MCP server by name.',
        input_schema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'MCP server name' } },
            required: ['name'],
        },
    },
    {
        name: 'restart_mcp_server',
        description: 'Restart an MCP server by name.',
        input_schema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'MCP server name' } },
            required: ['name'],
        },
    },
    {
        name: 'get_mcp_server_logs',
        description: 'Get recent logs for an MCP server.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'MCP server name' },
                lines: { type: 'number', description: 'Number of log lines to return' },
            },
            required: ['name'],
        },
    },
    {
        name: 'get_mcp_runtime_status',
        description: 'Get live runtime status of MCP servers. If name is provided, returns status for that server; otherwise returns all.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Optional MCP server name. Omit to get all.' },
            },
        },
    },
    {
        name: 'get_command',
        description: 'Get the full content of a specific custom command by name.',
        input_schema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Command name (without .md extension)' } },
            required: ['name'],
        },
    },
    {
        name: 'create_command',
        description: 'Create a new custom slash-command.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Command name' },
                content: { type: 'string', description: 'Command content (markdown)' },
            },
            required: ['name', 'content'],
        },
    },
    {
        name: 'update_command',
        description: 'Update the content of an existing custom command.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Command name' },
                content: { type: 'string', description: 'New command content (markdown)' },
            },
            required: ['name', 'content'],
        },
    },
    {
        name: 'delete_command',
        description: 'Delete a custom command by name.',
        input_schema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Command name to delete' } },
            required: ['name'],
        },
    },
    {
        name: 'get_skill',
        description: 'Get the full SKILL.md content for a specific skill.',
        input_schema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Skill name' } },
            required: ['name'],
        },
    },
    {
        name: 'create_skill',
        description: 'Create a new agent skill.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Skill name' },
                content: { type: 'string', description: 'SKILL.md content' },
            },
            required: ['name', 'content'],
        },
    },
    {
        name: 'delete_skill',
        description: 'Delete an agent skill by name.',
        input_schema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Skill name to delete' } },
            required: ['name'],
        },
    },
    {
        name: 'delete_environment',
        description: 'Delete an environment profile by ID.',
        input_schema: {
            type: 'object',
            properties: { id: { type: 'string', description: 'Profile ID to delete' } },
            required: ['id'],
        },
    },
    {
        name: 'reorder_environments',
        description: 'Reorder environment profiles by providing an ordered list of profile IDs.',
        input_schema: {
            type: 'object',
            properties: {
                ids: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Ordered list of profile IDs',
                },
            },
            required: ['ids'],
        },
    },
    {
        name: 'list_marketplaces',
        description: 'List registered marketplace sources for plugins.',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'list_installed_plugins',
        description: 'List all installed plugins with details.',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'install_plugin',
        description: 'Install a plugin from a marketplace.',
        input_schema: {
            type: 'object',
            properties: {
                marketplaceName: { type: 'string', description: 'Marketplace source name' },
                pluginName: { type: 'string', description: 'Plugin name to install' },
            },
            required: ['marketplaceName', 'pluginName'],
        },
    },
    {
        name: 'uninstall_plugin',
        description: 'Uninstall an installed plugin.',
        input_schema: {
            type: 'object',
            properties: {
                marketplaceName: { type: 'string', description: 'Marketplace source name' },
                pluginName: { type: 'string', description: 'Plugin name to uninstall' },
            },
            required: ['marketplaceName', 'pluginName'],
        },
    },
];
async function handleListEnvironments(_input) {
    const data = await readProfilesForAI();
    return JSON.stringify({
        profiles: data.profiles.map(redactProfile),
        activeProfileId: data.activeProfileId,
    });
}
async function handleGetEnvironment(input) {
    const data = await readProfilesForAI();
    const profile = data.profiles.find((p) => p.id === input.id);
    if (!profile)
        return JSON.stringify({ error: `Profile not found: ${input.id}` });
    return JSON.stringify(redactProfile(profile));
}
async function handleCreateEnvironment(input) {
    const data = await readProfilesForAI();
    const now = new Date().toISOString();
    const newProfile = {
        id: crypto.randomUUID(),
        name: input.name || 'New Profile',
        baseUrl: input.baseUrl || '',
        apiKey: input.apiKey || '',
        authToken: input.authToken || '',
        haikuModel: input.haikuModel || '',
        opusModel: input.opusModel || '',
        sonnetModel: input.sonnetModel || '',
        smallFastModel: input.smallFastModel || '',
        createdAt: now,
    };
    data.profiles.push(newProfile);
    await writeProfilesForAI(data);
    return JSON.stringify({ success: true, profile: redactProfile(newProfile) });
}
async function handleUpdateEnvironment(input) {
    const data = await readProfilesForAI();
    const idx = data.profiles.findIndex((p) => p.id === input.id);
    if (idx === -1)
        return JSON.stringify({ error: `Profile not found: ${input.id}` });
    const profile = data.profiles[idx];
    const updated = {
        ...profile,
        ...(input.name !== undefined && { name: input.name }),
        ...(input.baseUrl !== undefined && { baseUrl: input.baseUrl }),
        ...(input.apiKey !== undefined && { apiKey: input.apiKey }),
        ...(input.authToken !== undefined && { authToken: input.authToken }),
        ...(input.haikuModel !== undefined && { haikuModel: input.haikuModel }),
        ...(input.opusModel !== undefined && { opusModel: input.opusModel }),
        ...(input.sonnetModel !== undefined && { sonnetModel: input.sonnetModel }),
        ...(input.smallFastModel !== undefined && { smallFastModel: input.smallFastModel }),
        updatedAt: new Date().toISOString(),
    };
    data.profiles[idx] = updated;
    await writeProfilesForAI(data);
    return JSON.stringify({ success: true, profile: redactProfile(updated) });
}
async function handleActivateEnvironment(input) {
    const data = await readProfilesForAI();
    const profile = data.profiles.find((p) => p.id === input.id);
    if (!profile)
        return JSON.stringify({ error: `Profile not found: ${input.id}` });
    data.activeProfileId = profile.id;
    await writeProfilesForAI(data);
    // Write env vars to settings.json
    try {
        const vars = { ANTHROPIC_PROFILE_ID: profile.id };
        if (profile.baseUrl)
            vars.ANTHROPIC_BASE_URL = profile.baseUrl;
        if (profile.apiKey)
            vars.ANTHROPIC_API_KEY = profile.apiKey;
        if (profile.authToken)
            vars.ANTHROPIC_AUTH_TOKEN = profile.authToken;
        if (profile.haikuModel)
            vars.ANTHROPIC_DEFAULT_HAIKU_MODEL = profile.haikuModel;
        if (profile.opusModel)
            vars.ANTHROPIC_DEFAULT_OPUS_MODEL = profile.opusModel;
        if (profile.sonnetModel)
            vars.ANTHROPIC_DEFAULT_SONNET_MODEL = profile.sonnetModel;
        if (profile.smallFastModel)
            vars.ANTHROPIC_DEFAULT_SMALL_FAST_MODEL = profile.smallFastModel;
        await writeSettingsEnv(CLAUDE_SETTINGS_PATH, vars);
    }
    catch {
        // Ignore settings write errors
    }
    return JSON.stringify({ success: true, message: `Activated profile: ${profile.name}` });
}
async function handleDeactivateEnvironment(_input) {
    const data = await readProfilesForAI();
    data.activeProfileId = null;
    await writeProfilesForAI(data);
    try {
        await clearSettingsEnv(CLAUDE_SETTINGS_PATH);
    }
    catch {
        // Ignore
    }
    return JSON.stringify({ success: true, message: 'Deactivated active profile' });
}
async function handleGetMcpServerStatuses(_input) {
    try {
        const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8').catch(() => '{}');
        const config = JSON.parse(content);
        const servers = config.mcpServers || {};
        const result = Object.entries(servers).map(([name, srv]) => ({
            name,
            command: srv.command,
            args: srv.args || [],
            hasEnvVars: !!(srv.env && Object.keys(srv.env).length > 0),
        }));
        return JSON.stringify({ servers: result, count: result.length });
    }
    catch {
        return JSON.stringify({ servers: [], count: 0 });
    }
}
async function handleListCommands(_input) {
    try {
        const entries = await fs.readdir(CLAUDE_COMMANDS_DIR).catch(() => []);
        const commands = [];
        for (const entry of entries.filter((e) => e.endsWith('.md'))) {
            try {
                const content = await fs.readFile(path.join(CLAUDE_COMMANDS_DIR, entry), 'utf-8');
                const firstLine = content.split('\n').find((l) => l.trim()) || '';
                commands.push({ name: entry.replace(/\.md$/, ''), description: firstLine.replace(/^#+\s*/, '') });
            }
            catch {
                commands.push({ name: entry.replace(/\.md$/, ''), description: '' });
            }
        }
        return JSON.stringify({ commands, count: commands.length });
    }
    catch {
        return JSON.stringify({ commands: [], count: 0 });
    }
}
async function handleListSkills(_input) {
    try {
        const entries = await fs.readdir(CLAUDE_SKILLS_DIR, { withFileTypes: true }).catch(() => []);
        const skills = [];
        for (const entry of entries.filter((e) => e.isDirectory())) {
            try {
                const skillMdPath = path.join(CLAUDE_SKILLS_DIR, entry.name, 'SKILL.md');
                const content = await fs.readFile(skillMdPath, 'utf-8');
                const lines = content.split('\n').slice(0, 5).filter((l) => l.trim());
                const description = lines.find((l) => !l.startsWith('#') && !l.startsWith('---')) || '';
                skills.push({ name: entry.name, description });
            }
            catch {
                skills.push({ name: entry.name, description: '' });
            }
        }
        return JSON.stringify({ skills, count: skills.length });
    }
    catch {
        return JSON.stringify({ skills: [], count: 0 });
    }
}
async function handleGetAppConfig(_input) {
    const creds = await getActiveProfileCredentials();
    const activeProfileName = creds ? 'Active profile found' : null;
    let mcpCount = 0;
    try {
        const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8').catch(() => '{}');
        const config = JSON.parse(content);
        mcpCount = Object.keys(config.mcpServers || {}).length;
    }
    catch { /* ignore */ }
    let commandCount = 0;
    try {
        const entries = await fs.readdir(CLAUDE_COMMANDS_DIR).catch(() => []);
        commandCount = entries.filter((e) => e.endsWith('.md')).length;
    }
    catch { /* ignore */ }
    let skillCount = 0;
    try {
        const entries = await fs.readdir(CLAUDE_SKILLS_DIR, { withFileTypes: true }).catch(() => []);
        skillCount = entries.filter((e) => e.isDirectory()).length;
    }
    catch { /* ignore */ }
    return JSON.stringify({
        activeProfile: activeProfileName,
        mcpServers: mcpCount,
        commandCount,
        skillCount,
    });
}
async function handleStartMcpServer(input) {
    const name = input.name;
    try {
        const resp = await fetch(`http://localhost:3001/api/mcp/${encodeURIComponent(name)}/start`, { method: 'POST' });
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleStopMcpServer(input) {
    const name = input.name;
    try {
        const resp = await fetch(`http://localhost:3001/api/mcp/${encodeURIComponent(name)}/stop`, { method: 'POST' });
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleRestartMcpServer(input) {
    const name = input.name;
    try {
        const resp = await fetch(`http://localhost:3001/api/mcp/${encodeURIComponent(name)}/restart`, { method: 'POST' });
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleGetMcpServerLogs(input) {
    const name = input.name;
    try {
        const resp = await fetch(`http://localhost:3001/api/mcp/${encodeURIComponent(name)}/logs`);
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleGetMcpRuntimeStatus(input) {
    const name = input.name;
    try {
        const url = name
            ? `http://localhost:3001/api/mcp/${encodeURIComponent(name)}/status`
            : 'http://localhost:3001/api/mcp/status/all';
        const resp = await fetch(url);
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleGetCommand(input) {
    const name = input.name;
    try {
        const content = await fs.readFile(path.join(CLAUDE_COMMANDS_DIR, `${name}.md`), 'utf-8');
        return JSON.stringify({ name, content });
    }
    catch {
        return JSON.stringify({ error: `Command not found: ${name}` });
    }
}
async function handleCreateCommand(input) {
    const name = input.name;
    const content = input.content;
    try {
        const resp = await fetch('http://localhost:3001/api/commands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, content }),
        });
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleUpdateCommand(input) {
    const name = input.name;
    const content = input.content;
    try {
        await fs.writeFile(path.join(CLAUDE_COMMANDS_DIR, `${name}.md`), content, 'utf-8');
        return JSON.stringify({ success: true });
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleDeleteCommand(input) {
    const name = input.name;
    try {
        const resp = await fetch(`http://localhost:3001/api/commands/${encodeURIComponent(name)}`, { method: 'DELETE' });
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleGetSkill(input) {
    const name = input.name;
    try {
        const content = await fs.readFile(path.join(CLAUDE_SKILLS_DIR, name, 'SKILL.md'), 'utf-8');
        return JSON.stringify({ name, content });
    }
    catch {
        return JSON.stringify({ error: `Skill not found: ${name}` });
    }
}
async function handleCreateSkill(input) {
    const name = input.name;
    const content = input.content;
    try {
        const resp = await fetch('http://localhost:3001/api/skills', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, content }),
        });
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleDeleteSkill(input) {
    const name = input.name;
    try {
        const resp = await fetch(`http://localhost:3001/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleDeleteEnvironment(input) {
    const id = input.id;
    try {
        const resp = await fetch(`http://localhost:3001/api/env-profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleReorderEnvironments(input) {
    const ids = input.ids;
    try {
        const resp = await fetch('http://localhost:3001/api/env-profiles/reorder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        });
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleListMarketplaces(_input) {
    try {
        const resp = await fetch('http://localhost:3001/api/plugins/marketplaces');
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleListInstalledPlugins(_input) {
    try {
        const resp = await fetch('http://localhost:3001/api/plugins/installed-details');
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleInstallPlugin(input) {
    const marketplaceName = input.marketplaceName;
    const pluginName = input.pluginName;
    try {
        const resp = await fetch('http://localhost:3001/api/plugins/install', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ marketplaceName, pluginName }),
        });
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleUninstallPlugin(input) {
    const marketplaceName = input.marketplaceName;
    const pluginName = input.pluginName;
    try {
        const resp = await fetch('http://localhost:3001/api/plugins/uninstall', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ marketplaceName, pluginName }),
        });
        const data = await resp.json();
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
export async function executeToolHandler(name, input) {
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
        case 'start_mcp_server': return handleStartMcpServer(input);
        case 'stop_mcp_server': return handleStopMcpServer(input);
        case 'restart_mcp_server': return handleRestartMcpServer(input);
        case 'get_mcp_server_logs': return handleGetMcpServerLogs(input);
        case 'get_mcp_runtime_status': return handleGetMcpRuntimeStatus(input);
        case 'get_command': return handleGetCommand(input);
        case 'create_command': return handleCreateCommand(input);
        case 'update_command': return handleUpdateCommand(input);
        case 'delete_command': return handleDeleteCommand(input);
        case 'get_skill': return handleGetSkill(input);
        case 'create_skill': return handleCreateSkill(input);
        case 'delete_skill': return handleDeleteSkill(input);
        case 'delete_environment': return handleDeleteEnvironment(input);
        case 'reorder_environments': return handleReorderEnvironments(input);
        case 'list_marketplaces': return handleListMarketplaces(input);
        case 'list_installed_plugins': return handleListInstalledPlugins(input);
        case 'install_plugin': return handleInstallPlugin(input);
        case 'uninstall_plugin': return handleUninstallPlugin(input);
        default: return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
}
//# sourceMappingURL=ai-assistant.js.map