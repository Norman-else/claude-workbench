import Anthropic from '@anthropic-ai/sdk';
import type { Express } from 'express';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const HOME_DIR = os.homedir();
const CLAUDE_PROFILES_PATH = path.join(HOME_DIR, '.claude', 'env-profiles.json');
const CLAUDE_SETTINGS_PATH = path.join(HOME_DIR, '.claude', 'settings.json');

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
