import { useState, useCallback, useRef, useEffect } from 'react';
import type { AIChatMessage, AIChatStreamEvent, AIToolCall, AIAttachment } from '../types';
import { streamConversationChat, getConversation, deleteConversation } from '../api';

interface UseAIChatReturn {
  messages: AIChatMessage[];
  isLoading: boolean;
  error: string | null;
  sendMessage: (message: string, model: string, forceTool?: string, attachments?: AIAttachment[]) => Promise<void>;
  stopGeneration: () => void;
  clearHistory: () => Promise<void>;
  loadHistory: () => Promise<void>;
}

export function useAIChat(
  conversationId: string | null,
  options?: { onToolCall?: (toolName: string) => void; onStreamComplete?: () => void }
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

  const sendMessage = useCallback(async (message: string, model: string, forceTool?: string, attachments?: AIAttachment[]) => {
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
      ...(attachments && attachments.length > 0 ? { attachments } : {}),
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
      const apiAttachments = attachments?.map(a => ({ name: a.name, mediaType: a.mediaType, data: a.data }));
      const response = await streamConversationChat(conversationId, message, model, controller.signal, forceTool, apiAttachments);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((errData as { error?: string }).error || `HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      const toolCalls: AIToolCall[] = [];
      let rafScheduled = false;
      let pendingToolUpdate = false;

      // Throttled UI update: batches all token deltas within a single animation frame
      function scheduleUIUpdate(): void {
        if (rafScheduled) return;
        rafScheduled = true;
        requestAnimationFrame(() => {
          rafScheduled = false;
          const update: Partial<AIChatMessage> = { content: assistantContent };
          if (pendingToolUpdate) {
            update.toolCalls = [...toolCalls];
            pendingToolUpdate = false;
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, ...update } : m
            )
          );
        });
      }

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
            scheduleUIUpdate();
          } else if (event.type === 'tool_call' && event.tool) {
            const tc: AIToolCall = {
              name: event.tool.name,
              input: event.tool.input ?? {},
              result: event.tool.result,
            };
            toolCalls.push(tc);
            pendingToolUpdate = true;
            scheduleUIUpdate();
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

      // Final flush: ensure last buffered content is rendered
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, content: assistantContent, toolCalls: [...toolCalls] } : m
        )
      );
      // Stream completed successfully — notify caller
      if (options?.onStreamComplete) {
        // Use setTimeout to ensure state updates from streaming are flushed before callback fires
        setTimeout(() => options.onStreamComplete?.(), 0);
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
  }, [conversationId, options?.onToolCall, options?.onStreamComplete]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);


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

  return { messages, isLoading, error, sendMessage, stopGeneration, clearHistory, loadHistory };
}
