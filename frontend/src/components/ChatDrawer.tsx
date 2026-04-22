import { useEffect, useRef, useState } from 'react';
import { apiBaseUrl } from '../lib/constants';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface HistoryResponse {
  success: boolean;
  data?: ChatMessage[];
  error?: string;
}

interface SseEvent {
  type: string;
  content?: string;
  messageId?: string;
  error?: string;
}

interface ChatDrawerProps {
  sessionId: string;
  authToken: string;
  open: boolean;
  onClose: () => void;
}

export function ChatDrawer({ sessionId, authToken, open, onClose }: ChatDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    fetch(`${apiBaseUrl}/api/sessions/${sessionId}/chat/history`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((json: HistoryResponse) => {
        if (json.success && json.data) {
          setMessages(json.data);
        }
      })
      .catch(() => {
        setError('Failed to load chat history');
      });
  }, [open, sessionId, authToken]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  async function handleSend(): Promise<void> {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    setInput('');
    setStreaming(true);
    setStreamingContent('');
    setError(null);

    const tempUserMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${sessionId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ message: trimmed }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error('No response stream');

      let accumulated = '';
      let assistantMsgId = crypto.randomUUID();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));

        for (const line of lines) {
          const jsonStr = line.replace('data: ', '');
          const event = JSON.parse(jsonStr) as SseEvent;

          if (event.type === 'token' && event.content) {
            accumulated += event.content;
            setStreamingContent(accumulated);
          } else if (event.type === 'done' && event.messageId) {
            assistantMsgId = event.messageId;
          } else if (event.type === 'error') {
            throw new Error(event.error ?? 'Stream error');
          }
        }
      }

      const assistantMsg: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: accumulated,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setStreamingContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setStreaming(false);
    }
  }

  if (!open) return null;

  return (
    <div className="chat-drawer" aria-label="Document Q&A Chat">
      <div className="chat-drawer-header">
        <h3>Document Chat</h3>
        <button className="chat-close" onClick={onClose} aria-label="Close chat">
          &#x2715;
        </button>
      </div>

      <div className="chat-messages" role="log" aria-live="polite">
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-msg chat-msg--${msg.role}`}>
            <span className="chat-msg-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
            <p className="chat-msg-content">{msg.content}</p>
          </div>
        ))}
        {streaming && streamingContent && (
          <div className="chat-msg chat-msg--assistant chat-msg--streaming">
            <span className="chat-msg-role">AI</span>
            <p className="chat-msg-content">
              {streamingContent}
              <span className="chat-cursor" aria-hidden="true">
                &#x258A;
              </span>
            </p>
          </div>
        )}
        {error ? (
          <p className="chat-error" role="alert">
            {error}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="Ask about your document..."
          disabled={streaming}
          aria-label="Chat message input"
        />
        <button
          className="chat-send-btn"
          onClick={() => void handleSend()}
          disabled={streaming || !input.trim()}
        >
          {streaming ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}
