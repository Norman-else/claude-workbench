import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, X, Send, User, Bot, Trash2, Check, Wrench, Maximize2, Minimize2, Cpu, Plus, MessageSquare, ChevronDown, Paperclip, FolderOpen, Globe, Clock, Layers, Server, Terminal, Zap, ShoppingBag, Settings, HardDrive, Package } from 'lucide-react';
import type { AIModelOption, AIToolInfo, AIConversation, AIAttachment, SavedProject } from '../types';
import { getAvailableModels, getAITools, getConversations, createConversation, deleteConversation, generateConversationName, getProjects, getTerminalConfirmCommands, saveTerminalConfirmCommands } from '../api';
import { useAIChat } from '../hooks/useAIChat';
import { useProject } from '../ProjectContext';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

const TOOL_CATEGORIES: Record<string, string[]> = {
  System: ['get_current_datetime', 'get_system_info', 'web_search'],
  Environment: ['list_environments', 'get_environment', 'create_environment', 'update_environment', 'activate_environment', 'deactivate_environment', 'delete_environment', 'reorder_environments'],
  'MCP Servers': ['get_mcp_server_statuses', 'get_mcp_runtime_status', 'start_mcp_server', 'stop_mcp_server', 'restart_mcp_server', 'get_mcp_server_logs', 'add_mcp_server', 'remove_mcp_server', 'update_mcp_server'],
  Commands: ['list_commands', 'get_command', 'create_command', 'update_command', 'delete_command'],
  Skills: ['list_skills', 'get_skill', 'create_skill', 'update_skill', 'delete_skill'],
  Marketplace: ['list_marketplaces', 'add_marketplace', 'remove_marketplace', 'list_installed_plugins', 'install_plugin', 'uninstall_plugin'],
  App: ['get_app_config'],
  'File System': ['read_local_path', 'write_local_path'],
  Terminal: ['execute_terminal_command'],
};

function getToolCategory(toolName: string): string {
  for (const [category, toolNames] of Object.entries(TOOL_CATEGORIES)) {
    if (toolNames.includes(toolName)) return category;
  }
  return 'Other';
}

function groupToolsByCategory(toolList: AIToolInfo[]): Record<string, AIToolInfo[]> {
  const groups: Record<string, AIToolInfo[]> = {};
  const categoryOrder = Object.keys(TOOL_CATEGORIES);
  for (const tool of toolList) {
    const cat = getToolCategory(tool.name);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(tool);
  }
  // Sort groups by defined category order
  const sorted: Record<string, AIToolInfo[]> = {};
  for (const cat of categoryOrder) {
    if (groups[cat]) sorted[cat] = groups[cat];
  }
  if (groups['Other']) sorted['Other'] = groups['Other'];
  return sorted;
}

const CATEGORY_META: Record<string, { icon: typeof Clock; accent: string }> = {
  System: { icon: Clock, accent: '#60a5fa' },
  Environment: { icon: Layers, accent: '#34d399' },
  'MCP Servers': { icon: Server, accent: '#a78bfa' },
  Commands: { icon: Terminal, accent: '#fb923c' },
  Skills: { icon: Zap, accent: '#facc15' },
  Marketplace: { icon: ShoppingBag, accent: '#f472b6' },
  App: { icon: Settings, accent: '#94a3b8' },
  'File System': { icon: HardDrive, accent: '#2dd4bf' },
  Terminal: { icon: Terminal, accent: '#10b981' },
  Other: { icon: Package, accent: '#71717a' },
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onToolCall?: (toolName: string) => void;
}


