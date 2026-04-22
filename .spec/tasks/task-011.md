---
task: 011
feature: document-qa-chat
status: pending
model: haiku
supervisor: software-cto
agent: web-backend-expert
depends_on: [010]
---

# Task 011: Document Q&A Chat

## Skills
- .kit/skills/data-science-ml/ai-engineer/SKILL.md
- .kit/skills/frameworks-backend/nodejs-backend-patterns/SKILL.md
- .kit/skills/frameworks-frontend/react-ui-patterns/SKILL.md
- .kit/skills/data-backend/postgres-patterns/SKILL.md
- .kit/skills/core/karpathy-principles/SKILL.md

## Agents
- @web-backend-expert
- @web-frontend-expert

## Commands
- /verify
- /task-handoff

> Load the skills, agents, and commands listed above before reading anything else. Do not load context not listed here.

---

## Objective

Add a collapsible Q&A chat drawer on the ReviewPage: users ask questions about their document, AI answers with streaming responses using GPT-4o, chat history persists per session in the `chat_messages` DB table.

---

## Files

### Create
| File | Purpose |
|------|---------|
| `backend/src/db/migrations/008_chat_history.sql` | Create `chat_messages` table with RLS |
| `backend/src/services/chat.ts` | `buildChatContext(sections)` + streaming chat handler |
| `frontend/src/components/ChatDrawer.tsx` | Collapsible drawer: message list + input + streaming |

### Modify
| File | What to change |
|------|---------------|
| `backend/src/routes/sessions.ts` | Add `POST /api/sessions/:id/chat` route (streaming SSE) |
| `frontend/src/ReviewPage.tsx` | Add ChatDrawer toggle button + render `<ChatDrawer>` |

---

## Dependencies
_(none — OpenAI SDK already installed and supports streaming)_

---

## API Contracts
```
POST /api/sessions/:id/chat
Headers: Authorization: Bearer <jwt>
         Content-Type: application/json
         Accept: text/event-stream
Request: { message: string }
Response 200 (streaming):
  Content-Type: text/event-stream
  Cache-Control: no-cache
  Connection: keep-alive
  Body: SSE stream
    data: {"type":"token","content":"..."}   ← streamed tokens
    data: {"type":"done","messageId":"<uuid>"}
    data: {"type":"error","error":"..."}
Response 400: { success: false, error: 'message is required' }
Response 403: { success: false, error: 'Forbidden' }
Response 404: { success: false, error: 'Session not found' }

GET /api/sessions/:id/chat/history
Headers: Authorization: Bearer <jwt>
Response 200: {
  success: true,
  data: Array<{ id: string, role: 'user'|'assistant', content: string, created_at: string }>
}
```

---

## Code Templates

### `backend/src/db/migrations/008_chat_history.sql` (create this file exactly)
```sql
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_session_id ON public.chat_messages(session_id);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_messages_owner ON public.chat_messages;
CREATE POLICY chat_messages_owner
  ON public.chat_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );
```

### `backend/src/services/chat.ts` (create this file exactly)
```typescript
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { openai } from './openai';
import { supabase } from '../db/supabase';

interface SectionContext {
  position: number;
  section_type: string;
  original_text: string;
  corrected_text: string | null;
}

/**
 * Build a document context string for the system prompt.
 * Caps at 12,000 characters to stay within GPT-4o context budget.
 */
export function buildDocumentContext(sections: SectionContext[]): string {
  const fullText = sections
    .sort((a, b) => a.position - b.position)
    .map((s) => s.corrected_text ?? s.original_text)
    .join('\n\n');
  return fullText.slice(0, 12000);
}

/**
 * Save a message to DB. Returns the saved message id.
 */
export async function saveMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<string> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, role, content })
    .select('id')
    .single();
  if (error) throw new Error(`Failed to save message: ${error.message}`);
  return data.id as string;
}

/**
 * Load chat history for a session (ordered by created_at ascending).
 */
export async function loadHistory(sessionId: string): Promise<Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string }>> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`Failed to load history: ${error.message}`);
  return (data ?? []) as Array<{ id: string; role: 'user' | 'assistant'; content: string; created_at: string }>;
}

/**
 * Stream a GPT-4o response given document context + chat history + new user message.
 * Yields string chunks. Caller is responsible for writing to SSE stream.
 */
export async function* streamChatResponse(
  documentContext: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string
): AsyncGenerator<string> {
  const systemPrompt = `You are a document assistant. The user is reviewing the following document.
