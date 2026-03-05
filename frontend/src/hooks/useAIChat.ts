import { useState, useCallback, useRef, useEffect } from 'react';
import type { AIChatMessage, AIChatStreamEvent, AIToolCall } from '../types';
import { streamConversationChat, getConversation, deleteConversation } from '../api';

interface UseAIChatReturn {
  messages: AIChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (message: string, model: string, forceTool?: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  loadHistory: () => Promise<void>;
}

export function useAIChat(
  conversationId: string | null,
  options?: { onToolCall?: (toolName: string) => void }
): UseAIChatReturn {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-load messages when conversationId changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    setMessages([]);
    setError(null);
    let cancelled = false;
    getConversation(conversationId)
      .then(result => {
        if (!cancelled && result.messages && result.messages.length > 0) {
          setMessages(result.messages);
        }
      })
      .catch(() => {
        // start fresh
      });
    return () => { cancelled = true; };
  }, [conversationId]);

  const sendMessage = useCallback(async (message: string, model: string, forceTool?: string) => {
    if (!conversationId) return;

    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Add user message
    const userMsg: AIChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setError(null);

    // Create placeholder assistant message
    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: AIChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      toolCalls: [],
    };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      const response = await streamConversationChat(conversationId, message, model, controller.signal, forceTool);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((errData as { error?: string }).error || `HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      const toolCalls: AIToolCall[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let event: AIChatStreamEvent;
          try {
            event = JSON.parse(jsonStr) as AIChatStreamEvent;
          } catch {
            continue;
          }

          if (event.type === 'text_delta' && event.text) {
            assistantContent += event.text;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, content: assistantContent } : m
              )
            );
          } else if (event.type === 'tool_call' && event.tool) {
            const tc: AIToolCall = {
              name: event.tool.name,
              input: event.tool.input ?? {},
              result: event.tool.result,
            };
            toolCalls.push(tc);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, toolCalls: [...toolCalls] } : m
              )
            );
            if (options?.onToolCall) {
              options.onToolCall(tc.name);
            }
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Stream error');
          } else if (event.type === 'done') {
            break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // Request was aborted (drawer closed) — mark as interrupted
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId && m.content === ''
              ? { ...m, content: '(interrupted)' }
              : m.id === assistantId && m.content !== ''
              ? { ...m, content: m.content + ' (interrupted)' }
              : m
          )
        );
      } else {
        const errorMsg = (err as Error).message || 'Unknown error';
        setError(errorMsg);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${errorMsg}` }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [conversationId, options?.onToolCall]);

  const clearHistory = useCallback(async () => {
    if (!conversationId) return;
    await deleteConversation(conversationId);
    setMessages([]);
    setError(null);
  }, [conversationId]);

  const loadHistory = useCallback(async () => {
    if (!conversationId) return;
    try {
      setMessages([]);
      const data = await getConversation(conversationId);
      if (data.messages && data.messages.length > 0) {
        setMessages(data.messages);
      }
    } catch {
      // If history load fails, just start fresh
    }
  }, [conversationId]);

  return { messages, isLoading, error, sendMessage, clearHistory, loadHistory };
}
