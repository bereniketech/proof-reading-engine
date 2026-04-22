import { getLLMProvider } from './llm-provider.js';

const OPENAI_TIMEOUT_MS = 20_000;
const OPENAI_INSTRUCTION_TIMEOUT_MS = 60_000;
const MAX_RETRY_ATTEMPTS = 1;
const MAX_INSTRUCTION_RETRY_ATTEMPTS = 1;
const RETRY_DELAY_MS = 1_000;

export type DocumentType =
  | 'general'
  | 'medical_journal'
  | 'legal_document'
  | 'academic_paper'
  | 'business_report'
  | 'creative_writing';

const JSON_INSTRUCTION = 'Return valid JSON only with this exact shape: {"corrected_text": string, "change_summary": string}';

const DOCUMENT_TYPE_SYSTEM_PROMPTS: Record<DocumentType, string> = {
  general: [
    'You are a professional proofreader.',
    'Fix grammar, spelling, punctuation, style, and clarity.',
    'Preserve the original meaning, tone, and structure.',
    JSON_INSTRUCTION,
  ].join(' '),
  medical_journal: [
    'You are an experienced peer reviewer for medical journals.',
    'Follow ICMJE guidelines and AMA Manual of Style.',
    'Preserve medical terminology, drug names, and dosages exactly.',
    'Fix grammar, punctuation, and clarity while maintaining scientific precision.',
    'Flag ambiguous clinical claims without altering their meaning.',
    JSON_INSTRUCTION,
  ].join(' '),
  legal_document: [
    'You are a legal editor specializing in contracts and regulatory documents.',
    'Preserve defined terms (capitalized terms with specific legal meaning) exactly.',
    'Maintain clause and section numbering intact.',
    'Fix grammar, punctuation, and readability without altering legal meaning.',
    'Do not rephrase operative language (shall, must, may) or change party references.',
    JSON_INSTRUCTION,
  ].join(' '),
  academic_paper: [
    'You are an academic editor familiar with APA, Chicago, and MLA style guides.',
    'Fix grammar, punctuation, clarity, and academic tone.',
    'Preserve citation markers, reference numbers, and technical terminology.',
    'Ensure formal register and logical flow between sentences.',
    JSON_INSTRUCTION,
  ].join(' '),
  business_report: [
    'You are a business editor focused on clarity and professional tone.',
    'Fix grammar, punctuation, and readability.',
    'Prefer active voice and concise phrasing.',
    'Preserve financial figures, KPIs, and proper nouns exactly.',
    JSON_INSTRUCTION,
  ].join(' '),
  creative_writing: [
    'You are a literary editor with a light editorial touch.',
    "Preserve the author's voice, stylistic choices, and intentional rule-breaking.",
    'Fix only clear grammatical errors, typos, and punctuation mistakes.',
    'Do not flatten distinctive prose style or impose formal register.',
    JSON_INSTRUCTION,
  ].join(' '),
};

const SYSTEM_PROMPT = DOCUMENT_TYPE_SYSTEM_PROMPTS.general;

const INSTRUCTION_SYSTEM_PROMPT = [
  'You are a professional editor.',
  'The user will provide a document section and an instruction for how to modify it.',
  'Apply the instruction and return the modified text.',
  'Return valid JSON only with this exact shape:',
  '{"corrected_text": string, "change_summary": string}',
].join(' ');

export interface ProofreadSectionInput {
  originalText: string;
  sectionType?: 'heading' | 'paragraph';
  headingLevel?: number | null;
  documentType?: DocumentType;
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

interface InstructionOptions {
  maxRetryAttempts?: number;
  retryDelayMs?: number;
  runInstruction?: (sectionText: string, instruction: string) => Promise<ProofreadResult>;
}

function buildUserPrompt(section: ProofreadSectionInput): string {
  const sectionContext = [
    `Section type: ${section.sectionType ?? 'paragraph'}`,
    `Heading level: ${section.headingLevel ?? 'n/a'}`,
  ].join('\n');

  const sectionText = `Section text:\n${section.originalText}`;

  return [sectionContext, '', sectionText].join('\n');
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

function isRetryableLLMError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const e = error as { status?: unknown; code?: unknown; name?: unknown };
  if (e.status === 429 || e.code === 'rate_limit_exceeded') {
    return true;
  }

  return e.name === 'AbortError' || e.name === 'APIConnectionTimeoutError';
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function runSingleOpenAIProofread(section: ProofreadSectionInput): Promise<ProofreadResult> {
  const llm = await getLLMProvider('proofreading');
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, OPENAI_TIMEOUT_MS);

  const systemPrompt = DOCUMENT_TYPE_SYSTEM_PROMPTS[section.documentType ?? 'general'] ?? SYSTEM_PROMPT;

  try {
    const content = await llm.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: buildUserPrompt(section) },
      ],
      { temperature: 0.2, jsonMode: true, signal: controller.signal },
    );

    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return parseProofreadResult(cleaned);
  } finally {
    clearTimeout(timeoutHandle);
  }
}

async function runSingleInstructionApplication(
  sectionText: string,
  instruction: string,
): Promise<ProofreadResult> {
  const llm = await getLLMProvider('proofreading');
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, OPENAI_INSTRUCTION_TIMEOUT_MS);

  try {
    const content = await llm.chat(
      [
        { role: 'system', content: INSTRUCTION_SYSTEM_PROMPT },
        { role: 'user', content: `Section text:\n${sectionText}\n\nInstruction:\n${instruction}` },
      ],
      { temperature: 0.2, jsonMode: true, signal: controller.signal },
    );

    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    return parseProofreadResult(cleaned);
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

      if (attempt === maxRetryAttempts || !isRetryableLLMError(error)) {
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

export async function applySectionInstruction(
  sectionText: string,
  instruction: string,
  options: InstructionOptions = {},
): Promise<ProofreadResult> {
  const maxRetryAttempts = options.maxRetryAttempts ?? MAX_INSTRUCTION_RETRY_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const runInstruction = options.runInstruction ?? runSingleInstructionApplication;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetryAttempts; attempt += 1) {
    try {
      return await runInstruction(sectionText, instruction);
    } catch (error: unknown) {
      lastError = error;

      if (attempt === maxRetryAttempts || !isRetryableLLMError(error)) {
        break;
      }

      console.warn('Retrying OpenAI instruction after retryable failure', {
        attempt: attempt + 1,
      });
      await delay(retryDelayMs);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : 'Unknown error';
  if (detail === 'Request was aborted.') {
    throw new Error(
      'AI instruction timed out on this section. Try splitting the references into smaller sections and retry.',
    );
  }

  throw new Error(`AI instruction failed: ${detail}`);
}

export const openAIServiceInternals = {
  buildUserPrompt,
  isRetryableLLMError,
  parseProofreadResult,
};