Answer questions about the document content, structure, and quality.
Be specific and cite the document text where relevant.

DOCUMENT:
"""
${documentContext}
"""`;

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content } as ChatCompletionMessageParam)),
    { role: 'user', content: userMessage },
  ];

  const stream = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    stream: true,
    temperature: 0.5,
  });

  for await (const chunk of stream) {
    const token = chunk.choices[0]?.delta?.content;
    if (token) yield token;
  }
}
```

### `backend/src/routes/sessions.ts` — add chat routes

Add imports:
```typescript
import { buildDocumentContext, saveMessage, loadHistory, streamChatResponse } from '../services/chat';
```

Add routes:
```typescript
// GET /api/sessions/:id/chat/history
router.get('/:id/chat/history', requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const userId = (req as AuthenticatedRequest).userId;

  const { data: session, error: sessionError } = await supabase
    .from('sessions').select('id, user_id').eq('id', sessionId).single();
  if (sessionError || !session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.user_id !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

  try {
    const history = await loadHistory(sessionId);
    return res.json({ success: true, data: history });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load history';
    return res.status(500).json({ success: false, error: message });
  }
});

// POST /api/sessions/:id/chat  (SSE streaming)
router.post('/:id/chat', requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const userId = (req as AuthenticatedRequest).userId;
  const { message } = req.body as { message?: string };

  if (!message || message.trim() === '') {
    return res.status(400).json({ success: false, error: 'message is required' });
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions').select('id, user_id').eq('id', sessionId).single();
  if (sessionError || !session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.user_id !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

  const { data: sections } = await supabase
    .from('sections')
    .select('position, section_type, original_text, corrected_text')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  // Save user message
  await saveMessage(sessionId, 'user', message.trim());

  // Load history (excluding the message just saved)
  const history = await loadHistory(sessionId);
  const priorHistory = history.slice(0, -1); // exclude just-saved user message

  const docContext = buildDocumentContext(sections ?? []);

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let fullResponse = '';
  try {
    for await (const token of streamChatResponse(docContext, priorHistory, message.trim())) {
      fullResponse += token;
      res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
    }
    // Save assistant response
    const msgId = await saveMessage(sessionId, 'assistant', fullResponse);
    res.write(`data: ${JSON.stringify({ type: 'done', messageId: msgId })}\n\n`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Stream error';
    res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
  } finally {
    res.end();
  }
});
```

### `frontend/src/components/ChatDrawer.tsx` (create this file exactly)
```tsx
import { useEffect, useRef, useState } from 'react';
import { apiBaseUrl } from '../lib/constants';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
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

  // Load history on open
  useEffect(() => {
    if (!open) return;
    fetch(`${apiBaseUrl}/api/sessions/${sessionId}/chat/history`, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then((r) => r.json())
      .then((json: { success: boolean; data?: ChatMessage[]; error?: string }) => {
        if (json.success && json.data) setMessages(json.data);
      })
      .catch(() => setError('Failed to load chat history'));
  }, [open, sessionId, authToken]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  async function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || streaming) return;

    setInput('');
    setStreaming(true);
    setStreamingContent('');
    setError(null);

    // Optimistically add user message to UI
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
          const event = JSON.parse(jsonStr) as { type: string; content?: string; messageId?: string; error?: string };

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
        <button className="chat-close" onClick={onClose} aria-label="Close chat">✕</button>
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
            <p className="chat-msg-content">{streamingContent}<span className="chat-cursor">▊</span></p>
          </div>
        )}
        {error && <p className="chat-error" role="alert">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-row">
        <input
          className="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder="Ask about your document…"
          disabled={streaming}
          aria-label="Chat message input"
        />
        <button className="chat-send-btn" onClick={handleSend} disabled={streaming || !input.trim()}>
          {streaming ? '…' : 'Send'}
        </button>
      </div>
    </div>
  );
}
```

