---
task: 009
feature: export-track-changes
status: pending
model: haiku
supervisor: software-cto
agent: web-backend-expert
depends_on: [008]
---

# Task 009: Export with Track Changes (.docx)

## Skills
- .kit/skills/frameworks-backend/nodejs-backend-patterns/SKILL.md
- .kit/skills/development/api-design/SKILL.md
- .kit/skills/core/karpathy-principles/SKILL.md

## Agents
- @web-backend-expert
- @web-frontend-expert

## Commands
- /verify
- /task-handoff

> Load the skills, agents, and commands listed above before reading anything else. Do not load context not listed here.

---

## Objective

Add a "Export with Track Changes" button that generates a .docx file where each accepted correction is marked as a Word-compatible tracked change (revision markup), allowing users to see what the AI changed before final acceptance.

---

## Files

### Create
| File | Purpose |
|------|---------|
| `backend/src/services/track-changes-exporter.ts` | Build .docx with revision markup using `docx` npm package |

### Modify
| File | What to change |
|------|---------------|
| `backend/src/routes/export.ts` | Add `GET /api/sessions/:id/export/docx-tracked` route |
| `frontend/src/ReviewPage.tsx` | Add "Export with Track Changes" button alongside existing Export button |

---

## Dependencies
```
# Install in backend workspace:
cd backend && npm install docx
# Env vars: none new
```

---

## API Contracts
```
GET /api/sessions/:id/export/docx-tracked
Headers: Authorization: Bearer <jwt>
Response 200:
  Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document
  Content-Disposition: attachment; filename="<session-filename>-tracked.docx"
  Body: binary .docx blob
Response 403: { success: false, error: 'Forbidden' }
Response 404: { success: false, error: 'Session not found' }
Response 500: { success: false, error: string }
```

---

## Code Templates

### `backend/src/services/track-changes-exporter.ts` (create this file exactly)
```typescript
import {
  Document,
  Paragraph,
  TextRun,
  InsertedRun,
  DeletedRun,
  DeletedText,
  Packer,
  HeadingLevel,
} from 'docx';

interface SectionData {
  position: number;
  section_type: string;
  heading_level: number | null;
  original_text: string;
  corrected_text: string | null;
  status: string;
}

/**
 * Build a .docx Buffer with tracked changes.
 * For sections where corrected_text differs from original_text:
 *   - original_text is wrapped in a DeletedRun (strikethrough red in Word)
 *   - corrected_text is wrapped in an InsertedRun (underline green in Word)
 * For sections with no changes: plain TextRun.
 */
export async function buildTrackedChangesDocx(
  filename: string,
  sections: SectionData[],
  authorName = 'AI Proofreader'
): Promise<Buffer> {
  const now = new Date().toISOString();

  const paragraphs = sections
    .sort((a, b) => a.position - b.position)
    .map((section): Paragraph => {
      const original = section.original_text;
      const corrected = section.corrected_text;
      const hasChange = corrected !== null && corrected.trim() !== original.trim();

      // Determine heading level
      const headingMap: Record<number, HeadingLevel> = {
        1: HeadingLevel.HEADING_1,
        2: HeadingLevel.HEADING_2,
        3: HeadingLevel.HEADING_3,
      };
      const heading =
        section.section_type === 'heading' && section.heading_level !== null
          ? headingMap[section.heading_level] ?? HeadingLevel.HEADING_2
          : undefined;

      if (!hasChange || !corrected) {
        // No change — plain text
        return new Paragraph({
          heading,
          children: [new TextRun({ text: original })],
        });
      }

      // Has change — show deletion + insertion
      return new Paragraph({
        heading,
        children: [
          new DeletedRun({
            author: authorName,
            date: now,
            children: [new DeletedText({ text: original })],
          }),
          new InsertedRun({
            author: authorName,
            date: now,
            children: [new TextRun({ text: corrected })],
          }),
        ],
      });
    });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return Buffer.from(buffer);
}
```

### `backend/src/routes/export.ts` — add tracked-changes route

Open `backend/src/routes/export.ts`. Add import:
```typescript
import { buildTrackedChangesDocx } from '../services/track-changes-exporter';
```

Add route (after existing export routes):
```typescript
// GET /api/sessions/:id/export/docx-tracked
router.get('/:id/export/docx-tracked', requireAuth, async (req, res) => {
  const sessionId = req.params.id;
  const userId = (req as AuthenticatedRequest).userId;

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, user_id, filename')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return res.status(404).json({ success: false, error: 'Session not found' });
  }
  if (session.user_id !== userId) {
    return res.status(403).json({ success: false, error: 'Forbidden' });
  }

  const { data: sections, error: sectionsError } = await supabase
    .from('sections')
    .select('position, section_type, heading_level, original_text, corrected_text, status')
    .eq('session_id', sessionId)
    .order('position', { ascending: true });

  if (sectionsError) {
    return res.status(500).json({ success: false, error: sectionsError.message });
  }

  try {
    const buffer = await buildTrackedChangesDocx(session.filename, sections ?? []);
    const safeFilename = session.filename.replace(/\.[^.]+$/, '') + '-tracked.docx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export failed';
    return res.status(500).json({ success: false, error: message });
  }
});
```

### `frontend/src/ReviewPage.tsx` — add track-changes export button

