import Anthropic from '@anthropic-ai/sdk';
import type { Express } from 'express';
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
export declare function getActiveProfileCredentials(): Promise<ActiveProfileCredentials | null>;
export declare function getAnthropicClient(creds: ActiveProfileCredentials): Anthropic;
export declare function registerAIAssistantRoutes(app: Express): void;
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
export declare function redactProfile(profile: EnvProfile): EnvProfile;
interface AIChatMessageForHistory {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
    toolCalls?: Array<{
        name: string;
        input: Record<string, unknown>;
        result?: string;
    }>;
}
interface AIChatHistoryFile {
    messages: AIChatMessageForHistory[];
    updatedAt: string;
}
export declare function loadHistory(): Promise<AIChatHistoryFile>;
export declare function saveHistory(history: AIChatHistoryFile): Promise<void>;
export declare function trimHistory(history: AIChatHistoryFile): AIChatHistoryFile;
interface AnthropicToolDefinition {
    name: string;
    description: string;
    input_schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
}
export declare const toolDefinitions: AnthropicToolDefinition[];
type ToolInput = Record<string, unknown>;
export declare function executeToolHandler(name: string, input: ToolInput): Promise<string>;
export {};
//# sourceMappingURL=ai-assistant.d.ts.map