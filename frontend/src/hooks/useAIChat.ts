import { useState, useCallback, useRef, useEffect } from 'react';
import type { AIChatMessage, AIChatStreamEvent, AIToolCall, AIAttachment, CommandConfirmation } from '../types';
import { streamConversationChat, getConversation, deleteConversation, confirmTerminalCommand } from '../api';

interface UseAIChatReturn {
  messages: AIChatMessage[];
  isLoading: boolean;
  error: string | null;
  pendingConfirmation: CommandConfirmation | null;
  sendMessage: (message: string, model: string, forceTool?: string, attachments?: AIAttachment[], projectPath?: string) => Promise<void>;
  stopGeneration: () => void;
  clearHistory: () => Promise<void>;
  loadHistory: () => Promise<void>;
  confirmCommand: () => void;
  rejectCommand: () => void;
}

export function useAIChat(
  conversationId: string | null,
  options?: { onToolCall?: (toolName: string) => void; onStreamComplete?: () => void; projectPath?: string }
): UseAIChatReturn {
  const [messages, setMessages] = useState<AIChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState<CommandConfirmation | null>(null);
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

    let assistantContent = '';
    const toolCalls: AIToolCall[] = [];

    try {
      const apiAttachments = attachments?.map(a => ({ name: a.name, mediaType: a.mediaType, data: a.data }));
      const response = await streamConversationChat(conversationId, message, model, controller.signal, forceTool, apiAttachments, options?.projectPath);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((errData as { error?: string }).error || `HTTP ${response.status}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
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
          } else if (event.type === 'command_confirm' && event.commandConfirm) {
            // Show confirmation UI and wait for user response
            setPendingConfirmation(event.commandConfirm);
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
        // Request was aborted — keep whatever content was already streamed
        // Final flush of buffered content
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: assistantContent || m.content, toolCalls: toolCalls.length > 0 ? [...toolCalls] : m.toolCalls }
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
  }, [conversationId, options?.onToolCall, options?.onStreamComplete, options?.projectPath]);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const confirmCommand = useCallback(() => {
    if (!conversationId || !pendingConfirmation) return;
    confirmTerminalCommand(conversationId, pendingConfirmation.requestId, true).catch(() => {});
    setPendingConfirmation(null);
  }, [conversationId, pendingConfirmation]);

  const rejectCommand = useCallback(() => {
    if (!conversationId || !pendingConfirmation) return;
    confirmTerminalCommand(conversationId, pendingConfirmation.requestId, false).catch(() => {});
    setPendingConfirmation(null);
  }, [conversationId, pendingConfirmation]);

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

  return { messages, isLoading, error, pendingConfirmation, sendMessage, stopGeneration, clearHistory, loadHistory, confirmCommand, rejectCommand };
}
