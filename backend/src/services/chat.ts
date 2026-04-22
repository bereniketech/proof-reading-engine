import { getLLMProvider } from './llm-provider.js';
import { createUserScopedSupabaseClient } from '../lib/supabase.js';

const DOCUMENT_CONTEXT_CHAR_LIMIT = 12_000;

export interface ChatMessageRecord {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface SectionContext {
  position: number;
  section_type: string;
  original_text: string;
  corrected_text: string | null;
}

export function buildDocumentContext(sections: SectionContext[]): string {
  const fullText = [...sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => s.corrected_text ?? s.original_text)
    .join('\n\n');
  return fullText.slice(0, DOCUMENT_CONTEXT_CHAR_LIMIT);
}

export async function saveMessage(
  accessToken: string,
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
): Promise<string> {
  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ session_id: sessionId, role, content })
    .select('id')
    .single();
  if (error) {
    throw new Error(`Failed to save message: ${error.message}`);
  }
  return data.id as string;
}

export async function loadHistory(
  accessToken: string,
  sessionId: string,
): Promise<ChatMessageRecord[]> {
  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`Failed to load history: ${error.message}`);
  }
  return (data ?? []) as ChatMessageRecord[];
}

export async function* streamChatResponse(
  documentContext: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  userMessage: string,
): AsyncGenerator<string> {
  const systemPrompt = `You are a document assistant. The user is reviewing the following document.
Answer questions about the document content, structure, and quality.
Be specific and cite the document text where relevant.

DOCUMENT:
"""
${documentContext}
"""`;

  const llm = await getLLMProvider('chat');
  yield* llm.stream(
    [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage },
    ],
    { temperature: 0.5 },
  );
}