export function AIAssistantDrawer({ isOpen, onClose, onToolCall }: AIAssistantDrawerProps) {
  // ── Conversation state ──
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showConversationList, setShowConversationList] = useState(false);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const conversationListRef = useRef<HTMLDivElement>(null);
  const hasAutoNamed = useRef<Set<string>>(new Set());

  // ── Chat hook (MUST be before any conditional returns) ──
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-6');
  const handleStreamComplete = useCallback(() => {
    if (!activeConversationId) return;
    const conv = conversations.find(c => c.id === activeConversationId);
    if (!conv || conv.name !== 'New Chat') return;
    if (hasAutoNamed.current.has(activeConversationId)) return;
    hasAutoNamed.current.add(activeConversationId);
    generateConversationName(activeConversationId, selectedModel)
      .then((name) => {
        setConversations(prev =>
          prev.map(c => c.id === activeConversationId ? { ...c, name } : c)
        );
      })
      .catch(() => {
        // Naming failed — allow retry on next stream
        hasAutoNamed.current.delete(activeConversationId);
      });
  }, [activeConversationId, conversations, selectedModel]);
  const { projects: sidebarProjects } = useProject();
  const [aiSelectedProject, setAiSelectedProject] = useState<SavedProject | null>(null);
  const [aiProjects, setAiProjects] = useState<SavedProject[]>([]);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const projectDropdownRef = useRef<HTMLDivElement>(null);
  const currentProjectPath = aiSelectedProject?.path ?? undefined;
  const { messages: chatMessages, isLoading: chatIsLoading, error: chatError, pendingConfirmation, sendMessage, stopGeneration, confirmCommand, rejectCommand } = useAIChat(activeConversationId, { onToolCall, onStreamComplete: handleStreamComplete, projectPath: currentProjectPath });

  const handleProjectSwitch = useCallback(async (project: SavedProject | null) => {
    const prevPath = aiSelectedProject?.path ?? null;
    const newPath = project?.path ?? null;
    if (prevPath === newPath) {
      setShowProjectDropdown(false);
      return;
    }
    setAiSelectedProject(project);
    setShowProjectDropdown(false);
    // Always create a new conversation on project switch to avoid stale context
    try {
      const newConv = await createConversation(newPath ?? undefined);
      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
    } catch {
      // ignore
    }
  }, [aiSelectedProject]);

  const [input, setInput] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [modelOptions, setModelOptions] = useState<AIModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [noProfile, setNoProfile] = useState(false);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const [tools, setTools] = useState<AIToolInfo[]>([]);
  const [toolPaletteOpen, setToolPaletteOpen] = useState(false);
  const toolPaletteRef = useRef<HTMLDivElement>(null);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilterText, setSlashFilterText] = useState('');
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [modelSlashMenuOpen, setModelSlashMenuOpen] = useState(false);
  const [modelSlashFilterText, setModelSlashFilterText] = useState('');
  const [modelSlashSelectedIndex, setModelSlashSelectedIndex] = useState(0);
  const [attachments, setAttachments] = useState<AIAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Settings panel state ──
  const [showSettings, setShowSettings] = useState(false);
  const [defaultConfirmCmds, setDefaultConfirmCmds] = useState<string[]>([]);
  const [userConfirmCmds, setUserConfirmCmds] = useState<string[]>([]);
  const [confirmCmdInput, setConfirmCmdInput] = useState('');
  const [confirmCmdsLoading, setConfirmCmdsLoading] = useState(false);

  // Compute filtered tools for slash command menu
  const slashFilteredTools = useMemo(() => {
    if (!slashMenuOpen || tools.length === 0) return [];
    if (!slashFilterText) return tools;
    const lower = slashFilterText.toLowerCase();
    return tools.filter(t =>
      t.name.toLowerCase().includes(lower) ||
      t.description.toLowerCase().includes(lower)
    );
  }, [slashMenuOpen, slashFilterText, tools]);

  // Compute filtered models for /model slash command menu
  const modelSlashFilteredOptions = useMemo(() => {
    if (!modelSlashMenuOpen || modelOptions.length === 0) return [];
    if (!modelSlashFilterText) return modelOptions;
    const lower = modelSlashFilterText.toLowerCase();
    return modelOptions.filter(opt =>
      opt.label.toLowerCase().includes(lower) ||
      opt.id.toLowerCase().includes(lower)
    );
  }, [modelSlashMenuOpen, modelSlashFilterText, modelOptions]);

  // Get active conversation object
  const activeConversation = useMemo(() => {
    return conversations.find(c => c.id === activeConversationId) ?? null;
  }, [conversations, activeConversationId]);

  // ── Scroll to bottom on new messages ──
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    if (messagesEndRef.current && chatMessages.length > 0) {
      // Use instant scroll when conversation loads (bulk messages), smooth for streaming
      const isInitialLoad = prevMessageCountRef.current === 0 && chatMessages.length > 1;
      messagesEndRef.current.scrollIntoView({ behavior: isInitialLoad ? 'instant' : 'smooth' });
    }
    prevMessageCountRef.current = chatMessages.length;
  }, [chatMessages]);

  // Reset scroll ref when drawer opens so it scrolls to bottom on reopen
  useEffect(() => {
    if (isOpen) {
      prevMessageCountRef.current = 0;
      // Scroll to bottom after drawer renders
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'instant' });
      });
    }
  }, [isOpen]);

  // Close model dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    }
    if (modelDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [modelDropdownOpen]);

  // Close tool palette on outside click
  useEffect(() => {
    function handleToolPaletteClick(e: MouseEvent) {
      if (toolPaletteRef.current && !toolPaletteRef.current.contains(e.target as Node)) {
        setToolPaletteOpen(false);
      }
    }
    if (toolPaletteOpen) {
      document.addEventListener('mousedown', handleToolPaletteClick);
    }
    return () => document.removeEventListener('mousedown', handleToolPaletteClick);
  }, [toolPaletteOpen]);

  // Close conversation list on outside click
  useEffect(() => {
    function handleConvListClick(e: MouseEvent) {
      if (conversationListRef.current && !conversationListRef.current.contains(e.target as Node)) {
        setShowConversationList(false);
      }
    }
    if (showConversationList) {
      document.addEventListener('mousedown', handleConvListClick);
    }
    return () => document.removeEventListener('mousedown', handleConvListClick);
  }, [showConversationList]);

  // Close project dropdown on outside click
  useEffect(() => {
    function handleProjectDropdownClick(e: MouseEvent) {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setShowProjectDropdown(false);
      }
    }
    if (showProjectDropdown) {
      document.addEventListener('mousedown', handleProjectDropdownClick);
    }
    return () => document.removeEventListener('mousedown', handleProjectDropdownClick);
  }, [showProjectDropdown]);

  // Load projects list when drawer opens or sidebar projects change
  useEffect(() => {
    if (!isOpen) return;
    getProjects().then(setAiProjects).catch(() => setAiProjects([]));
  }, [isOpen, sidebarProjects]);


  // ── Load conversations + models + tools on open ──
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setModelsLoading(true);
    setNoProfile(false);
    getAvailableModels()
      .then((opts) => {
        if (cancelled) return;
        setModelOptions(opts);
        if (opts.length > 0) {
          setSelectedModel(opts[0].id);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setNoProfile(true);
        setModelOptions([]);
      })
      .finally(() => { if (!cancelled) setModelsLoading(false); });
    getAITools().then(t => { if (!cancelled) setTools(t); }).catch(() => { if (!cancelled) setTools([]); });
    setConversationsLoading(true);
    getConversations()
      .then(async (convs) => {
        if (cancelled) return;
        if (convs.length > 0) {
          setConversations(convs);
          setActiveConversationId(convs[0].id);
        } else {
          const newConv = await createConversation();
          if (cancelled) return;
          setConversations([newConv]);
          setActiveConversationId(newConv.id);
          setAiSelectedProject(null);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setConversations([]);
        setActiveConversationId(null);
      })
      .finally(() => { if (!cancelled) setConversationsLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  // ── Fetch confirmation commands when settings panel opens ──
  useEffect(() => {
    if (!showSettings) return;
    let cancelled = false;
    setConfirmCmdsLoading(true);
    getTerminalConfirmCommands()
      .then((data) => {
        if (cancelled) return;
        setDefaultConfirmCmds(data.defaultCommands);
        setUserConfirmCmds(data.userCommands);
      })
      .catch(() => {
        if (cancelled) return;
        setDefaultConfirmCmds([]);
        setUserConfirmCmds([]);
      })
      .finally(() => { if (!cancelled) setConfirmCmdsLoading(false); });
    return () => { cancelled = true; };
  }, [showSettings]);

  // Restore project selection when active conversation or projects list changes
  const initialProjectRestoredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeConversationId || conversations.length === 0) return;
    // Only auto-restore on conversation load, not during active editing
    if (initialProjectRestoredRef.current === activeConversationId) return;
    initialProjectRestoredRef.current = activeConversationId;
    const conv = conversations.find(c => c.id === activeConversationId);
    if (conv?.projectPath) {
      const proj = aiProjects.find(p => p.path === conv.projectPath);
      setAiSelectedProject(proj ?? { path: conv.projectPath, name: conv.projectPath.split('/').pop() || conv.projectPath, addedAt: '' });
    } else {
      setAiSelectedProject(null);
    }
  }, [activeConversationId, conversations, aiProjects]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineH = parseInt(getComputedStyle(ta).lineHeight) || 20;
    const maxH = lineH * 4 + 32;
    ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
  };

  const handleNewChat = useCallback(async () => {
    try {
      const newConv = await createConversation(currentProjectPath);
      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      setShowConversationList(false);
    } catch {
      // Failed to create conversation
    }
  }, [currentProjectPath]);

  const handleDeleteConversation = useCallback(async () => {
    if (!activeConversationId) return;
    try {
      await deleteConversation(activeConversationId);
      const remaining = conversations.filter(c => c.id !== activeConversationId);
      if (remaining.length > 0) {
        setConversations(remaining);
        setActiveConversationId(remaining[0].id);
      } else {
        // Create a new conversation since we deleted the last one
        const newConv = await createConversation();
        setConversations([newConv]);
        setActiveConversationId(newConv.id);
      }
      setShowDeleteConfirm(false);
    } catch {
      // Delete failed
    }
  }, [activeConversationId, conversations]);

  const handleAddConfirmCmd = useCallback(async () => {
    const newItem = confirmCmdInput.trim();
    if (!newItem) return;
    if (userConfirmCmds.includes(newItem) || defaultConfirmCmds.includes(newItem)) return;
    const updated = [...userConfirmCmds, newItem];
    setUserConfirmCmds(updated);
    setConfirmCmdInput('');
    try { await saveTerminalConfirmCommands(updated); } catch { /* save failed */ }
  }, [confirmCmdInput, userConfirmCmds, defaultConfirmCmds]);

  const handleRemoveConfirmCmd = useCallback(async (item: string) => {
    const filtered = userConfirmCmds.filter(i => i !== item);
    setUserConfirmCmds(filtered);
    try { await saveTerminalConfirmCommands(filtered); } catch { /* save failed */ }
  }, [userConfirmCmds]);

  const handleSwitchConversation = useCallback((id: string) => {
    prevMessageCountRef.current = 0;
    setActiveConversationId(id);
    setShowConversationList(false);
    // Restore project selection from conversation metadata
    const conv = conversations.find(c => c.id === id);
    if (conv?.projectPath) {
      const proj = aiProjects.find(p => p.path === conv.projectPath);
      setAiSelectedProject(proj ?? { path: conv.projectPath, name: conv.projectPath.split('/').pop() || conv.projectPath, addedAt: '' });
    } else {
      setAiSelectedProject(null);
    }
  }, [conversations, aiProjects]);

  const handleDeleteFromList = useCallback(async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (conversations.length <= 1) return;
    try {
      await deleteConversation(id);
      const remaining = conversations.filter(c => c.id !== id);
      setConversations(remaining);
      if (activeConversationId === id) {
        setActiveConversationId(remaining[0]?.id ?? null);
      }
    } catch {
      // Delete failed
    }
  }, [conversations, activeConversationId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Model slash menu keyboard navigation
    if (modelSlashMenuOpen && modelSlashFilteredOptions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setModelSlashSelectedIndex(prev => (prev + 1) % modelSlashFilteredOptions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setModelSlashSelectedIndex(prev => (prev - 1 + modelSlashFilteredOptions.length) % modelSlashFilteredOptions.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const selected = modelSlashFilteredOptions[modelSlashSelectedIndex];
        if (selected) {
          setSelectedModel(selected.id);
          setInput('');
          setModelSlashMenuOpen(false);
          setModelSlashFilterText('');
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setModelSlashMenuOpen(false);
        setModelSlashFilterText('');
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const selected = modelSlashFilteredOptions[modelSlashSelectedIndex];
        if (selected) {
          setSelectedModel(selected.id);
          setInput('');
          setModelSlashMenuOpen(false);
          setModelSlashFilterText('');
        }
        return;
      }
    }
    // Slash menu keyboard navigation
    if (slashMenuOpen && slashFilteredTools.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex(prev => (prev + 1) % slashFilteredTools.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex(prev => (prev - 1 + slashFilteredTools.length) % slashFilteredTools.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const selected = slashFilteredTools[slashSelectedIndex];
        if (selected) {
          setInput('/' + selected.name + ' ');
          setSlashMenuOpen(false);
          setSlashFilterText('');
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuOpen(false);
        setSlashFilterText('');
        return;
      }
      // Tab also selects (common autocomplete pattern)
      if (e.key === 'Tab') {
        e.preventDefault();
        const selected = slashFilteredTools[slashSelectedIndex];
        if (selected) {
          setInput('/' + selected.name + ' ');
          setSlashMenuOpen(false);
          setSlashFilterText('');
        }
        return;
      }
    }
    // Normal Enter to send
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    autoResize();

    // Slash command detection
    if (val.startsWith('/model')) {
      // /model slash menu
      const afterModel = val.slice(6); // everything after '/model'
      const filterText = afterModel.startsWith(' ') ? afterModel.slice(1) : (afterModel === '' ? '' : null);
      if (filterText !== null) {
        setModelSlashFilterText(filterText);
        setModelSlashMenuOpen(true);
        setModelSlashSelectedIndex(0);
        setSlashMenuOpen(false);
        setSlashFilterText('');
      } else {
        // Partial match like '/modela' — fall through to tool slash menu
        setModelSlashMenuOpen(false);
        setModelSlashFilterText('');
        const filterTextSlash = val.slice(1);
        setSlashFilterText(filterTextSlash);
        setSlashMenuOpen(true);
        setSlashSelectedIndex(0);
      }
    } else if (val.startsWith('/')) {
      // Check if a tool is already confirmed (e.g., "/list_environments some text")
      const spaceIdx = val.indexOf(' ');
      if (spaceIdx > 0) {
        const candidate = val.slice(1, spaceIdx);
        if (tools.some(t => t.name === candidate)) {
          // Tool already confirmed in input, suppress slash menu
          setSlashMenuOpen(false);
          setSlashFilterText('');
          setModelSlashMenuOpen(false);
          setModelSlashFilterText('');
          return;
        }
      }
      // Otherwise show tool slash menu with filter
      const filterText = val.slice(1);
      setSlashFilterText(filterText);
      setSlashMenuOpen(true);
      setSlashSelectedIndex(0);
      setModelSlashMenuOpen(false);
      setModelSlashFilterText('');
    } else {
      setSlashMenuOpen(false);
      setSlashFilterText('');
      setModelSlashMenuOpen(false);
      setModelSlashFilterText('');
    }
  }, [tools]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        const att: AIAttachment = {
          name: file.name,
          mediaType: file.type || 'application/octet-stream',
          data: base64,
          preview: file.type.startsWith('image/') ? result : undefined,
        };
        setAttachments((prev) => [...prev, att]);
      };
      reader.readAsDataURL(file);
    });
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return;
    e.preventDefault();
    imageFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        const att: AIAttachment = {
          name: file.name || 'pasted-image.png',
          mediaType: file.type,
          data: base64,
          preview: result,
        };
        setAttachments((prev) => [...prev, att]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSend = useCallback(() => {
    if ((!input.trim() && attachments.length === 0) || chatIsLoading) return;
    const raw = input.trim();
    let msg = raw;
    let tool: string | undefined;

    // Parse /toolname prefix from input
    if (raw.startsWith('/')) {
      const spaceIdx = raw.indexOf(' ');
      const candidate = spaceIdx > 0 ? raw.slice(1, spaceIdx) : raw.slice(1);
      if (tools.some(t => t.name === candidate)) {
        tool = candidate;
        msg = spaceIdx > 0 ? raw.slice(spaceIdx + 1).trim() : '';
      }
    }

    setInput('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setDismissedError(null);
    sendMessage(msg || (tool ? `Use tool: ${tool}` : ''), selectedModel, tool, attachments.length > 0 ? attachments : undefined);
    setAttachments([]);
  }, [input, chatIsLoading, sendMessage, selectedModel, tools, attachments]);

  const isDropdownDisabled = modelsLoading || noProfile || modelOptions.length === 0;
  const selectedLabel = modelOptions.find((opt) => opt.id === selectedModel)?.label ?? '';

  if (!isOpen) {
    if (showDeleteConfirm) setShowDeleteConfirm(false);
    return null;
  }

  return (
    <>
      {/* Floating panel */}
      <div id="ai-assistant-panel" className={`fixed z-[150] glass-dark flex flex-col overflow-hidden transition-all duration-300 ease-in-out ${
        isFullscreen
          ? 'top-0 right-0 bottom-0 rounded-none' 
          : 'bottom-24 right-6 w-[520px] rounded-2xl'
      }`}
        style={isFullscreen ? { left: 'calc(18rem)' } : { height: 'calc(100vh - 120px)', maxHeight: 'calc(100vh - 120px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 relative z-10">
          {/* Left: conversation name dropdown */}
          <div ref={conversationListRef} className="relative flex-1 min-w-0">
            <button
              type="button"
              onClick={() => setShowConversationList(v => !v)}
              className="flex items-center gap-2 min-w-0 max-w-full hover:bg-white/[0.06] rounded-lg px-2 py-1 transition-colors"
            >
              <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />
              <span className="text-white font-medium text-sm truncate">
                {conversationsLoading ? 'Loading…' : (activeConversation?.name ?? 'AI Assistant')}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-white/40 shrink-0 transition-transform ${showConversationList ? 'rotate-180' : ''}`} />
            </button>

            {/* Conversation list dropdown */}
            {showConversationList && (
              <div className="ai-conversation-list absolute top-full left-0 mt-1 rounded-xl border border-white/[0.12] shadow-2xl overflow-hidden animate-fade-in z-30" style={{ minWidth: '300px', maxWidth: '400px' }}>
                <div className="px-3 py-2 border-b border-white/[0.08] flex items-center justify-between">
                  <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Conversations</span>
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    New
                  </button>
                </div>
                <div className="max-h-[300px] overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSwitchConversation(conv.id);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors duration-75 group ${
                        conv.id === activeConversationId
                          ? 'bg-blue-600/15 text-white'
                          : 'hover:bg-white/[0.04] text-white/80'
                      }`}
                    >
                      <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${
                        conv.id === activeConversationId ? 'text-blue-400' : 'text-white/30'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs truncate block">{conv.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[10px] ${
                            conv.id === activeConversationId ? 'text-white/40' : 'text-white/20'
                          }`}>
                            {formatRelativeTime(conv.updatedAt)}
                          </span>
                          {conv.projectPath && (
                            <span className="ai-conv-project-badge inline-flex items-center gap-0.5 text-[9px] px-1 py-0 rounded">
                              <FolderOpen className="w-2.5 h-2.5" />
                              {conv.projectPath.split('/').pop() || conv.projectPath}
                            </span>
                          )}
                        </div>
                      </div>
                      {conversations.length > 1 && (
                        <button
                          type="button"
                          onMouseDown={(e) => handleDeleteFromList(e, conv.id)}
                          className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 transition-all p-0.5 rounded"
                          aria-label="Delete conversation"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: action buttons */}
          <button
            onClick={handleNewChat}
            className="text-white/40 hover:text-white/70 p-1 rounded transition-colors"
            aria-label="New conversation"
            title="New conversation"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="text-white/40 hover:text-white/70 p-1 rounded transition-colors"
            aria-label="Delete conversation"
            title="Delete conversation"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowSettings(v => !v)}
            className={`p-1 rounded transition-colors ${showSettings ? 'text-blue-400 bg-blue-600/15' : 'text-white/40 hover:text-white/70'}`}
            aria-label="Settings"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(f => !f)}
            className="text-white/40 hover:text-white/70 p-1 rounded transition-colors"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white p-1 rounded transition-colors"
            aria-label="Close AI Assistant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Project scope bar */}
        <div ref={projectDropdownRef} className="relative px-4 py-1.5 border-b border-white/[0.08] flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowProjectDropdown(v => !v)}
            className="ai-project-trigger flex items-center gap-1.5 min-w-0 rounded-md px-2 py-1 transition-colors"
          >
            {aiSelectedProject ? (
              <FolderOpen className="w-3 h-3 text-emerald-400 shrink-0" />
            ) : (
              <Globe className="w-3 h-3 text-white/40 shrink-0" />
            )}
            <span className={`text-[11px] font-medium truncate max-w-[180px] ${aiSelectedProject ? 'text-emerald-300' : 'text-white/50'}`}>
              {aiSelectedProject ? aiSelectedProject.name : 'Global'}
            </span>
            <ChevronDown className={`w-2.5 h-2.5 text-white/25 shrink-0 transition-transform ${showProjectDropdown ? 'rotate-180' : ''}`} />
          </button>
          {aiSelectedProject && (
            <span className="ai-project-path text-[10px] text-white/20 truncate flex-1 min-w-0" title={aiSelectedProject.path}>
              {aiSelectedProject.path}
            </span>
          )}

          {/* Project dropdown */}
          {showProjectDropdown && (
            <div className="ai-project-dropdown absolute top-full left-3 right-3 mt-1 rounded-lg border border-white/[0.12] shadow-2xl overflow-hidden animate-fade-in z-30">
              <div className="max-h-[220px] overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
                {/* Global option */}
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleProjectSwitch(null);
                  }}
                  className={`ai-project-option w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-75 ${
                    !aiSelectedProject ? 'ai-project-option--active' : ''
                  }`}
                >
                  <Globe className="w-3.5 h-3.5 shrink-0" />
                  <span className="text-xs font-medium flex-1">Global</span>
                  {!aiSelectedProject && <Check className="w-3 h-3 shrink-0 text-blue-400" />}
                </button>
                {/* Separator + project list */}
                {aiProjects.length > 0 && (
                  <div className="ai-project-divider border-t border-white/[0.06] mx-2" />
                )}
                {aiProjects.map((proj) => (
                  <button
                    key={proj.path}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleProjectSwitch(proj);
                    }}
                    className={`ai-project-option w-full flex items-center gap-2 px-3 py-2 text-left transition-colors duration-75 ${
                      aiSelectedProject?.path === proj.path ? 'ai-project-option--active' : ''
                    }`}
                  >
                    <FolderOpen className="w-3.5 h-3.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-xs font-medium truncate block">{proj.name}</span>
                      <span className="ai-project-option-path text-[10px] truncate block">{proj.path}</span>
                    </div>
                    {aiSelectedProject?.path === proj.path && <Check className="w-3 h-3 shrink-0 text-emerald-400" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {noProfile && (
            <div className="flex flex-col items-center justify-center h-full gap-4 px-8">
              <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-yellow-400" />
              </div>
              <div className="text-center">
                <p className="text-white/80 font-medium mb-2">No active environment profile</p>
                <p className="text-white/40 text-sm leading-relaxed">
                  Activate an environment profile in the Environments tab to use AI Assistant
                </p>
              </div>
            </div>
          )}
          {!noProfile && showSettings && (
            <div className="ai-settings-panel space-y-4">
              {/* Section header */}
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-white/50" />
                <h3 className="text-xs font-semibold text-white/70 tracking-wide uppercase">Commands Requiring Confirmation</h3>
              </div>
              <p className="text-[11px] text-white/30 leading-relaxed -mt-2">
                Commands matching these prefixes will require your approval before running. All other commands execute automatically.
              </p>

              {confirmCmdsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <span className="text-[11px] text-white/30 animate-pulse">Loading…</span>
                </div>
              ) : (
                <>
                  {/* Built-in Dangerous Commands */}
                  <div>
                    <label className="text-[10px] font-medium text-white/30 uppercase tracking-wider">Built-in</label>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {defaultConfirmCmds.map((cmd) => (
                        <span
                          key={cmd}
                          className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] text-white/30 font-mono"
                        >
                          {cmd}
                        </span>
                      ))}
                      {defaultConfirmCmds.length === 0 && (
                        <span className="text-[10px] text-white/20 italic">None</span>
                      )}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-white/[0.08]" />

                  {/* Custom Commands */}
                  <div>
                    <label className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Custom</label>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        value={confirmCmdInput}
                        onChange={(e) => setConfirmCmdInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddConfirmCmd(); } }}
                        placeholder="e.g. docker compose down, kubectl delete"
                        className="ai-settings-input flex-1 min-w-0 rounded-md bg-white/[0.06] border border-white/[0.08] px-2.5 py-1.5 text-xs text-white/80 placeholder-white/20 outline-none focus:border-white/[0.2] focus:bg-white/[0.08] transition-colors"
                      />
                      <button
                        onClick={handleAddConfirmCmd}
                        disabled={!confirmCmdInput.trim()}
                        className="rounded-md px-3 py-1.5 text-xs font-medium bg-blue-600/20 text-blue-400 border border-blue-500/20 hover:bg-blue-600/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        Add
                      </button>
                    </div>
                    <div className="mt-2.5 space-y-1">
                      {userConfirmCmds.map((cmd) => (
                        <div
                          key={cmd}
                          className="group flex items-center justify-between rounded-md bg-white/[0.06] border border-white/[0.08] px-2.5 py-1.5 transition-colors hover:bg-white/[0.08]"
                        >
                          <span className="text-xs text-white/70 font-mono truncate">{cmd}</span>
                          <button
                            onClick={() => handleRemoveConfirmCmd(cmd)}
                            className="ml-2 shrink-0 text-white/20 hover:text-red-400 transition-colors p-0.5 rounded"
                            aria-label={`Remove ${cmd}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {userConfirmCmds.length === 0 && (
                        <p className="text-[10px] text-white/20 italic py-1">No custom commands added</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {!noProfile && !showSettings && chatMessages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-white/40 text-sm text-center px-8">
                Ask me about your environments, MCP servers, or commands
              </p>
            </div>
          )}
          {!showSettings && chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                msg.role === 'user' ? 'bg-blue-600/40' : 'bg-white/10'
              }`}>
                {msg.role === 'user'
                  ? <User className="w-4 h-4 text-blue-300" />
                  : <Bot className="w-4 h-4 text-white/70" />
                }
              </div>
              <div className="flex flex-col max-w-[85%]">
                <div className={`rounded-2xl px-4 py-2 text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600/20 text-blue-100 rounded-tr-sm'
                    : 'bg-white/10 text-white/90 rounded-tl-sm'
                }`}>
                  {msg.role === 'user' ? (
                    <div>
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {msg.attachments.map((att, attIdx) =>
                            att.mediaType.startsWith('image/') ? (
                              <img
                                key={attIdx}
                                src={`data:${att.mediaType};base64,${att.data}`}
                                alt={att.name}
                                className="max-w-full rounded-lg max-h-48 object-contain"
                              />
                            ) : (
                              <span
                                key={attIdx}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.08] border border-white/[0.12] text-xs text-white/60"
                              >
                                <Paperclip className="w-3 h-3" />
                                {att.name}
                              </span>
                            )
                          )}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ) : (
                    <div className="prose prose-invert prose-sm max-w-none">
                      {chatIsLoading && chatMessages[chatMessages.length - 1]?.id === msg.id && msg.content === '' ? (
                        <div className="flex gap-1 py-1">
                          <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            const isInline = !match;
                            return isInline ? (
                              <code className="bg-white/10 px-1 rounded text-xs" {...props}>{children}</code>
                            ) : (
                              <SyntaxHighlighter
                                style={oneDark}
                                language={match[1]}
                                PreTag="div"
                                customStyle={{ borderRadius: '8px', fontSize: '12px' }}
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            );
                          },
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-white/30 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          {!showSettings && <div ref={messagesEndRef} />}
        </div>

        {/* Terminal command confirmation */}
        {pendingConfirmation && (
          <div className="ai-command-confirm px-4 py-3 border-t border-white/[0.08] bg-amber-900/10">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-medium text-amber-300">Command requires approval</span>
            </div>
            <div className="rounded-lg bg-black/20 border border-white/[0.08] px-3 py-2 mb-1.5">
              <code className="text-xs text-white/90 font-mono break-all">{pendingConfirmation.command}</code>
            </div>
            <div className="text-[10px] text-white/30 mb-2.5 truncate" title={pendingConfirmation.workingDirectory}>
              cwd: {pendingConfirmation.workingDirectory}
            </div>
            <div className="flex gap-2">
              <button
                onClick={confirmCommand}
                className="flex-1 rounded-lg py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                Run
              </button>
              <button
                onClick={rejectCommand}
                className="flex-1 rounded-lg py-1.5 text-xs font-medium border border-white/15 bg-white/8 text-white/70 hover:bg-white/12 transition-colors"
              >
                Reject
              </button>
            </div>
          </div>
        )}

        {/* Input area */}
        {chatError && chatError !== dismissedError && (
          <div className="px-4 py-2 bg-red-900/20 border-t border-red-700/30 text-red-300 text-xs flex items-center justify-between">
            <span>Error: {chatError}</span>
            <button
              onClick={() => setDismissedError(chatError)}
              className="ml-2 text-red-400/60 hover:text-red-300 transition-colors"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="px-4 pt-3 pb-5 relative" ref={toolPaletteRef}>
          {/* Slash command autocomplete */}
          {slashMenuOpen && slashFilteredTools.length > 0 && (
            <div className="ai-slash-menu absolute bottom-full left-4 right-4 mb-2 rounded-xl border border-white/[0.12] shadow-2xl overflow-hidden animate-fade-in z-10">
              <div className="px-3 py-1.5 border-b border-white/[0.08] flex items-center gap-2">
                <span className="text-[10px] font-medium text-white/40">/ Select a tool</span>
                <span className="ml-auto text-[10px] text-white/20">↑↓ navigate · Enter select · Esc close</span>
              </div>
              <div className="max-h-[240px] overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
                {slashFilteredTools.map((tool, idx) => (
                  <button
                    key={tool.name}
                    type="button"
                    ref={idx === slashSelectedIndex ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                    onMouseDown={(e) => {
                      e.preventDefault(); // prevent textarea blur
                      e.stopPropagation();
                      setInput('/' + tool.name + ' ');
                      setSlashMenuOpen(false);
                      setSlashFilterText('');
                      textareaRef.current?.focus();
                    }}
                    onMouseEnter={() => setSlashSelectedIndex(idx)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors duration-75 ${
                      idx === slashSelectedIndex
                        ? 'bg-blue-600/15 text-white'
                        : 'hover:bg-white/[0.04] text-white/80'
                    }`}
                  >
                    <span className={`font-mono text-xs shrink-0 pt-0.5 ${
                      idx === slashSelectedIndex ? 'text-blue-400' : 'text-blue-400/60'
                    }`}>
                      {tool.name}
                    </span>
                    {tool.description && (
                      <span className={`text-[11px] leading-tight line-clamp-1 ${
                        idx === slashSelectedIndex ? 'text-white/50' : 'text-white/30'
                      }`}>
                        {tool.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Model slash command autocomplete */}
          {modelSlashMenuOpen && modelSlashFilteredOptions.length > 0 && (
            <div className="ai-slash-menu absolute bottom-full left-4 right-4 mb-2 rounded-xl border border-white/[0.12] shadow-2xl overflow-hidden animate-fade-in z-10">
              <div className="px-3 py-1.5 border-b border-white/[0.08] flex items-center gap-2">
                <span className="text-[10px] font-medium text-white/40">/model Select a model</span>
                <span className="ml-auto text-[10px] text-white/20">↑↓ navigate · Enter select · Esc close</span>
              </div>
              <div className="max-h-[240px] overflow-y-auto overscroll-contain" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.15) transparent' }}>
                {modelSlashFilteredOptions.map((opt, idx) => (
                  <button
                    key={opt.id}
                    type="button"
                    ref={idx === modelSlashSelectedIndex ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedModel(opt.id);
                      setInput('');
                      setModelSlashMenuOpen(false);
                      setModelSlashFilterText('');
                      textareaRef.current?.focus();
                    }}
                    onMouseEnter={() => setModelSlashSelectedIndex(idx)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors duration-75 ${
                      idx === modelSlashSelectedIndex
                        ? 'bg-blue-600/15 text-white'
                        : 'hover:bg-white/[0.04] text-white/80'
                    }`}
                  >
                    <span className={`text-xs shrink-0 ${
                      idx === modelSlashSelectedIndex ? 'text-blue-400' : 'text-blue-400/60'
                    }`}>
                      {opt.label}
                    </span>
                    <span className={`font-mono text-[11px] ${
                      idx === modelSlashSelectedIndex ? 'text-white/40' : 'text-white/20'
                    }`}>
                      {opt.id}
                    </span>
                    {opt.id === selectedModel && <Check className="w-3.5 h-3.5 shrink-0 text-blue-400 ml-auto" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tool palette popup */}
          {toolPaletteOpen && tools.length > 0 && !slashMenuOpen && (
            <div className="ai-tool-palette absolute bottom-full left-4 right-4 mb-2 rounded-xl shadow-2xl overflow-hidden animate-fade-in z-50">
              <div className="tp-header">
                <Wrench className="tp-header-icon" />
                <span className="tp-header-title">Force a tool</span>
                <span className="tp-badge">{tools.length}</span>
                <button
                  onClick={() => setToolPaletteOpen(false)}
                  className="tp-close-btn"
                  aria-label="Close tool palette"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="tp-scroll-area">
                {Object.entries(groupToolsByCategory(tools)).map(([category, categoryTools]) => {
                  const meta = CATEGORY_META[category] || CATEGORY_META.Other;
                  const CategoryIcon = meta.icon;
                  return (
                    <div key={category} className="tp-category-group">
                      <div className="tp-category-header" style={{ borderLeftColor: meta.accent }}>
                        <CategoryIcon className="tp-category-icon" style={{ color: meta.accent }} />
                        <span className="tp-category-name">{category}</span>
                        <span className="tp-badge tp-badge-sm">{categoryTools.length}</span>
                      </div>
                      {categoryTools.map((tool) => (
                        <button
                          key={tool.name}
                          type="button"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={() => {
                            setInput('/' + tool.name + ' ');
                            setToolPaletteOpen(false);
                            textareaRef.current?.focus();
                          }}
                          className="tp-tool-item"
                        >
                          <span className="tp-tool-indicator" style={{ backgroundColor: meta.accent }} />
                          <span className="tp-tool-name">{tool.name}</span>
                          {tool.description && (
                            <span className="tp-tool-desc">{tool.description}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}


          {/* Attachment preview area */}
          {attachments.length > 0 && (
            <div className="ai-attachment-preview flex flex-wrap gap-2 px-2 py-2 mb-1 rounded-lg border border-white/[0.08]">
              {attachments.map((att, idx) => (
                <div key={idx} className="relative group">
                  {att.mediaType.startsWith('image/') ? (
                    <div className="relative">
                      <img
                        src={att.preview || `data:${att.mediaType};base64,${att.data}`}
                        alt={att.name}
                        className="h-16 rounded-lg object-cover border border-white/[0.12]"
                      />
                      <button
                        onClick={() => removeAttachment(idx)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-black/70 border border-white/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        aria-label={`Remove ${att.name}`}
                      >
                        <X className="w-3 h-3 text-white/80" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.08] border border-white/[0.12]">
                      <Paperclip className="w-3 h-3 text-white/40" />
                      <span className="text-xs text-white/60 max-w-[120px] truncate">{att.name}</span>
                      <button
                        onClick={() => removeAttachment(idx)}
                        className="ml-1 w-4 h-4 rounded-full flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/10 transition-colors"
                        aria-label={`Remove ${att.name}`}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Input container — textarea on top, toolbar on bottom */}
          <div className={`ai-chat-input-container relative rounded-2xl border transition-all duration-200 ${
            inputFocused
              ? 'border-white/30 shadow-[0_0_0_2px_rgba(59,130,246,0.15)]'
              : 'border-white/[0.15]'
          } bg-white/[0.07]`}>
            <textarea
              ref={textareaRef}
              className="ai-chat-textarea w-full bg-transparent border-none px-4 pt-3 pb-2 text-white text-[14px] placeholder-white/30 resize-none focus:outline-none focus:ring-0"
              placeholder={noProfile ? 'Activate a profile to start chatting...' : 'Type a message...'}
              value={input}
              rows={1}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              disabled={chatIsLoading || noProfile}
            />
            {/* Toolbar row */}
            <div className="flex items-center justify-between px-2 pb-2">
              {/* Left: model selector + tool picker */}
              <div className="flex items-center gap-1">
                <div ref={modelDropdownRef} className="relative">
                  <button
                    type="button"
                    onClick={() => !isDropdownDisabled && setModelDropdownOpen((v) => !v)}
                    disabled={isDropdownDisabled}
                    className="ai-model-trigger flex items-center gap-1.5 text-[11px] rounded-lg px-2 py-1 transition-all duration-150 hover:bg-white/[0.06] disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Cpu className="w-3.5 h-3.5 shrink-0 text-blue-400/70" />
                    <span className="truncate max-w-[100px] text-white/60">
                      {noProfile ? 'No profile' : (!modelsLoading && selectedLabel) ? selectedLabel : '…'}
                    </span>
                  </button>

                  {modelDropdownOpen && modelOptions.length > 0 && (
                    <div className="ai-model-dropdown absolute left-0 bottom-full mb-1.5 min-w-[170px] rounded-lg border shadow-xl z-50 overflow-hidden animate-fade-in">
                      {modelOptions.map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => { setSelectedModel(opt.id); setModelDropdownOpen(false); }}
                          className={`ai-model-option w-full flex items-center justify-between gap-3 px-3 py-2 text-sm text-left transition-colors duration-100 ${
                            opt.id === selectedModel ? 'ai-model-option--selected' : ''
                          }`}
                        >
                          <span className="truncate">{opt.label}</span>
                          {opt.id === selectedModel && <Check className="w-3.5 h-3.5 shrink-0 text-blue-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => { setToolPaletteOpen((v) => !v); setSlashMenuOpen(false); }}
                  disabled={noProfile || tools.length === 0}
                  className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 ${
                    toolPaletteOpen
                      ? 'bg-blue-600/30 text-blue-300'
                      : 'text-white/30 hover:text-white/60 hover:bg-white/[0.06]'
                  } disabled:opacity-30 disabled:cursor-not-allowed`}
                  aria-label="Select tool"
                  title="Force a specific tool"
                >
                  <Wrench className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={noProfile || chatIsLoading}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 text-white/30 hover:text-white/60 hover:bg-white/[0.06] disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Attach file"
                  title="Attach file or image"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/plain,text/markdown,.md,.json,.yaml,.yml,.csv,.xml,.html,.css,.js,.ts,.tsx,.py"
                  onChange={handleFileSelect}
                />
              </div>

              {/* Right: send / stop button */}
              <div className="flex items-center gap-1">
                {chatIsLoading ? (
                  <button
                    onClick={stopGeneration}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 bg-red-600/80 hover:bg-red-500 hover:scale-105 shadow-lg shadow-red-600/20 cursor-pointer"
                    aria-label="Stop generating"
                    title="Stop generating"
                  >
                    <span className="w-2.5 h-2.5 rounded-sm bg-white block" />
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={(!input.trim() && attachments.length === 0) || noProfile}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150 ${
                      (input.trim() || attachments.length > 0) && !noProfile
                        ? 'bg-blue-600 hover:bg-blue-500 hover:scale-105 shadow-lg shadow-blue-600/20 cursor-pointer'
                        : 'bg-white/10 opacity-40 cursor-not-allowed'
                    }`}
                    aria-label="Send message"
                  >
                    <Send className="w-3.5 h-3.5 text-white" />
                  </button>
                )}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-white/20 mt-1.5 text-center select-none">Enter 发送 · Shift+Enter 换行 · / 选择工具 · /model 切换模型</p>
        </div>
      </div>

      {/* Delete conversation confirmation modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center"
          onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(false); }}
        >
          <div
            className="ai-confirm-dialog glass-dark max-w-sm w-full mx-4 rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-white font-semibold text-lg">Delete conversation</h3>
              <p className="text-white/60 text-sm mt-2 leading-relaxed">
                This will permanently delete this conversation and all its messages. This action cannot be undone.
              </p>
              <div className="flex gap-3 mt-6 w-full">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="ai-confirm-cancel flex-1 rounded-xl py-2.5 text-sm font-medium border border-white/15 bg-white/8 text-white/80 hover:bg-white/12 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={async (e) => { e.stopPropagation(); await handleDeleteConversation(); }}
                  className="flex-1 rounded-xl py-2.5 text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
