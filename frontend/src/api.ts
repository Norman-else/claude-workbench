import type {
  ClaudeConfig,
  CommandFile,
  EnvProfile,
  EnvProfileForm,
  McpLogsResponse,
  McpStatus,
  ShellConfigContentResponse,
  Skill,
  Agent,
  MarketplaceInfo,
  InstalledPluginDetails,
  MarketplacePluginDetails,
  AIChatHistory,
  AIChatMessage,
  AIModelOption,
  AIToolInfo,
  AIConversation,
  SavedProject,
  TerminalConfirmCommandsResponse,
} from './types';
async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (typeof data?.details === 'string' && data.details.trim()) return data.details;
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
    if (typeof data?.message === 'string' && data.message.trim()) return data.message;
  } catch {
  }
  return `${response.status} ${response.statusText}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json() as Promise<T>;
}

async function requestVoid(url: string, init?: RequestInit): Promise<void> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
}

function withProjectPath(url: string, projectPath?: string): string {
  if (!projectPath) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}projectPath=${encodeURIComponent(projectPath)}`;
}

// Project management
export async function getProjects(): Promise<SavedProject[]> {
  const data = await requestJson<{ projects: SavedProject[] }>('/api/projects');
  return data.projects || [];
}

export async function addProject(projectPath: string): Promise<SavedProject> {
  const data = await requestJson<{ project: SavedProject }>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: projectPath }),
  });
  return data.project;
}

export async function removeProject(projectPath: string): Promise<void> {
  await requestVoid(`/api/projects/${btoa(projectPath)}`, { method: 'DELETE' });
}

export async function validateProjectPath(projectPath: string): Promise<{ exists: boolean; hasClaude: boolean }> {
  return requestJson<{ exists: boolean; hasClaude: boolean }>(`/api/projects/validate?path=${encodeURIComponent(projectPath)}`);
}

// Directory browsing
export interface FileEntry {
  name: string;
  isDirectory: boolean;
  path: string;
}

export interface DefaultPaths {
  homeDir: string;
  homeDirSymbol: string;
  platform: 'windows' | 'unix';
  quickPaths: Record<string, string>;
  drives?: string[];
}

export async function listFiles(directory: string): Promise<{ files: FileEntry[]; directory: string }> {
  return requestJson<{ files: FileEntry[]; directory: string }>('/api/list-files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directory }),
  });
}

export async function getDefaultPaths(): Promise<DefaultPaths> {
  return requestJson<DefaultPaths>('/api/default-paths');
}

export async function getClaudeConfig(projectPath?: string): Promise<ClaudeConfig> {
  return requestJson<ClaudeConfig>(withProjectPath('/api/claude-config', projectPath));
}

export async function saveClaudeConfig(config: ClaudeConfig, projectPath?: string): Promise<void> {
  await requestVoid(withProjectPath('/api/claude-config', projectPath), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
}

export async function getEnvProfiles(): Promise<{ profiles: EnvProfile[]; activeProfileId: string | null }> {
  const data = await requestJson<{ profiles?: EnvProfile[]; activeProfileId?: string | null }>('/api/env-profiles');
  return {
    profiles: data.profiles || [],
    activeProfileId: data.activeProfileId || null,
  };
}

export async function createEnvProfile(form: EnvProfileForm): Promise<EnvProfile> {
  return requestJson<EnvProfile>('/api/env-profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
  });
}

