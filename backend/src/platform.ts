import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export const IS_WINDOWS = os.platform() === 'win32';
export const HOME_DIR = os.homedir();

// ============================================================
// Types
// ============================================================

export interface EnvVarMap {
  [key: string]: string;
}

// ============================================================
// Helpers
// ============================================================

export async function ensureFileExists(
  filePath: string,
  defaultContent = ''
): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, defaultContent);
  }
}

/** Returns the shell config file path for the current platform/user. */
export async function getEnvConfigPath(): Promise<string> {
  if (IS_WINDOWS) {
    return path.join(HOME_DIR, '.claude-env');
  }
  const zshrcPath = path.join(HOME_DIR, '.zshrc');
  try {
    await fs.access(zshrcPath);
    return zshrcPath;
  } catch {
    return path.join(HOME_DIR, '.bashrc');
  }
}

/** Get the PowerShell profile path on Windows. */
async function getPowerShellProfile(): Promise<string> {
  try {
    const { stdout } = await execPromise('pwsh -Command "$PROFILE"');
    return stdout.trim();
  } catch {
    const { stdout } = await execPromise('powershell -Command "$PROFILE"');
    return stdout.trim();
  }
}

// ============================================================
// Shell config read / write abstraction
// ============================================================

const START_MARKER = '# Claude Code Environment Variables - START';
const END_MARKER = '# Claude Code Environment Variables - END';

/** Build the lines that belong inside the env block. */
function buildEnvBlock(vars: EnvVarMap): string[] {
  const lines: string[] = ['', START_MARKER];
  for (const [key, value] of Object.entries(vars)) {
    if (value) {
      lines.push(
        IS_WINDOWS
          ? `$env:${key} = "${value}"`
          : `export ${key}="${value}"`
      );
    }
  }
  lines.push(END_MARKER, '');
  return lines;
}

