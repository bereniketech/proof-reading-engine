import OpenAI from 'openai';
import { createAdminSupabaseClient } from '../lib/supabase.js';

const CITATION_TIMEOUT_MS = 60_000;

export interface ClaimFlag {
  section_id: string;
  position: number;
  snippet: string;
  claim_type: 'statistical' | 'causal' | 'authority' | 'general';
  needs_citation: boolean;
}

export interface CitationReport {
  flagged_count: number;
  claims: ClaimFlag[];
}

interface SectionInput {
  id: string;
  position: number;
  original_text: string;
  corrected_text: string | null;
}

const CLAIM_PATTERNS = [
  /\bstud(?:ies|y)\s+show/i,
  /\bresearch\s+(?:indicates?|shows?|suggests?|finds?|demonstrates?)/i,
  /\baccording\s+to\s+(?:experts?|scientists?|researchers?|studies?)/i,
  /\bscientists?\s+(?:have\s+)?(?:found|discovered|shown|proven)/i,
  /\bevidence\s+(?:suggests?|shows?|indicates?|demonstrates?)/i,
  /\bdata\s+(?:shows?|suggests?|indicates?)/i,
  /\bstatistics?\s+show/i,
  /\bit\s+(?:has\s+been\s+)?(?:proven|demonstrated|shown)\s+that/i,
  /\bexperts?\s+(?:agree|say|believe|claim)/i,
  /\bmajority\s+of\s+(?:people|users?|consumers?|patients?)/i,
];

function extractMatchingSnippet(text: string, pattern: RegExp): string {
  const match = pattern.exec(text);
  if (!match) return '';
  const start = Math.max(0, match.index - 20);
  const end = Math.min(text.length, match.index + match[0].length + 100);
  return text.slice(start, end).trim();
}

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  return new OpenAI({ apiKey });
}

interface RawClaimFlag {
  section_id?: unknown;
  position?: unknown;
  snippet?: unknown;
  claim_type?: unknown;
  needs_citation?: unknown;
}

function parseClaimsResponse(content: string | null | undefined): ClaimFlag[] {
  if (!content) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI citation response was not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') return [];

  const candidate = parsed as { claims?: unknown };
  if (!Array.isArray(candidate.claims)) return [];

  return candidate.claims
    .filter((c: unknown): c is RawClaimFlag => typeof c === 'object' && c !== null)
    .map((c: RawClaimFlag) => ({
      section_id: typeof c.section_id === 'string' ? c.section_id : '',
      position: typeof c.position === 'number' ? c.position : 0,
      snippet: typeof c.snippet === 'string' ? c.snippet.slice(0, 150) : '',
      claim_type: (['statistical', 'causal', 'authority', 'general'] as const).includes(
        c.claim_type as 'statistical' | 'causal' | 'authority' | 'general',
      )
        ? (c.claim_type as ClaimFlag['claim_type'])
        : 'general',
      needs_citation: typeof c.needs_citation === 'boolean' ? c.needs_citation : false,
    }))
    .filter((c) => c.needs_citation);
}

export async function detectClaims(
  sessionId: string,
  sections: SectionInput[],
): Promise<CitationReport> {
  const adminSupabase = createAdminSupabaseClient();

  const { data: session, error: fetchError } = await adminSupabase
    .from('sessions')
    .select('citations_report')
    .eq('id', sessionId)
    .single();

  if (fetchError) throw new Error(`Failed to fetch session: ${fetchError.message}`);

  if (session.citations_report !== null) {
    return session.citations_report as CitationReport;
  }

  // Pre-filter sections with claim patterns
  const candidates: Array<{ id: string; position: number; text: string; snippets: string[] }> = [];

  for (const s of sections) {
    const text = s.corrected_text ?? s.original_text;
    const snippets: string[] = [];
    for (const pattern of CLAIM_PATTERNS) {
      const snippet = extractMatchingSnippet(text, pattern);
      if (snippet) snippets.push(snippet.slice(0, 150));
    }
    if (snippets.length > 0) {
      candidates.push({ id: s.id, position: s.position, text: text.slice(0, 800), snippets });
    }
  }

  if (candidates.length === 0) {
    const emptyReport: CitationReport = { flagged_count: 0, claims: [] };
    await adminSupabase
      .from('sessions')
      .update({ citations_report: emptyReport })
      .eq('id', sessionId);
    return emptyReport;
  }

  const prompt = `You are a fact-checking assistant. Review these text snippets that may contain unsupported factual claims.

For each snippet, determine if it makes a claim that requires a citation (statistical, causal, authority, or general factual claim).

Input:
${JSON.stringify(
  candidates.map((c) => ({ id: c.id, position: c.position, snippets: c.snippets })),
  null,
  2,
)}

Return JSON only — no markdown outside JSON:
{
  "claims": [
    {
      "section_id": "<id from input>",
      "position": <position from input>,
      "snippet": "<the specific claim snippet, max 150 chars>",
      "claim_type": "<statistical|causal|authority|general>",
      "needs_citation": <true|false>
    }
  ]
}

Only include items where needs_citation is true.`;

  const client = getOpenAIClient();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, CITATION_TIMEOUT_MS);

  let claims: ClaimFlag[];
  try {
    const completion = await client.chat.completions.create(
      {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      },
      { signal: controller.signal },
    );

    const raw = completion.choices[0]?.message?.content;
    claims = parseClaimsResponse(raw);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const report: CitationReport = {
    flagged_count: claims.length,
    claims,
  };

  await adminSupabase
    .from('sessions')
    .update({ citations_report: report })
    .eq('id', sessionId);

  return report;
}