export async function updateEnvProfile(id: string, profile: EnvProfile): Promise<EnvProfile> {
  return requestJson<EnvProfile>(`/api/env-profiles/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
}

export async function deleteEnvProfile(id: string): Promise<void> {
  await requestVoid(`/api/env-profiles/${id}`, { method: 'DELETE' });
}

export async function activateEnvProfile(id: string): Promise<{ message?: string }> {
  return requestJson<{ message?: string }>(`/api/env-profiles/${id}/activate`, { method: 'POST' });
}

export async function deactivateEnvProfile(id: string): Promise<{ message?: string }> {
  return requestJson<{ message?: string }>(`/api/env-profiles/${id}/deactivate`, { method: 'POST' });
}
export async function reorderEnvProfiles(orderedIds: string[]): Promise<void> {
  await requestVoid('/api/env-profiles/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderedIds }),
  });
}

export async function getCommands(projectPath?: string): Promise<CommandFile[]> {
  return requestJson<CommandFile[]>(withProjectPath('/api/commands', projectPath));
}

export async function saveCommand(cmd: CommandFile, projectPath?: string): Promise<void> {
  await requestVoid(withProjectPath('/api/commands', projectPath), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
}

export async function deleteCommand(name: string, projectPath?: string): Promise<void> {
  await requestVoid(withProjectPath(`/api/commands/${name}`, projectPath), { method: 'DELETE' });
}

export async function getSkills(projectPath?: string): Promise<Skill[]> {
  return requestJson<Skill[]>(withProjectPath('/api/skills', projectPath));
}

export async function saveSkill(skill: Pick<Skill, 'name' | 'content'>, projectPath?: string): Promise<void> {
  await requestVoid(withProjectPath('/api/skills', projectPath), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skill),
  });
}

export async function deleteSkill(name: string, projectPath?: string): Promise<void> {
  await requestVoid(withProjectPath(`/api/skills/${name}`, projectPath), { method: 'DELETE' });
}

export async function getAgents(projectPath?: string): Promise<Agent[]> {
  return requestJson<Agent[]>(withProjectPath('/api/agents', projectPath));
}

export async function saveAgent(agent: Pick<Agent, 'name' | 'content'>, projectPath?: string): Promise<void> {
  await requestVoid(withProjectPath('/api/agents', projectPath), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(agent),
  });
}

export async function deleteAgent(name: string, projectPath?: string): Promise<void> {
  await requestVoid(withProjectPath(`/api/agents/${name}`, projectPath), { method: 'DELETE' });
}

export function getPluginAgentContent(installPath: string, filename: string): Promise<{ content: string }> {
  return requestJson(`/api/plugins/agent-content?installPath=${encodeURIComponent(installPath)}&filename=${encodeURIComponent(filename)}`);
}

export function getPluginSkillContent(installPath: string, skillName: string): Promise<{ content: string }> {
  return requestJson(`/api/plugins/skill-content?installPath=${encodeURIComponent(installPath)}&skillName=${encodeURIComponent(skillName)}`);
}

export async function startMcpServer(name: string): Promise<{ pid?: number; logs?: unknown[]; details?: string; error?: string }> {
  return requestJson<{ pid?: number; logs?: unknown[]; details?: string; error?: string }>(`/api/mcp/${name}/start`, { method: 'POST' });
}

export async function stopMcpServer(name: string): Promise<{ error?: string }> {
  return requestJson<{ error?: string }>(`/api/mcp/${name}/stop`, { method: 'POST' });
}

export async function restartMcpServer(name: string): Promise<{ pid?: number; error?: string }> {
  return requestJson<{ pid?: number; error?: string }>(`/api/mcp/${name}/restart`, { method: 'POST' });
}

export async function getAllMcpStatuses(): Promise<Record<string, McpStatus>> {
  return requestJson<Record<string, McpStatus>>('/api/mcp/status/all');
}

export async function getMcpLogs(name: string, limit = 50): Promise<McpLogsResponse> {
  return requestJson<McpLogsResponse>(`/api/mcp/${name}/logs?limit=${limit}`);
}

export async function clearMcpLogs(name: string): Promise<void> {
  await requestVoid(`/api/mcp/${name}/logs/clear`, { method: 'POST' });
}

export async function getShellConfigContent(): Promise<ShellConfigContentResponse> {
  return requestJson<ShellConfigContentResponse>('/api/shell-config-content');
}

export async function saveShellConfigContent(content: string): Promise<void> {
  await requestVoid('/api/shell-config-content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
}

export async function getClaudeSettingsContent(): Promise<ShellConfigContentResponse> {
  return requestJson<ShellConfigContentResponse>('/api/claude-settings-content');
}

export async function saveClaudeSettingsContent(content: string): Promise<void> {
  await requestVoid('/api/claude-settings-content', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) });
}

export async function getMarketplaces(): Promise<(MarketplaceInfo & { installedPlugins: Record<string, unknown[]> })[]> {
  return requestJson<(MarketplaceInfo & { installedPlugins: Record<string, unknown[]> })[]>('/api/plugins/marketplaces');
}

export async function addMarketplace(url: string): Promise<MarketplaceInfo> {
  return requestJson<MarketplaceInfo>('/api/plugins/marketplaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

export async function updateMarketplace(name: string): Promise<MarketplaceInfo> {
  return requestJson<MarketplaceInfo>(`/api/plugins/marketplaces/${encodeURIComponent(name)}/update`, {
    method: 'POST',
  });
}

export async function removeMarketplace(name: string): Promise<void> {
  await requestVoid(`/api/plugins/marketplaces/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function installPlugin(marketplace: string, plugin: string): Promise<{ success: boolean; installPath?: string; alreadyInstalled?: boolean }> {
  return requestJson<{ success: boolean; installPath?: string; alreadyInstalled?: boolean }>('/api/plugins/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ marketplace, plugin }),
  });
}

export async function uninstallPlugin(marketplace: string, plugin: string): Promise<void> {
  await requestVoid('/api/plugins/uninstall', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ marketplace, plugin }),
  });
}

