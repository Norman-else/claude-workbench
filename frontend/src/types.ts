export interface McpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ClaudeConfig {
  mcpServers?: Record<string, McpServer>;
}

export interface CommandFile {
  name: string;
  content: string;
}

export interface Skill {
  name: string;
  content: string;
  description?: string;
  allowedTools?: string;
}

export interface McpStatus {
  status: 'running' | 'stopped' | 'stopping' | 'error';
  running: boolean;
  pid?: number;
  startTime?: string;
  error?: string;
}

export interface EnvProfile {
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

export type ViewMode = 'list' | 'detail';

export type TabType = 'mcp' | 'env' | 'commands' | 'skills';

export type RefreshStepStatus = 'pending' | 'loading' | 'done' | 'error';

export interface RefreshProgress {
  mcpConfig: RefreshStepStatus;
  envProfiles: RefreshStepStatus;
  commands: RefreshStepStatus;
  skills: RefreshStepStatus;
}

export interface EnvProfileForm {
  name: string;
  baseUrl: string;
  apiKey: string;
  authToken: string;
  haikuModel: string;
  opusModel: string;
  sonnetModel: string;
  smallFastModel: string;
}

export interface McpLogsResponse {
  logs?: Array<{ timestamp: string; type: string; message: string }>;
}

export interface ShellConfigContentResponse {
  configPath: string;
  content: string;
}

// Registry API 相关类型
export interface RegistryEnvVar {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
}

export interface RegistryPackage {
  registryType: string;
  identifier: string;
  version?: string;
  runtimeHint?: string;
  transport: { type: string };
  environmentVariables?: RegistryEnvVar[];
}

export interface RegistryRemoteHeader {
  name: string;
  description?: string;
  isRequired?: boolean;
  isSecret?: boolean;
}

export interface RegistryRemote {
  type: 'streamable-http' | 'sse' | string;
  url: string;
  headers?: RegistryRemoteHeader[];
}

export interface RegistryServer {
  name: string;
  title?: string;
  description?: string;
  version?: string;
  websiteUrl?: string;
  repository?: { url: string; source: string };
  icons?: Array<{ src: string; mimeType: string }>;
  packages?: RegistryPackage[];
  remotes?: RegistryRemote[];
}

export interface RegistryListResponse {
  servers: Array<{ server: RegistryServer; _meta?: Record<string, unknown> }>;
  metadata: { nextCursor?: string; count: number };
}
