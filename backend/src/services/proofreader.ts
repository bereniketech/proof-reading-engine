import { createUserScopedSupabaseClient } from '../lib/supabase.js';
import {
  proofreadSectionWithLanguageTool,
  type ProofreadResult as LanguageToolProofreadResult,
} from './languagetool.js';
import { proofreadSectionWithOpenAI, type ProofreadResult as OpenAIProofreadResult } from './openai.js';

const DEFAULT_MAX_CONCURRENCY = 5;

type SectionStatus = 'pending' | 'ready' | 'accepted' | 'rejected';
type SessionStatus = 'parsing' | 'proofreading' | 'review' | 'done';

interface SessionSectionRecord {
  id: string;
  position: number;
  section_type: 'heading' | 'paragraph';
  heading_level: number | null;
  original_text: string;
  status: SectionStatus;
}

type ProofreadResult = OpenAIProofreadResult | LanguageToolProofreadResult;

interface ProofreaderRepository {
  getPendingSections: (sessionId: string) => Promise<SessionSectionRecord[]>;
  saveSectionProofreadResult: (sessionId: string, sectionId: string, result: ProofreadResult) => Promise<void>;
  updateSessionStatus: (sessionId: string, status: SessionStatus) => Promise<void>;
}

interface ProofreaderDependencies {
  repository: ProofreaderRepository;
  proofreadWithOpenAI: (section: SessionSectionRecord) => Promise<ProofreadResult>;
  proofreadWithLanguageTool: (section: SessionSectionRecord) => Promise<ProofreadResult>;
}

export interface RunProofreadingOrchestratorInput {
  sessionId: string;
  accessToken: string;
  maxConcurrency?: number;
  documentType?: string;
}

export interface RunProofreadingOrchestratorOptions {
  dependencies?: ProofreaderDependencies;
}

function normalizeConcurrencyLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit) || limit < 1) {
    return DEFAULT_MAX_CONCURRENCY;
  }

  return Math.floor(limit);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown error';
}

async function runWithConcurrency<TItem>(
  items: TItem[],
  concurrencyLimit: number,
  handler: (item: TItem) => Promise<void>,
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const workerCount = Math.min(concurrencyLimit, items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      const currentItem = items[currentIndex];
      if (currentItem === undefined) {
        return;
      }

      await handler(currentItem);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

function createSupabaseProofreaderRepository(accessToken: string): ProofreaderRepository {
  const supabase = createUserScopedSupabaseClient(accessToken);

  return {
    getPendingSections: async (sessionId: string): Promise<SessionSectionRecord[]> => {
      const { data, error } = await supabase
        .from('sections')
        .select('id, position, section_type, heading_level, original_text, status')
        .eq('session_id', sessionId)
        .eq('status', 'pending')
        .order('position', { ascending: true });

      if (error) {
        throw new Error(`Failed to load sections for proofreading: ${error.message}`);
      }

      return data ?? [];
    },

    saveSectionProofreadResult: async (sessionId: string, sectionId: string, result: ProofreadResult): Promise<void> => {
      const { error } = await supabase
        .from('sections')
        .update({
          corrected_text: result.corrected_text,
          change_summary: result.change_summary,
          status: 'ready',
        })
        .eq('id', sectionId)
        .eq('session_id', sessionId);

      if (error) {
        throw new Error(`Failed to update section ${sectionId}: ${error.message}`);
      }
    },

    updateSessionStatus: async (sessionId: string, status: SessionStatus): Promise<void> => {
      const { error } = await supabase
        .from('sessions')
        .update({ status })
        .eq('id', sessionId);

      if (error) {
        throw new Error(`Failed to update session status: ${error.message}`);
      }
    },
  };
}

function createDefaultDependencies(accessToken: string, documentType?: string): ProofreaderDependencies {
  return {
    repository: createSupabaseProofreaderRepository(accessToken),
    proofreadWithOpenAI: async (section: SessionSectionRecord): Promise<ProofreadResult> =>
      proofreadSectionWithOpenAI({
        originalText: section.original_text,
        sectionType: section.section_type,
        headingLevel: section.heading_level,
        documentType: documentType as import('./openai.js').DocumentType | undefined,
      }),
    proofreadWithLanguageTool: async (section: SessionSectionRecord): Promise<ProofreadResult> =>
      proofreadSectionWithLanguageTool({
        originalText: section.original_text,
        sectionType: section.section_type,
        headingLevel: section.heading_level,
      }),
  };
}

async function proofreadSingleSection(
  sessionId: string,
  section: SessionSectionRecord,
  dependencies: ProofreaderDependencies,
): Promise<void> {
  try {
    const openAIResult = await dependencies.proofreadWithOpenAI(section);
    await dependencies.repository.saveSectionProofreadResult(sessionId, section.id, openAIResult);
    return;
  } catch (openAIError: unknown) {
    console.warn('OpenAI proofreading failed for section, attempting LanguageTool fallback', {
      sessionId,
      sectionId: section.id,
      error: getErrorMessage(openAIError),
    });
  }

  try {
    const fallbackResult = await dependencies.proofreadWithLanguageTool(section);
    await dependencies.repository.saveSectionProofreadResult(sessionId, section.id, fallbackResult);
  } catch (fallbackError: unknown) {
    console.error('LanguageTool fallback failed for section, persisting original text', {
      sessionId,
      sectionId: section.id,
      error: getErrorMessage(fallbackError),
    });

    await dependencies.repository.saveSectionProofreadResult(sessionId, section.id, {
      corrected_text: section.original_text,
      change_summary: 'Proofreading services unavailable; original text retained.',
    });
  }
}

export async function runProofreadingOrchestrator(
  input: RunProofreadingOrchestratorInput,
  options: RunProofreadingOrchestratorOptions = {},
): Promise<void> {
  if (!input.sessionId || !input.accessToken) {
    throw new Error('sessionId and accessToken are required to run proofreading orchestrator');
  }

  const dependencies = options.dependencies ?? createDefaultDependencies(input.accessToken, input.documentType);
  const concurrencyLimit = normalizeConcurrencyLimit(input.maxConcurrency);
  const sections = await dependencies.repository.getPendingSections(input.sessionId);

  await runWithConcurrency(sections, concurrencyLimit, async (section) =>
    proofreadSingleSection(input.sessionId, section, dependencies),
  );

  await dependencies.repository.updateSessionStatus(input.sessionId, 'review');
}

export const proofreaderInternals = {
  DEFAULT_MAX_CONCURRENCY,
  normalizeConcurrencyLimit,
  runWithConcurrency,
};