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

export interface MarketplaceSource {
  source: 'github' | 'git';
  repo: string;
}

export interface KnownMarketplace {
  source: MarketplaceSource;
  installLocation: string;
  lastUpdated: string;
}

export interface MarketplacePlugin {
  name: string;
  description?: string;
  source: string;
  strict?: boolean;
  skills?: string[];
  version?: string;
  category?: string;
}

export interface MarketplaceManifest {
  name: string;
  description?: string;
  version?: string;
  owner?: { name: string; email: string };
  metadata?: { description: string; version: string };
  plugins: MarketplacePlugin[];
}

export interface InstalledPlugin {
  scope: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated?: string;
  gitCommitSha: string;
}

export interface InstalledPluginsFile {
  version: number;
  plugins: Record<string, InstalledPlugin[]>;
}

export interface MarketplaceInfo {
  name: string;
  manifest: MarketplaceManifest;
  source: MarketplaceSource;
  lastUpdated: string;
}

 export interface PluginContentFile {
  name: string;      // 文件名不含扩展名，如 "code-review"
  filename: string;  // 完整文件名，如 "code-review.md"
}

export interface InstalledPluginDetails {
  key: string;             // "pluginName@marketplaceName"
  pluginName: string;
  marketplaceName: string;
  installPath: string;
  version: string;
  commands: PluginContentFile[];   // commands/ 目录下的 .md 文件
  skills: PluginContentFile[];     // skills/ 目录下的子目录（含 SKILL.md 的）
  agents: PluginContentFile[];     // agents/ 目录下的 .md 文件
}


export interface AIToolCall {
  name: string;
  input: Record<string, unknown>;
  result?: string;
}

export interface AIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  toolCalls?: AIToolCall[];
}

export interface AIChatStreamEvent {
  type: 'text_delta' | 'tool_call' | 'error' | 'done';
  text?: string;
  tool?: { name: string; input?: Record<string, unknown>; result?: string };
  error?: string;
}

export interface AIModelOption {
  id: string;      // e.g. 'claude-sonnet-4-6'
  label: string;   // e.g. 'Sonnet'
  source: 'profile' | 'default';
}

export interface AIToolInfo {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  required: string[];
}
export interface AIChatHistory {
  messages: AIChatMessage[];
  updatedAt: string;
}

export interface AIConversation {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}