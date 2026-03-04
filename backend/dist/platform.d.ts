export declare const IS_WINDOWS: boolean;
export declare const HOME_DIR: string;
export interface EnvVarMap {
    [key: string]: string;
}
export declare function ensureFileExists(filePath: string, defaultContent?: string): Promise<void>;
/** Returns the shell config file path for the current platform/user. */
export declare function getEnvConfigPath(): Promise<string>;
/** Read env vars from shell config (Unix) or PowerShell profile (Windows). */
export declare function readEnvFromShellConfig(): Promise<EnvVarMap>;
/** Write env vars to shell config. Replaces the managed block. */
export declare function writeEnvToShellConfig(vars: EnvVarMap): Promise<void>;
/** Remove managed env block from shell config entirely. */
export declare function clearEnvFromShellConfig(): Promise<void>;
/** Get the ANTHROPIC_PROFILE_ID from the shell config (source of truth). */
export declare function readActiveProfileIdFromShellConfig(): Promise<string | null>;
export declare function readSettingsEnv(settingsPath: string): Promise<EnvVarMap | null>;
export declare function writeSettingsEnv(settingsPath: string, envVars: EnvVarMap): Promise<void>;
export declare function clearSettingsEnv(settingsPath: string): Promise<void>;
/** Expand ~ and %VAR% placeholders. */
export declare function expandPath(inputPath: string): string;
/** Return available Windows drive paths (e.g. C:\). */
export declare function getWindowsDrives(): Promise<string[]>;
//# sourceMappingURL=platform.d.ts.map