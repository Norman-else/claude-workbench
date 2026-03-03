import { useState } from 'react';
import { GitBranch, X } from 'lucide-react';

interface AddMarketplaceModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (url: string) => Promise<void>;
  showNotification: (message: string, type?: 'success' | 'error') => void;
}

export function AddMarketplaceModal({ open, onClose, onAdd, showNotification }: AddMarketplaceModalProps) {
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const canAdd = url.trim().length > 0;

  const handleAdd = async () => {
    if (!canAdd || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      await onAdd(url.trim());
      setUrl('');
      onClose();
      showNotification('Marketplace added successfully!');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Failed to add marketplace. Please try again.');
      setAdding(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canAdd && !adding) {
      handleAdd();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[200] p-4 animate-fade-in">
      <div className="glass-dark border border-zinc-700 rounded-2xl p-8 max-w-lg w-full animate-slide-up shadow-2xl shadow-black/20">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-2xl font-bold text-white">Add Marketplace</h3>
            <p className="text-gray-400 text-sm mt-1">Enter a GitHub repository or Git URL</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors ml-4 flex-shrink-0"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Input */}
        <div className="mb-4">
          <div className="flex items-center space-x-2 mb-2">
            <GitBranch className="w-4 h-4 text-zinc-400" />
            <label className="text-sm font-medium text-gray-300">Repository URL or Shorthand</label>
          </div>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. anthropics/skills or https://github.com/..."
            autoFocus
            className="w-full glass border border-zinc-800 rounded-xl px-4 py-3 text-white focus:border-zinc-600 focus:outline-none transition-colors"
          />
        </div>

        {/* Help text */}
        <div className="mb-6 px-4 py-3 rounded-xl bg-zinc-900/50 border border-zinc-800">
          <p className="text-xs text-zinc-500">
            The repository must contain a{' '}
            <span className="font-mono text-zinc-400">.claude-plugin/marketplace.json</span> file.
            Use <span className="font-mono text-zinc-400">owner/repo</span> shorthand for GitHub repos.
          </p>
        </div>

        {/* Error */}
        {addError && (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-900/30 border border-red-800/50">
            <p className="text-sm text-red-400">{addError}</p>
          </div>
        )}

        {/* Buttons */}
        <div className="flex justify-end space-x-4">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-zinc-800 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!canAdd || adding}
            className="px-6 py-3 rounded-xl bg-white text-black hover:bg-zinc-200 font-medium hover:shadow-lg hover:shadow-black/40 transition-all flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <GitBranch className="w-4 h-4" />
            <span>{adding ? 'Adding...' : 'Add Marketplace'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
