import { useState } from 'react';
import { Download, X, Eye, EyeOff } from 'lucide-react';
import type { RegistryEnvVar, RegistryPackage, RegistryServer } from '../types';

interface McpInstallModalProps {
  server: RegistryServer;
  npmPackage: RegistryPackage;
  onInstall: (envValues: Record<string, string>) => Promise<void>;
  onClose: () => void;
}

export function McpInstallModal({ server, npmPackage, onInstall, onClose }: McpInstallModalProps) {
  const requiredEnvVars = (npmPackage.environmentVariables ?? []).filter((e) => e.isRequired);
  const [envValues, setEnvValues] = useState<Record<string, string>>(
    Object.fromEntries(requiredEnvVars.map((e) => [e.name, '']))
  );
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState(false);

  const canInstall = requiredEnvVars.every((e) => envValues[e.name]?.trim());

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await onInstall(envValues);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-fade-in">
      <div className="glass-dark border border-zinc-700 rounded-2xl p-8 max-w-lg w-full animate-slide-up shadow-2xl shadow-black/20">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-2xl font-bold text-white">{server.title ?? server.name}</h3>
            <p className="text-gray-400 text-sm mt-1">{server.description}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors ml-4 flex-shrink-0">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Package info */}
        <div className="glass border border-zinc-800 rounded-xl px-4 py-3 mb-6 flex items-center space-x-2">
          <span className="text-xs font-medium text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded">npm</span>
          <span className="text-sm text-zinc-300 font-mono">{npmPackage.identifier}</span>
          {npmPackage.version && <span className="text-xs text-zinc-500 ml-auto">v{npmPackage.version}</span>}
        </div>

        {/* Required env vars */}
        {requiredEnvVars.length > 0 && (
          <div className="space-y-4 mb-6">
            <p className="text-sm font-medium text-gray-300">Required Configuration</p>
            {requiredEnvVars.map((envVar: RegistryEnvVar) => (
              <div key={envVar.name}>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  {envVar.name}
                  {envVar.description && <span className="text-zinc-600 ml-2">— {envVar.description}</span>}
                </label>
                <div className="relative">
                  <input
                    type={envVar.isSecret && !showSecrets[envVar.name] ? 'password' : 'text'}
                    value={envValues[envVar.name] ?? ''}
                    onChange={(e) => setEnvValues((prev) => ({ ...prev, [envVar.name]: e.target.value }))}
                    className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-zinc-600 focus:outline-none transition-colors pr-10"
                    placeholder={envVar.isSecret ? '••••••••' : `Enter ${envVar.name}`}
                  />
                  {envVar.isSecret && (
                    <button
                      type="button"
                      onClick={() => setShowSecrets((prev) => ({ ...prev, [envVar.name]: !prev[envVar.name] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showSecrets[envVar.name] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleInstall}
            disabled={!canInstall || installing}
            className="px-6 py-3 rounded-xl bg-white text-black hover:bg-zinc-200 font-medium hover:shadow-lg hover:shadow-black/40 transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            <span>{installing ? 'Installing...' : 'Install'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
