import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, User, Bot } from 'lucide-react';
import type { AIChatMessage, AIModelOption } from '../types';
import { getAvailableModels } from '../api';

interface AIAssistantDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIAssistantDrawer({ isOpen, onClose }: AIAssistantDrawerProps) {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-20250514');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [modelOptions, setModelOptions] = useState<AIModelOption[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [noProfile, setNoProfile] = useState(false);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

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
  }, [isOpen]);

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

  const handleSend = () => {
    if (!input.trim() || isLoading) return;
    const userMsg: AIChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    // API wiring will be done in Task 12
    setTimeout(() => setIsLoading(false), 500);
  };

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
          {/* Model selector — dynamic from API */}
          <select
            className="glass text-white text-sm rounded px-2 py-1 border border-white/20 bg-transparent mr-2 disabled:opacity-50"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={modelsLoading || noProfile || modelOptions.length === 0}
          >
            {noProfile && (
              <option value="">No profile</option>
            )}
            {modelOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
            {!noProfile && modelOptions.length === 0 && (
              <option value={selectedModel}>Loading...</option>
            )}
          </select>
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
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-white/40 text-sm text-center px-8">
                Ask me about your environments, MCP servers, or commands
              </p>
            </div>
          )}
          {messages.map((msg) => (
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
                <p className="whitespace-pre-wrap">{msg.content}</p>
                <p className="text-xs text-white/30 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3">
              <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center bg-white/10">
                <Bot className="w-4 h-4 text-white/70" />
              </div>
              <div className="bg-white/10 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-white/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-4 border-t border-white/10">
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 resize-none focus:outline-none focus:border-white/40 transition-colors"
              placeholder="Type a message..."
              value={input}
              rows={1}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="shrink-0 w-9 h-9 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
              aria-label="Send message"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
