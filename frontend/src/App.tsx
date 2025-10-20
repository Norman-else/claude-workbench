import { useState, useEffect, useRef } from 'react';
import { Settings, Server, Terminal, Command, Save, RefreshCw, Plus, Trash2, Check, X, XCircle, AlertTriangle, CheckCircle, MessageSquare, Send, FolderOpen, FileText, Eye, EyeOff, User, Bot, ChevronDown, Sparkles, Zap, Target } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface McpServer {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface ClaudeConfig {
  mcpServers?: Record<string, McpServer>;
}

interface CommandFile {
  name: string;
  content: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

function App() {
  const [activeTab, setActiveTab] = useState<'mcp' | 'env' | 'commands' | 'chat'>('mcp');
  const [claudeConfig, setClaudeConfig] = useState<ClaudeConfig>({});
  const [envVars, setEnvVars] = useState({ 
    baseUrl: '', 
    authToken: '', 
    haikuModel: '', 
    opusModel: '', 
    sonnetModel: '' 
  });
  const [commands, setCommands] = useState<CommandFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [showApiKey, setShowApiKey] = useState(false);
  
  // Global notification state
  const [notification, setNotification] = useState<{
    show: boolean;
    message: string;
    type: 'success' | 'error';
  }>({ show: false, message: '', type: 'success' });
  
  // MCP Server editing
  const [editingMcp, setEditingMcp] = useState<Record<string, McpServer>>({});
  const [newlyAddedServers, setNewlyAddedServers] = useState<Set<string>>(new Set());
  const [showAddServerModal, setShowAddServerModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<string | null>(null);
  const [showServerDetailModal, setShowServerDetailModal] = useState(false);
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [serverInputMode, setServerInputMode] = useState<'form' | 'json'>('form');
  const [newServerForm, setNewServerForm] = useState({
    name: '',
    command: '',
    args: '',
    env: ''
  });
  const [serverJsonInput, setServerJsonInput] = useState('');
  
  // Command editing
  const [newCommandName, setNewCommandName] = useState('');
  const [newCommandContent, setNewCommandContent] = useState('');
  const [editingCommand, setEditingCommand] = useState<string | null>(null);
  const [showCommandModal, setShowCommandModal] = useState(false);
  const [showDeleteCommandConfirm, setShowDeleteCommandConfirm] = useState(false);
  const [commandToDelete, setCommandToDelete] = useState<string | null>(null);

  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatWorkingDir, setChatWorkingDir] = useState('~');
  const [chatContextFiles, setChatContextFiles] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('auto'); // 'auto', 'haiku', 'opus', 'sonnet'
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showDirectoryBrowser, setShowDirectoryBrowser] = useState(false);
  const [directoryFiles, setDirectoryFiles] = useState<Array<{name: string; isDirectory: boolean; path: string}>>([]);
  const [currentBrowsingPath, setCurrentBrowsingPath] = useState('~');
  const [pathInputValue, setPathInputValue] = useState('~');
  const [platformInfo, setPlatformInfo] = useState<{platform: string; quickPaths: any; drives?: string[]}>({
    platform: 'unix',
    quickPaths: { home: '~', desktop: '~/Desktop', documents: '~/Documents', downloads: '~/Downloads', root: '/' }
  });
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [autocompleteSearchQuery, setAutocompleteSearchQuery] = useState('');
  const [showFileAutocomplete, setShowFileAutocomplete] = useState(false);
  const [autocompleteFiles, setAutocompleteFiles] = useState<Array<{name: string; isDirectory: boolean; path: string}>>([]);
  const [selectedAutocompleteIndex, setSelectedAutocompleteIndex] = useState(0);
  const [selectedBrowserFileIndex, setSelectedBrowserFileIndex] = useState(0);
  const [showSlashCommandList, setShowSlashCommandList] = useState(false);
  const [selectedSlashCommandIndex, setSelectedSlashCommandIndex] = useState(0);
  const [slashCommands, setSlashCommands] = useState<Array<{command: string; description: string; category: string; isCustom?: boolean}>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const autocompleteSearchRef = useRef<HTMLInputElement>(null);
  const fileSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadDefaultPaths();
    loadConfig();
    loadSlashCommands();
  }, []);

  const loadDefaultPaths = async () => {
    try {
      const response = await fetch('/api/default-paths');
      if (response.ok) {
        const data = await response.json();
        
        // Save platform info
        setPlatformInfo({
          platform: data.platform || 'unix',
          quickPaths: data.quickPaths || { home: '~', desktop: '~/Desktop', documents: '~/Documents', downloads: '~/Downloads', root: '/' },
          drives: data.drives || []
        });
        
        // Set default working directory
        const defaultDir = data.quickPaths?.home || data.homeDirSymbol || '~';
        setChatWorkingDir(defaultDir);
        setCurrentBrowsingPath(defaultDir);
        setPathInputValue(defaultDir);
      }
    } catch (error) {
      console.error('Failed to load default paths:', error);
      // Keep default values (~) if API call fails
    }
  };

  const loadSlashCommands = async () => {
    try {
      const response = await fetch('/api/slash-commands');
      const data = await response.json();
      if (data.commands) {
        setSlashCommands(data.commands);
      }
    } catch (error) {
      console.error('Failed to load slash commands:', error);
      // Fallback to default commands if API fails
      setSlashCommands([
        { command: '/help', description: 'Show all available commands', category: 'fully-supported' },
        { command: '/clear', description: 'Clear the current context', category: 'fully-supported' },
        { command: '/reset', description: 'Reset the session', category: 'fully-supported' },
        { command: '/add <path>', description: 'Add files or directories to context', category: 'interactive' },
        { command: '/drop <path>', description: 'Remove files from context', category: 'interactive' },
        { command: '/list', description: 'List files in current context', category: 'interactive' },
        { command: '/context', description: 'Show current context information', category: 'interactive' },
        { command: '/config', description: 'Show configuration', category: 'interactive' },
        { command: '/model', description: 'Show or change the model', category: 'interactive' },
      ]);
    }
  };

  // Auto-hide notification after 3 seconds
  useEffect(() => {
    if (notification.show) {
      // Auto-adjust duration based on message length (min 3s, max 8s)
      const baseDuration = 3000;
      const extraDuration = Math.min(notification.message.length * 30, 5000);
      const duration = baseDuration + extraDuration;
      
      const timer = setTimeout(() => {
        setNotification({ ...notification, show: false });
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [notification.show]);

  const showNotification = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ show: true, message, type });
  };

  // Handle ESC key to close modals
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDeleteConfirm) {
          cancelDeleteServer();
        } else if (showDeleteCommandConfirm) {
          cancelDeleteCommand();
        } else if (showServerDetailModal) {
          closeServerDetail();
        } else if (showCommandModal) {
          closeCommandModal();
        } else if (showAddServerModal) {
          closeAddServerModal();
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showAddServerModal, showDeleteConfirm, showServerDetailModal, showCommandModal, showDeleteCommandConfirm]);

  const closeAddServerModal = () => {
    setShowAddServerModal(false);
    setNewServerForm({ name: '', command: '', args: '', env: '' });
    setServerJsonInput('');
    setServerInputMode('form');
  };

  const loadConfig = async () => {
    setLoading(true);
    try {
      // Load Claude config
      const claudeRes = await fetch('/api/claude-config');
      const claudeData = await claudeRes.json();
      setClaudeConfig(claudeData);
      setEditingMcp(claudeData.mcpServers || {});
      
      // Load env vars
      const envRes = await fetch('/api/env-vars');
      const envData = await envRes.json();
      setEnvVars(envData);
      
      // Load commands
      const cmdRes = await fetch('/api/commands');
      const cmdData = await cmdRes.json();
      setCommands(cmdData);
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveClaudeConfig = async () => {
    setSaveStatus('saving');
    try {
      const response = await fetch('/api/claude-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...claudeConfig, mcpServers: editingMcp }),
      });
      if (response.ok) {
        setSaveStatus('success');
        setClaudeConfig({ ...claudeConfig, mcpServers: editingMcp });
        setNewlyAddedServers(new Set()); // Clear newly added servers after save
        showNotification('MCP configuration saved successfully!');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        showNotification('Failed to save MCP configuration', 'error');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      setSaveStatus('error');
      showNotification('Failed to save MCP configuration', 'error');
    }
  };

  const saveEnvVars = async () => {
    setSaveStatus('saving');
    try {
      const response = await fetch('/api/env-vars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(envVars),
      });
      if (response.ok) {
        const data = await response.json();
        setSaveStatus('success');
        
        // Show hot reload status
        let message = 'Environment variables saved successfully! ';
        if (data.hotReloaded) {
          message += '✨ Changes applied immediately - no restart needed!';
        } else if (data.platform === 'windows') {
          message += data.instructions || 'Restart your terminals or applications to use the new environment variables.';
        } else {
          message += data.instructions || 'Run "source ~/.zshrc" or restart your terminal.';
        }
        
        showNotification(message);
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
        showNotification('Failed to save environment variables', 'error');
      }
    } catch (error) {
      console.error('Failed to save env vars:', error);
      setSaveStatus('error');
      showNotification('Failed to save environment variables', 'error');
    }
  };

  const reloadEnvVars = async () => {
    try {
      const response = await fetch('/api/reload-env', {
        method: 'POST',
      });
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          const source = data.platform === 'windows' 
            ? 'PowerShell Profile' 
            : 'shell config (.zshrc or .bashrc)';
          showNotification(`🔄 Environment variables reloaded from ${source}!`);
          // Refresh the env vars display
          loadConfig();
        } else {
          showNotification('Failed to reload: ' + data.message, 'error');
        }
      } else {
        showNotification('Failed to reload environment variables', 'error');
      }
    } catch (error) {
      console.error('Failed to reload env vars:', error);
      showNotification('Failed to reload environment variables', 'error');
    }
  };

  const addMcpServer = () => {
    try {
      if (serverInputMode === 'json') {
        // JSON mode
        const parsed = JSON.parse(serverJsonInput);
        
        // Validate that it's an object with server configurations
        if (typeof parsed !== 'object' || parsed === null) {
          alert('Invalid JSON format. Please provide a valid server configuration object.');
          return;
        }

        // Check if any server names already exist
        const newServerNames = Object.keys(parsed);
        const existingNames = newServerNames.filter(name => editingMcp[name]);
        if (existingNames.length > 0) {
          alert(`Server(s) already exist: ${existingNames.join(', ')}`);
          return;
        }

        // Add all servers from JSON
        setEditingMcp({
          ...editingMcp,
          ...parsed
        });

        // Mark all as newly added
        const updatedNewlyAdded = new Set(newlyAddedServers);
        newServerNames.forEach(name => updatedNewlyAdded.add(name));
        setNewlyAddedServers(updatedNewlyAdded);

        // Reset and close
        setServerJsonInput('');
        setShowAddServerModal(false);
      } else {
        // Form mode
        if (!newServerForm.name || editingMcp[newServerForm.name]) {
          alert('Please enter a valid server name that doesn\'t already exist.');
          return;
        }

        const args = newServerForm.args 
          ? newServerForm.args.split(',').map(s => s.trim()).filter(s => s)
          : [];
        
        const env = newServerForm.env 
          ? JSON.parse(newServerForm.env)
          : undefined;

        setEditingMcp({
          ...editingMcp,
          [newServerForm.name]: { 
            command: newServerForm.command,
            args: args.length > 0 ? args : undefined,
            env
          }
        });

        // Mark as newly added
        setNewlyAddedServers(new Set(newlyAddedServers).add(newServerForm.name));

        // Reset form and close modal
        setNewServerForm({ name: '', command: '', args: '', env: '' });
        setShowAddServerModal(false);
      }
    } catch (error) {
      alert(`Invalid JSON format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const confirmDeleteServer = (name: string) => {
    setServerToDelete(name);
    setShowDeleteConfirm(true);
  };

  const removeMcpServer = () => {
    if (!serverToDelete) return;
    
    const updated = { ...editingMcp };
    delete updated[serverToDelete];
    setEditingMcp(updated);
    
    // Also remove from newly added list if present
    const updatedNewlyAdded = new Set(newlyAddedServers);
    updatedNewlyAdded.delete(serverToDelete);
    setNewlyAddedServers(updatedNewlyAdded);
    
    // Close confirm dialog
    setShowDeleteConfirm(false);
    setServerToDelete(null);
  };

  const cancelDeleteServer = () => {
    setShowDeleteConfirm(false);
    setServerToDelete(null);
  };

  const openServerDetail = (name: string) => {
    setSelectedServer(name);
    setShowServerDetailModal(true);
  };

  const closeServerDetail = () => {
    setShowServerDetailModal(false);
    setSelectedServer(null);
  };

  const updateMcpServer = (name: string, field: keyof McpServer, value: any) => {
    setEditingMcp({
      ...editingMcp,
      [name]: { ...editingMcp[name], [field]: value }
    });
  };

  const saveCommand = async () => {
    if (!newCommandName || !newCommandContent) return;
    
    try {
      const response = await fetch('/api/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCommandName, content: newCommandContent }),
      });
      if (response.ok) {
        const action = editingCommand ? 'updated' : 'created';
        showNotification(`Command "${newCommandName}" ${action} successfully!`);
        await loadConfig();
        await loadSlashCommands(); // Reload slash commands to include the new/updated command
      } else {
        showNotification('Failed to save command', 'error');
      }
    } catch (error) {
      console.error('Failed to save command:', error);
      showNotification('Failed to save command', 'error');
    }
  };

  const openCommandModal = (cmd?: CommandFile) => {
    if (cmd) {
      setEditingCommand(cmd.name);
      setNewCommandName(cmd.name);
      setNewCommandContent(cmd.content);
    } else {
      setEditingCommand(null);
      setNewCommandName('');
      setNewCommandContent('');
    }
    setShowCommandModal(true);
  };

  const closeCommandModal = () => {
    setShowCommandModal(false);
    setEditingCommand(null);
    setNewCommandName('');
    setNewCommandContent('');
  };

  const confirmDeleteCommand = (name: string) => {
    setCommandToDelete(name);
    setShowDeleteCommandConfirm(true);
  };

  const cancelDeleteCommand = () => {
    setShowDeleteCommandConfirm(false);
    setCommandToDelete(null);
  };

  const deleteCommand = async () => {
    if (!commandToDelete) return;
    
    try {
      const response = await fetch(`/api/commands/${commandToDelete}`, { method: 'DELETE' });
      if (response.ok) {
        showNotification(`Command "${commandToDelete}" deleted successfully!`);
        await loadConfig();
        await loadSlashCommands(); // Reload slash commands to remove the deleted command
        setShowDeleteCommandConfirm(false);
        setCommandToDelete(null);
      } else {
        showNotification('Failed to delete command', 'error');
      }
    } catch (error) {
      console.error('Failed to delete command:', error);
      showNotification('Failed to delete command', 'error');
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || isSendingMessage) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
      timestamp: new Date(),
    };

    setChatMessages(prev => [...prev, userMessage]);
    const messageToSend = chatInput;
    setChatInput('');
    setIsSendingMessage(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: messageToSend,
          isCommand: messageToSend.startsWith('/'),
          workingDirectory: chatWorkingDir,
          contextFiles: chatContextFiles,
          selectedModel: selectedModel
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const assistantMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
        };
        setChatMessages(prev => [...prev, assistantMessage]);
      } else {
        const data = await response.json();
        showNotification('Failed to send message', 'error');
        // Show error message in chat
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response || 'Failed to send message',
          timestamp: new Date(),
        };
        setChatMessages(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      showNotification('Failed to send message', 'error');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const loadDirectoryFiles = async (directory: string) => {
    try {
      const response = await fetch('/api/list-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory }),
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.files;
      }
      return [];
    } catch (error) {
      console.error('Failed to load directory files:', error);
      return [];
    }
  };

  const openDirectoryBrowser = async () => {
    setCurrentBrowsingPath(chatWorkingDir);
    setPathInputValue(chatWorkingDir);
    const files = await loadDirectoryFiles(chatWorkingDir);
    setDirectoryFiles(files);
    setSelectedBrowserFileIndex(0);
    setShowDirectoryBrowser(true);
    // Auto-focus the search input after a short delay
    setTimeout(() => {
      fileSearchRef.current?.focus();
    }, 100);
  };

  const browseToDirectory = async (dirPath: string) => {
    setCurrentBrowsingPath(dirPath);
    setPathInputValue(dirPath);
    const files = await loadDirectoryFiles(dirPath);
    setDirectoryFiles(files);
    setSelectedBrowserFileIndex(0);
    // Keep focus on search input
    setTimeout(() => {
      fileSearchRef.current?.focus();
    }, 100);
  };

  const navigateToPath = async () => {
    if (pathInputValue.trim()) {
      const files = await loadDirectoryFiles(pathInputValue.trim());
      if (files.length > 0 || pathInputValue.trim() === '/' || pathInputValue.trim() === '~') {
        setCurrentBrowsingPath(pathInputValue.trim());
        setDirectoryFiles(files);
        setSelectedBrowserFileIndex(0);
        // Focus search input
        setTimeout(() => {
          fileSearchRef.current?.focus();
        }, 100);
      } else {
        // Try to load anyway, backend will handle the error
        const result = await loadDirectoryFiles(pathInputValue.trim());
        if (result.length >= 0) {
          setCurrentBrowsingPath(pathInputValue.trim());
          setDirectoryFiles(result);
          setSelectedBrowserFileIndex(0);
          // Focus search input
          setTimeout(() => {
            fileSearchRef.current?.focus();
          }, 100);
        } else {
          showNotification('Directory not found or inaccessible', 'error');
        }
      }
    }
  };

  const goToQuickPath = async (path: string) => {
    setPathInputValue(path);
    const files = await loadDirectoryFiles(path);
    setCurrentBrowsingPath(path);
    setDirectoryFiles(files);
    setSelectedBrowserFileIndex(0);
    // Focus search input
    setTimeout(() => {
      fileSearchRef.current?.focus();
    }, 100);
  };

  const selectDirectory = () => {
    setChatWorkingDir(currentBrowsingPath);
    setShowDirectoryBrowser(false);
    setFileSearchQuery(''); // Clear search when closing
    showNotification(`Working directory set to ${currentBrowsingPath}`);
  };

  const closeDirectoryBrowser = () => {
    setShowDirectoryBrowser(false);
    setFileSearchQuery(''); // Clear search when closing
  };

  const selectFileFromBrowser = (filePath: string, isDirectory: boolean) => {
    if (isDirectory) {
      browseToDirectory(filePath);
    } else {
      // Add file to context
      if (!chatContextFiles.includes(filePath)) {
        setChatContextFiles(prev => [...prev, filePath]);
        showNotification(`Added ${filePath} to context`);
      }
    }
  };

  const removeContextFile = (file: string) => {
    setChatContextFiles(prev => prev.filter(f => f !== file));
  };

  const handleChatInputChange = async (value: string) => {
    setChatInput(value);
    
    // Check if user typed / at the start (slash command)
    if (value === '/') {
      setShowSlashCommandList(true);
      setSelectedSlashCommandIndex(0);
      setShowFileAutocomplete(false);
    } else if (value.startsWith('/') && value.length > 1 && !value.includes(' ')) {
      // Keep showing slash command list while typing command
      setShowSlashCommandList(true);
    } else if (!value.startsWith('/')) {
      setShowSlashCommandList(false);
    }
    
    // Check if user typed @ at the end
    if (value.endsWith('@')) {
      // Load files from current working directory
      const files = await loadDirectoryFiles(chatWorkingDir);
      setAutocompleteFiles(files);
      setAutocompleteSearchQuery('');
      setSelectedAutocompleteIndex(0);
      setShowFileAutocomplete(true);
      setShowSlashCommandList(false);
      // Auto-focus the search input after a short delay
      setTimeout(() => {
        autocompleteSearchRef.current?.focus();
      }, 100);
    } else if (!value.includes('@')) {
      setShowFileAutocomplete(false);
    }
  };

  const handleAutocompleteKeyDown = (e: React.KeyboardEvent, filteredFiles: Array<{name: string; isDirectory: boolean; path: string}>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedAutocompleteIndex(prev => 
        prev < filteredFiles.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedAutocompleteIndex(prev => prev > 0 ? prev - 1 : 0);
    } else if (e.key === 'Enter' && filteredFiles.length > 0) {
      e.preventDefault();
      const selected = filteredFiles[selectedAutocompleteIndex];
      if (selected) {
        selectFileFromAutocomplete(selected.path, selected.isDirectory);
      }
    } else if (e.key === 'Escape') {
      setShowFileAutocomplete(false);
      setAutocompleteSearchQuery('');
      chatInputRef.current?.focus();
    }
  };

  const handleBrowserFileKeyDown = (e: React.KeyboardEvent, filteredFiles: Array<{name: string; isDirectory: boolean; path: string}>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedBrowserFileIndex(prev => 
        prev < filteredFiles.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedBrowserFileIndex(prev => prev > 0 ? prev - 1 : 0);
    } else if (e.key === 'Enter' && filteredFiles.length > 0) {
      e.preventDefault();
      const selected = filteredFiles[selectedBrowserFileIndex];
      if (selected) {
        selectFileFromBrowser(selected.path, selected.isDirectory);
      }
    }
  };

  const handleSlashCommandKeyDown = (e: React.KeyboardEvent, filteredCommands: Array<{command: string; description: string; category: string}>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSlashCommandIndex(prev => 
        prev < filteredCommands.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSlashCommandIndex(prev => prev > 0 ? prev - 1 : 0);
    } else if (e.key === 'Enter' && filteredCommands.length > 0) {
      e.preventDefault();
      const selected = filteredCommands[selectedSlashCommandIndex];
      if (selected) {
        selectSlashCommand(selected.command);
      }
    } else if (e.key === 'Escape') {
      setShowSlashCommandList(false);
      chatInputRef.current?.focus();
    }
  };

  const selectSlashCommand = (command: string) => {
    setChatInput(command);
    setShowSlashCommandList(false);
    chatInputRef.current?.focus();
  };

  const selectFileFromAutocomplete = (filePath: string, isDirectory: boolean) => {
    if (isDirectory) {
      // If directory selected, browse into it
      loadDirectoryFiles(filePath).then(files => {
        setAutocompleteFiles(files);
        setAutocompleteSearchQuery(''); // Clear search when navigating
        setSelectedAutocompleteIndex(0); // Reset selection
        // Keep focus on search input
        setTimeout(() => {
          autocompleteSearchRef.current?.focus();
        }, 100);
      });
    } else {
      // If file selected, add to context and remove @ from input
      if (!chatContextFiles.includes(filePath)) {
        setChatContextFiles(prev => [...prev, filePath]);
      }
      // Remove the @ and everything after it from input
      const lastAtIndex = chatInput.lastIndexOf('@');
      setChatInput(chatInput.substring(0, lastAtIndex));
      setShowFileAutocomplete(false);
      setAutocompleteSearchQuery(''); // Clear search when closing
      setSelectedAutocompleteIndex(0); // Reset selection
      showNotification(`Added ${filePath} to context`);
      // Return focus to chat input
      chatInputRef.current?.focus();
    }
  };

  const clearChatHistory = () => {
    setChatMessages([]);
    showNotification('Chat history cleared');
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  // Auto-scroll to selected item in autocomplete
  useEffect(() => {
    if (showFileAutocomplete && selectedAutocompleteIndex >= 0) {
      const element = document.getElementById(`autocomplete-file-${selectedAutocompleteIndex}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedAutocompleteIndex, showFileAutocomplete]);

  // Auto-scroll to selected item in browser
  useEffect(() => {
    if (showDirectoryBrowser && selectedBrowserFileIndex >= 0) {
      const element = document.getElementById(`browser-file-${selectedBrowserFileIndex}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedBrowserFileIndex, showDirectoryBrowser]);

  // Auto-scroll to selected item in slash command list
  useEffect(() => {
    if (showSlashCommandList && selectedSlashCommandIndex >= 0) {
      const element = document.getElementById(`slash-command-${selectedSlashCommandIndex}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedSlashCommandIndex, showSlashCommandList]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex">
      {/* Global Notification Toast */}
      {notification.show && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-[60] animate-slide-down">
          <div 
            className={`flex items-center space-x-3 px-6 py-4 rounded-lg shadow-lg border ${
              notification.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            {notification.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            )}
            <span className="font-medium">{notification.message}</span>
            <button
              onClick={() => setNotification({ ...notification, show: false })}
              className="ml-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete Command Confirmation Modal */}
      {showDeleteCommandConfirm && commandToDelete && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={cancelDeleteCommand}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Delete Command</h3>
                  <p className="text-sm text-slate-600">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-slate-700">
                  Are you sure you want to delete the command <strong className="text-slate-900">"{commandToDelete}"</strong>?
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={cancelDeleteCommand}
                  className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteCommand}
                  className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-medium flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Command</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Server Confirmation Modal */}
      {showDeleteConfirm && serverToDelete && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={cancelDeleteServer}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="p-3 bg-red-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Delete MCP Server</h3>
                  <p className="text-sm text-slate-600">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="bg-slate-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-slate-700">
                  Are you sure you want to delete the server <strong className="text-slate-900">"{serverToDelete}"</strong>?
                </p>
                {newlyAddedServers.has(serverToDelete) && (
                  <p className="text-xs text-amber-600 mt-2">
                    ⚠️ This is an unsaved server. It will be removed from the list immediately.
                  </p>
                )}
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={cancelDeleteServer}
                  className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={removeMcpServer}
                  className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-medium flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Server</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Server Detail/Edit Modal */}
      {showServerDetailModal && selectedServer && editingMcp[selectedServer] && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={closeServerDetail}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <Server className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{selectedServer}</h3>
                  <p className="text-sm text-slate-600">Edit MCP server configuration</p>
                </div>
              </div>
              <button
                onClick={closeServerDetail}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Command */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Command <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editingMcp[selectedServer].command}
                  onChange={(e) => updateMcpServer(selectedServer, 'command', e.target.value)}
                  placeholder="e.g., npx, node, python"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">The command to execute the MCP server</p>
              </div>

              {/* Arguments */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Arguments (Optional)
                </label>
                <input
                  type="text"
                  value={editingMcp[selectedServer].args?.join(', ') || ''}
                  onChange={(e) => updateMcpServer(
                    selectedServer, 
                    'args', 
                    e.target.value.split(',').map(s => s.trim()).filter(s => s)
                  )}
                  placeholder="e.g., -y, @modelcontextprotocol/server-name"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                <p className="text-xs text-slate-500 mt-1">Comma-separated command arguments</p>
              </div>

              {/* Environment Variables */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Environment Variables (Optional)
                </label>
                <textarea
                  value={editingMcp[selectedServer].env ? JSON.stringify(editingMcp[selectedServer].env, null, 2) : ''}
                  onChange={(e) => {
                    try {
                      const env = e.target.value ? JSON.parse(e.target.value) : undefined;
                      updateMcpServer(selectedServer, 'env', env);
                    } catch {
                      // Invalid JSON, ignore
                    }
                  }}
                  placeholder='{\n  "KEY": "value",\n  "API_TOKEN": "your-token"\n}'
                  rows={8}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">JSON format environment variables</p>
              </div>

              {newlyAddedServers.has(selectedServer) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm text-amber-700">
                    ⚠️ This is a newly added server. Remember to save your changes!
                  </p>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-between">
              <button
                onClick={() => {
                  confirmDeleteServer(selectedServer);
                  closeServerDetail();
                }}
                className="px-5 py-2.5 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Server</span>
              </button>
              <button
                onClick={closeServerDetail}
                className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Command Edit/Create Modal */}
      {showCommandModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={closeCommandModal}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-primary-100 rounded-lg">
                  <Command className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {editingCommand ? 'Edit Command' : 'Create New Command'}
                  </h3>
                  <p className="text-sm text-slate-600">
                    {editingCommand ? 'Update your custom command script' : 'Add a new custom command script'}
                  </p>
                </div>
              </div>
              <button
                onClick={closeCommandModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Command Name */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Command Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCommandName}
                  onChange={(e) => setNewCommandName(e.target.value)}
                  placeholder="e.g., deploy.sh, test-script.py"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  disabled={!!editingCommand}
                />
                <p className="text-xs text-slate-500 mt-1">
                  The file name for this command {editingCommand && '(cannot be changed)'}
                </p>
              </div>

              {/* Command Content */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Command Content <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={newCommandContent}
                  onChange={(e) => setNewCommandContent(e.target.value)}
                  placeholder="#!/bin/bash&#10;&#10;echo 'Your command script here...'"
                  rows={16}
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Write your shell script, Python code, or any executable command
                </p>
              </div>

              {/* Example */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-blue-900 mb-2">💡 Example Script:</p>
                <pre className="text-xs text-blue-800 font-mono overflow-x-auto">
{`#!/bin/bash

# Deploy to production
npm run build
rsync -avz dist/ user@server:/var/www/
echo "Deployment completed!"`}
                </pre>
              </div>
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-between">
              {editingCommand && (
                <button
                  onClick={() => {
                    confirmDeleteCommand(editingCommand);
                    closeCommandModal();
                  }}
                  className="px-5 py-2.5 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg transition-colors font-medium flex items-center space-x-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Command</span>
                </button>
              )}
              <div className={`flex space-x-3 ${!editingCommand ? 'w-full justify-end' : ''}`}>
                <button
                  onClick={closeCommandModal}
                  className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    await saveCommand();
                    closeCommandModal();
                  }}
                  disabled={!newCommandName || !newCommandContent}
                  className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  <Save className="w-4 h-4" />
                  <span>{editingCommand ? 'Update Command' : 'Create Command'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Server Modal */}
      {showAddServerModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={closeAddServerModal}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Add MCP Server</h3>
                <p className="text-sm text-slate-600 mt-1">Configure a new Model Context Protocol server</p>
              </div>
              <button
                onClick={closeAddServerModal}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>

            {/* Mode Switcher */}
            <div className="px-6 pt-4">
              <div className="flex space-x-1 bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={() => setServerInputMode('form')}
                  className={`flex-1 px-4 py-2 rounded-md transition-all font-medium ${
                    serverInputMode === 'form'
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  📝 Form Mode
                </button>
                <button
                  onClick={() => setServerInputMode('json')}
                  className={`flex-1 px-4 py-2 rounded-md transition-all font-medium ${
                    serverInputMode === 'json'
                      ? 'bg-white text-primary-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {} JSON Mode
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {serverInputMode === 'form' ? (
                <>
                  {/* Server Name */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Server Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newServerForm.name}
                      onChange={(e) => setNewServerForm({ ...newServerForm, name: e.target.value })}
                      placeholder="e.g., mcp-atlassian"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <p className="text-xs text-slate-500 mt-1">A unique identifier for this MCP server</p>
                  </div>

                  {/* Command */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Command <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newServerForm.command}
                      onChange={(e) => setNewServerForm({ ...newServerForm, command: e.target.value })}
                      placeholder="e.g., npx, node, python"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <p className="text-xs text-slate-500 mt-1">The command to execute the MCP server</p>
                  </div>

                  {/* Arguments */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Arguments (Optional)
                    </label>
                    <input
                      type="text"
                      value={newServerForm.args}
                      onChange={(e) => setNewServerForm({ ...newServerForm, args: e.target.value })}
                      placeholder="e.g., -y, @modelcontextprotocol/server-name"
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <p className="text-xs text-slate-500 mt-1">Comma-separated command arguments</p>
                  </div>

                  {/* Environment Variables */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Environment Variables (Optional)
                    </label>
                    <textarea
                      value={newServerForm.env}
                      onChange={(e) => setNewServerForm({ ...newServerForm, env: e.target.value })}
                      placeholder='{\n  "KEY": "value",\n  "API_TOKEN": "your-token"\n}'
                      rows={6}
                      className="w-full px-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">JSON format environment variables</p>
                  </div>

                  {/* Example */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-blue-900 mb-2">💡 Example Configuration:</p>
                    <div className="text-xs text-blue-800 space-y-1 font-mono">
                      <p><strong>Name:</strong> mcp-atlassian</p>
                      <p><strong>Command:</strong> npx</p>
                      <p><strong>Args:</strong> -y, @modelcontextprotocol/server-atlassian</p>
                      <p><strong>Env:</strong> {"{"}"JIRA_URL": "https://..."{"}"}</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* JSON Input */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      MCP Server Configuration (JSON) <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={serverJsonInput}
                      onChange={(e) => setServerJsonInput(e.target.value)}
                      placeholder='Paste your MCP server configuration here...'
                      rows={16}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Paste your complete MCP server configuration in JSON format</p>
                  </div>

                  {/* JSON Example */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm font-semibold text-blue-900 mb-2">💡 Example JSON Format:</p>
                    <pre className="text-xs text-blue-800 font-mono overflow-x-auto">
{`{
  "mcp-atlassian": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-atlassian"],
    "env": {
      "JIRA_URL": "https://your-domain.atlassian.net",
      "JIRA_EMAIL": "your-email@example.com"
    }
  },
  "mcp-postgres": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-postgres"]
  }
}`}
                    </pre>
                    <p className="text-xs text-blue-700 mt-2">
                      ℹ️ You can add multiple servers at once in JSON mode
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex justify-end space-x-3">
              <button
                onClick={closeAddServerModal}
                className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-100 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={addMcpServer}
                disabled={
                  serverInputMode === 'form' 
                    ? (!newServerForm.name || !newServerForm.command)
                    : !serverJsonInput.trim()
                }
                className="px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>{serverInputMode === 'form' ? 'Add Server' : 'Add Servers'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left Sidebar */}
      <div className="w-64 bg-white shadow-lg border-r border-slate-200 flex flex-col">
        {/* Logo/Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary-500 rounded-lg">
              <Settings className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Claude Config</h1>
              <p className="text-xs text-slate-600">Manager</p>
            </div>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav className="flex-1 p-4">
          <div className="space-y-2">
            <button
              onClick={() => setActiveTab('mcp')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                activeTab === 'mcp'
                  ? 'bg-primary-500 text-white shadow-md'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Server className="w-5 h-5" />
              <span className="font-medium">MCP Servers</span>
            </button>
            <button
              onClick={() => setActiveTab('env')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                activeTab === 'env'
                  ? 'bg-primary-500 text-white shadow-md'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Terminal className="w-5 h-5" />
              <span className="font-medium">Environment</span>
            </button>
            <button
              onClick={() => setActiveTab('commands')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                activeTab === 'commands'
                  ? 'bg-primary-500 text-white shadow-md'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Command className="w-5 h-5" />
              <span className="font-medium">Commands</span>
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${
                activeTab === 'chat'
                  ? 'bg-primary-500 text-white shadow-md'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              <span className="font-medium">Chat</span>
            </button>
          </div>
        </nav>

        {/* Footer with Refresh Button */}
        <div className="p-4 border-t border-slate-200">
          <button
            onClick={loadConfig}
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="text-sm font-medium">Refresh Config</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Page Header */}
        <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
          <div className="px-8 py-6">
            <h2 className="text-2xl font-bold text-slate-900">
              {activeTab === 'mcp' && 'MCP Servers Configuration'}
              {activeTab === 'env' && 'Environment Variables'}
              {activeTab === 'commands' && 'Custom Commands'}
              {activeTab === 'chat' && 'Claude Code CLI Chat'}
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              {activeTab === 'mcp' && 'Configure Model Context Protocol servers for Claude CLI'}
              {activeTab === 'env' && 'Manage API credentials and environment settings'}
              {activeTab === 'commands' && 'Create and manage custom command scripts'}
              {activeTab === 'chat' && 'Chat directly with Claude Code CLI'}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
        {/* MCP Servers Tab */}
        {activeTab === 'mcp' && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            {/* Top Action Bar */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
              <button
                onClick={() => setShowAddServerModal(true)}
                className="flex items-center space-x-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-all shadow-sm hover:shadow-md font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>Add MCP Server</span>
              </button>

              <div className="flex items-center space-x-3">
                {newlyAddedServers.size > 0 && (
                  <div className="flex items-center space-x-2 text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                    <span className="text-sm font-medium">
                      {newlyAddedServers.size} unsaved
                    </span>
                  </div>
                )}
                <button
                  onClick={saveClaudeConfig}
                  disabled={saveStatus === 'saving'}
                  className={`flex items-center space-x-2 px-5 py-2.5 rounded-lg transition-all font-medium ${
                    saveStatus === 'success'
                      ? 'bg-green-500 text-white shadow-sm'
                      : saveStatus === 'error'
                      ? 'bg-red-500 text-white shadow-sm'
                      : newlyAddedServers.size > 0
                      ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-md animate-pulse'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300'
                  } disabled:opacity-50`}
                >
                  {saveStatus === 'success' ? (
                    <Check className="w-4 h-4" />
                  ) : saveStatus === 'error' ? (
                    <X className="w-4 h-4" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : 'Save Changes'}</span>
                </button>
              </div>
            </div>

            {/* Server List - Card View */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(editingMcp)
                .sort(([nameA], [nameB]) => {
                  // Sort newly added servers to the top
                  const aIsNew = newlyAddedServers.has(nameA);
                  const bIsNew = newlyAddedServers.has(nameB);
                  if (aIsNew && !bIsNew) return -1;
                  if (!aIsNew && bIsNew) return 1;
                  return nameA.localeCompare(nameB);
                })
                .map(([name, server]) => {
                  const isNewlyAdded = newlyAddedServers.has(name);
                  const hasEnv = server.env && Object.keys(server.env).length > 0;
                  const hasArgs = server.args && server.args.length > 0;
                  
                  return (
                    <div 
                      key={name} 
                      onClick={() => openServerDetail(name)}
                      className={`group relative p-5 border rounded-lg transition-all cursor-pointer ${
                        isNewlyAdded 
                          ? 'border-green-400 bg-green-50 hover:shadow-lg hover:border-green-500' 
                          : 'border-slate-200 bg-white hover:shadow-lg hover:border-primary-300'
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <Server className="w-4 h-4 text-slate-500 flex-shrink-0" />
                            <h3 className="font-semibold text-slate-900 truncate">{name}</h3>
                          </div>
                          {isNewlyAdded && (
                            <span className="inline-block px-2 py-0.5 bg-green-500 text-white text-xs font-semibold rounded-full animate-pulse">
                              NEW
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            confirmDeleteServer(name);
                          }}
                          className="text-slate-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                          title="Delete server"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Command */}
                      <div className="mb-3">
                        <div className="flex items-center space-x-2 text-sm">
                          <Terminal className="w-3.5 h-3.5 text-primary-500" />
                          <code className="text-slate-700 font-mono text-sm">{server.command}</code>
                        </div>
                      </div>

                      {/* Info badges */}
                      <div className="flex flex-wrap gap-2">
                        {hasArgs && (
                          <span className="inline-flex items-center px-2 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded border border-blue-200">
                            {server.args!.length} arg{server.args!.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {hasEnv && (
                          <span className="inline-flex items-center px-2 py-1 bg-purple-50 text-purple-700 text-xs font-medium rounded border border-purple-200">
                            {Object.keys(server.env!).length} env var{Object.keys(server.env!).length > 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {/* Hover indicator */}
                      <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs text-primary-600 font-medium">Click to edit →</span>
                      </div>
                    </div>
                  );
                })}
              
            </div>
            
            {Object.keys(editingMcp).length === 0 && (
              <div className="text-center py-12 text-slate-500 col-span-full">
                <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium mb-2">No MCP servers configured yet</p>
                <p className="text-sm">Click "Add MCP Server" above to get started</p>
              </div>
            )}
          </div>
        )}

        {/* Environment Variables Tab */}
        {activeTab === 'env' && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            {/* Configuration Notice */}
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  {platformInfo.platform === 'windows' ? (
                    <>
                      <h4 className="text-sm font-semibold text-blue-900 mb-1">PowerShell Profile Configuration</h4>
                      <p className="text-sm text-blue-800">
                        Environment variables will be saved to your <strong>PowerShell Profile</strong> and applied immediately. 
                        New PowerShell sessions will also load these variables automatically.
                      </p>
                    </>
                  ) : (
                    <>
                      <h4 className="text-sm font-semibold text-blue-900 mb-1">Shell Configuration</h4>
                      <p className="text-sm text-blue-800">
                        Environment variables will be saved to your <strong>shell config file</strong> (.zshrc or .bashrc) and applied immediately. 
                        New terminal sessions will also load these variables automatically.
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mb-6">
              <button
                onClick={reloadEnvVars}
                className="flex items-center space-x-2 px-4 py-2.5 rounded-lg transition-all font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
                title={platformInfo.platform === 'windows' 
                  ? "Reload environment variables from PowerShell Profile" 
                  : "Reload environment variables from shell config (.zshrc or .bashrc)"}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload</span>
              </button>
              
              <button
                onClick={saveEnvVars}
                disabled={saveStatus === 'saving'}
                className={`flex items-center space-x-2 px-6 py-2.5 rounded-lg transition-all font-medium ${
                  saveStatus === 'success'
                    ? 'bg-green-500 text-white'
                    : saveStatus === 'error'
                    ? 'bg-red-500 text-white'
                    : 'bg-primary-500 hover:bg-primary-600 text-white'
                } disabled:opacity-50`}
              >
                {saveStatus === 'success' ? (
                  <Check className="w-4 h-4" />
                ) : saveStatus === 'error' ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>{saveStatus === 'saving' ? 'Saving...' : saveStatus === 'success' ? 'Saved!' : 'Save Changes'}</span>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ANTHROPIC_BASE_URL
                </label>
                <input
                  type="text"
                  value={envVars.baseUrl}
                  onChange={(e) => setEnvVars({ ...envVars, baseUrl: e.target.value })}
                  placeholder="https://api.anthropic.com"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  ANTHROPIC_API_KEY
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={envVars.authToken}
                    onChange={(e) => setEnvVars({ ...envVars, authToken: e.target.value })}
                    placeholder="sk-ant-..."
                    className="w-full px-4 py-3 pr-12 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    title={showApiKey ? "Hide API key" : "Show API key"}
                  >
                    {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Model Defaults (Optional)</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      ANTHROPIC_DEFAULT_HAIKU_MODEL
                    </label>
                    <input
                      type="text"
                      value={envVars.haikuModel}
                      onChange={(e) => setEnvVars({ ...envVars, haikuModel: e.target.value })}
                      placeholder="e.g., claude-3-5-haiku-20241022"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      ANTHROPIC_DEFAULT_OPUS_MODEL
                    </label>
                    <input
                      type="text"
                      value={envVars.opusModel}
                      onChange={(e) => setEnvVars({ ...envVars, opusModel: e.target.value })}
                      placeholder="e.g., claude-3-opus-20240229"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      ANTHROPIC_DEFAULT_SONNET_MODEL
                    </label>
                    <input
                      type="text"
                      value={envVars.sonnetModel}
                      onChange={(e) => setEnvVars({ ...envVars, sonnetModel: e.target.value })}
                      placeholder="e.g., claude-3-5-sonnet-20241022"
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Note:</strong> After saving:
                </p>
                <ul className="text-sm text-blue-700 mt-2 ml-4 list-disc">
                  <li><strong>Windows:</strong> Restart terminals/applications (variables set system-wide)</li>
                  <li><strong>macOS/Linux:</strong> Run <code className="px-1 py-0.5 bg-blue-100 rounded">source ~/.zshrc</code> or restart terminal</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Commands Tab */}
        {activeTab === 'commands' && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            {/* Top Action Bar */}
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200">
              <button
                onClick={() => openCommandModal()}
                className="flex items-center space-x-2 px-5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-all shadow-sm hover:shadow-md font-medium"
              >
                <Plus className="w-4 h-4" />
                <span>Add Command</span>
              </button>
            </div>

            {/* Commands List - Card View */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {commands.map((cmd) => {
                const previewLines = cmd.content.split('\n').slice(0, 3);
                const hasMore = cmd.content.split('\n').length > 3;
                
                return (
                  <div 
                    key={cmd.name} 
                    onClick={() => openCommandModal(cmd)}
                    className="group relative p-5 border border-slate-200 bg-white rounded-lg hover:shadow-lg hover:border-primary-300 transition-all cursor-pointer"
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <Command className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          <h3 className="font-semibold text-slate-900 truncate">{cmd.name}</h3>
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          confirmDeleteCommand(cmd.name);
                        }}
                        className="text-slate-400 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete command"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Content Preview */}
                    <div className="mb-3">
                      <pre className="text-xs text-slate-600 font-mono bg-slate-50 p-2 rounded overflow-hidden">
                        {previewLines.join('\n')}
                        {hasMore && '\n...'}
                      </pre>
                    </div>

                    {/* Info badges */}
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center px-2 py-1 bg-slate-100 text-slate-700 text-xs font-medium rounded">
                        {cmd.content.split('\n').length} lines
                      </span>
                      
                      {/* Hover indicator */}
                      <span className="text-xs text-primary-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to edit →
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {commands.length === 0 && (
              <div className="text-center py-12 text-slate-500">
                <Command className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-lg font-medium mb-2">No commands configured yet</p>
                <p className="text-sm">Click "Add Command" above to get started</p>
              </div>
            )}
          </div>
        )}

        {/* Chat Tab */}
        {activeTab === 'chat' && (
          <div className="h-[calc(100vh-180px)] flex flex-col bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
            {/* Chat Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-sm text-slate-600">Claude Code CLI is ready</span>
              </div>
              
              <div className="flex items-center space-x-3">
                {/* Custom Model Selector */}
                <div className="relative">
                  <button
                    onClick={() => setShowModelSelector(!showModelSelector)}
                    className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white rounded-xl transition-all shadow-md hover:shadow-lg font-medium"
                  >
                    {selectedModel === 'auto' && <Bot className="w-4 h-4" />}
                    {selectedModel === 'haiku' && <Zap className="w-4 h-4" />}
                    {selectedModel === 'opus' && <Target className="w-4 h-4" />}
                    {selectedModel === 'sonnet' && <Sparkles className="w-4 h-4" />}
                    <span className="text-sm">
                      {selectedModel === 'auto' && 'Auto'}
                      {selectedModel === 'haiku' && 'Haiku'}
                      {selectedModel === 'opus' && 'Opus'}
                      {selectedModel === 'sonnet' && 'Sonnet'}
                    </span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${showModelSelector ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Dropdown Menu */}
                  {showModelSelector && (
                    <>
                      {/* Backdrop */}
                      <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setShowModelSelector(false)}
                      />
                      
                      {/* Menu */}
                      <div className="absolute top-full left-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50">
                        <div className="py-2">
                          <button
                            onClick={() => {
                              setSelectedModel('auto');
                              setShowModelSelector(false);
                            }}
                            className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-purple-50 transition-colors ${
                              selectedModel === 'auto' ? 'bg-purple-100 text-purple-700' : 'text-slate-700'
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              selectedModel === 'auto' 
                                ? 'bg-purple-500 text-white' 
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              <Bot className="w-4 h-4" />
                            </div>
                            <div className="flex-1 text-left">
                              <div className="font-semibold text-sm">Auto</div>
                              <div className="text-xs text-slate-500">Default model</div>
                            </div>
                            {selectedModel === 'auto' && <Check className="w-4 h-4 text-purple-600" />}
                          </button>

                          {envVars.haikuModel && (
                            <button
                              onClick={() => {
                                setSelectedModel('haiku');
                                setShowModelSelector(false);
                              }}
                              className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-amber-50 transition-colors ${
                                selectedModel === 'haiku' ? 'bg-amber-100 text-amber-700' : 'text-slate-700'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                selectedModel === 'haiku' 
                                  ? 'bg-amber-500 text-white' 
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                <Zap className="w-4 h-4" />
                              </div>
                              <div className="flex-1 text-left">
                                <div className="font-semibold text-sm">Haiku</div>
                                <div className="text-xs text-slate-500">Fast & efficient</div>
                              </div>
                              {selectedModel === 'haiku' && <Check className="w-4 h-4 text-amber-600" />}
                            </button>
                          )}

                          {envVars.opusModel && (
                            <button
                              onClick={() => {
                                setSelectedModel('opus');
                                setShowModelSelector(false);
                              }}
                              className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-rose-50 transition-colors ${
                                selectedModel === 'opus' ? 'bg-rose-100 text-rose-700' : 'text-slate-700'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                selectedModel === 'opus' 
                                  ? 'bg-rose-500 text-white' 
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                <Target className="w-4 h-4" />
                              </div>
                              <div className="flex-1 text-left">
                                <div className="font-semibold text-sm">Opus</div>
                                <div className="text-xs text-slate-500">Most powerful</div>
                              </div>
                              {selectedModel === 'opus' && <Check className="w-4 h-4 text-rose-600" />}
                            </button>
                          )}

                          {envVars.sonnetModel && (
                            <button
                              onClick={() => {
                                setSelectedModel('sonnet');
                                setShowModelSelector(false);
                              }}
                              className={`w-full px-4 py-3 flex items-center space-x-3 hover:bg-emerald-50 transition-colors ${
                                selectedModel === 'sonnet' ? 'bg-emerald-100 text-emerald-700' : 'text-slate-700'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                selectedModel === 'sonnet' 
                                  ? 'bg-emerald-500 text-white' 
                                  : 'bg-slate-100 text-slate-600'
                              }`}>
                                <Sparkles className="w-4 h-4" />
                              </div>
                              <div className="flex-1 text-left">
                                <div className="font-semibold text-sm">Sonnet</div>
                                <div className="text-xs text-slate-500">Balanced choice</div>
                              </div>
                              {selectedModel === 'sonnet' && <Check className="w-4 h-4 text-emerald-600" />}
                            </button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <button
                  onClick={clearChatHistory}
                  disabled={chatMessages.length === 0}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed border border-slate-200 shadow-sm"
                >
                  Clear History
                </button>
              </div>
            </div>

            {/* Working Directory and Context Files */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 space-y-2">
              {/* Working Directory */}
              <div className="flex items-center space-x-2">
                <FolderOpen className="w-4 h-4 text-slate-500" />
                <label className="text-xs font-medium text-slate-600 whitespace-nowrap">Working Directory:</label>
                <input
                  type="text"
                  value={chatWorkingDir}
                  onChange={(e) => setChatWorkingDir(e.target.value)}
                  placeholder="~/your/project/path"
                  className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-transparent"
                  readOnly
                />
                <button
                  onClick={openDirectoryBrowser}
                  className="px-3 py-1 bg-slate-600 hover:bg-slate-700 text-white text-xs rounded flex items-center space-x-1"
                >
                  <FolderOpen className="w-3 h-3" />
                  <span>Browse</span>
                </button>
              </div>

              {/* Context Files */}
              <div className="flex items-start space-x-2">
                <FileText className="w-4 h-4 text-slate-500 mt-1" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-slate-600">Context Files:</label>
                    <span className="text-xs text-slate-500 italic">Type @ in chat to add files</span>
                  </div>
                  
                  {chatContextFiles.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {chatContextFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center space-x-1 px-2 py-1 bg-white border border-slate-300 rounded text-xs"
                        >
                          <span className="text-slate-700">{file}</span>
                          <button
                            onClick={() => removeContextFile(file)}
                            className="text-slate-400 hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">No files in context. Type @ in the chat input to select files.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gradient-to-b from-slate-50 to-white">
              {chatMessages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-2">Start a conversation</h3>
                  <p className="text-sm text-slate-500 mb-6">Ask Claude anything about your code or project</p>
                  
                  {/* Command hints */}
                  <div className="max-w-2xl mx-auto mt-8">
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                      <h4 className="text-sm font-semibold text-blue-900 mb-3 flex items-center">
                        <Terminal className="w-4 h-4 mr-2" />
                        Quick Commands
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-xs text-blue-800">
                        <button
                          onClick={() => setChatInput('/help')}
                          className="text-left px-3 py-2 bg-white hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                        >
                          <code className="font-mono text-blue-600">/help</code> - Show all commands
                        </button>
                        <button
                          onClick={() => setChatInput('/clear')}
                          className="text-left px-3 py-2 bg-white hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                        >
                          <code className="font-mono text-blue-600">/clear</code> - Clear context
                        </button>
                        <button
                          onClick={() => setChatInput('/list')}
                          className="text-left px-3 py-2 bg-white hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                        >
                          <code className="font-mono text-blue-600">/list</code> - List files
                        </button>
                        <button
                          onClick={() => setChatInput('/context')}
                          className="text-left px-3 py-2 bg-white hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                        >
                          <code className="font-mono text-blue-600">/context</code> - Show context
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {chatMessages.map((message, index) => (
                    <div
                      key={message.id}
                      className={`flex items-start gap-4 mb-6 animate-fade-in ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                      style={{ animationDelay: `${index * 0.05}s` }}
                    >
                      {/* Avatar */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                        message.role === 'user' 
                          ? 'bg-gradient-to-br from-blue-500 via-blue-600 to-purple-600 shadow-lg shadow-blue-500/30' 
                          : 'bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 shadow-lg shadow-emerald-500/30'
                      } ring-2 ring-white`}>
                        {message.role === 'user' ? (
                          <User className="w-5 h-5 text-white drop-shadow" />
                        ) : (
                          <Bot className="w-5 h-5 text-white drop-shadow" />
                        )}
                      </div>

                      {/* Message Bubble */}
                      <div className="flex max-w-[78%]">
                        <div
                          className={`inline-block rounded-2xl px-5 py-3.5 transition-all duration-200 hover:scale-[1.01] ${
                            message.role === 'user'
                              ? 'bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20'
                              : 'bg-white border-2 border-slate-100 text-slate-900 shadow-lg shadow-slate-200/50 hover:border-slate-200'
                          }`}
                        >
                          {message.role === 'user' ? (
                            <p className="text-[15px] whitespace-pre-wrap leading-relaxed font-medium">{message.content}</p>
                          ) : (
                            <div className="text-[15px] prose prose-sm max-w-none prose-slate">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm]}
                                  components={{
                                    code({ node, inline, className, children, ...props }: any) {
                                      const match = /language-(\w+)/.exec(className || '');
                                      return !inline && match ? (
                                        <SyntaxHighlighter
                                          style={vscDarkPlus}
                                          language={match[1]}
                                          PreTag="div"
                                          {...props}
                                        >
                                          {String(children).replace(/\n$/, '')}
                                        </SyntaxHighlighter>
                                      ) : (
                                        <code className="bg-gradient-to-r from-slate-800 to-slate-900 text-emerald-300 px-2 py-0.5 rounded-md text-sm font-mono shadow-sm" {...props}>
                                          {children}
                                        </code>
                                      );
                                    },
                                    p: ({ children }) => <p className="mb-3 last:mb-0 text-slate-800 leading-relaxed">{children}</p>,
                                    ul: ({ children }) => <ul className="list-disc list-outside ml-5 mb-3 space-y-1.5 text-slate-800">{children}</ul>,
                                    ol: ({ children }) => <ol className="list-decimal list-outside ml-5 mb-3 space-y-1.5 text-slate-800">{children}</ol>,
                                    li: ({ children }) => <li className="text-slate-800 leading-relaxed">{children}</li>,
                                    h1: ({ children }) => <h1 className="text-xl font-bold mb-3 mt-5 first:mt-0 text-slate-900 border-b-2 border-slate-200 pb-2">{children}</h1>,
                                    h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-4 first:mt-0 text-slate-900">{children}</h2>,
                                    h3: ({ children }) => <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0 text-slate-900">{children}</h3>,
                                    blockquote: ({ children }) => (
                                      <blockquote className="border-l-4 border-slate-300 pl-4 italic my-2 text-slate-700">
                                        {children}
                                      </blockquote>
                                    ),
                                    a: ({ children, href }) => (
                                      <a href={href} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
                                        {children}
                                      </a>
                                    ),
                                    table: ({ children }) => (
                                      <div className="overflow-x-auto my-2">
                                        <table className="min-w-full border border-slate-300">{children}</table>
                                      </div>
                                    ),
                                    th: ({ children }) => (
                                      <th className="border border-slate-300 px-2 py-1 bg-slate-200 text-slate-900 font-semibold text-left">
                                        {children}
                                      </th>
                                    ),
                                    td: ({ children }) => (
                                      <td className="border border-slate-300 px-2 py-1 text-slate-900">{children}</td>
                                    ),
                                  }}
                                >
                                  {message.content}
                                </ReactMarkdown>
                            </div>
                          )}
                        </div>
                        {/* Timestamp */}
                        <p className={`text-[11px] text-slate-400 font-medium mt-2 px-1 ${
                          message.role === 'user' ? 'text-right' : 'text-left'
                        }`}>
                          {message.timestamp.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  ))}
                  {isSendingMessage && (
                    <div className="flex items-start gap-4 mb-6 animate-fade-in">
                      {/* Claude Avatar */}
                      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 ring-2 ring-white animate-pulse">
                        <Bot className="w-5 h-5 text-white drop-shadow" />
                      </div>
                      {/* Typing Indicator */}
                      <div className="flex max-w-[78%]">
                        <div className="inline-block bg-white border-2 border-slate-100 rounded-2xl px-5 py-4 shadow-lg shadow-slate-200/50">
                          <div className="flex items-center space-x-2">
                            <div className="flex space-x-1">
                              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce"></div>
                              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                            <span className="text-sm text-slate-500 font-medium">正在思考...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </>
              )}
            </div>

            {/* Chat Input */}
            <div className="border-t border-slate-200 p-4 bg-gradient-to-r from-slate-50 to-white">
              {chatInput.startsWith('/') && !showSlashCommandList && (
                <div className="mb-2 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700 flex items-center space-x-2">
                  <Terminal className="w-3 h-3" />
                  <span>💡 Use <kbd className="px-1 bg-blue-100 rounded">↑↓</kbd> to navigate commands, <kbd className="px-1 bg-blue-100 rounded">Enter</kbd> to select</span>
                </div>
              )}
              {chatInput.includes('@') && !showFileAutocomplete && (
                <div className="mb-2 px-2 py-1 bg-green-50 border border-green-200 rounded text-xs text-green-700">
                  📎 File selector active. Use the search box to find files or click to navigate folders.
                </div>
              )}
              
              <div className="relative">
                <div className="flex items-center space-x-3">
                  <input
                    ref={chatInputRef}
                    type="text"
                    value={chatInput}
                    onChange={(e) => handleChatInputChange(e.target.value)}
                    onKeyDown={(e) => {
                      // Handle slash command navigation
                      if (showSlashCommandList) {
                        const filteredCommands = slashCommands.filter(cmd => 
                          cmd.command.toLowerCase().includes(chatInput.toLowerCase())
                        );
                        handleSlashCommandKeyDown(e, filteredCommands);
                      }
                    }}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && !showFileAutocomplete && !showSlashCommandList) {
                        e.preventDefault();
                        sendChatMessage();
                      }
                    }}
                    placeholder="Type your message, @ to add files, or / for commands..."
                    className="flex-1 px-5 py-3 border-2 border-slate-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-400 transition-all bg-white shadow-sm"
                    disabled={isSendingMessage}
                  />
                  <button
                    onClick={sendChatMessage}
                    disabled={!chatInput.trim() || isSendingMessage}
                    className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 shadow-md hover:shadow-lg font-medium"
                  >
                    <Send className="w-4 h-4" />
                    <span>Send</span>
                  </button>
                </div>

                {/* Slash Command List Dropdown */}
                {showSlashCommandList && (() => {
                  const filteredCommands = slashCommands.filter(cmd => 
                    cmd.command.toLowerCase().includes(chatInput.toLowerCase())
                  );
                  
                  return (
                  <div className="absolute bottom-full left-0 right-16 mb-2 bg-white border border-slate-300 rounded-lg shadow-lg z-50 flex flex-col max-h-96">
                    {/* Header */}
                    <div className="px-3 py-2 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50">
                      <div className="flex items-center space-x-2">
                        <Terminal className="w-4 h-4 text-blue-600" />
                        <p className="text-xs font-semibold text-blue-900">Available Slash Commands</p>
                      </div>
                    </div>

                    {/* Command List */}
                    <div className="flex-1 overflow-y-auto max-h-80" id="slash-command-list">
                      {filteredCommands.map((cmd, index) => (
                        <button
                          key={index}
                          id={`slash-command-${index}`}
                          onClick={() => selectSlashCommand(cmd.command)}
                          className={`w-full px-4 py-3 text-left border-b border-slate-100 last:border-b-0 transition-colors ${
                            index === selectedSlashCommandIndex 
                              ? 'bg-blue-50 border-blue-200' 
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start space-x-3">
                            <code className={`text-sm font-mono font-semibold px-2 py-1 rounded ${
                              index === selectedSlashCommandIndex 
                                ? 'bg-blue-100 text-blue-700' 
                                : 'bg-slate-100 text-slate-700'
                            }`}>
                              {cmd.command}
                            </code>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-600 leading-relaxed">{cmd.description}</p>
                              {cmd.category === 'interactive' && (
                                <span className="inline-block mt-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-xs rounded">
                                  Requires interactive session
                                </span>
                              )}
                              {cmd.category === 'fully-supported' && (
                                <span className="inline-block mt-1 px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                                  ✓ Fully supported
                                </span>
                              )}
                              {cmd.category === 'custom' && (
                                <span className="inline-block mt-1 px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                                  ⚡ Custom command
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                      {filteredCommands.length === 0 && (
                        <div className="px-3 py-8 text-center text-sm text-slate-500">
                          <Terminal className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                          <p>No matching commands found</p>
                          <p className="text-xs mt-1">Type <code className="bg-slate-100 px-1 rounded">/</code> to see all commands</p>
                        </div>
                      )}
                    </div>

                    {/* Footer hint */}
                    <div className="px-3 py-2 border-t border-slate-200 bg-slate-50">
                      <p className="text-xs text-slate-500">
                        <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-xs">↑↓</kbd> Navigate
                        {' '}<kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-xs">Enter</kbd> Select
                        {' '}<kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-xs">Esc</kbd> Close
                      </p>
                    </div>
                  </div>
                  );
                })()}

                {/* File Autocomplete Dropdown */}
                {showFileAutocomplete && (() => {
                  const filteredFiles = autocompleteFiles.filter(file => 
                    !autocompleteSearchQuery || 
                    file.name.toLowerCase().includes(autocompleteSearchQuery.toLowerCase())
                  );
                  
                  return (
                  <div className="absolute bottom-full left-0 right-16 mb-2 bg-white border border-slate-300 rounded-lg shadow-lg z-50 flex flex-col max-h-96">
                    {/* Header */}
                    <div className="px-3 py-2 border-b border-slate-200 bg-slate-50">
                      <p className="text-xs font-medium text-slate-600">Select a file or directory</p>
                    </div>
                    
                    {/* Search Input */}
                    <div className="p-3 border-b border-slate-200">
                      <input
                        ref={autocompleteSearchRef}
                        type="text"
                        value={autocompleteSearchQuery}
                        onChange={(e) => {
                          setAutocompleteSearchQuery(e.target.value);
                          setSelectedAutocompleteIndex(0); // Reset selection when search changes
                        }}
                        placeholder="Search files and folders..."
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        onKeyDown={(e) => handleAutocompleteKeyDown(e, filteredFiles)}
                      />
                    </div>

                    {/* File List */}
                    <div className="flex-1 overflow-y-auto max-h-64" id="autocomplete-file-list">
                      {filteredFiles.map((file, index) => (
                        <button
                          key={index}
                          id={`autocomplete-file-${index}`}
                          onClick={() => selectFileFromAutocomplete(file.path, file.isDirectory)}
                          className={`w-full px-3 py-2 text-left flex items-center space-x-2 text-sm border-b border-slate-100 last:border-b-0 ${
                            index === selectedAutocompleteIndex 
                              ? 'bg-primary-100 border-primary-200' 
                              : 'hover:bg-slate-100'
                          }`}
                        >
                          {file.isDirectory ? (
                            <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          )}
                          <span className="flex-1 truncate">{file.name}</span>
                          {file.isDirectory && (
                            <span className="text-xs text-slate-400">→</span>
                          )}
                        </button>
                      ))}
                      {filteredFiles.length === 0 && (
                        <div className="px-3 py-8 text-center text-sm text-slate-500">
                          {autocompleteSearchQuery ? 'No matching files or folders found' : 'No files in this directory'}
                        </div>
                      )}
                    </div>

                    {/* Footer hint */}
                    <div className="px-3 py-2 border-t border-slate-200 bg-slate-50">
                      <p className="text-xs text-slate-500">
                        <kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-xs">↑↓</kbd> Navigate
                        {' '}<kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-xs">Enter</kbd> Select
                        {' '}<kbd className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-xs">Esc</kbd> Close
                      </p>
                    </div>
                  </div>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>

      {/* Directory Browser Modal */}
      {showDirectoryBrowser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">Browse Directory</h3>
              <button
                onClick={closeDirectoryBrowser}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Path Navigation */}
            <div className="px-6 py-4 bg-white border-b border-slate-200 space-y-3">
              {/* Path Input */}
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={pathInputValue}
                  onChange={(e) => setPathInputValue(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      navigateToPath();
                    }
                  }}
                  placeholder={
                    platformInfo.platform === 'windows' 
                      ? "Enter path (e.g., C:\\Users\\YourName\\Documents or %USERPROFILE%\\Desktop)"
                      : "Enter path (e.g., ~/Documents or /Users/yourname/projects)"
                  }
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono"
                />
                <button
                  onClick={navigateToPath}
                  className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm rounded-lg transition-colors flex items-center space-x-1"
                >
                  <span>Go</span>
                </button>
              </div>

              {/* Quick Paths */}
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-slate-600 font-medium mr-2 flex items-center">Quick:</span>
                <button
                  onClick={() => goToQuickPath(platformInfo.quickPaths.home)}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded border border-slate-300 transition-colors"
                >
                  🏠 Home
                </button>
                <button
                  onClick={() => goToQuickPath(platformInfo.quickPaths.desktop)}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded border border-slate-300 transition-colors"
                >
                  🖥️ Desktop
                </button>
                <button
                  onClick={() => goToQuickPath(platformInfo.quickPaths.documents)}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded border border-slate-300 transition-colors"
                >
                  📄 Documents
                </button>
                <button
                  onClick={() => goToQuickPath(platformInfo.quickPaths.downloads)}
                  className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded border border-slate-300 transition-colors"
                >
                  📥 Downloads
                </button>
                
                {/* Windows: Show drives, Unix: Show root */}
                {platformInfo.platform === 'windows' && platformInfo.drives && platformInfo.drives.length > 0 ? (
                  platformInfo.drives.map(drive => (
                    <button
                      key={drive}
                      onClick={() => goToQuickPath(drive)}
                      className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs rounded border border-blue-300 transition-colors font-mono"
                    >
                      💾 {drive}
                    </button>
                  ))
                ) : platformInfo.quickPaths.root ? (
                  <button
                    onClick={() => goToQuickPath(platformInfo.quickPaths.root)}
                    className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs rounded border border-slate-300 transition-colors"
                  >
                    💾 Root
                  </button>
                ) : null}
              </div>
            </div>

            {/* Current Path Display */}
            <div className="px-6 py-2 bg-slate-50 border-b border-slate-200">
              <div className="flex items-center space-x-2">
                <FolderOpen className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-mono text-slate-600">Current: </span>
                <span className="text-xs font-mono text-slate-900 font-semibold">{currentBrowsingPath}</span>
              </div>
            </div>

            {/* Search Filter - Fixed at top */}
            <div className="px-4 py-3 border-b border-slate-200 bg-white">
              <input
                ref={fileSearchRef}
                type="text"
                value={fileSearchQuery}
                onChange={(e) => {
                  setFileSearchQuery(e.target.value);
                  setSelectedBrowserFileIndex(0); // Reset selection when search changes
                }}
                placeholder="Filter files and folders..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                onKeyDown={(e) => {
                  const filteredBrowserFiles = directoryFiles.filter(file => 
                    !fileSearchQuery || 
                    file.name.toLowerCase().includes(fileSearchQuery.toLowerCase())
                  );
                  handleBrowserFileKeyDown(e, filteredBrowserFiles);
                }}
              />
            </div>

            {/* File List - Scrollable */}
            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                const filteredBrowserFiles = directoryFiles.filter(file => 
                  !fileSearchQuery || 
                  file.name.toLowerCase().includes(fileSearchQuery.toLowerCase())
                );
                
                return (
                  <>
                    {/* Parent Directory Button */}
                    {currentBrowsingPath !== '/' && currentBrowsingPath !== '~' && (
                      <button
                        onClick={() => {
                          const parentPath = currentBrowsingPath.split('/').slice(0, -1).join('/') || '/';
                          browseToDirectory(parentPath);
                          setFileSearchQuery(''); // Clear filter when navigating
                          setSelectedBrowserFileIndex(0); // Reset selection
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-slate-100 flex items-center space-x-2 text-sm border-b border-slate-200 mb-2"
                      >
                        <FolderOpen className="w-4 h-4 text-slate-400" />
                        <span className="font-medium">.. (Parent Directory)</span>
                      </button>
                    )}

                    {/* Directory Contents */}
                    <div className="space-y-1" id="browser-file-list">
                      {filteredBrowserFiles.map((file, index) => (
                        <button
                          key={index}
                          id={`browser-file-${index}`}
                          onClick={() => {
                            selectFileFromBrowser(file.path, file.isDirectory);
                            if (file.isDirectory) {
                              setFileSearchQuery(''); // Clear filter when navigating to a directory
                              setSelectedBrowserFileIndex(0); // Reset selection
                            }
                          }}
                          className={`w-full px-3 py-2 text-left flex items-center space-x-2 text-sm rounded border ${
                            index === selectedBrowserFileIndex
                              ? 'bg-primary-100 border-primary-200'
                              : 'border-transparent hover:bg-slate-100 hover:border-slate-300'
                          }`}
                        >
                          {file.isDirectory ? (
                            <FolderOpen className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                          )}
                          <span className="flex-1 truncate">{file.name}</span>
                          {file.isDirectory && (
                            <span className="text-xs text-slate-400">→</span>
                          )}
                        </button>
                      ))}
                      {filteredBrowserFiles.length === 0 && (
                        <div className="px-3 py-8 text-center text-sm text-slate-500">
                          {fileSearchQuery ? 'No matching files or folders found' : 'This directory is empty'}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50">
              <button
                onClick={closeDirectoryBrowser}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={selectDirectory}
                className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm rounded-lg transition-colors flex items-center space-x-2"
              >
                <Check className="w-4 h-4" />
                <span>Select This Directory</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

