import { useState, useRef, useEffect, useCallback } from 'react';
import { Sparkles, X, Send, User, Bot, Trash2, ChevronDown, Check } from 'lucide-react';
import type { AIModelOption } from '../types';
import { getAvailableModels } from '../api';
import { useAIChat } from '../hooks/useAIChat';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onToolCall?: (toolName: string) => void;
}


export function AIAssistantDrawer({ isOpen, onClose, onToolCall }: AIAssistantDrawerProps) {
  const { messages: chatMessages, isLoading: chatIsLoading, error: chatError, sendMessage, loadHistory, clearHistory } = useAIChat({ onToolCall });
  const [input, setInput] = useState('');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-20250514');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [modelOptions, setModelOptions] = useState<AIModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [noProfile, setNoProfile] = useState(false);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const modelDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

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

  useEffect(() => {
    if (!isOpen) return;
    setModelsLoading(true);
    setNoProfile(false);
    getAvailableModels()
      .then((opts) => {
        setModelOptions(opts);
        if (opts.length > 0) {
          setSelectedModel(opts[0].id);
        }
      })
      .catch(() => {
        setNoProfile(true);
        setModelOptions([]);
      })
      .finally(() => setModelsLoading(false));
    // Load conversation history
    loadHistory();
  }, [isOpen, loadHistory]);

  const autoResize = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineH = parseInt(getComputedStyle(ta).lineHeight) || 20;
    const maxH = lineH * 4 + 32;
    ta.style.height = Math.min(ta.scrollHeight, maxH) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = useCallback(() => {
    if (!input.trim() || chatIsLoading) return;
    const msg = input.trim();
    setInput('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setDismissedError(null);
    sendMessage(msg, selectedModel);
  }, [input, chatIsLoading, sendMessage, selectedModel]);

  const isDropdownDisabled = modelsLoading || noProfile || modelOptions.length === 0;
  const selectedLabel = modelOptions.find((opt) => opt.id === selectedModel)?.label ?? '';

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[140] bg-black/30"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 w-[560px] z-[150] glass-dark flex flex-col animate-slide-up">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <Sparkles className="w-5 h-5 text-blue-400 shrink-0" />
          <h2 className="text-white font-semibold flex-1">AI Assistant</h2>
          {/* Model selector — custom dropdown */}
          <div ref={modelDropdownRef} className="relative mr-2">
            <button
              type="button"
              onClick={() => !isDropdownDisabled && setModelDropdownOpen((v) => !v)}
              disabled={isDropdownDisabled}
              className="ai-model-trigger flex items-center gap-1.5 text-sm rounded-full px-3 py-1 border transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="truncate max-w-[100px]">
                {noProfile ? 'No profile' : (!modelsLoading && selectedLabel) ? selectedLabel : 'Loading…'}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${modelDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {modelDropdownOpen && modelOptions.length > 0 && (
              <div className="ai-model-dropdown absolute right-0 top-full mt-1.5 min-w-[170px] rounded-lg border shadow-xl z-50 overflow-hidden animate-fade-in">
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
            onClick={() => setShowClearConfirm(true)}
            className="text-white/40 hover:text-white/70 p-1 rounded transition-colors"
            aria-label="Clear history"
            title="Clear history"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white p-1 rounded transition-colors"
            aria-label="Close AI Assistant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
          {!noProfile && chatMessages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-white/40 text-sm text-center px-8">
                Ask me about your environments, MCP servers, or commands
              </p>
            </div>
          )}
          {chatMessages.map((msg) => (
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
              <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-blue-600/20 text-blue-100 rounded-tr-sm'
                  : 'bg-white/10 text-white/90 rounded-tl-sm'
              }`}>
                {msg.role === 'user' ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
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
                <p className="text-xs text-white/30 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

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

        <div className="px-4 pt-3 pb-5">
          <div className={`ai-chat-input-container overflow-hidden relative flex items-end rounded-2xl border transition-all duration-200 ${
            inputFocused
              ? 'border-white/30 shadow-[0_0_0_2px_rgba(59,130,246,0.15)]'
              : 'border-white/[0.15]'
          } bg-white/[0.07]`}>
            <textarea
              ref={textareaRef}
              className="ai-chat-textarea flex-1 bg-transparent border-none px-4 py-3 text-white text-[14px] placeholder-white/30 resize-none focus:outline-none focus:ring-0"
              placeholder={noProfile ? "Activate a profile to start chatting..." : "Type a message..."}
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              disabled={chatIsLoading || noProfile}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || chatIsLoading || noProfile}
              className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-150 mb-1.5 mr-1.5 ${
                input.trim() && !chatIsLoading && !noProfile
                  ? 'bg-blue-600 hover:bg-blue-500 hover:scale-105 shadow-lg shadow-blue-600/20 cursor-pointer'
                  : 'bg-white/10 opacity-40 cursor-not-allowed'
              }`}
              aria-label="Send message"
            >
              <Send className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
          <p className="text-[11px] text-white/20 mt-1.5 text-center select-none">Enter 发送 · Shift+Enter 换行</p>
        </div>
      </div>

      {/* Clear history confirmation modal */}
      {showClearConfirm && (
        <div
          className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            className="ai-confirm-dialog glass-dark max-w-sm w-full mx-4 rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mb-4">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-white font-semibold text-lg">Clear conversation history</h3>
              <p className="text-white/60 text-sm mt-2 leading-relaxed">
                This will permanently delete all messages in this conversation. This action cannot be undone.
              </p>
              <div className="flex gap-3 mt-6 w-full">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="ai-confirm-cancel flex-1 rounded-xl py-2.5 text-sm font-medium border border-white/15 bg-white/8 text-white/80 hover:bg-white/12 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { clearHistory(); setShowClearConfirm(false); }}
                  className="flex-1 rounded-xl py-2.5 text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors"
                >
                  Delete All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