Find the existing Export / PDF export button area in ReviewPage. Add alongside it:
```tsx
<button
  className="export-tracked-btn"
  onClick={async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${session.id}/export/docx-tracked`, {
        headers: { Authorization: `Bearer ${supabaseSession.access_token}` },
      });
      if (!res.ok) {
        const json = await res.json() as { error?: string };
        throw new Error(json.error ?? 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = session.filename.replace(/\.[^.]+$/, '') + '-tracked.docx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Track changes export failed:', err instanceof Error ? err.message : err);
    }
  }}
>
  Export with Track Changes
</button>
```

Add CSS to `frontend/src/styles.css`:
```css
/* Track Changes Export button */
.export-tracked-btn {
  padding: 0.5rem 1rem;
  background: #0f766e;
  color: white;
  border: none;
  border-radius: 0.375rem;
  cursor: pointer;
  font-weight: 600;
}
.export-tracked-btn:hover { background: #0d6660; }
```

---

## Codebase Context

### Key Code Snippets
```typescript
// backend/src/routes/export.ts — existing pattern for binary file response
// (existing PDF export already uses res.setHeader + res.send(buffer))
// Follow same pattern: setHeader Content-Type + Content-Disposition + Content-Length, then res.send(buffer)

// docx package API (version 8.x):
// import { Document, Paragraph, TextRun, InsertedRun, DeletedRun, DeletedText, Packer, HeadingLevel } from 'docx';
// InsertedRun: wraps TextRun children with author+date metadata — Word renders as underline green
// DeletedRun: wraps DeletedText children — Word renders as strikethrough red
// Packer.toBuffer(doc) returns Promise<Uint8Array> — wrap with Buffer.from()
```

### Key Patterns in Use
- **`docx` package revision API:** `InsertedRun` + `DeletedRun` from the `docx` npm package (v8+) produce Word-compatible revision markup. Never use raw XML manipulation.
- **Content-Disposition attachment:** Always set `attachment; filename="..."` to force browser download, not inline render.
- **URL.createObjectURL pattern:** Create a temporary object URL from the blob, click a temporary `<a>` element, then revoke immediately.
- **Ownership check:** Always verify `session.user_id === userId` before serving file.

---

## Handoff from Previous Task
**Files changed by previous task:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for this task:** _(fill via /task-handoff)_
**Open questions left:** _(fill via /task-handoff)_

---

## Implementation Steps
1. Run: `cd backend && npm install docx`
2. Create `backend/src/services/track-changes-exporter.ts` with exact code above.
3. Open `backend/src/routes/export.ts` — add import + `GET /:id/export/docx-tracked` route.
4. Open `frontend/src/ReviewPage.tsx` — add "Export with Track Changes" button JSX.
5. Append CSS to `frontend/src/styles.css`.
6. Run: `cd backend && npx tsc --noEmit`
7. Run: `cd frontend && npx tsc --noEmit`
8. Run: `/verify`

---

## Test Cases

### File: `backend/src/services/track-changes-exporter.test.ts`
```typescript
import { describe, expect, it } from 'vitest';
import { buildTrackedChangesDocx } from './track-changes-exporter';

const sections = [
  {
    position: 0,
    section_type: 'heading',
    heading_level: 1,
    original_text: 'Introduction',
    corrected_text: 'Introduction',
    status: 'accepted',
  },
  {
    position: 1,
    section_type: 'paragraph',
    heading_level: null,
    original_text: 'The dog runned fast.',
    corrected_text: 'The dog ran fast.',
    status: 'accepted',
  },
  {
    position: 2,
    section_type: 'paragraph',
    heading_level: null,
    original_text: 'No changes here.',
    corrected_text: null,
    status: 'ready',
  },
];

describe('buildTrackedChangesDocx', () => {
  it('returns a Buffer', async () => {
    const buffer = await buildTrackedChangesDocx('test.docx', sections);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('produces a valid docx ZIP signature', async () => {
    const buffer = await buildTrackedChangesDocx('test.docx', sections);
    // DOCX files start with PK (zip) magic bytes: 0x50 0x4B
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('handles empty sections array without throwing', async () => {
    const buffer = await buildTrackedChangesDocx('empty.docx', []);
    expect(buffer).toBeInstanceOf(Buffer);
  });
});
```

---

## Decision Rules
| Scenario | Action |
|----------|--------|
| Session not found | `res.status(404).json({ success: false, error: 'Session not found' })` |
| `session.user_id !== userId` | `res.status(403).json({ success: false, error: 'Forbidden' })` |
| `corrected_text === null` or unchanged | Render as plain `TextRun` — no deletion/insertion markup |
| `Packer.toBuffer` throws | Catch in route handler → `res.status(500).json({ success: false, error: message })` |
| Frontend fetch non-ok status | Log error to `console.error` — no toast yet (add in future task) |
| `heading_level` not in 1/2/3 map | Default to `HeadingLevel.HEADING_2` |

---

## Acceptance Criteria
- [ ] WHEN "Export with Track Changes" is clicked THEN a .docx file downloads
- [ ] WHEN the .docx is opened in Word THEN deleted text appears with strikethrough and inserted text with underline
- [ ] WHEN a section has no `corrected_text` THEN it exports as plain text with no markup
- [ ] WHEN session does not belong to user THEN 403 is returned
- [ ] Backend TypeScript strict — no `any` in new files
- [ ] `/verify` passes

---

## Handoff to Next Task
> Fill via `/task-handoff` after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
