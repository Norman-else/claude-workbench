import type {
  ClaudeConfig,
  CommandFile,
  EnvProfile,
  EnvProfileForm,
  McpLogsResponse,
  McpStatus,
  ShellConfigContentResponse,
  Skill,
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

export async function getClaudeConfig(): Promise<ClaudeConfig> {
  return requestJson<ClaudeConfig>('/api/claude-config');
}

export async function saveClaudeConfig(config: ClaudeConfig): Promise<void> {
  await requestVoid('/api/claude-config', {
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

export async function getCommands(): Promise<CommandFile[]> {
  return requestJson<CommandFile[]>('/api/commands');
}

export async function saveCommand(cmd: CommandFile): Promise<void> {
  await requestVoid('/api/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
}

export async function deleteCommand(name: string): Promise<void> {
  await requestVoid(`/api/commands/${name}`, { method: 'DELETE' });
}

export async function getSkills(): Promise<Skill[]> {
  return requestJson<Skill[]>('/api/skills');
}

export async function saveSkill(skill: Pick<Skill, 'name' | 'content'>): Promise<void> {
  await requestVoid('/api/skills', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skill),
  });
}

export async function deleteSkill(name: string): Promise<void> {
  await requestVoid(`/api/skills/${name}`, { method: 'DELETE' });
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

export async function getClaudeSettingsContent(): Promise<ShellConfigContentResponse> {
  return requestJson<ShellConfigContentResponse>('/api/claude-settings-content');
}
