---
name: e2e-testing
description: Build stable Playwright E2E test suites using Page Object Model, semantic selectors, and CI-integrated artifact collection.
---

# E2E Testing

Write maintainable end-to-end tests with Playwright that cover critical user flows and survive refactors.

---

## 1. Project Structure

Organize tests by domain, not by file type. Keep fixtures, page objects, and specs separate.

```
tests/
├── e2e/
│   ├── auth/          # login, logout, register specs
│   ├── features/      # browse, search, create specs
│   └── api/           # endpoint contract specs
├── fixtures/          # auth.ts, data.ts
├── pages/             # Page Object classes
└── playwright.config.ts
```

**Rule:** Never put page object logic inside spec files — always extract to a `pages/` class.

---

## 2. Page Object Model

Encapsulate selectors and interactions in a typed Page Object class. Expose intent-revealing methods, not raw locator calls.

```typescript
export class ItemsPage {
  readonly searchInput: Locator
  readonly itemCards: Locator

  constructor(page: Page) {
    this.searchInput = page.locator('[data-testid="search-input"]')
    this.itemCards = page.locator('[data-testid="item-card"]')
  }

  async search(query: string) {
    await this.searchInput.fill(query)
    await this.page.waitForResponse(r => r.url().includes('/api/search'))
  }
}
```

**Rule:** All selectors live in Page Objects — specs call methods, never raw `page.locator()`.

---

## 3. Selector Strategy

Prefer `data-testid` attributes for UI elements under test. Fall back to semantic ARIA selectors (`role`, `label`, `text`) when `data-testid` is absent. Never use CSS class names or DOM hierarchy selectors.

```typescript
// Use these
page.locator('[data-testid="submit-btn"]')
page.locator('button:has-text("Submit")')
page.getByRole('button', { name: 'Submit' })

// Never use these
page.locator('.css-class-xyz')
page.locator('div > div > button')
```

**Rule:** A selector that breaks due to a style change is a test authoring defect — fix the selector strategy.

---

## 4. Async and Wait Handling

Use Playwright's auto-waiting locator methods. Wait for specific network responses, not arbitrary timeouts. Wait for `networkidle` after navigations that trigger data fetching.

```typescript
// Good: wait for specific condition
await page.waitForResponse(r => r.url().includes('/api/data'))
await page.locator('[data-testid="menu"]').waitFor({ state: 'visible' })

// Never: arbitrary sleep
await page.waitForTimeout(5000)
```

**Rule:** Any `waitForTimeout` over 500ms is a code smell — replace with a deterministic wait.

---

## 5. Playwright Configuration

Enable retries in CI, parallel execution locally, and multi-browser coverage. Capture traces, screenshots, and video on failure only to keep artifact storage lean.

```typescript
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },
})
```

**Rule:** Set `forbidOnly: true` in CI so `test.only` accidentally left in code causes the pipeline to fail.

---

## 6. Flaky Test Prevention and Quarantine

Tag known-flaky tests with `test.fixme` or `test.skip(process.env.CI, 'reason - Issue #N')` and file a tracking issue immediately. Diagnose flakiness by running `--repeat-each=10` before quarantining.

```bash
npx playwright test tests/search.spec.ts --repeat-each=10
npx playwright test tests/search.spec.ts --retries=3
```

**Rule:** A flaky test that is quarantined without a filed issue and a resolution deadline must not stay in that state past one sprint.

---

## 7. CI Integration and Artifacts

Run E2E tests on every push and pull request. Upload the HTML report and artifacts unconditionally so failures are always diagnosable.

```yaml
- run: npx playwright install --with-deps
- run: npx playwright test
  env:
    BASE_URL: ${{ vars.STAGING_URL }}
- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
    retention-days: 30
```

**Rule:** Always upload artifacts with `if: always()` — a failing run with no artifacts cannot be debugged.
