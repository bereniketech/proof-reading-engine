import OpenAI from 'openai';

const OPENAI_MODEL = 'gpt-4o';
const OPENAI_TIMEOUT_MS = 20_000;
const MAX_RETRY_ATTEMPTS = 1;
const RETRY_DELAY_MS = 1_000;

const SYSTEM_PROMPT = [
  'You are a professional proofreader.',
  'Fix grammar, spelling, punctuation, style, and clarity.',
  'Preserve the original meaning, tone, and structure.',
  'If the section text is empty but reference text is provided, the section is missing from the uploaded document.',
  'In that case, set corrected_text to the reference text and set change_summary to "This section is present in the reference document but missing from the uploaded document. Consider adding it."',
  'Return valid JSON only with this exact shape:',
  '{"corrected_text": string, "change_summary": string}',
].join(' ');

export interface ProofreadSectionInput {
  originalText: string;
  referenceText?: string | null;
  sectionType?: 'heading' | 'paragraph';
  headingLevel?: number | null;
}

export interface ProofreadResult {
  corrected_text: string;
  change_summary: string;
}

interface ProofreadOptions {
  maxRetryAttempts?: number;
  retryDelayMs?: number;
  runProofread?: (section: ProofreadSectionInput) => Promise<ProofreadResult>;
}

let openAIClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (openAIClient) {
    return openAIClient;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  openAIClient = new OpenAI({ apiKey });
  return openAIClient;
}

const SECTION_MATCH_MODEL = 'gpt-4o-mini';
const SECTION_MATCH_TIMEOUT_MS = 5_000;
const SECTION_MATCH_TRUNCATE_CHARS = 300;

export async function verifySectionMatch(
  mainText: string,
  referenceText: string,
): Promise<boolean> {
  const client = getOpenAIClient();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, SECTION_MATCH_TIMEOUT_MS);

  try {
    const truncatedMain = mainText.slice(0, SECTION_MATCH_TRUNCATE_CHARS);
    const truncatedRef = referenceText.slice(0, SECTION_MATCH_TRUNCATE_CHARS);

    const completion = await client.chat.completions.create(
      {
        model: SECTION_MATCH_MODEL,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are comparing two document sections. Determine if they are about the same topic/content, even if worded differently. Return JSON: {"match": true} or {"match": false}',
          },
          {
            role: 'user',
            content: `Section A:\n${truncatedMain}\n\nSection B:\n${truncatedRef}`,
          },
        ],
      },
      { signal: controller.signal },
    );

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      return false;
    }

    const parsed = JSON.parse(content) as { match?: boolean };
    return parsed.match === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function buildUserPrompt(section: ProofreadSectionInput): string {
  const isMissingSection = section.originalText.length === 0 && section.referenceText;

  const sectionContext = [
    `Section type: ${section.sectionType ?? 'paragraph'}`,
    `Heading level: ${section.headingLevel ?? 'n/a'}`,
    ...(isMissingSection ? ['Status: MISSING — this section exists in the reference but not in the uploaded document.'] : []),
  ].join('\n');

  const referenceContext = section.referenceText
    ? `Reference text to align tone/terminology:\n${section.referenceText}`
    : 'No reference text provided.';

  const sectionText = isMissingSection
    ? 'Section text:\n(empty — section is missing from uploaded document)'
    : `Section text:\n${section.originalText}`;

  return [sectionContext, '', referenceContext, '', sectionText].join('\n');
}

function parseProofreadResult(content: string | null | undefined): ProofreadResult {
  if (!content) {
    throw new Error('OpenAI returned an empty response');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI response was not valid JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('OpenAI response must be a JSON object');
  }

  const candidate = parsed as { corrected_text?: unknown; change_summary?: unknown };
  if (typeof candidate.corrected_text !== 'string' || typeof candidate.change_summary !== 'string') {
    throw new Error('OpenAI response is missing required fields');
  }

  return {
    corrected_text: candidate.corrected_text,
    change_summary: candidate.change_summary,
  };
}

function isRetryableOpenAIError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const errorWithStatus = error as { status?: unknown; code?: unknown; name?: unknown };
  if (errorWithStatus.status === 429 || errorWithStatus.code === 'rate_limit_exceeded') {
    return true;
  }

  return errorWithStatus.name === 'AbortError' || errorWithStatus.name === 'APIConnectionTimeoutError';
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function runSingleOpenAIProofread(section: ProofreadSectionInput): Promise<ProofreadResult> {
  const client = getOpenAIClient();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, OPENAI_TIMEOUT_MS);

  try {
    const completion = await client.chat.completions.create(
      {
        model: OPENAI_MODEL,
        temperature: 0.2,
        response_format: {
          type: 'json_object',
        },
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: buildUserPrompt(section),
          },
        ],
      },
      {
        signal: controller.signal,
      },
    );

    const content = completion.choices[0]?.message?.content;
    return parseProofreadResult(content);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function proofreadSectionWithOpenAI(
  section: ProofreadSectionInput,
  options: ProofreadOptions = {},
): Promise<ProofreadResult> {
  const maxRetryAttempts = options.maxRetryAttempts ?? MAX_RETRY_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const runProofread = options.runProofread ?? runSingleOpenAIProofread;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetryAttempts; attempt += 1) {
    try {
      return await runProofread(section);
    } catch (error: unknown) {
      lastError = error;

      if (attempt === maxRetryAttempts || !isRetryableOpenAIError(error)) {
        break;
      }

      console.warn('Retrying OpenAI proofreading after retryable failure', {
        attempt: attempt + 1,
      });
      await delay(retryDelayMs);
    }
  }

  console.error('OpenAI proofreading failed', {
    message: lastError instanceof Error ? lastError.message : 'Unknown error',
  });

  const detail = lastError instanceof Error ? `: ${lastError.message}` : '';
  throw new Error(`OpenAI proofreading failed after retry${detail}`);
}

export const openAIServiceInternals = {
  buildUserPrompt,
  isRetryableOpenAIError,
  parseProofreadResult,
};
