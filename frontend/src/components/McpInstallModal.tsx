import { useState } from 'react';
import { Download, X, Eye, EyeOff } from 'lucide-react';
import type { RegistryServer } from '../types';

export interface RequiredField {
  name: string;
  description?: string;
  isSecret?: boolean;
}

interface McpInstallModalProps {
  server: RegistryServer;
  packageLabel: string;         // 显示用，如 "npm: airtable-mcp-server" 或 "remote: https://..."
  requiredFields: RequiredField[];
  onInstall: (values: Record<string, string>) => Promise<void>;
  onClose: () => void;
}

export function McpInstallModal({ server, packageLabel, requiredFields, onInstall, onClose }: McpInstallModalProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(requiredFields.map((f) => [f.name, '']))
  );
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState(false);

  const canInstall = requiredFields.every((f) => values[f.name]?.trim());

  const handleInstall = async () => {
    setInstalling(true);
    try {
      await onInstall(values);
    } finally {
      setInstalling(false);
    }
  };

  const displayName = server.title ?? server.name.split('/').pop() ?? server.name;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-fade-in">
      <div className="glass-dark border border-zinc-700 rounded-2xl p-8 max-w-lg w-full animate-slide-up shadow-2xl shadow-black/20">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-2xl font-bold text-white">{displayName}</h3>
            {server.description && (
              <p className="text-gray-400 text-sm mt-1">{server.description}</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-zinc-800 transition-colors ml-4 flex-shrink-0">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Package info */}
        <div className="glass border border-zinc-800 rounded-xl px-4 py-3 mb-6">
          <span className="text-sm text-zinc-300 font-mono text-xs break-all">{packageLabel}</span>
        </div>

        {/* Required fields */}
        {requiredFields.length > 0 && (
          <div className="space-y-4 mb-6">
            <p className="text-sm font-medium text-gray-300">Required Configuration</p>
            {requiredFields.map((field) => (
              <div key={field.name}>
                <label className="block text-xs font-medium text-gray-400 mb-1">
                  {field.name}
                  {field.description && (
                    <span className="text-zinc-600 ml-2">— {field.description}</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={field.isSecret && !showSecrets[field.name] ? 'password' : 'text'}
                    value={values[field.name] ?? ''}
                    onChange={(e) => setValues((prev) => ({ ...prev, [field.name]: e.target.value }))}
                    className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-zinc-600 focus:outline-none transition-colors pr-10"
                    placeholder={field.isSecret ? '••••••••' : `Enter ${field.name}`}
                  />
                  {field.isSecret && (
                    <button
                      type="button"
                      onClick={() => setShowSecrets((prev) => ({ ...prev, [field.name]: !prev[field.name] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                    >
                      {showSecrets[field.name] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
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
