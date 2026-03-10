import Anthropic from '@anthropic-ai/sdk';
import type { Express, Request, Response } from 'express';
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
const CLAUDE_AGENTS_DIR = path.join(HOME_DIR, '.claude', 'agents');

function resolveProjectPaths(projectPath?: string) {
  if (!projectPath) {
    return {
      claudeJsonPath: CLAUDE_JSON_PATH,
      commandsDir: CLAUDE_COMMANDS_DIR,
      skillsDir: CLAUDE_SKILLS_DIR,
      agentsDir: CLAUDE_AGENTS_DIR,
    };
  }
  const resolved = path.resolve(projectPath);
  return {
    claudeJsonPath: path.join(resolved, '.mcp.json'),
    commandsDir: path.join(resolved, '.claude', 'commands'),
    skillsDir: path.join(resolved, '.claude', 'skills'),
    agentsDir: path.join(resolved, '.claude', 'agents'),
  };
}
const AI_HISTORY_PATH = path.join(HOME_DIR, '.claude', 'ai-assistant-history.json');
const CONVERSATIONS_DIR = path.join(HOME_DIR, '.claude', 'ai-assistant-conversations');
const CONVERSATIONS_INDEX_PATH = path.join(CONVERSATIONS_DIR, 'index.json');
const DEFAULT_CONVERSATION_ID = '__default__';

function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };
  const frontmatter: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      frontmatter[line.substring(0, colonIdx).trim()] = line.substring(colonIdx + 1).trim();
    }
  }
  return { frontmatter, body: match[2] };
}

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
        sonnet: profile.sonnetModel || 'claude-sonnet-4-6',
        opus: profile.opusModel || 'claude-opus-4-6',
        haiku: profile.haikuModel || 'claude-haiku-4-5-20251001',
        smallFast: profile.smallFastModel || 'claude-haiku-4-5-20251001',
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

