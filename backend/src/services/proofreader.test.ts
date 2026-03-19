import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { runProofreadingOrchestrator } from './proofreader.js';

type SectionRecord = {
  id: string;
  position: number;
  section_type: 'heading' | 'paragraph';
  heading_level: number | null;
  original_text: string;
  status: 'pending' | 'ready' | 'accepted' | 'rejected';
};

type ResultRecord = {
  sectionId: string;
  correctedText: string;
  changeSummary: string;
};

function createSection(id: number): SectionRecord {
  return {
    id: `section-${id}`,
    position: id,
    section_type: 'paragraph',
    heading_level: null,
    original_text: `This are paragraph ${id}.`,
    status: 'pending',
  };
}

describe('runProofreadingOrchestrator', () => {
  it('updates each section to ready and marks session as review', async () => {
    const sections = [createSection(1), createSection(2), createSection(3)];
    const savedResults: ResultRecord[] = [];
    let updatedSessionStatus: string | null = null;

    await runProofreadingOrchestrator(
      {
        sessionId: 'session-1',
        accessToken: 'token-1',
      },
      {
        dependencies: {
          repository: {
            getPendingSections: async () => sections,
            saveSectionProofreadResult: async (_sessionId, sectionId, result) => {
              savedResults.push({
                sectionId,
                correctedText: result.corrected_text,
                changeSummary: result.change_summary,
              });
            },
            updateSessionStatus: async (_sessionId, status) => {
              updatedSessionStatus = status;
            },
          },
          proofreadWithOpenAI: async (section) => ({
            corrected_text: section.original_text.replace('are', 'is'),
            change_summary: 'Fixed grammar via OpenAI',
          }),
          proofreadWithLanguageTool: async () => ({
            corrected_text: 'unused',
            change_summary: 'unused',
          }),
        },
      },
    );

    assert.equal(savedResults.length, 3);
    assert.equal(updatedSessionStatus, 'review');
    assert.equal(savedResults.every((result) => result.correctedText.includes('is paragraph')), true);
  });

  it('enforces a maximum of 5 concurrent proofreading calls', async () => {
    const sections = Array.from({ length: 12 }, (_, index) => createSection(index + 1));
    let activeCount = 0;
    let maxObservedActiveCount = 0;

    await runProofreadingOrchestrator(
      {
        sessionId: 'session-2',
        accessToken: 'token-2',
      },
      {
        dependencies: {
          repository: {
            getPendingSections: async () => sections,
            saveSectionProofreadResult: async () => {
              return;
            },
            updateSessionStatus: async () => {
              return;
            },
          },
          proofreadWithOpenAI: async () => {
            activeCount += 1;
            maxObservedActiveCount = Math.max(maxObservedActiveCount, activeCount);

            await new Promise((resolve) => {
              setTimeout(resolve, 10);
            });

            activeCount -= 1;

            return {
              corrected_text: 'Corrected text',
              change_summary: 'OpenAI summary',
            };
          },
          proofreadWithLanguageTool: async () => ({
            corrected_text: 'unused',
            change_summary: 'unused',
          }),
        },
      },
    );

    assert.equal(maxObservedActiveCount <= 5, true);
  });

  it('uses LanguageTool fallback when OpenAI fails for a section', async () => {
    const sections = [createSection(1), createSection(2)];
    const savedResultsBySection = new Map<string, string>();

    await runProofreadingOrchestrator(
      {
        sessionId: 'session-3',
        accessToken: 'token-3',
      },
      {
        dependencies: {
          repository: {
            getPendingSections: async () => sections,
            saveSectionProofreadResult: async (_sessionId, sectionId, result) => {
              savedResultsBySection.set(sectionId, result.change_summary);
            },
            updateSessionStatus: async () => {
              return;
            },
          },
          proofreadWithOpenAI: async (section) => {
            if (section.id === 'section-2') {
              throw new Error('OpenAI unavailable');
            }

            return {
              corrected_text: 'Primary correction',
              change_summary: 'OpenAI correction',
            };
          },
          proofreadWithLanguageTool: async () => ({
            corrected_text: 'Fallback correction',
            change_summary: 'Grammar corrections via LanguageTool',
          }),
        },
      },
    );

    assert.equal(savedResultsBySection.get('section-1'), 'OpenAI correction');
    assert.equal(savedResultsBySection.get('section-2'), 'Grammar corrections via LanguageTool');
  });

  it('retains original text and still marks review when both providers fail', async () => {
    let didUpdateSessionStatus = false;
    const savedResults: ResultRecord[] = [];

    await runProofreadingOrchestrator(
      {
        sessionId: 'session-4',
        accessToken: 'token-4',
      },
      {
        dependencies: {
          repository: {
            getPendingSections: async () => [createSection(1)],
            saveSectionProofreadResult: async (_sessionId, sectionId, result) => {
              savedResults.push({
                sectionId,
                correctedText: result.corrected_text,
                changeSummary: result.change_summary,
              });
            },
            updateSessionStatus: async () => {
              didUpdateSessionStatus = true;
            },
          },
          proofreadWithOpenAI: async () => {
            throw new Error('OpenAI failed');
          },
          proofreadWithLanguageTool: async () => {
            throw new Error('LanguageTool failed');
          },
        },
      },
    );

    assert.equal(didUpdateSessionStatus, true);
    assert.equal(savedResults.length, 1);
    assert.equal(savedResults[0]?.correctedText, 'This are paragraph 1.');
    assert.equal(savedResults[0]?.changeSummary, 'Proofreading services unavailable; original text retained.');
  });
});