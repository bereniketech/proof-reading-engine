import { getLLMProvider } from './llm-provider.js';
import { createAdminSupabaseClient } from '../lib/supabase.js';

export interface SectionSuggestion {
  suggested_position: number;
  content: string;
  rationale: string;
}

interface SectionContext {
  position: number;
  section_type: string;
  original_text: string;
  corrected_text: string | null;
}

interface RawSuggestion {
  suggested_position?: unknown;
  content?: unknown;
  rationale?: unknown;
}

export async function suggestSection(
  _sessionId: string,
  sectionTitle: string,
  sections: SectionContext[],
): Promise<SectionSuggestion> {
  const sectionList = [...sections]
    .sort((a, b) => a.position - b.position)
    .map((s) => ({
      position: s.position,
      type: s.section_type,
      text: (s.corrected_text ?? s.original_text).slice(0, 200),
    }));

  const totalSections = sections.length;

  const prompt = `You are a professional document editor.

The user wants to add a new section titled: "${sectionTitle}"

Current document structure (${totalSections} sections):
${JSON.stringify(sectionList, null, 2)}

Suggest the best position to insert this section, write scaffolded content for it, and explain why.
Return JSON only — no markdown outside the JSON.

{
  "suggested_position": <integer 0 to ${totalSections}, where 0 = before all sections, ${totalSections} = after all>,
  "content": "<2-4 paragraphs of scaffolded placeholder content appropriate for this section type and document context>",
  "rationale": "<1-2 sentences explaining the placement choice>"
}`;

  const llm = await getLLMProvider('section');
  const raw = await llm.chat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.4, jsonMode: true },
  );
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const parsed = JSON.parse(cleaned || '{}') as RawSuggestion;

  const suggestedPosition =
    typeof parsed.suggested_position === 'number' && Number.isFinite(parsed.suggested_position)
      ? Math.max(0, Math.min(totalSections, Math.trunc(parsed.suggested_position)))
      : totalSections;

  const content = typeof parsed.content === 'string' ? parsed.content : '';
  const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : '';

  return { suggested_position: suggestedPosition, content, rationale };
}

export async function insertSection(
  sessionId: string,
  title: string,
  position: number,
  content: string,
): Promise<void> {
  const client = createAdminSupabaseClient();

  const { data: existing, error: fetchError } = await client
    .from('sections')
    .select('id, position')
    .eq('session_id', sessionId)
    .gte('position', position)
    .order('position', { ascending: false });

  if (fetchError) {
    throw new Error(`Failed to fetch sections: ${fetchError.message}`);
  }

  for (const section of existing ?? []) {
    const typedSection = section as { id: string; position: number };
    const { error } = await client
      .from('sections')
      .update({ position: typedSection.position + 1 })
      .eq('id', typedSection.id);
    if (error) {
      throw new Error(`Failed to shift section: ${error.message}`);
    }
  }

  const { error: insertError } = await client.from('sections').insert({
    session_id: sessionId,
    position,
    section_type: 'heading',
    heading_level: 2,
    original_text: title,
    corrected_text: content,
    reference_text: null,
    final_text: null,
    change_summary: null,
    status: 'ready',
  });

  if (insertError) {
    throw new Error(`Failed to insert section: ${insertError.message}`);
  }
}