/** Remove existing Claude env block from content and return cleaned text. */
function removeEnvBlock(content: string): string {
  return content
    .replace(
      /# Claude Code Environment Variables - START[\s\S]*?# Claude Code Environment Variables - END\n?/g,
      ''
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Read env vars from shell config (Unix) or PowerShell profile (Windows). */
export async function readEnvFromShellConfig(): Promise<EnvVarMap> {
  const result: EnvVarMap = {};

  if (IS_WINDOWS) {
    try {
      const profilePath = await getPowerShellProfile();
      const content = await fs.readFile(profilePath, 'utf-8');
      for (const line of content.split('\n')) {
        const match = line.match(/\$env:(\w+)\s*=\s*["']([^"']+)["']/);
        if (match) result[match[1]] = match[2];
      }
    } catch {
      // Profile not found – return empty
    }
  } else {
    try {
      const configPath = await getEnvConfigPath();
      await ensureFileExists(configPath, '');
      const content = await fs.readFile(configPath, 'utf-8');
      for (const line of content.split('\n')) {
        const match = line.match(/^\s*export\s+(\w+)=["']?([^"'\n]+)["']?/);
        if (match) result[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    } catch {
      // Config not found – return empty
    }
  }

  return result;
}

/** Write env vars to shell config. Replaces the managed block. */
export async function writeEnvToShellConfig(vars: EnvVarMap): Promise<void> {
  if (IS_WINDOWS) {
    const profilePath = await getPowerShellProfile();
    const profileDir = path.dirname(profilePath);
    await fs.mkdir(profileDir, { recursive: true });
    await ensureFileExists(profilePath, '');

    let content = await fs.readFile(profilePath, 'utf-8');

    // Remove old PS1 variable lines
    for (const key of Object.keys(vars)) {
      content = content.replace(
        new RegExp(`^\\$env:${key}\\s*=.*$`, 'gm'),
        ''
      );
    }
    content = removeEnvBlock(content);
    content = content + '\n' + buildEnvBlock(vars).join('\n');
    await fs.writeFile(profilePath, content, 'utf-8');
  } else {
    const configPath = await getEnvConfigPath();
    await ensureFileExists(configPath, '');
    let lines = (await fs.readFile(configPath, 'utf-8')).split('\n');

    const startIdx = lines.findIndex((l) => l.includes(START_MARKER));
    const endIdx = lines.findIndex((l) => l.includes(END_MARKER));
    if (startIdx !== -1 && endIdx !== -1) {
      lines.splice(startIdx, endIdx - startIdx + 1);
    }
    lines.push(...buildEnvBlock(vars));
    await fs.writeFile(configPath, lines.join('\n'));
  }
}

/** Remove managed env block from shell config entirely. */
export async function clearEnvFromShellConfig(): Promise<void> {
  if (IS_WINDOWS) {
    try {
      const profilePath = await getPowerShellProfile();
      let content = await fs.readFile(profilePath, 'utf-8');
      content = removeEnvBlock(content);
      await fs.writeFile(profilePath, content, 'utf-8');
    } catch {
      // Profile not found – nothing to clear
    }
  } else {
    try {
      const configPath = await getEnvConfigPath();
      let lines = (await fs.readFile(configPath, 'utf-8')).split('\n');
      const startIdx = lines.findIndex((l) => l.includes(START_MARKER));
      const endIdx = lines.findIndex((l) => l.includes(END_MARKER));
      if (startIdx !== -1 && endIdx !== -1) {
        lines.splice(startIdx, endIdx - startIdx + 1);
      }
      const cleaned = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      await fs.writeFile(configPath, cleaned);
    } catch {
      // Config not found – nothing to clear
    }
  }
}

/** Get the ANTHROPIC_PROFILE_ID from the shell config (source of truth). */
export async function readActiveProfileIdFromShellConfig(): Promise<
  string | null
> {
  if (IS_WINDOWS) {
    try {
      const profilePath = await getPowerShellProfile();
      const content = await fs.readFile(profilePath, 'utf-8');
      const match = content.match(/\$env:ANTHROPIC_PROFILE_ID\s*=\s*"([^"]+)"/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  } else {
    try {
      const configPath = await getEnvConfigPath();
      const content = await fs.readFile(configPath, 'utf-8');
      const match = content.match(/export ANTHROPIC_PROFILE_ID="([^"]+)"/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }
}

// ============================================================
// settings.json helpers
// ============================================================

export async function readSettingsEnv(
  settingsPath: string
): Promise<EnvVarMap | null> {
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as { env?: EnvVarMap };
    return settings.env ?? null;
  } catch {
    return null;
  }
}

export async function writeSettingsEnv(
  settingsPath: string,
  envVars: EnvVarMap
): Promise<void> {
  let settings: Record<string, unknown> = {};
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    settings = JSON.parse(content) as Record<string, unknown>;
  } catch {
    // File doesn't exist yet – start fresh
  }
  settings.env = envVars;
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export async function clearSettingsEnv(settingsPath: string): Promise<void> {
  try {
    const content = await fs.readFile(settingsPath, 'utf-8');
    const settings = JSON.parse(content) as Record<string, unknown>;
    delete settings.env;
    await fs.writeFile(
      settingsPath,
      JSON.stringify(settings, null, 2),
      'utf-8'
    );
  } catch {
    // File doesn't exist – nothing to clear
  }
}

// ============================================================
// Path utilities
// ============================================================

/** Expand ~ and %VAR% placeholders. */
export function expandPath(inputPath: string): string {
  let p = inputPath;
  if (p.startsWith('~')) p = p.replace('~', HOME_DIR);
  if (IS_WINDOWS && p.includes('%')) {
    p = p.replace(/%([^%]+)%/g, (_, envVar: string) => process.env[envVar] ?? `%${envVar}%`);
  }
  return path.normalize(p);
}

/** Return available Windows drive paths (e.g. C:\). */
export async function getWindowsDrives(): Promise<string[]> {
  if (!IS_WINDOWS) return [];
  const drives: string[] = [];
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')) {
    try {
      await fs.access(`${letter}:\\`);
      drives.push(`${letter}:\\`);
    } catch {
      // Not accessible
    }
  }
  return drives;
}
