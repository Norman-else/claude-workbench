import { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';
import { getMcpLogs } from '../api';

interface ServerLogsProps {
  serverName: string;
}

export function ServerLogs({ serverName }: ServerLogsProps) {
  const [logs, setLogs] = useState<Array<{ timestamp: string; type: string; message: string }>>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const data = await getMcpLogs(serverName, 50);
        setLogs(data.logs || []);
        if (autoScroll && logsEndRef.current) {
          logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [serverName, autoScroll]);

  const getLogColor = (type: string) => {
    switch (type) {
      case 'error':
      case 'stderr':
        return 'text-red-400';
      case 'info':
        return 'text-blue-400';
      case 'stdout':
        return 'text-green-400';
      default:
        return 'text-gray-400';
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      <div className="flex items-center justify-between flex-shrink-0">
        <label className="flex items-center space-x-2 text-sm font-medium text-gray-300">
          <Activity className="w-4 h-4 text-purple-400" />
          <span>Server Logs</span>
        </label>
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="rounded bg-gray-800 border-purple-500/20"
          />
          <span className="text-xs text-gray-400">Auto-scroll</span>
        </label>
      </div>
      <div className="glass border border-purple-500/20 rounded-xl p-4 flex-1 overflow-y-auto font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-gray-500 text-center py-8">No logs yet</div>
        ) : (
          logs.map((log, index) => (
            <div key={index} className="mb-1">
              <span className="text-gray-600">{new Date(log.timestamp).toLocaleTimeString()}</span>{' '}
              <span className={`font-medium ${getLogColor(log.type)}`}>[{log.type}]</span>{' '}
              <span className="text-gray-300">{log.message}</span>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