export function registerAIAssistantRoutes(app: Express): void {
  // GET /api/ai/history (deprecated — delegates to default conversation)
  app.get('/api/ai/history', async (_req: Request, res: Response) => {
    try {
      const history = await loadHistory();
      res.json(history);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // DELETE /api/ai/history (deprecated — deletes default conversation)
  app.delete('/api/ai/history', async (_req: Request, res: Response) => {
    try {
      // Also delete old file if it still exists
      await fs.unlink(AI_HISTORY_PATH).catch(() => {});
      // Delete the default conversation from the index
      const index = await loadConversationIndex();
      if (index.conversations.length > 0) {
        const defaultId = index.conversations[0].id;
        await fs.unlink(path.join(CONVERSATIONS_DIR, `${defaultId}.json`)).catch(() => {});
        index.conversations.shift();
        await saveConversationIndex(index);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Extract version from model ID (e.g. 'claude-sonnet-4-6' → '4.6')
  function modelLabel(baseName: string, modelId: string): string {
    const m = modelId.match(/^claude-[a-z]+-([\d]+)-([\d]+)/);
    return m ? `${baseName} ${m[1]}.${m[2]}` : baseName;
  }

  // GET /api/ai/models
  app.get('/api/ai/models', async (_req: Request, res: Response) => {
    try {
      const creds = await getActiveProfileCredentials();
      if (!creds) {
        res.status(400).json({ error: 'No active environment profile' });
        return;
      }
      const models = [
        { id: creds.models.sonnet, label: modelLabel('Sonnet', creds.models.sonnet), source: 'profile' },
        { id: creds.models.opus, label: modelLabel('Opus', creds.models.opus), source: 'profile' },
        { id: creds.models.haiku, label: modelLabel('Haiku', creds.models.haiku), source: 'profile' },
        { id: creds.models.smallFast, label: modelLabel('Small/Fast', creds.models.smallFast), source: 'profile' },
      ];
      res.json(models);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /api/ai/tools — list available tool definitions
  app.get('/api/ai/tools', (_req: Request, res: Response) => {
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

  // ============================================================
  // Conversation management routes
  // ============================================================

  // GET /api/ai/conversations
  app.get('/api/ai/conversations', async (_req: Request, res: Response) => {
    try {
      const index = await loadConversationIndex();
      // Sort by updatedAt descending
      index.conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      res.json({ conversations: index.conversations });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // POST /api/ai/conversations
  app.post('/api/ai/conversations', async (req: Request, res: Response) => {
    try {
      const { projectPath } = req.body as { projectPath?: string };
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const conv: ConversationFile = { id, name: 'New Chat', messages: [], createdAt: now, updatedAt: now, ...(projectPath ? { projectPath } : {}) };
      await saveConversation(conv);
      const index = await loadConversationIndex();
      const meta: ConversationMeta = { id, name: conv.name, createdAt: now, updatedAt: now, ...(projectPath ? { projectPath } : {}) };
      index.conversations.unshift(meta);
      await saveConversationIndex(index);
      res.json(meta);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // GET /api/ai/conversations/:id
  app.get('/api/ai/conversations/:id', async (req: Request, res: Response) => {
    try {
      const conv = await loadConversation(req.params.id);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      res.json(conv);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // DELETE /api/ai/conversations/:id
  app.delete('/api/ai/conversations/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const index = await loadConversationIndex();
      const idx = index.conversations.findIndex((c) => c.id === id);
      if (idx === -1) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      index.conversations.splice(idx, 1);
      await saveConversationIndex(index);
      await fs.unlink(path.join(CONVERSATIONS_DIR, `${id}.json`)).catch(() => {});
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // PATCH /api/ai/conversations/:id
  app.patch('/api/ai/conversations/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, projectPath } = req.body as { name?: string; projectPath?: string | null };
      if (!name && projectPath === undefined) {
        res.status(400).json({ error: 'name or projectPath is required' });
        return;
      }
      const conv = await loadConversation(id);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      if (name) conv.name = name;
      if (projectPath !== undefined) {
        if (projectPath === null) {
          delete conv.projectPath;
        } else {
          conv.projectPath = projectPath;
        }
      }
      conv.updatedAt = new Date().toISOString();
      await saveConversation(conv);
      const index = await loadConversationIndex();
      const meta = index.conversations.find((c) => c.id === id);
      if (meta) {
        if (name) meta.name = name;
        if (projectPath !== undefined) {
          if (projectPath === null) {
            delete meta.projectPath;
          } else {
            meta.projectPath = projectPath;
          }
        }
        meta.updatedAt = conv.updatedAt;
        await saveConversationIndex(index);
      }
      const updatedMeta: ConversationMeta = { id, name: conv.name, createdAt: conv.createdAt, updatedAt: conv.updatedAt, ...(conv.projectPath ? { projectPath: conv.projectPath } : {}) };
      res.json(updatedMeta);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // POST /api/ai/conversations/:id/generate-name
  app.post('/api/ai/conversations/:id/generate-name', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { model } = req.body as { model: string };
      const creds = await getActiveProfileCredentials();
      if (!creds) {
        res.status(400).json({ error: 'No active environment profile' });
        return;
      }
      const conv = await loadConversation(id);
      if (!conv) {
        res.status(404).json({ error: 'Conversation not found' });
        return;
      }
      if (conv.messages.length === 0) {
        res.json({ name: conv.name });
        return;
      }
      // Take first 2-4 messages for context
      const contextMessages = conv.messages.slice(0, 4);
      const messagesText = contextMessages.map((m) => `${m.role}: ${m.content}`).join('\n');
      const client = getAnthropicClient(creds);
      const response = await client.messages.create({
        model: model || creds.models.haiku,
        max_tokens: 50,
        system: 'Generate a brief title (3-6 words) for this conversation based on the messages below. Return ONLY the title, nothing else. No quotes, no punctuation at the end.',
        messages: [{ role: 'user', content: messagesText }],
      });
      let generatedName = 'New Chat';
      for (const block of response.content) {
        if (block.type === 'text') {
          generatedName = block.text.trim();
          break;
        }
      }
      // Save the generated name
      conv.name = generatedName;
      conv.updatedAt = new Date().toISOString();
      await saveConversation(conv);
      const index = await loadConversationIndex();
      const meta = index.conversations.find((c) => c.id === id);
      if (meta) {
        meta.name = generatedName;
        meta.updatedAt = conv.updatedAt;
        await saveConversationIndex(index);
      }
      res.json({ name: generatedName });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // POST /api/ai/conversations/:id/chat — SSE streaming scoped to a conversation
  app.post('/api/ai/conversations/:id/chat', async (req: Request, res: Response) => {
    const { id } = req.params;
    const { message, model, forceTool, attachments, projectPath } = req.body as { message: string; model: string; forceTool?: string; attachments?: Array<{ name: string; mediaType: string; data: string }>; projectPath?: string };

    const creds = await getActiveProfileCredentials();
    if (!creds) {
      res.status(400).json({ error: 'No active environment profile' });
      return;
    }

    const conv = await loadConversation(id);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const abortController = new AbortController();
    req.on('close', () => { connectionClosed = true; abortController.abort(); });

    const client = getAnthropicClient(creds);

    let connectionClosed = false;
    function sendSSE(event: object): void {
      if (connectionClosed) return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        connectionClosed = true;
      }
    }

    let currentAssistantContent = '';
    const toolCallsForHistory: Array<{ name: string; input: Record<string, unknown>; result: string }> = [];

    try {
      // Append user message
      const userMsg: AIChatMessageForHistory = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
        ...(attachments && attachments.length > 0 ? { attachments } : {}),
      };
      conv.messages.push(userMsg);

      // Build conversation for Anthropic API
      const conversationMessages: Anthropic.MessageParam[] = conv.messages.map((m) => {
        // Build multimodal content blocks for messages with attachments
        if (m.attachments && m.attachments.length > 0 && m.role === 'user') {
          const contentBlocks: Anthropic.ContentBlockParam[] = [];
          for (const att of m.attachments) {
            if (att.mediaType.startsWith('image/')) {
              contentBlocks.push({
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: att.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
                  data: att.data,
                },
              });
            } else if (att.mediaType === 'application/pdf') {
              contentBlocks.push({
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: att.data,
                },
              } as Anthropic.ContentBlockParam);
            } else {
              // Text-based files: decode and inject as text block
              try {
                const decoded = Buffer.from(att.data, 'base64').toString('utf-8');
                contentBlocks.push({ type: 'text', text: `--- File: ${att.name} ---\n${decoded}` });
              } catch {
                contentBlocks.push({ type: 'text', text: `[Attachment: ${att.name}]` });
              }
            }
          }
          if (m.content) {
            contentBlocks.push({ type: 'text', text: m.content });
          }
          return { role: m.role as 'user' | 'assistant', content: contentBlocks };
        }
        return { role: m.role as 'user' | 'assistant', content: m.content };
      });

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

Agents:
- list_agents: List user agents with names, descriptions, and model settings
- get_agent: Get full content of a user agent
- create_agent: Create a new user agent
- update_agent: Update a user agent's content
- delete_agent: Delete a user agent
- list_plugin_agents: List agents from installed plugins
- get_plugin_agent: Get full content of a plugin agent
- update_plugin_agent_model: Update the model setting of a plugin agent

Plugins:
- list_marketplaces: List registered marketplace sources
- add_marketplace: Add a new marketplace source by GitHub URL
- remove_marketplace: Remove a marketplace source by name
- list_installed_plugins: List all installed plugins with details (commands, skills, agents)
- install_plugin: Install a plugin from a marketplace
- uninstall_plugin: Uninstall a plugin
- list_plugin_commands: List commands from installed plugins
- list_plugin_skills: List skills from installed plugins
- get_plugin_command: Get the full content of a plugin command
- get_plugin_skill: Get the full content of a plugin skill (SKILL.md)

App Overview:
- get_app_config: Get high-level app config overview

File System:
- read_local_path: Read a local file's text content or list a directory's entries. Use this when the user wants to inspect any config file (e.g. ~/.claude/settings.json, ~/.gitconfig), log file, or explore a directory on their machine.
- write_local_path: Write text content to a local file (home directory or project directory)

Terminal:
- execute_terminal_command: Execute a shell command on the user's machine. Safe read-only commands (ls, cat, git status, etc.) run automatically. Other commands require user confirmation before execution. Supports working_directory and project_path parameters.

Project-scoped tools:
Many tools accept an optional 'project_path' parameter. When provided, the tool operates on project-level configuration instead of global:
- MCP servers read from {project_path}/.mcp.json instead of ~/.claude.json
- Commands read from {project_path}/.claude/commands/ instead of ~/.claude/commands/
- Skills read from {project_path}/.claude/skills/ instead of ~/.claude/skills/
- Agents read from {project_path}/.claude/agents/ instead of ~/.claude/agents/
When the user is working with a specific project, use project_path to scope operations to that project.

Use tools to answer questions accurately. Be concise and helpful. Never expose API keys or auth tokens.
If the user asks about current events, real-time information, or anything requiring up-to-date knowledge, use the web_search tool when available.${projectPath ? `\n\nCurrent project context: The user is working in project "${projectPath}". For all project-scoped tools (MCP, commands, skills, agents), automatically use project_path: "${projectPath}" unless the user explicitly asks for global configuration.` : ''}`;

      const webSearchTool = [{
        type: 'web_search_20250305' as const,
        name: 'web_search' as const,
        max_uses: 5,
      }];

      let iteration = 0;
      const MAX_ITERATIONS = 10;
      let isFirstIteration = true;

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        const stream = client.messages.stream({
          model,
          max_tokens: 16384,
          system: SYSTEM_PROMPT,
          messages: conversationMessages,
          tools: [...webSearchTool, ...toolDefinitions] as unknown as Anthropic.Messages.Tool[],
          ...(forceTool && isFirstIteration ? { tool_choice: { type: 'tool' as const, name: forceTool } } : {}),
        }, { signal: abortController.signal });
        isFirstIteration = false;

        let hasToolUse = false;
        const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];

        for await (const event of stream) {
          if (abortController.signal.aborted) break;
          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              currentAssistantContent += event.delta.text;
              sendSSE({ type: 'text_delta', text: event.delta.text });
            }
          }
        }

        if (abortController.signal.aborted) break;

        const finalMessage = await stream.finalMessage();

        for (const block of finalMessage.content) {
          if (block.type === 'tool_use') {
            hasToolUse = true;
            toolUseBlocks.push(block);
          }
        }

        if (hasToolUse) {
          conversationMessages.push({
            role: 'assistant' as const,
            content: finalMessage.content as unknown as Anthropic.MessageParam['content'],
          });

          const toolResultContents: Anthropic.Messages.ToolResultBlockParam[] = [];

          for (const toolBlock of toolUseBlocks) {
            if (toolBlock.name === 'web_search') continue;
            const toolInput = toolBlock.input as ToolInput;
            if (projectPath && !toolInput.project_path) {
              toolInput.project_path = projectPath;
            }

            let result: string;

            // Special handling for terminal commands requiring confirmation
            if (toolBlock.name === 'execute_terminal_command') {
              const command = typeof toolInput.command === 'string' ? toolInput.command : '';
              const cwd = resolveCommandCwd(toolInput);
              const timeoutMs = typeof toolInput.timeout_ms === 'number' ? Math.min(Math.max(1000, toolInput.timeout_ms), 120_000) : 30_000;

              if (isWhitelistedCommand(command)) {
                // Auto-execute whitelisted commands
                result = await handleExecuteTerminalCommand(command, cwd, timeoutMs);
              } else {
                // Send confirmation request to frontend and wait
                const requestId = crypto.randomUUID();
                sendSSE({
                  type: 'command_confirm',
                  commandConfirm: { requestId, command, workingDirectory: cwd },
                });

                // Wait for user confirmation (with timeout)
                const approved = await new Promise<boolean>((resolve) => {
                  pendingCommandConfirmations.set(requestId, { resolve, command, cwd });
                  // Auto-reject after 5 minutes if no response
                  setTimeout(() => {
                    if (pendingCommandConfirmations.has(requestId)) {
                      pendingCommandConfirmations.delete(requestId);
                      resolve(false);
                    }
                  }, 300_000);
                });

                if (approved) {
                  result = await handleExecuteTerminalCommand(command, cwd, timeoutMs);
                } else {
                  result = JSON.stringify({ error: 'Command rejected by user', command });
                }
              }
            } else {
              result = await executeToolHandler(toolBlock.name, toolInput);
            }

            toolCallsForHistory.push({
              name: toolBlock.name,
              input: toolBlock.input as Record<string, unknown>,
              result,
            });
            sendSSE({
              type: 'tool_call',
              tool: { name: toolBlock.name, input: toolBlock.input, result },
            });
            toolResultContents.push({
              type: 'tool_result' as const,
              tool_use_id: toolBlock.id,
              content: result,
            });
          }

          conversationMessages.push({
            role: 'user' as const,
            content: toolResultContents as unknown as Anthropic.MessageParam['content'],
          });
          continue;
        }

        // Auto-continue if response was truncated due to max_tokens
        if (finalMessage.stop_reason === 'max_tokens') {
          // Append current partial assistant response to conversation for continuation
          conversationMessages.push({
            role: 'assistant' as const,
            content: finalMessage.content as unknown as Anthropic.MessageParam['content'],
          });
          conversationMessages.push({
            role: 'user' as const,
            content: 'Your previous response was cut off due to length limits. Please continue exactly where you left off. Do not repeat any content you already provided — just pick up from the exact point of truncation and continue.',
          });
          continue;
        }

        break;
      }

      // Save updated conversation
      const assistantMsg: AIChatMessageForHistory = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: currentAssistantContent,
        timestamp: new Date().toISOString(),
        toolCalls: toolCallsForHistory.length > 0 ? toolCallsForHistory : undefined,
      };
      conv.messages.push(assistantMsg);
      conv.updatedAt = new Date().toISOString();
      await saveConversation(conv);

      // Update index
      const index = await loadConversationIndex();
      const meta = index.conversations.find((c) => c.id === id);
      if (meta) {
        meta.updatedAt = conv.updatedAt;
        await saveConversationIndex(index);
      }

      sendSSE({ type: 'done' });
      res.end();
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Save partial response on abort so user keeps what was already generated
        if (currentAssistantContent) {
          const partialMsg: AIChatMessageForHistory = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: currentAssistantContent,
            timestamp: new Date().toISOString(),
            toolCalls: toolCallsForHistory.length > 0 ? toolCallsForHistory : undefined,
          };
          conv.messages.push(partialMsg);
          conv.updatedAt = new Date().toISOString();
          await saveConversation(conv).catch(() => {});
        }
        res.end();
        return;
      }
      sendSSE({ type: 'error', error: (err as Error).message });
      res.end();
    }
  });

  // POST /api/ai/conversations/:id/confirm-command — User confirms or rejects a terminal command
  app.post('/api/ai/conversations/:id/confirm-command', (req: Request, res: Response) => {
    const { requestId, approved } = req.body as { requestId: string; approved: boolean };
    if (!requestId) {
      res.status(400).json({ error: 'requestId is required' });
      return;
    }
    const pending = pendingCommandConfirmations.get(requestId);
    if (!pending) {
      res.status(404).json({ error: 'No pending confirmation found for this requestId (may have expired)' });
      return;
    }
    pendingCommandConfirmations.delete(requestId);
    pending.resolve(approved === true);
    res.json({ success: true, approved: approved === true });
  });


  // POST /api/ai/chat (deprecated — delegates to default conversation via loadHistory/saveHistory)
  app.post('/api/ai/chat', async (req: Request, res: Response) => {
    const { message, model, forceTool } = req.body as { message: string; model: string; forceTool?: string };

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
    req.on('close', () => { connectionClosed = true; abortController.abort(); });

    const client = getAnthropicClient(creds);

    let connectionClosed = false;
    function sendSSE(event: object): void {
      if (connectionClosed) return;
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        connectionClosed = true;
      }
    }

    try {
      // Load history and append user message
      const historyFile = await loadHistory();
      const userMsg: AIChatMessageForHistory = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      };
      historyFile.messages.push(userMsg);

      // Build conversation for Anthropic API (convert history format)
      const conversationMessages: Anthropic.MessageParam[] = historyFile.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
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

Agents:
- list_agents: List user agents with names, descriptions, and model settings
- get_agent: Get full content of a user agent
- create_agent: Create a new user agent
- update_agent: Update a user agent's content
- delete_agent: Delete a user agent
- list_plugin_agents: List agents from installed plugins
- get_plugin_agent: Get full content of a plugin agent
- update_plugin_agent_model: Update the model setting of a plugin agent

Plugins:
- list_marketplaces: List registered marketplace sources
- add_marketplace: Add a new marketplace source by GitHub URL
- remove_marketplace: Remove a marketplace source by name
- list_installed_plugins: List all installed plugins with details (commands, skills, agents)
- install_plugin: Install a plugin from a marketplace
- uninstall_plugin: Uninstall a plugin
- list_plugin_commands: List commands from installed plugins
- list_plugin_skills: List skills from installed plugins
- get_plugin_command: Get the full content of a plugin command

App Overview:
- get_app_config: Get high-level app config overview

File System:
- read_local_path: Read a local file's text content or list a directory's entries. Use this when the user wants to inspect any config file (e.g. ~/.claude/settings.json, ~/.gitconfig), log file, or explore a directory on their machine.
- write_local_path: Write text content to a local file (home directory or project directory)

Terminal:
- execute_terminal_command: Execute a shell command on the user's machine. Safe read-only commands run automatically; others require user confirmation.

Use tools to answer questions accurately. Be concise and helpful. Never expose API keys or auth tokens.
If the user asks about current events, real-time information, or anything requiring up-to-date knowledge, use the web_search tool when available.`;

      // Enable web search for all profiles — let the API decide if it's supported
      const webSearchTool = [{
        type: 'web_search_20250305' as const,
        name: 'web_search' as const,
        max_uses: 5,
      }];

      let iteration = 0;
      const MAX_ITERATIONS = 10;

      // Track current assistant message for history
      let currentAssistantContent = '';
      const toolCallsForHistory: Array<{ name: string; input: Record<string, unknown>; result: string }> = [];
      let isFirstIteration = true;

      while (iteration < MAX_ITERATIONS) {
        iteration++;

        // Stream from Anthropic
        const stream = client.messages.stream({
          model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: conversationMessages,
          tools: [...webSearchTool, ...toolDefinitions] as unknown as Anthropic.Messages.Tool[],
          ...(forceTool && isFirstIteration ? { tool_choice: { type: 'tool' as const, name: forceTool } } : {}),
        }, { signal: abortController.signal });
        isFirstIteration = false;

        let hasToolUse = false;
        const toolUseBlocks: Anthropic.Messages.ToolUseBlock[] = [];

        for await (const event of stream) {
          if (abortController.signal.aborted) break;

          if (event.type === 'content_block_delta') {
            if (event.delta.type === 'text_delta') {
              currentAssistantContent += event.delta.text;
              sendSSE({ type: 'text_delta', text: event.delta.text });
            }
          }
        }

        if (abortController.signal.aborted) break;

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
            role: 'assistant' as const,
            content: finalMessage.content as unknown as Anthropic.MessageParam['content'],
          });

          // Execute each tool and collect results
          const toolResultContents: Anthropic.Messages.ToolResultBlockParam[] = [];

          for (const toolBlock of toolUseBlocks) {
            // web_search is executed server-side by Anthropic — skip our handler
            if (toolBlock.name === 'web_search') continue;

            const result = await executeToolHandler(toolBlock.name, toolBlock.input as ToolInput);

            toolCallsForHistory.push({
              name: toolBlock.name,
              input: toolBlock.input as Record<string, unknown>,
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
              type: 'tool_result' as const,
              tool_use_id: toolBlock.id,
              content: result,
            });
          }

          // Add tool results to conversation
          conversationMessages.push({
            role: 'user' as const,
            content: toolResultContents as unknown as Anthropic.MessageParam['content'],
          });

          // Continue loop for next AI response
          continue;
        }

        // No tool use — we're done
        break;
      }

      // Save updated history
      const assistantMsg: AIChatMessageForHistory = {
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
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        res.end();
        return;
      }
      sendSSE({ type: 'error', error: (err as Error).message });
      res.end();
    }
  });
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
// History management
// ============================================================

interface AIChatMessageForHistory {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; result?: string }>;
  attachments?: Array<{ name: string; mediaType: string; data: string }>;
}

interface AIChatHistoryFile {
  messages: AIChatMessageForHistory[];
  updatedAt: string;
}

interface ConversationMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  projectPath?: string;
}

interface ConversationIndex {
  conversations: ConversationMeta[];
}

interface ConversationFile {
  id: string;
  name: string;
  messages: AIChatMessageForHistory[];
  createdAt: string;
  updatedAt: string;
  projectPath?: string;
}

// --- Conversation storage helpers ---

async function migrateOldHistory(): Promise<void> {
  try {
    const oldContent = await fs.readFile(AI_HISTORY_PATH, 'utf-8');
    const oldHistory = JSON.parse(oldContent) as AIChatHistoryFile;
    if (oldHistory.messages.length === 0) {
      await fs.unlink(AI_HISTORY_PATH).catch(() => {});
      return;
    }
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const conv: ConversationFile = {
      id,
      name: 'Previous Chat',
      messages: oldHistory.messages,
      createdAt: oldHistory.messages[0]?.timestamp || now,
      updatedAt: oldHistory.updatedAt || now,
    };
    await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
    await fs.writeFile(path.join(CONVERSATIONS_DIR, `${id}.json`), JSON.stringify(conv, null, 2), 'utf-8');
    const index: ConversationIndex = {
      conversations: [{ id, name: conv.name, createdAt: conv.createdAt, updatedAt: conv.updatedAt }],
    };
    await fs.writeFile(CONVERSATIONS_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
    await fs.unlink(AI_HISTORY_PATH).catch(() => {});
  } catch {
    // Old history doesn't exist or is invalid — nothing to migrate
  }
}

async function loadConversationIndex(): Promise<ConversationIndex> {
  try {
    await fs.access(CONVERSATIONS_INDEX_PATH);
  } catch {
    // Index doesn't exist — check for old history to migrate
    try {
      await fs.access(AI_HISTORY_PATH);
      await migrateOldHistory();
    } catch {
      // No old history either — return empty
    }
  }
  try {
    const content = await fs.readFile(CONVERSATIONS_INDEX_PATH, 'utf-8');
    return JSON.parse(content) as ConversationIndex;
  } catch {
    return { conversations: [] };
  }
}

async function saveConversationIndex(index: ConversationIndex): Promise<void> {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
  await fs.writeFile(CONVERSATIONS_INDEX_PATH, JSON.stringify(index, null, 2), 'utf-8');
}

async function loadConversation(id: string): Promise<ConversationFile | null> {
  try {
    const content = await fs.readFile(path.join(CONVERSATIONS_DIR, `${id}.json`), 'utf-8');
    return JSON.parse(content) as ConversationFile;
  } catch {
    return null;
  }
}

async function saveConversation(conv: ConversationFile): Promise<void> {
  const trimmed = trimConversationMessages(conv);
  const redacted = redactConversationCredentials(trimmed);
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true });
  await fs.writeFile(path.join(CONVERSATIONS_DIR, `${redacted.id}.json`), JSON.stringify(redacted, null, 2), 'utf-8');
}

function trimConversationMessages(conv: ConversationFile): ConversationFile {
  const MAX_MESSAGES = 100;
  if (conv.messages.length <= MAX_MESSAGES) return conv;
  return {
    ...conv,
    messages: conv.messages.slice(conv.messages.length - MAX_MESSAGES),
  };
}

function redactConversationCredentials(conv: ConversationFile): ConversationFile {
  return {
    ...conv,
    messages: conv.messages.map((msg) => ({
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

async function getOrCreateDefaultConversation(): Promise<ConversationFile> {
  const index = await loadConversationIndex();
  // Use the first conversation as default, or create one
  if (index.conversations.length > 0) {
    const conv = await loadConversation(index.conversations[0].id);
    if (conv) return conv;
  }
  // Create a default conversation
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const conv: ConversationFile = { id, name: 'New Chat', messages: [], createdAt: now, updatedAt: now };
  await saveConversation(conv);
  index.conversations.unshift({ id, name: conv.name, createdAt: now, updatedAt: now });
  await saveConversationIndex(index);
  return conv;
}

// Backward-compatible delegates for loadHistory/saveHistory (exported)
export async function loadHistory(): Promise<AIChatHistoryFile> {
  const conv = await getOrCreateDefaultConversation();
  return { messages: conv.messages, updatedAt: conv.updatedAt };
}

export async function saveHistory(history: AIChatHistoryFile): Promise<void> {
  const conv = await getOrCreateDefaultConversation();
  conv.messages = history.messages;
  conv.updatedAt = history.updatedAt || new Date().toISOString();
  await saveConversation(conv);
  // Update index
  const index = await loadConversationIndex();
  const meta = index.conversations.find((c) => c.id === conv.id);
  if (meta) {
    meta.updatedAt = conv.updatedAt;
    await saveConversationIndex(index);
  }
}

export function trimHistory(history: AIChatHistoryFile): AIChatHistoryFile {
  const MAX_MESSAGES = 100;
  if (history.messages.length <= MAX_MESSAGES) return history;
  return {
    ...history,
    messages: history.messages.slice(history.messages.length - MAX_MESSAGES),
  };
}

function redactHistoryCredentials(history: AIChatHistoryFile): AIChatHistoryFile {
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
    input_schema: { type: 'object', properties: { project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } } },
  },
  {
    name: 'list_commands',
    description: 'List custom Claude CLI slash-commands stored in ~/.claude/commands/. Returns command names and their first line as description.',
    input_schema: { type: 'object', properties: { project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } } },
  },
  {
    name: 'list_skills',
    description: 'List agent skills stored in ~/.claude/skills/. Returns skill names and descriptions from SKILL.md files.',
    input_schema: { type: 'object', properties: { project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } } },
  },
  {
    name: 'get_app_config',
    description: 'Get a high-level overview of the app config: active profile name, MCP server count, command count, skill count, and agent count. No credentials returned.',
    input_schema: { type: 'object', properties: { project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } } },
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
      properties: { name: { type: 'string', description: 'Command name (without .md extension)' }, project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } },
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
        project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' },
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
        project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'delete_command',
    description: 'Delete a custom command by name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Command name to delete' }, project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } },
      required: ['name'],
    },
  },
  {
    name: 'get_skill',
    description: 'Get the full SKILL.md content for a specific skill.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Skill name' }, project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } },
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
        project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'delete_skill',
    description: 'Delete an agent skill by name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Skill name to delete' }, project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } },
      required: ['name'],
    },
  },
  {
    name: 'list_agents',
    description: 'List user agents stored in ~/.claude/agents/. Returns agent names, descriptions, and model settings.',
    input_schema: { type: 'object', properties: { project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } } },
  },
  {
    name: 'get_agent',
    description: 'Get the full content of a specific user agent by name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Agent name (without .md extension)' }, project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } },
      required: ['name'],
    },
  },
  {
    name: 'create_agent',
    description: 'Create a new user agent.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name (lowercase, numbers, hyphens, max 64 chars)' },
        content: { type: 'string', description: 'Agent content (markdown with frontmatter)' },
        project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'update_agent',
    description: 'Update an existing user agent by name. Overwrites the .md file content.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Agent name to update' },
        content: { type: 'string', description: 'New agent content (markdown with frontmatter)' },
        project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' },
      },
      required: ['name', 'content'],
    },
  },
  {
    name: 'delete_agent',
    description: 'Delete a user agent by name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Agent name to delete' }, project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } },
      required: ['name'],
    },
  },
  {
    name: 'list_plugin_agents',
    description: 'List all agents from installed plugins. Returns agent names, plugin names, marketplace names, and model settings.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_plugin_agent',
    description: 'Get the full content of a plugin agent.',
    input_schema: {
      type: 'object',
      properties: {
        installPath: { type: 'string', description: 'Plugin install path' },
        filename: { type: 'string', description: 'Agent filename (e.g. "code-reviewer.md")' },
      },
      required: ['installPath', 'filename'],
    },
  },
  {
    name: 'update_plugin_agent_model',
    description: 'Update the model setting in a plugin agent file frontmatter.',
    input_schema: {
      type: 'object',
      properties: {
        installPath: { type: 'string', description: 'Plugin install path' },
        filename: { type: 'string', description: 'Agent filename (e.g. "code-reviewer.md")' },
        model: { type: 'string', description: 'New model value (e.g. "opus", "sonnet", "inherit")' },
      },
      required: ['installPath', 'filename', 'model'],
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
    name: 'list_plugin_commands',
    description: 'List commands from installed plugins. Returns command names, filenames, plugin names, and marketplace names.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_plugin_skills',
    description: 'List skills from installed plugins. Returns skill names, plugin names, and marketplace names.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_plugin_command',
    description: 'Get the full content of a plugin command.',
    input_schema: {
      type: 'object',
      properties: {
        installPath: { type: 'string', description: 'Plugin install path' },
        filename: { type: 'string', description: 'Command filename (e.g. "code-review.md")' },
      },
      required: ['installPath', 'filename'],
    },
  },
  {
    name: 'get_plugin_skill',
    description: 'Get the full content of a plugin skill (SKILL.md).',
    input_schema: {
      type: 'object',
      properties: {
        installPath: { type: 'string', description: 'Plugin install path' },
        skillName: { type: 'string', description: 'Skill directory name (e.g. "implement-design")' },
      },
      required: ['installPath', 'skillName'],
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
        project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' },
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
        project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' },
      },
      required: ['name', 'command'],
    },
  },
  {
    name: 'remove_mcp_server',
    description: 'Remove an MCP server from ~/.claude.json config by name.',
    input_schema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Server name to remove' }, project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' } },
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
        project_path: { type: 'string', description: 'Optional project root path. If provided, operates on project-level config instead of global.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'write_local_path',
    description: 'Write text content to a local file. Supports ~ (home dir) expansion. The file must be within the home directory or the specified project directory. Creates parent directories if needed.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path or ~ relative path to write to' },
        content: { type: 'string', description: 'Text content to write' },
        project_path: { type: 'string', description: 'Optional project root path. If provided, allows writing within the project directory in addition to the home directory.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'execute_terminal_command',
    description: 'Execute a terminal/shell command on the user\'s machine. Safe read-only commands (ls, cat, git status, etc.) execute automatically. Other commands require user confirmation before execution. Use this when the user asks to run shell commands, check system state, or perform operations that need terminal access.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute (e.g. "ls -la", "git status", "npm install")' },
        working_directory: { type: 'string', description: 'Optional working directory to run the command in. Defaults to home directory. Supports ~ expansion.' },
        timeout_ms: { type: 'number', description: 'Optional timeout in milliseconds (default: 30000, max: 120000)' },
        project_path: { type: 'string', description: 'Optional project root path. If provided, uses it as the default working directory.' },
      },
      required: ['command'],
    },
  },
  {
    name: 'get_system_info',
    description: 'Get system diagnostic information: OS, Node.js version, architecture, hostname, home directory, shell, and Claude CLI version.',
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

async function handleGetMcpServerStatuses(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  try {
    const content = await fs.readFile(paths.claudeJsonPath, 'utf-8').catch(() => '{}');
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

async function handleListCommands(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  try {
    const entries = await fs.readdir(paths.commandsDir).catch(() => [] as string[]);
    const commands = [];
    for (const entry of entries.filter((e) => e.endsWith('.md'))) {
      try {
        const content = await fs.readFile(path.join(paths.commandsDir, entry), 'utf-8');
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

async function handleListSkills(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  try {
    const entries = await fs.readdir(paths.skillsDir, { withFileTypes: true }).catch(() => [] as import('fs').Dirent[]);
    const skills = [];
    for (const entry of entries.filter((e) => e.isDirectory())) {
      try {
        const skillMdPath = path.join(paths.skillsDir, entry.name, 'SKILL.md');
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

async function handleGetAppConfig(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  const creds = await getActiveProfileCredentials();
  const activeProfileName = creds ? 'Active profile found' : null;

  let mcpCount = 0;
  try {
    const content = await fs.readFile(paths.claudeJsonPath, 'utf-8').catch(() => '{}');
    const config = JSON.parse(content) as { mcpServers?: Record<string, unknown> };
    mcpCount = Object.keys(config.mcpServers || {}).length;
  } catch { /* ignore */ }

  let commandCount = 0;
  try {
    const entries = await fs.readdir(paths.commandsDir).catch(() => [] as string[]);
    commandCount = entries.filter((e) => e.endsWith('.md')).length;
  } catch { /* ignore */ }

  let skillCount = 0;
  try {
    const entries = await fs.readdir(paths.skillsDir, { withFileTypes: true }).catch(() => [] as import('fs').Dirent[]);
    skillCount = entries.filter((e) => e.isDirectory()).length;
  } catch { /* ignore */ }

  let agentCount = 0;
  try {
    const entries = await fs.readdir(paths.agentsDir).catch(() => [] as string[]);
    agentCount = entries.filter((e) => e.endsWith('.md')).length;
  } catch { /* ignore */ }

  return JSON.stringify({
    activeProfile: activeProfileName,
    mcpServers: mcpCount,
    commandCount,
    skillCount,
    agentCount,
    ...(projectPath ? { projectPath } : {}),
  });
}

async function handleStartMcpServer(input: ToolInput): Promise<string> {
  const name = input.name as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/mcp/${encodeURIComponent(name)}/start`, { method: 'POST' });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleStopMcpServer(input: ToolInput): Promise<string> {
  const name = input.name as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/mcp/${encodeURIComponent(name)}/stop`, { method: 'POST' });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleRestartMcpServer(input: ToolInput): Promise<string> {
  const name = input.name as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/mcp/${encodeURIComponent(name)}/restart`, { method: 'POST' });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleGetMcpServerLogs(input: ToolInput): Promise<string> {
  const name = input.name as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/mcp/${encodeURIComponent(name)}/logs`);
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleGetMcpRuntimeStatus(input: ToolInput): Promise<string> {
  const name = input.name as string | undefined;
  try {
    const url = name
      ? `http://localhost:3001/api/mcp/${encodeURIComponent(name)}/status`
      : 'http://localhost:3001/api/mcp/status/all';
    const resp = await fetch(url);
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleGetCommand(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  const name = input.name as string;
  try {
    const content = await fs.readFile(path.join(paths.commandsDir, `${name}.md`), 'utf-8');
    return JSON.stringify({ name, content });
  } catch {
    return JSON.stringify({ error: `Command not found: ${name}` });
  }
}

async function handleCreateCommand(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const name = input.name as string;
  const content = input.content as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/commands${projectPath ? '?projectPath=' + encodeURIComponent(projectPath) : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleUpdateCommand(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  const name = input.name as string;
  const content = input.content as string;
  try {
    await fs.writeFile(path.join(paths.commandsDir, `${name}.md`), content, 'utf-8');
    return JSON.stringify({ success: true });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleDeleteCommand(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const name = input.name as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/commands/${encodeURIComponent(name)}${projectPath ? '?projectPath=' + encodeURIComponent(projectPath) : ''}`, { method: 'DELETE' });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleGetSkill(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  const name = input.name as string;
  try {
    const content = await fs.readFile(path.join(paths.skillsDir, name, 'SKILL.md'), 'utf-8');
    return JSON.stringify({ name, content });
  } catch {
    return JSON.stringify({ error: `Skill not found: ${name}` });
  }
}

async function handleCreateSkill(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const name = input.name as string;
  const content = input.content as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/skills${projectPath ? '?projectPath=' + encodeURIComponent(projectPath) : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleDeleteSkill(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const name = input.name as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/skills/${encodeURIComponent(name)}${projectPath ? '?projectPath=' + encodeURIComponent(projectPath) : ''}`, { method: 'DELETE' });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleListAgents(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  try {
    const entries = await fs.readdir(paths.agentsDir).catch(() => [] as string[]);
    const agents = [];
    for (const entry of entries.filter((e) => e.endsWith('.md'))) {
      try {
        const content = await fs.readFile(path.join(paths.agentsDir, entry), 'utf-8');
        const parsed = parseFrontmatter(content);
        agents.push({
          name: entry.replace(/\.md$/, ''),
          description: parsed.frontmatter.description || '',
          model: parsed.frontmatter.model || '',
        });
      } catch {
        agents.push({ name: entry.replace(/\.md$/, ''), description: '', model: '' });
      }
    }
    return JSON.stringify({ agents, count: agents.length });
  } catch {
    return JSON.stringify({ agents: [], count: 0 });
  }
}

async function handleGetAgent(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  const name = input.name as string;
  try {
    const content = await fs.readFile(path.join(paths.agentsDir, `${name}.md`), 'utf-8');
    return JSON.stringify({ name, content });
  } catch {
    return JSON.stringify({ error: `Agent not found: ${name}` });
  }
}

async function handleCreateAgent(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const name = input.name as string;
  const content = input.content as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/agents${projectPath ? '?projectPath=' + encodeURIComponent(projectPath) : ''}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleUpdateAgent(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  const name = input.name as string;
  const content = input.content as string;
  try {
    const filePath = path.join(paths.agentsDir, `${name}.md`);
    await fs.access(filePath);
    await fs.writeFile(filePath, content, 'utf-8');
    return JSON.stringify({ success: true });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleDeleteAgent(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const name = input.name as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/agents/${encodeURIComponent(name)}${projectPath ? '?projectPath=' + encodeURIComponent(projectPath) : ''}`, { method: 'DELETE' });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleListPluginAgents(_input: ToolInput): Promise<string> {
  try {
    const resp = await fetch('http://localhost:3001/api/plugins/installed-details');
    const data: unknown = await resp.json();
    if (!resp.ok) {
      const errorObj = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
      const errMsg = typeof errorObj.error === 'string' ? errorObj.error : `HTTP ${resp.status}`;
      throw new Error(errMsg);
    }

    const root = typeof data === 'object' && data !== null ? data as Record<string, unknown> : null;
    const plugins: unknown[] = Array.isArray(root?.plugins)
      ? root.plugins as unknown[]
      : (Array.isArray(data) ? data as unknown[] : []);

    const agents: Array<{
      name: string;
      filename: string;
      model: string;
      pluginName: string;
      marketplaceName: string;
      installPath: string;
    }> = [];

    for (const plugin of plugins) {
      if (typeof plugin !== 'object' || plugin === null) continue;
      const pluginObj = plugin as Record<string, unknown>;
      const installPath = typeof pluginObj.installPath === 'string' ? pluginObj.installPath : '';
      const pluginName = typeof pluginObj.pluginName === 'string'
        ? pluginObj.pluginName
        : (typeof pluginObj.name === 'string' ? pluginObj.name : '');
      const marketplaceName = typeof pluginObj.marketplaceName === 'string' ? pluginObj.marketplaceName : '';
      const pluginAgents = Array.isArray(pluginObj.agents) ? pluginObj.agents : [];

      for (const pluginAgent of pluginAgents) {
        if (typeof pluginAgent !== 'object' || pluginAgent === null) continue;
        const agentObj = pluginAgent as Record<string, unknown>;
        const filename = typeof agentObj.filename === 'string'
          ? agentObj.filename
          : (typeof agentObj.fileName === 'string' ? agentObj.fileName : '');
        if (!filename || !installPath) continue;
        const name = typeof agentObj.name === 'string' ? agentObj.name : filename.replace(/\.md$/, '');
        const model = typeof agentObj.model === 'string' ? agentObj.model : '';
        agents.push({ name, filename, model, pluginName, marketplaceName, installPath });
      }
    }

    return JSON.stringify({ agents, count: agents.length });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleGetPluginAgent(input: ToolInput): Promise<string> {
  const installPath = input.installPath as string;
  const filename = input.filename as string;
  try {
    const filePath = path.join(installPath, 'agents', filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.stringify({ name: filename.replace(/\.md$/, ''), content });
  } catch {
    return JSON.stringify({ error: `Plugin agent not found: ${filename}` });
  }
}

async function handleUpdatePluginAgentModel(input: ToolInput): Promise<string> {
  const installPath = input.installPath as string;
  const filename = input.filename as string;
  const model = input.model as string;
  try {
    const filePath = path.join(installPath, 'agents', filename);
    const content = await fs.readFile(filePath, 'utf-8');
    let updated: string;
    const fmMatch = content.match(/^(---\s*\n)([\s\S]*?)(\n---\s*\n)([\s\S]*)$/);
    if (fmMatch) {
      const fmContent = fmMatch[2];
      if (/^model\s*:/m.test(fmContent)) {
        const newFm = fmContent.replace(/^model\s*:.*$/m, `model: ${model}`);
        updated = fmMatch[1] + newFm + fmMatch[3] + fmMatch[4];
      } else {
        updated = fmMatch[1] + fmContent + `\nmodel: ${model}` + fmMatch[3] + fmMatch[4];
      }
    } else {
      updated = `---\nmodel: ${model}\n---\n\n${content}`;
    }
    await fs.writeFile(filePath, updated, 'utf-8');
    return JSON.stringify({ success: true, message: `Updated model to '${model}' for ${filename}` });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleDeleteEnvironment(input: ToolInput): Promise<string> {
  const id = input.id as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/env-profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleReorderEnvironments(input: ToolInput): Promise<string> {
  const ids = input.ids as string[];
  try {
    const resp = await fetch('http://localhost:3001/api/env-profiles/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleListMarketplaces(_input: ToolInput): Promise<string> {
  try {
    const resp = await fetch('http://localhost:3001/api/plugins/marketplaces');
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleAddMarketplace(input: ToolInput): Promise<string> {
  const url = input.url as string;
  try {
    const resp = await fetch('http://localhost:3001/api/plugins/marketplaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleRemoveMarketplace(input: ToolInput): Promise<string> {
  const name = input.name as string;
  try {
    const resp = await fetch(`http://localhost:3001/api/plugins/marketplaces/${encodeURIComponent(name)}`, { method: 'DELETE' });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleListInstalledPlugins(_input: ToolInput): Promise<string> {
  try {
    const resp = await fetch('http://localhost:3001/api/plugins/installed-details');
    const data = await resp.json();
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleInstallPlugin(input: ToolInput): Promise<string> {
  const marketplaceName = input.marketplaceName as string;
  const pluginName = input.pluginName as string;
  try {
    const resp = await fetch('http://localhost:3001/api/plugins/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketplace: marketplaceName, plugin: pluginName }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleUninstallPlugin(input: ToolInput): Promise<string> {
  const marketplaceName = input.marketplaceName as string;
  const pluginName = input.pluginName as string;
  try {
    const resp = await fetch('http://localhost:3001/api/plugins/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketplace: marketplaceName, plugin: pluginName }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data?.error || data?.message || `HTTP ${resp.status}`);
    return JSON.stringify(data);
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleListPluginCommands(_input: ToolInput): Promise<string> {
  try {
    const resp = await fetch('http://localhost:3001/api/plugins/installed-details');
    const data: unknown = await resp.json();
    if (!resp.ok) {
      const errorObj = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
      const errMsg = typeof errorObj.error === 'string' ? errorObj.error : `HTTP ${resp.status}`;
      throw new Error(errMsg);
    }

    const root = typeof data === 'object' && data !== null ? data as Record<string, unknown> : null;
    const plugins: unknown[] = Array.isArray(root?.plugins)
      ? root.plugins as unknown[]
      : (Array.isArray(data) ? data as unknown[] : []);

    const commands: Array<{
      name: string;
      filename: string;
      pluginName: string;
      marketplaceName: string;
      installPath: string;
    }> = [];

    for (const plugin of plugins) {
      if (typeof plugin !== 'object' || plugin === null) continue;
      const pluginObj = plugin as Record<string, unknown>;
      const installPath = typeof pluginObj.installPath === 'string' ? pluginObj.installPath : '';
      const pluginName = typeof pluginObj.pluginName === 'string'
        ? pluginObj.pluginName
        : (typeof pluginObj.name === 'string' ? pluginObj.name : '');
      const marketplaceName = typeof pluginObj.marketplaceName === 'string' ? pluginObj.marketplaceName : '';
      const pluginCommands = Array.isArray(pluginObj.commands) ? pluginObj.commands : [];

      for (const cmd of pluginCommands) {
        if (typeof cmd !== 'object' || cmd === null) continue;
        const cmdObj = cmd as Record<string, unknown>;
        const filename = typeof cmdObj.filename === 'string' ? cmdObj.filename : '';
        if (!filename || !installPath) continue;
        const name = typeof cmdObj.name === 'string' ? cmdObj.name : filename.replace(/\.md$/, '');
        commands.push({ name, filename, pluginName, marketplaceName, installPath });
      }
    }

    return JSON.stringify({ commands, count: commands.length });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleListPluginSkills(_input: ToolInput): Promise<string> {
  try {
    const resp = await fetch('http://localhost:3001/api/plugins/installed-details');
    const data: unknown = await resp.json();
    if (!resp.ok) {
      const errorObj = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
      const errMsg = typeof errorObj.error === 'string' ? errorObj.error : `HTTP ${resp.status}`;
      throw new Error(errMsg);
    }

    const root = typeof data === 'object' && data !== null ? data as Record<string, unknown> : null;
    const plugins: unknown[] = Array.isArray(root?.plugins)
      ? root.plugins as unknown[]
      : (Array.isArray(data) ? data as unknown[] : []);

    const skills: Array<{
      name: string;
      pluginName: string;
      marketplaceName: string;
      installPath: string;
    }> = [];

    for (const plugin of plugins) {
      if (typeof plugin !== 'object' || plugin === null) continue;
      const pluginObj = plugin as Record<string, unknown>;
      const installPath = typeof pluginObj.installPath === 'string' ? pluginObj.installPath : '';
      const pluginName = typeof pluginObj.pluginName === 'string'
        ? pluginObj.pluginName
        : (typeof pluginObj.name === 'string' ? pluginObj.name : '');
      const marketplaceName = typeof pluginObj.marketplaceName === 'string' ? pluginObj.marketplaceName : '';
      const pluginSkills = Array.isArray(pluginObj.skills) ? pluginObj.skills : [];

      for (const skill of pluginSkills) {
        if (typeof skill !== 'object' || skill === null) continue;
        const skillObj = skill as Record<string, unknown>;
        const name = typeof skillObj.name === 'string' ? skillObj.name : '';
        if (!name) continue;
        skills.push({ name, pluginName, marketplaceName, installPath });
      }
    }

    return JSON.stringify({ skills, count: skills.length });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleGetPluginCommand(input: ToolInput): Promise<string> {
  const installPath = input.installPath as string;
  const filename = input.filename as string;
  try {
    const filePath = path.join(installPath, 'commands', filename);
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.stringify({ name: filename.replace(/\.md$/, ''), content });
  } catch {
    return JSON.stringify({ error: `Plugin command not found: ${filename}` });
  }
}

async function handleGetPluginSkill(input: ToolInput): Promise<string> {
  const installPath = input.installPath as string;
  const skillName = input.skillName as string;
  try {
    const filePath = path.join(installPath, 'skills', skillName, 'SKILL.md');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.stringify({ name: skillName, content });
  } catch {
    return JSON.stringify({ error: `Plugin skill not found: ${skillName}` });
  }
}

async function handleReadLocalPath(input: ToolInput): Promise<string> {
  // [Mi4] Type guard — reject non-string path early
  if (typeof input.path !== 'string' || input.path.trim() === '') {
    return JSON.stringify({ error: 'Invalid path: must be a non-empty string' });
  }

  const rawPath = input.path;
  // [C2] Clamp max_bytes to [1, 1MB] to prevent huge Buffer allocations
  const maxBytes =
    typeof input.max_bytes === 'number'
      ? Math.min(Math.max(1, Math.floor(input.max_bytes)), 1_048_576)
      : 32_768;

  // [M1] Expand ~ correctly: slice(2) to remove '~/' prefix (not slice(1))
  let targetPath: string;
  if (rawPath === '~') {
    targetPath = HOME_DIR;
  } else if (rawPath.startsWith('~/') || rawPath.startsWith('~\\')) {
    targetPath = path.join(HOME_DIR, rawPath.slice(2));
  } else {
    targetPath = rawPath;
  }

  // [C1] Resolve symlinks and verify the path stays within HOME_DIR
  let resolvedPath: string;
  try {
    resolvedPath = await fs.realpath(targetPath);
  } catch {
    // realpath fails when path does not exist
    return JSON.stringify({ error: 'Path not found: path does not exist or is inaccessible' });
  }

  const normalizedHome = path.normalize(HOME_DIR);
  const isUnderHome =
    resolvedPath === normalizedHome ||
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
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
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
        } finally {
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
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return JSON.stringify({ error: 'Path not found' });
    if (e.code === 'EACCES') return JSON.stringify({ error: 'Permission denied' });
    if (e.code === 'EMFILE') return JSON.stringify({ error: 'Too many open files, please retry' });
    if (e.code === 'ENOTDIR') return JSON.stringify({ error: 'Path component is not a directory' });
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleGetCurrentDatetime(_input: ToolInput): Promise<string> {
  return JSON.stringify({
    dateTime: new Date().toLocaleString(),
    iso: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: Date.now(),
  });
}

async function handleUpdateSkill(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  const name = input.name as string;
  const content = input.content as string;
  try {
    const skillPath = path.join(paths.skillsDir, name, 'SKILL.md');
    // Check skill exists
    try {
      await fs.access(skillPath);
    } catch {
      return JSON.stringify({ error: `Skill not found: ${name}` });
    }
    await fs.writeFile(skillPath, content, 'utf-8');
    return JSON.stringify({ success: true, message: `Updated skill: ${name}` });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleAddMcpServer(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  const name = input.name as string;
  const command = input.command as string;
  const args = (input.args as string[]) || [];
  const env = (input.env as Record<string, string>) || undefined;
  try {
    const content = await fs.readFile(paths.claudeJsonPath, 'utf-8').catch(() => '{}');
    const config = JSON.parse(content) as { mcpServers?: Record<string, unknown>; [key: string]: unknown };
    if (!config.mcpServers) config.mcpServers = {};
    if (config.mcpServers[name]) {
      return JSON.stringify({ error: `MCP server already exists: ${name}` });
    }
    const entry: { command: string; args: string[]; env?: Record<string, string> } = { command, args };
    if (env) entry.env = env;
    config.mcpServers[name] = entry;
    await fs.writeFile(paths.claudeJsonPath, JSON.stringify(config, null, 2), 'utf-8');
    return JSON.stringify({ success: true, message: `Added MCP server: ${name}` });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleRemoveMcpServer(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  const name = input.name as string;
  try {
    const content = await fs.readFile(paths.claudeJsonPath, 'utf-8').catch(() => '{}');
    const config = JSON.parse(content) as { mcpServers?: Record<string, unknown>; [key: string]: unknown };
    if (!config.mcpServers || !config.mcpServers[name]) {
      return JSON.stringify({ error: `MCP server not found: ${name}` });
    }
    delete config.mcpServers[name];
    await fs.writeFile(paths.claudeJsonPath, JSON.stringify(config, null, 2), 'utf-8');
    return JSON.stringify({ success: true, message: `Removed MCP server: ${name}` });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleUpdateMcpServer(input: ToolInput): Promise<string> {
  const projectPath = input.project_path as string | undefined;
  const paths = resolveProjectPaths(projectPath);
  const name = input.name as string;
  try {
    const content = await fs.readFile(paths.claudeJsonPath, 'utf-8').catch(() => '{}');
    const config = JSON.parse(content) as { mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>; [key: string]: unknown };
    if (!config.mcpServers || !config.mcpServers[name]) {
      return JSON.stringify({ error: `MCP server not found: ${name}` });
    }
    const server = config.mcpServers[name];
    if (input.command !== undefined) server.command = input.command as string;
    if (input.args !== undefined) server.args = input.args as string[];
    if (input.env !== undefined) server.env = input.env as Record<string, string>;
    config.mcpServers[name] = server;
    await fs.writeFile(paths.claudeJsonPath, JSON.stringify(config, null, 2), 'utf-8');
    return JSON.stringify({ success: true, message: `Updated MCP server: ${name}` });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}

async function handleWriteLocalPath(input: ToolInput): Promise<string> {
  if (typeof input.path !== 'string' || input.path.trim() === '') {
    return JSON.stringify({ error: 'Invalid path: must be a non-empty string' });
  }
  if (typeof input.content !== 'string') {
    return JSON.stringify({ error: 'Invalid content: must be a string' });
  }

  const rawPath = input.path;
  const content = input.content;
  const projectPath = typeof input.project_path === 'string' ? input.project_path : undefined;

  // Reject content larger than 1MB
  if (Buffer.byteLength(content, 'utf-8') > 1_048_576) {
    return JSON.stringify({ error: 'Content too large: maximum size is 1MB' });
  }

  // Expand ~ paths
  let targetPath: string;
  if (rawPath === '~') {
    return JSON.stringify({ error: 'Cannot write to home directory itself' });
  } else if (rawPath.startsWith('~/') || rawPath.startsWith('~\\')) {
    targetPath = path.join(HOME_DIR, rawPath.slice(2));
  } else {
    targetPath = rawPath;
  }

  // Security check: verify parent directory is under HOME_DIR or project_path
  const parentDir = path.dirname(targetPath);
  let resolvedParent: string;
  try {
    // Create parent dirs first so realpath can resolve
    await fs.mkdir(parentDir, { recursive: true });
    resolvedParent = await fs.realpath(parentDir);
  } catch {
    return JSON.stringify({ error: 'Cannot create or resolve parent directory' });
  }

  const normalizedHome = path.normalize(HOME_DIR);
  const isUnderHome =
    resolvedParent === normalizedHome ||
    resolvedParent.startsWith(normalizedHome + path.sep);

  let isUnderProject = false;
  if (projectPath) {
    try {
      const resolvedProject = path.resolve(projectPath);
      const realProject = await fs.realpath(resolvedProject);
      isUnderProject =
        resolvedParent === realProject ||
        resolvedParent.startsWith(realProject + path.sep);
    } catch {
      // Project path doesn't exist or can't be resolved — ignore
    }
  }

  if (!isUnderHome && !isUnderProject) {
    return JSON.stringify({ error: 'Access denied: path must be within the home directory or the project directory' });
  }

  try {
    const resolvedTarget = path.join(resolvedParent, path.basename(targetPath));
    await fs.writeFile(resolvedTarget, content, 'utf-8');
    return JSON.stringify({ success: true, path: resolvedTarget, size: Buffer.byteLength(content, 'utf-8') });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message });
  }
}


// ============================================================
// Terminal command execution
// ============================================================

// Whitelist of command prefixes that are safe to auto-execute without user confirmation.
// These are read-only / informational commands that don't modify system state.
const TERMINAL_COMMAND_WHITELIST: string[] = [
  // File system inspection (read-only)
  'ls', 'dir', 'pwd', 'find', 'which', 'whereis', 'file', 'stat', 'du', 'df',
  'wc', 'head', 'tail', 'cat', 'less', 'more', 'tree',
  // Text search / processing (read-only)
  'grep', 'rg', 'ag', 'ack', 'sed -n', 'awk',
  // Git inspection (read-only)
  'git status', 'git log', 'git diff', 'git branch', 'git remote', 'git tag',
  'git show', 'git blame', 'git shortlog', 'git stash list', 'git rev-parse',
  'git config --get', 'git config --list', 'git ls-files', 'git describe',
  // Package manager inspection (read-only)
  'npm list', 'npm ls', 'npm view', 'npm outdated', 'npm config list',
  'yarn list', 'yarn info', 'yarn why',
  'pip list', 'pip show', 'pip freeze',
  'cargo metadata',
  // System info (read-only)
  'echo', 'date', 'uptime', 'whoami', 'hostname', 'uname', 'env', 'printenv',
  'node --version', 'npm --version', 'python --version', 'pip --version',
  'java -version', 'go version', 'rustc --version', 'cargo --version',
  // Process inspection (read-only)
  'ps', 'top -l 1', 'lsof',
  // Network inspection (read-only)
  'curl -I', 'curl --head', 'ping -c', 'dig', 'nslookup', 'host',
];

/**
 * Check if a command matches the auto-execute whitelist.
 * The command is trimmed and compared against whitelist prefixes.
 */
function isWhitelistedCommand(command: string): boolean {
  const trimmed = command.trim();
  return TERMINAL_COMMAND_WHITELIST.some(prefix => {
    // Exact match or prefix match followed by space/end
    if (trimmed === prefix) return true;
    if (trimmed.startsWith(prefix + ' ')) return true;
    // Handle piped commands: only check the first command in the pipeline
    return false;
  });
}

// Map to hold pending command confirmations: requestId -> { resolve, reject, command, cwd }
const pendingCommandConfirmations = new Map<string, {
  resolve: (approved: boolean) => void;
  command: string;
  cwd: string;
}>();

/**
 * Execute a terminal command with timeout and output limits.
 */
async function executeShellCommand(command: string, cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const { exec } = await import('child_process');
  return new Promise((resolve) => {
    const child = exec(command, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 1_048_576, // 1MB max output
      shell: process.env.SHELL || '/bin/sh',
      env: { ...process.env },
    }, (error, stdout, stderr) => {
      const exitCode = error ? (error as NodeJS.ErrnoException & { code?: number | string }).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? -2 : (child.exitCode ?? 1) : 0;
      // Truncate output if too large
      const maxOutput = 65_536; // 64KB per stream
      const truncatedStdout = stdout.length > maxOutput ? stdout.slice(0, maxOutput) + '\n... [output truncated]' : stdout;
      const truncatedStderr = stderr.length > maxOutput ? stderr.slice(0, maxOutput) + '\n... [output truncated]' : stderr;
      resolve({
        stdout: truncatedStdout,
        stderr: truncatedStderr,
        exitCode: typeof exitCode === 'number' ? exitCode : 1,
      });
    });
  });
}

/** Resolve working directory for terminal commands */
function resolveCommandCwd(input: ToolInput): string {
  const workingDir = typeof input.working_directory === 'string' ? input.working_directory : undefined;
  const projectPath = typeof input.project_path === 'string' ? input.project_path : undefined;

  if (workingDir) {
    if (workingDir === '~') return HOME_DIR;
    if (workingDir.startsWith('~/') || workingDir.startsWith('~\\')) {
      return path.join(HOME_DIR, workingDir.slice(2));
    }
    return path.resolve(workingDir);
  }
  if (projectPath) {
    return path.resolve(projectPath);
  }
  return HOME_DIR;
}

async function handleExecuteTerminalCommand(command: string, cwd: string, timeoutMs: number): Promise<string> {
  if (!command.trim()) {
    return JSON.stringify({ error: 'Command cannot be empty' });
  }

  try {
    // Verify cwd exists
    await fs.access(cwd);
  } catch {
    return JSON.stringify({ error: `Working directory does not exist: ${cwd}` });
  }

  try {
    const result = await executeShellCommand(command, cwd, timeoutMs);
    return JSON.stringify({
      command,
      workingDirectory: cwd,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      ...(result.exitCode === -2 ? { warning: 'Output was truncated due to size limits' } : {}),
    });
  } catch (err) {
    return JSON.stringify({ error: (err as Error).message, command });
  }
}


async function handleGetSystemInfo(_input: ToolInput): Promise<string> {
  let claudeVersion = 'unknown';
  try {
    const { execSync } = await import('child_process');
    claudeVersion = execSync('claude --version 2>/dev/null || echo "not installed"', { encoding: 'utf-8' }).trim();
  } catch { claudeVersion = 'not installed'; }

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
    case 'list_agents': return handleListAgents(input);
    case 'get_agent': return handleGetAgent(input);
    case 'create_agent': return handleCreateAgent(input);
    case 'update_agent': return handleUpdateAgent(input);
    case 'delete_agent': return handleDeleteAgent(input);
    case 'list_plugin_agents': return handleListPluginAgents(input);
    case 'get_plugin_agent': return handleGetPluginAgent(input);
    case 'update_plugin_agent_model': return handleUpdatePluginAgentModel(input);
    case 'delete_environment': return handleDeleteEnvironment(input);
    case 'reorder_environments': return handleReorderEnvironments(input);
    case 'list_marketplaces': return handleListMarketplaces(input);
    case 'list_installed_plugins': return handleListInstalledPlugins(input);
    case 'install_plugin': return handleInstallPlugin(input);
    case 'uninstall_plugin': return handleUninstallPlugin(input);
    case 'add_marketplace': return handleAddMarketplace(input);
    case 'remove_marketplace': return handleRemoveMarketplace(input);
    case 'list_plugin_commands': return handleListPluginCommands(input);
    case 'list_plugin_skills': return handleListPluginSkills(input);
    case 'get_plugin_command': return handleGetPluginCommand(input);
    case 'get_plugin_skill': return handleGetPluginSkill(input);
    case 'read_local_path': return handleReadLocalPath(input);
    case 'get_current_datetime': return handleGetCurrentDatetime(input);
    case 'update_skill': return handleUpdateSkill(input);
    case 'add_mcp_server': return handleAddMcpServer(input);
    case 'remove_mcp_server': return handleRemoveMcpServer(input);
    case 'update_mcp_server': return handleUpdateMcpServer(input);
    case 'write_local_path': return handleWriteLocalPath(input);
    case 'get_system_info': return handleGetSystemInfo(input);
    case 'execute_terminal_command': {
      const command = typeof input.command === 'string' ? input.command : '';
      const cwd = resolveCommandCwd(input);
      const timeoutMs = typeof input.timeout_ms === 'number' ? Math.min(Math.max(1000, input.timeout_ms), 120_000) : 30_000;
      return handleExecuteTerminalCommand(command, cwd, timeoutMs);
    }
    default: return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
