import { test, expect, type Page, type Download } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? 'test@example.com';
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? 'testpassword123';

const SAMPLES_DIR = path.resolve(__dirname, '..', 'samples');
const MAIN_DOC = path.join(
  SAMPLES_DIR,
  'Maternal Fatigue Among Mothers of Children with Autism Spectrum Disorder A Cross-Sectional Questionnaire Study_.pdf',
);
const REF_DOC = path.join(SAMPLES_DIR, 'CIEY2645341.pdf');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(page: Page): Promise<void> {
  await page.goto(BASE_URL);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByLabel('Email').fill(TEST_EMAIL);
  await page.getByLabel('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Login' }).click();
  // Wait until authenticated state is visible (upload dropzone appears)
  await expect(page.getByText('Authenticated')).toBeVisible({ timeout: 15_000 });
}

async function uploadFiles(page: Page): Promise<void> {
  // Attach main document
  const mainInput = page.locator('input[type="file"]').first();
  await mainInput.setInputFiles(MAIN_DOC);

  // Attach reference document
  const refInput = page.locator('input[type="file"]').nth(1);
  await refInput.setInputFiles(REF_DOC);

  // Start proofreading
  await page.getByRole('button', { name: 'Start Proofreading' }).click();

  // Wait for navigation to /review
  await page.waitForURL(/\/review/, { timeout: 30_000 });
}

async function waitForAllSectionsReady(page: Page): Promise<void> {
  // Poll until no "Pending" status badge remains (sections finish AI processing)
  await expect(async () => {
    const pendingBadges = page.locator('.status-badge--pending');
    const count = await pendingBadges.count();
    expect(count).toBe(0);
  }).toPass({ timeout: 180_000, intervals: [3_000] });
}

async function acceptAllSections(page: Page): Promise<void> {
  // Get all section list items
  const sectionItems = page.locator('.section-item');
  const total = await sectionItems.count();

  for (let i = 0; i < total; i++) {
    await sectionItems.nth(i).click();
    // Only click Accept if not already accepted
    const acceptBtn = page.getByRole('button', { name: 'Accept' });
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      // Wait for status to update to accepted
      await expect(sectionItems.nth(i).locator('.status-badge--accepted')).toBeVisible({
        timeout: 15_000,
      });
    }
  }
}

function saveDownloadToSamples(download: Download): Promise<string> {
  const dest = path.join(SAMPLES_DIR, download.suggestedFilename());
  return download.saveAs(dest).then(() => dest);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Proof-Reading Engine E2E', () => {
  test('unauthenticated user is redirected to login page', async ({ page }) => {
    // Clear any stored auth by going to review without a session
    await page.goto(`${BASE_URL}/review?sessionId=fake-session-id`);

    // App should redirect to / (the upload/login page)
    await page.waitForURL(BASE_URL + '/', { timeout: 15_000 });
    await expect(page).toHaveURL(BASE_URL + '/');

    // Login form should be visible
    await expect(page.getByRole('button', { name: 'Login' })).toBeVisible();
  });

  test('happy path: upload → proofread → accept all → export PDF', async ({ page }) => {
    await login(page);
    await uploadFiles(page);

    // Wait for proofreading to complete
    await waitForAllSectionsReady(page);

    // Accept every section
    await acceptAllSections(page);

    // Download PDF — button should now be enabled
    const downloadButton = page.getByRole('button', { name: 'Download PDF' });
    await expect(downloadButton).toBeEnabled({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton.click(),
    ]);

    // Save to samples/ and verify it exists
    const savedPath = await saveDownloadToSamples(download);
    expect(fs.existsSync(savedPath)).toBe(true);
    expect(path.dirname(savedPath)).toBe(SAMPLES_DIR);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test('reject first section — export still succeeds (uses original_text)', async ({ page }) => {
    await login(page);
    await uploadFiles(page);

    await waitForAllSectionsReady(page);

    // Reject only the first section
    const firstSection = page.locator('.section-item').first();
    await firstSection.click();

    const rejectBtn = page.getByRole('button', { name: 'Reject' });
    await expect(rejectBtn).toBeVisible();
    await rejectBtn.click();

    await expect(firstSection.locator('.status-badge--rejected')).toBeVisible({ timeout: 15_000 });

    // Accept all remaining sections
    const sectionItems = page.locator('.section-item');
    const total = await sectionItems.count();
    for (let i = 1; i < total; i++) {
      await sectionItems.nth(i).click();
      const acceptBtn = page.getByRole('button', { name: 'Accept' });
      if (await acceptBtn.isVisible()) {
        await acceptBtn.click();
        await expect(sectionItems.nth(i).locator('.status-badge--accepted')).toBeVisible({
          timeout: 15_000,
        });
      }
    }

    // Export should succeed
    const downloadButton = page.getByRole('button', { name: 'Download PDF' });
    await expect(downloadButton).toBeEnabled({ timeout: 10_000 });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      downloadButton.click(),
    ]);

    const savedPath = await saveDownloadToSamples(download);
    expect(fs.existsSync(savedPath)).toBe(true);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });
});