Add CSS to `frontend/src/styles.css`:
```css
/* Chat Drawer */
.chat-drawer {
  position: fixed; right: 0; top: 3.75rem; bottom: 0; width: 360px;
  background: white; border-left: 1px solid #e2e8f0;
  display: flex; flex-direction: column; z-index: 200;
  box-shadow: -4px 0 12px rgba(0,0,0,0.08);
}
.chat-drawer-header {
  padding: 0.75rem 1rem; border-bottom: 1px solid #e2e8f0;
  display: flex; justify-content: space-between; align-items: center;
}
.chat-drawer-header h3 { margin: 0; font-size: 0.9rem; font-weight: 700; }
.chat-close { background: none; border: none; cursor: pointer; color: #64748b; }
.chat-messages { flex: 1; overflow-y: auto; padding: 0.75rem; display: flex; flex-direction: column; gap: 0.75rem; }
.chat-msg { max-width: 90%; }
.chat-msg--user { align-self: flex-end; }
.chat-msg--assistant { align-self: flex-start; }
.chat-msg-role { font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 0.125rem; }
.chat-msg-content {
  margin: 0; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; line-height: 1.5;
  white-space: pre-wrap;
}
.chat-msg--user .chat-msg-content { background: #6366f1; color: white; }
.chat-msg--assistant .chat-msg-content { background: #f1f5f9; color: #1e293b; }
.chat-cursor { animation: blink 1s step-end infinite; }
@keyframes blink { 50% { opacity: 0; } }
.chat-error { color: #dc2626; font-size: 0.8rem; }
.chat-input-row { padding: 0.75rem; border-top: 1px solid #e2e8f0; display: flex; gap: 0.5rem; }
.chat-input {
  flex: 1; padding: 0.5rem; border: 1px solid #e2e8f0; border-radius: 0.375rem;
  font-size: 0.875rem;
}
.chat-send-btn {
  padding: 0.5rem 0.75rem; background: #6366f1; color: white;
  border: none; border-radius: 0.375rem; cursor: pointer; font-weight: 600;
}
.chat-send-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* Chat toggle button (in ReviewPage toolbar) */
.chat-toggle-btn {
  padding: 0.5rem 1rem; background: #f1f5f9; border: 1px solid #e2e8f0;
  border-radius: 0.375rem; cursor: pointer; font-weight: 600; font-size: 0.875rem;
}
.chat-toggle-btn--active { background: #6366f1; color: white; border-color: #6366f1; }
```

### `frontend/src/ReviewPage.tsx` — add ChatDrawer

Add import:
```typescript
import { ChatDrawer } from './components/ChatDrawer';
```

Add state:
```typescript
const [chatOpen, setChatOpen] = useState(false);
```

Add toggle button in toolbar area:
```tsx
<button
  className={`chat-toggle-btn ${chatOpen ? 'chat-toggle-btn--active' : ''}`}
  onClick={() => setChatOpen((o) => !o)}
  aria-pressed={chatOpen}
>
  {chatOpen ? 'Close Chat' : 'Ask AI'}
</button>
```

Add ChatDrawer at end of JSX:
```tsx
<ChatDrawer
  sessionId={session.id}
  authToken={supabaseSession.access_token}
  open={chatOpen}
  onClose={() => setChatOpen(false)}
/>
```

---

## Codebase Context

### Key Code Snippets
```typescript
// OpenAI streaming in Node.js (openai SDK 5.x):
// const stream = await openai.chat.completions.create({ model: 'gpt-4o', messages, stream: true });
// for await (const chunk of stream) { const token = chunk.choices[0]?.delta?.content; }

// Express SSE pattern:
// res.setHeader('Content-Type', 'text/event-stream');
// res.setHeader('Cache-Control', 'no-cache');
// res.setHeader('Connection', 'keep-alive');
// res.flushHeaders();
// res.write(`data: ${JSON.stringify(payload)}\n\n`);
// res.end();

// Frontend SSE via fetch + ReadableStream:
// const res = await fetch(url, { method: 'POST', headers: { Accept: 'text/event-stream' }, body });
// const reader = res.body?.getReader();
// const { done, value } = await reader.read();
// const lines = decoder.decode(value).split('\n').filter(l => l.startsWith('data: '));
```

### Key Patterns in Use
- **SSE not WebSocket:** Use `text/event-stream` + `res.write()` — no WebSocket dependency needed.
- **`res.flushHeaders()` before streaming:** Required on Render to flush headers immediately before any `res.write()` calls.
- **Save user message first, then stream:** User message saved to DB before GPT call so it's in history even if stream fails.
- **`buildDocumentContext` caps at 12,000 chars:** Prevents context overflow. Do not remove the slice.
- **Optimistic UI:** User message appears immediately in UI — don't wait for server roundtrip to show it.

