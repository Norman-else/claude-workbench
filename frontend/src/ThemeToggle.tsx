import { Sun, Moon, MonitorPlay } from 'lucide-react';
import { useTheme } from './ThemeContext';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themes = [
    { value: 'light', label: '浅色', icon: Sun },
    { value: 'dark', label: '深色', icon: Moon },
    { value: 'system', label: '系统', icon: MonitorPlay },
  ] as const;

  return (
    <div className="flex items-center gap-1 p-1 bg-glass rounded-lg border border-purple-500/20 backdrop-blur">
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          onClick={() => setTheme(value)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-md transition-all duration-200 ${
            theme === value
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50 shadow-lg shadow-purple-500/20'
              : 'text-gray-500 hover:text-gray-300'
          }`}
          title={`切换至${label}模式`}
        >
          <Icon className="w-4 h-4" />
          <span className="text-xs font-medium hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}
