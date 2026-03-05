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
                sonnet: profile.sonnetModel || 'claude-sonnet-4-6',
                opus: profile.opusModel || 'claude-opus-4-6',
                haiku: profile.haikuModel || 'claude-haiku-4-5-20251001',
                smallFast: profile.smallFastModel || 'claude-haiku-4-5-20251001',
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
    // GET /api/ai/tools — list available tool definitions
    app.get('/api/ai/tools', (_req, res) => {
        const tools = toolDefinitions.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.input_schema.properties,
            required: t.input_schema.required || [],
        }));
        // Also include web_search
        tools.unshift({
            name: 'web_search',
            description: 'Search the web for current information, news, and real-time data.',
            parameters: {},
            required: [],
        });
        res.json(tools);
    });
    // POST /api/ai/chat — SSE streaming with tool use loop
    app.post('/api/ai/chat', async (req, res) => {
        const { message, model, forceTool } = req.body;
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

Current date and time: ${new Date().toLocaleString()} (${Intl.DateTimeFormat().resolvedOptions().timeZone})

You have access to these tools:

System:
- get_current_datetime: Get current date, time, and timezone
- get_system_info: Get OS, Node.js, Claude CLI version and system diagnostics

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
- add_mcp_server: Add a new MCP server to config
- remove_mcp_server: Remove an MCP server from config
- update_mcp_server: Update an MCP server's configuration

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
- update_skill: Update an existing skill's SKILL.md content
- delete_skill: Delete a skill

Marketplace:
- list_marketplaces: List registered marketplace sources
- add_marketplace: Add a new marketplace source by GitHub URL
- remove_marketplace: Remove a marketplace source by name
- list_installed_plugins: List all installed plugins
- install_plugin: Install a plugin from a marketplace
- uninstall_plugin: Uninstall a plugin

App Overview:
- get_app_config: Get high-level app config overview

File System:
- read_local_path: Read a local file's text content or list a directory's entries. Use this when the user wants to inspect any config file (e.g. ~/.claude/settings.json, ~/.gitconfig), log file, or explore a directory on their machine.
- write_local_path: Write text content to a local file (home directory only)

Use tools to answer questions accurately. Be concise and helpful. Never expose API keys or auth tokens.
If the user asks about current events, real-time information, or anything requiring up-to-date knowledge, use the web_search tool when available.`;
            // Enable web search for all profiles — let the API decide if it's supported
            const webSearchTool = [{
                    type: 'web_search_20250305',
                    name: 'web_search',
                    max_uses: 5,
                }];
            let iteration = 0;
            const MAX_ITERATIONS = 10;
            // Track current assistant message for history
            let currentAssistantContent = '';
            const toolCallsForHistory = [];
            let isFirstIteration = true;
            while (iteration < MAX_ITERATIONS) {
                iteration++;
                // Stream from Anthropic
                const stream = client.messages.stream({
                    model,
                    max_tokens: 4096,
                    system: SYSTEM_PROMPT,
                    messages: conversationMessages,
                    tools: [...webSearchTool, ...toolDefinitions],
                    ...(forceTool && isFirstIteration ? { tool_choice: { type: 'tool', name: forceTool } } : {}),
                }, { signal: abortController.signal });
                isFirstIteration = false;
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
                        // web_search is executed server-side by Anthropic — skip our handler
                        if (toolBlock.name === 'web_search')
                            continue;
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
        name: 'add_marketplace',
        description: 'Add a new marketplace source by GitHub URL. The URL should point to a GitHub repository containing a .claude-plugin/marketplace.json file.',
        input_schema: {
            type: 'object',
            properties: {
                url: { type: 'string', description: 'GitHub repository URL, e.g. https://github.com/owner/repo' },
            },
            required: ['url'],
        },
    },
    {
        name: 'remove_marketplace',
        description: 'Remove a registered marketplace source by name.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Marketplace name to remove (as shown in list_marketplaces)' },
            },
            required: ['name'],
        },
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
    {
        name: 'read_local_path',
        description: 'Read a local file\'s text content or list a directory\'s entries. Supports ~ (home dir) expansion. Use this to inspect any config file, log file, or directory on the user\'s machine.',
        input_schema: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                    description: 'Absolute path or ~ relative path to a file or directory. Examples: "~/.claude/settings.json", "~/.claude", "C:\\\\Users\\\\name\\\\.gitconfig"',
                },
                max_bytes: {
                    type: 'number',
                    description: 'Max bytes to read for files (default: 32768, max: 1048576). Ignored for directories.',
                    minimum: 1,
                    maximum: 1048576,
                },
            },
            required: ['path'],
        },
    },
    {
        name: 'get_current_datetime',
        description: 'Get the current date, time, and timezone of the server.',
        input_schema: { type: 'object', properties: {} },
    },
    {
        name: 'update_skill',
        description: 'Update an existing agent skill by name. Overwrites the SKILL.md content.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Skill name to update' },
                content: { type: 'string', description: 'New SKILL.md content' },
            },
            required: ['name', 'content'],
        },
    },
    {
        name: 'add_mcp_server',
        description: 'Add a new MCP server to ~/.claude.json config.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Server name (unique identifier)' },
                command: { type: 'string', description: 'Command to run (e.g. "npx", "node", "python")' },
                args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' },
                env: { type: 'object', description: 'Environment variables as key-value pairs' },
            },
            required: ['name', 'command'],
        },
    },
    {
        name: 'remove_mcp_server',
        description: 'Remove an MCP server from ~/.claude.json config by name.',
        input_schema: {
            type: 'object',
            properties: { name: { type: 'string', description: 'Server name to remove' } },
            required: ['name'],
        },
    },
    {
        name: 'update_mcp_server',
        description: 'Update an existing MCP server configuration in ~/.claude.json.',
        input_schema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Server name to update' },
                command: { type: 'string', description: 'New command' },
                args: { type: 'array', items: { type: 'string' }, description: 'New args' },
                env: { type: 'object', description: 'New environment variables' },
            },
            required: ['name'],
        },
    },
    {
        name: 'write_local_path',
        description: 'Write text content to a local file. Supports ~ (home dir) expansion. The file must be within the home directory. Creates parent directories if needed.',
        input_schema: {
            type: 'object',
            properties: {
                path: { type: 'string', description: 'Absolute path or ~ relative path to write to' },
                content: { type: 'string', description: 'Text content to write' },
            },
            required: ['path', 'content'],
        },
    },
    {
        name: 'get_system_info',
        description: 'Get system diagnostic information: OS, Node.js version, architecture, hostname, home directory, shell, and Claude CLI version.',
        input_schema: { type: 'object', properties: {} },
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
        if (!resp.ok)
            throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleAddMarketplace(input) {
    const url = input.url;
    try {
        const resp = await fetch('http://localhost:3001/api/plugins/marketplaces', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url }),
        });
        const data = await resp.json();
        if (!resp.ok)
            throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleRemoveMarketplace(input) {
    const name = input.name;
    try {
        const resp = await fetch(`http://localhost:3001/api/plugins/marketplaces/${encodeURIComponent(name)}`, { method: 'DELETE' });
        const data = await resp.json();
        if (!resp.ok)
            throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
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
            body: JSON.stringify({ marketplace: marketplaceName, plugin: pluginName }),
        });
        const data = await resp.json();
        if (!resp.ok)
            throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
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
            body: JSON.stringify({ marketplace: marketplaceName, plugin: pluginName }),
        });
        const data = await resp.json();
        if (!resp.ok)
            throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
        return JSON.stringify(data);
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleReadLocalPath(input) {
    // [Mi4] Type guard — reject non-string path early
    if (typeof input.path !== 'string' || input.path.trim() === '') {
        return JSON.stringify({ error: 'Invalid path: must be a non-empty string' });
    }
    const rawPath = input.path;
    // [C2] Clamp max_bytes to [1, 1MB] to prevent huge Buffer allocations
    const maxBytes = typeof input.max_bytes === 'number'
        ? Math.min(Math.max(1, Math.floor(input.max_bytes)), 1_048_576)
        : 32_768;
    // [M1] Expand ~ correctly: slice(2) to remove '~/' prefix (not slice(1))
    let targetPath;
    if (rawPath === '~') {
        targetPath = HOME_DIR;
    }
    else if (rawPath.startsWith('~/') || rawPath.startsWith('~\\')) {
        targetPath = path.join(HOME_DIR, rawPath.slice(2));
    }
    else {
        targetPath = rawPath;
    }
    // [C1] Resolve symlinks and verify the path stays within HOME_DIR
    let resolvedPath;
    try {
        resolvedPath = await fs.realpath(targetPath);
    }
    catch {
        // realpath fails when path does not exist
        return JSON.stringify({ error: 'Path not found: path does not exist or is inaccessible' });
    }
    const normalizedHome = path.normalize(HOME_DIR);
    const isUnderHome = resolvedPath === normalizedHome ||
        resolvedPath.startsWith(normalizedHome + path.sep);
    if (!isUnderHome) {
        return JSON.stringify({ error: 'Access denied: path must be within the home directory' });
    }
    try {
        const stats = await fs.stat(resolvedPath);
        if (stats.isDirectory()) {
            const entries = await fs.readdir(resolvedPath, { withFileTypes: true });
            const items = entries
                .map((e) => ({
                name: e.name,
                type: e.isDirectory() ? 'directory' : 'file',
                path: path.join(resolvedPath, e.name),
            }))
                .sort((a, b) => {
                if (a.type === 'directory' && b.type !== 'directory')
                    return -1;
                if (a.type !== 'directory' && b.type === 'directory')
                    return 1;
                return a.name.localeCompare(b.name);
            });
            return JSON.stringify({
                type: 'directory',
                path: resolvedPath,
                entries: items,
                count: items.length,
            });
        }
        if (stats.isFile()) {
            if (stats.size > maxBytes) {
                // [M3] Use try/finally to guarantee file descriptor is closed
                const fileHandle = await fs.open(resolvedPath, 'r');
                try {
                    const buffer = Buffer.alloc(maxBytes);
                    await fileHandle.read(buffer, 0, maxBytes, 0);
                    return JSON.stringify({
                        type: 'file',
                        path: resolvedPath,
                        size: stats.size,
                        truncated: true,
                        content: buffer.toString('utf-8'),
                        note: `File truncated: showing first ${maxBytes} of ${stats.size} bytes`,
                    });
                }
                finally {
                    await fileHandle.close();
                }
            }
            const content = await fs.readFile(resolvedPath, 'utf-8');
            return JSON.stringify({
                type: 'file',
                path: resolvedPath,
                size: stats.size,
                truncated: false,
                content,
            });
        }
        return JSON.stringify({ error: `Path is neither a file nor a directory: ${resolvedPath}` });
    }
    catch (err) {
        const e = err;
        if (e.code === 'ENOENT')
            return JSON.stringify({ error: 'Path not found' });
        if (e.code === 'EACCES')
            return JSON.stringify({ error: 'Permission denied' });
        if (e.code === 'EMFILE')
            return JSON.stringify({ error: 'Too many open files, please retry' });
        if (e.code === 'ENOTDIR')
            return JSON.stringify({ error: 'Path component is not a directory' });
        return JSON.stringify({ error: err.message });
    }
}
async function handleGetCurrentDatetime(_input) {
    return JSON.stringify({
        dateTime: new Date().toLocaleString(),
        iso: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timestamp: Date.now(),
    });
}
async function handleUpdateSkill(input) {
    const name = input.name;
    const content = input.content;
    try {
        const skillPath = path.join(CLAUDE_SKILLS_DIR, name, 'SKILL.md');
        // Check skill exists
        try {
            await fs.access(skillPath);
        }
        catch {
            return JSON.stringify({ error: `Skill not found: ${name}` });
        }
        await fs.writeFile(skillPath, content, 'utf-8');
        return JSON.stringify({ success: true, message: `Updated skill: ${name}` });
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleAddMcpServer(input) {
    const name = input.name;
    const command = input.command;
    const args = input.args || [];
    const env = input.env || undefined;
    try {
        const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8').catch(() => '{}');
        const config = JSON.parse(content);
        if (!config.mcpServers)
            config.mcpServers = {};
        if (config.mcpServers[name]) {
            return JSON.stringify({ error: `MCP server already exists: ${name}` });
        }
        const entry = { command, args };
        if (env)
            entry.env = env;
        config.mcpServers[name] = entry;
        await fs.writeFile(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2), 'utf-8');
        return JSON.stringify({ success: true, message: `Added MCP server: ${name}` });
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleRemoveMcpServer(input) {
    const name = input.name;
    try {
        const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8').catch(() => '{}');
        const config = JSON.parse(content);
        if (!config.mcpServers || !config.mcpServers[name]) {
            return JSON.stringify({ error: `MCP server not found: ${name}` });
        }
        delete config.mcpServers[name];
        await fs.writeFile(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2), 'utf-8');
        return JSON.stringify({ success: true, message: `Removed MCP server: ${name}` });
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleUpdateMcpServer(input) {
    const name = input.name;
    try {
        const content = await fs.readFile(CLAUDE_JSON_PATH, 'utf-8').catch(() => '{}');
        const config = JSON.parse(content);
        if (!config.mcpServers || !config.mcpServers[name]) {
            return JSON.stringify({ error: `MCP server not found: ${name}` });
        }
        const server = config.mcpServers[name];
        if (input.command !== undefined)
            server.command = input.command;
        if (input.args !== undefined)
            server.args = input.args;
        if (input.env !== undefined)
            server.env = input.env;
        config.mcpServers[name] = server;
        await fs.writeFile(CLAUDE_JSON_PATH, JSON.stringify(config, null, 2), 'utf-8');
        return JSON.stringify({ success: true, message: `Updated MCP server: ${name}` });
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleWriteLocalPath(input) {
    if (typeof input.path !== 'string' || input.path.trim() === '') {
        return JSON.stringify({ error: 'Invalid path: must be a non-empty string' });
    }
    if (typeof input.content !== 'string') {
        return JSON.stringify({ error: 'Invalid content: must be a string' });
    }
    const rawPath = input.path;
    const content = input.content;
    // Reject content larger than 1MB
    if (Buffer.byteLength(content, 'utf-8') > 1_048_576) {
        return JSON.stringify({ error: 'Content too large: maximum size is 1MB' });
    }
    // Expand ~ paths
    let targetPath;
    if (rawPath === '~') {
        return JSON.stringify({ error: 'Cannot write to home directory itself' });
    }
    else if (rawPath.startsWith('~/') || rawPath.startsWith('~\\')) {
        targetPath = path.join(HOME_DIR, rawPath.slice(2));
    }
    else {
        targetPath = rawPath;
    }
    // Security check: verify parent directory is under HOME_DIR
    const parentDir = path.dirname(targetPath);
    let resolvedParent;
    try {
        // Create parent dirs first so realpath can resolve
        await fs.mkdir(parentDir, { recursive: true });
        resolvedParent = await fs.realpath(parentDir);
    }
    catch {
        return JSON.stringify({ error: 'Cannot create or resolve parent directory' });
    }
    const normalizedHome = path.normalize(HOME_DIR);
    const isUnderHome = resolvedParent === normalizedHome ||
        resolvedParent.startsWith(normalizedHome + path.sep);
    if (!isUnderHome) {
        return JSON.stringify({ error: 'Access denied: path must be within the home directory' });
    }
    try {
        const resolvedTarget = path.join(resolvedParent, path.basename(targetPath));
        await fs.writeFile(resolvedTarget, content, 'utf-8');
        return JSON.stringify({ success: true, path: resolvedTarget, size: Buffer.byteLength(content, 'utf-8') });
    }
    catch (err) {
        return JSON.stringify({ error: err.message });
    }
}
async function handleGetSystemInfo(_input) {
    let claudeVersion = 'unknown';
    try {
        const { execSync } = await import('child_process');
        claudeVersion = execSync('claude --version 2>/dev/null || echo "not installed"', { encoding: 'utf-8' }).trim();
    }
    catch {
        claudeVersion = 'not installed';
    }
    return JSON.stringify({
        os: { platform: os.platform(), release: os.release(), arch: os.arch(), hostname: os.hostname() },
        node: process.version,
        homeDir: HOME_DIR,
        shell: process.env.SHELL || process.env.COMSPEC || 'unknown',
        claudeVersion,
        uptime: Math.round(os.uptime()),
        memory: { total: os.totalmem(), free: os.freemem() },
    });
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
        case 'add_marketplace': return handleAddMarketplace(input);
        case 'remove_marketplace': return handleRemoveMarketplace(input);
        case 'read_local_path': return handleReadLocalPath(input);
        case 'get_current_datetime': return handleGetCurrentDatetime(input);
        case 'update_skill': return handleUpdateSkill(input);
        case 'add_mcp_server': return handleAddMcpServer(input);
        case 'remove_mcp_server': return handleRemoveMcpServer(input);
        case 'update_mcp_server': return handleUpdateMcpServer(input);
        case 'write_local_path': return handleWriteLocalPath(input);
        case 'get_system_info': return handleGetSystemInfo(input);
        default: return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
}
//# sourceMappingURL=ai-assistant.js.map