export function getInstalledPluginDetails(): Promise<InstalledPluginDetails[]> {
  return requestJson('/api/plugins/installed-details');
}

export function getMarketplacePluginDetails(marketplace: string, plugin: string): Promise<MarketplacePluginDetails> {
  return requestJson(`/api/plugins/marketplace-plugin-details?marketplace=${encodeURIComponent(marketplace)}&plugin=${encodeURIComponent(plugin)}`);
}


export function getPluginCommandContent(installPath: string, filename: string): Promise<{ content: string }> {
  return requestJson(`/api/plugins/command-content?installPath=${encodeURIComponent(installPath)}&filename=${encodeURIComponent(filename)}`);
}


// AI Assistant API
export function streamAIChat(
  message: string,
  model: string,
  signal?: AbortSignal,
  forceTool?: string
): Promise<Response> {
  return fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, model, ...(forceTool ? { forceTool } : {}) }),
    signal,
  });
}

export async function getAIChatHistory(): Promise<AIChatHistory> {
  return requestJson<AIChatHistory>('/api/ai/history');
}

export async function clearAIChatHistory(): Promise<void> {
  await requestVoid('/api/ai/history', { method: 'DELETE' });
}

export async function getAvailableModels(): Promise<AIModelOption[]> {
  return requestJson<AIModelOption[]>('/api/ai/models');
}

export async function getAITools(): Promise<AIToolInfo[]> {
  return requestJson<AIToolInfo[]>('/api/ai/tools');
}

// Multi-conversation API
export async function getConversations(): Promise<AIConversation[]> {
  const data = await requestJson<{ conversations: AIConversation[] }>('/api/ai/conversations');
  return data.conversations;
}

export async function createConversation(projectPath?: string): Promise<AIConversation> {
  return requestJson<AIConversation>('/api/ai/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectPath ? { projectPath } : {}),
  });
}

export async function getConversation(id: string): Promise<{ id: string; name: string; messages: AIChatMessage[]; createdAt: string; updatedAt: string }> {
  return requestJson('/api/ai/conversations/' + id);
}

export async function deleteConversation(id: string): Promise<void> {
  await requestVoid('/api/ai/conversations/' + id, { method: 'DELETE' });
}

export async function renameConversation(id: string, name: string): Promise<AIConversation> {
  return requestJson<AIConversation>('/api/ai/conversations/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export async function updateConversationProject(id: string, projectPath: string | null): Promise<AIConversation> {
  return requestJson<AIConversation>('/api/ai/conversations/' + id, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectPath }),
  });
}

export function streamConversationChat(
  conversationId: string,
  message: string,
  model: string,
  signal?: AbortSignal,
  forceTool?: string,
  attachments?: Array<{ name: string; mediaType: string; data: string }>,
  projectPath?: string
): Promise<Response> {
  return fetch('/api/ai/conversations/' + conversationId + '/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, model, ...(forceTool ? { forceTool } : {}), ...(attachments && attachments.length > 0 ? { attachments } : {}), ...(projectPath ? { projectPath } : {}) }),
    signal,
  });
}

export async function generateConversationName(conversationId: string, model: string): Promise<string> {
  const data = await requestJson<{ name: string }>('/api/ai/conversations/' + conversationId + '/generate-name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model }),
  });
  return data.name;
}

export async function confirmTerminalCommand(conversationId: string, requestId: string, approved: boolean): Promise<void> {
  await requestVoid(`/api/ai/conversations/${conversationId}/confirm-command`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, approved }),
  });
}

export async function getTerminalConfirmCommands(): Promise<TerminalConfirmCommandsResponse> {
  return requestJson<TerminalConfirmCommandsResponse>('/api/ai/terminal-confirm-commands');
}

export async function saveTerminalConfirmCommands(userCommands: string[]): Promise<void> {
  await requestVoid('/api/ai/terminal-confirm-commands', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userCommands }),
  });
}