---

## Handoff from Previous Task
**Files changed by previous task:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for this task:** _(fill via /task-handoff)_
**Open questions left:** _(fill via /task-handoff)_

---

## Implementation Steps
1. Create `backend/src/db/migrations/008_chat_history.sql`. Apply in Supabase dashboard.
2. Create `backend/src/services/chat.ts` with exact code above.
3. Open `backend/src/routes/sessions.ts` — add imports + `GET /:id/chat/history` + `POST /:id/chat` routes.
4. Create `frontend/src/components/ChatDrawer.tsx` with exact code above.
5. Append CSS to `frontend/src/styles.css`.
6. Open `frontend/src/ReviewPage.tsx` — add import, `chatOpen` state, toggle button, `<ChatDrawer>` JSX.
7. Run: `cd backend && npx tsc --noEmit`
8. Run: `cd frontend && npx tsc --noEmit`
9. Run: `/verify`

---

## Test Cases

### File: `backend/src/services/chat.test.ts`
```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./openai', () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));
vi.mock('../db/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { buildDocumentContext, streamChatResponse } from './chat';
import { openai } from './openai';

const sections = [
  { position: 0, section_type: 'heading', original_text: 'Introduction', corrected_text: 'Introduction' },
  { position: 1, section_type: 'paragraph', original_text: 'Body text.', corrected_text: 'Improved body text.' },
];

beforeEach(() => { vi.clearAllMocks(); });

describe('buildDocumentContext', () => {
  it('concatenates corrected_text in position order', () => {
    const ctx = buildDocumentContext(sections);
    expect(ctx).toContain('Introduction');
    expect(ctx).toContain('Improved body text.');
  });

  it('falls back to original_text when corrected_text is null', () => {
    const withNull = [{ position: 0, section_type: 'paragraph', original_text: 'Original.', corrected_text: null }];
    expect(buildDocumentContext(withNull)).toBe('Original.');
  });

  it('caps output at 12000 characters', () => {
    const longSection = [{ position: 0, section_type: 'paragraph', original_text: 'x'.repeat(20000), corrected_text: null }];
    const ctx = buildDocumentContext(longSection);
    expect(ctx.length).toBe(12000);
  });
});

describe('streamChatResponse', () => {
  it('yields tokens from GPT stream', async () => {
    const mockStream = (async function* () {
      yield { choices: [{ delta: { content: 'Hello' } }] };
      yield { choices: [{ delta: { content: ' world' } }] };
    })();

    (openai.chat.completions.create as ReturnType<typeof vi.fn>).mockResolvedValue(mockStream);

    const tokens: string[] = [];
    for await (const token of streamChatResponse('doc context', [], 'What is this?')) {
      tokens.push(token);
    }
    expect(tokens).toEqual(['Hello', ' world']);
  });
});
```

---

## Decision Rules
| Scenario | Action |
|----------|--------|
| `message` missing or empty | `res.status(400).json({ success: false, error: 'message is required' })` |
| Session not found | `res.status(404).json({ success: false, error: 'Session not found' })` |
| `session.user_id !== userId` | `res.status(403).json({ success: false, error: 'Forbidden' })` |
| SSE stream error mid-stream | Write `data: {"type":"error","error":"..."}` then `res.end()` |
| Frontend stream read fails | `setError(err.message)` — display in `.chat-error` with `role="alert"` |
| User presses Enter with empty input | No-op — `if (!trimmed || streaming) return` guard |
| User presses Enter during streaming | No-op — same guard |

---

## Acceptance Criteria
- [ ] WHEN "Ask AI" is clicked THEN ChatDrawer opens as a right-side panel
- [ ] WHEN a message is sent THEN the response streams token-by-token in the drawer
- [ ] WHEN the drawer is closed and reopened THEN previous messages are loaded from DB
- [ ] WHEN the user message is empty THEN no request is sent
- [ ] WHEN a stream error occurs THEN error appears in `.chat-error` with `role="alert"`
- [ ] TypeScript strict — no `any` in new files
- [ ] `/verify` passes

---

## Handoff to Next Task
> Fill via `/task-handoff` after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
