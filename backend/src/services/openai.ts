import OpenAI from 'openai';

const OPENAI_MODEL = 'gpt-4o';
const OPENAI_TIMEOUT_MS = 20_000;
const MAX_RETRY_ATTEMPTS = 1;
const RETRY_DELAY_MS = 1_000;

const SYSTEM_PROMPT = [
  'You are a professional proofreader.',
  'Fix grammar, spelling, punctuation, style, and clarity.',
  'Preserve the original meaning, tone, and structure.',
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

function getOpenAIClient(): OpenAI {
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

function buildUserPrompt(section: ProofreadSectionInput): string {
  const sectionContext = [
    `Section type: ${section.sectionType ?? 'paragraph'}`,
    `Heading level: ${section.headingLevel ?? 'n/a'}`,
  ].join('\n');

  const referenceContext = section.referenceText
    ? `Reference text to align tone/terminology:\n${section.referenceText}`
    : 'No reference text provided.';

  return [sectionContext, '', referenceContext, '', `Section text:\n${section.originalText}`].join('\n');
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
