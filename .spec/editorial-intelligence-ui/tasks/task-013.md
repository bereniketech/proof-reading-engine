---
task: 013
feature: editorial-intelligence-ui
status: pending
depends_on: [012]
---

# Task 013: Build Backend Profile Endpoint

## Session Bootstrap
> Load these before reading anything else.

Skills: /code-writing-software-development
Commands: /verify, /task-handoff

---

## Objective
Create `backend/src/routes/profile.ts` with `GET /api/users/me` and `PATCH /api/users/me`. The GET returns user email + metadata fields (name, title, primary_dialect, translation_target, auto_localize). The PATCH validates against an allowlist and updates Supabase user metadata. Register both routes in `server.ts`.

---

## Codebase Context

### Key Code Snippets

```typescript
// backend/src/lib/supabase.ts:12-45 — both client factories
export function createUserScopedSupabaseClient(accessToken: string): SupabaseClient {
  // Uses anon key + Bearer token header — respects RLS
  // Use this for GET /users/me (getUser() with user's token)
}

export function createAdminSupabaseClient(): SupabaseClient {
  // Uses service_role key — bypasses RLS
  // Use this for PATCH /users/me (updateUser requires admin)
}
```

```typescript
// backend/src/routes/sections.ts:73-93 — helper function patterns to reuse
function getAuthenticatedUser(response: Response): AuthenticatedUser | null {
  const user = response.locals.user;
  if (!user || typeof user.id !== 'string') { return null; }
  return { id: user.id };
}

function getVerifiedAccessToken(res: Response): string | null {
  const token = res.locals.accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}
```

```typescript
// backend/src/server.ts — registration target
app.use('/api', verifySupabaseJwt);
// add: app.use('/api', profileRouter);
```

### Key Patterns in Use
- **GET:** Use `createUserScopedSupabaseClient(accessToken)` then call `supabase.auth.getUser()` — this validates the JWT again and returns the full user object including `user_metadata`.
- **PATCH:** Use `createAdminSupabaseClient()` then call `adminClient.auth.admin.updateUserById(userId, { user_metadata: { ...allowedFields } })`. Admin client needed because user-scoped client cannot update its own metadata via the JS SDK in this Supabase version.
- **Allowlisted fields:** `name`, `title`, `primary_dialect`, `translation_target`, `auto_localize` only. Reject any other key with 400.

---

## Handoff from Previous Task
**Files changed by previous task:** `frontend/src/pages/InsightsPage.tsx`, `frontend/src/components/ProgressBar.tsx`, `frontend/src/components/MetricCard.tsx`, `frontend/src/styles.css`
**Decisions made:** InsightsPage renders all 5 card types from real backend data.
**Context for this task:** Now add the profile backend endpoint.
**Open questions left:** _(none)_

---

## Implementation Steps

1. Create `backend/src/routes/profile.ts`:

```typescript
import type { Request, Response } from 'express';
import { Router } from 'express';
import { createUserScopedSupabaseClient, createAdminSupabaseClient } from '../lib/supabase.js';

interface AuthenticatedUser { id: string; }

function getAuthenticatedUser(res: Response): AuthenticatedUser | null {
  const user = res.locals.user;
  return user && typeof user.id === 'string' ? { id: user.id } : null;
}

function getVerifiedAccessToken(res: Response): string | null {
  const token = res.locals.accessToken;
  return typeof token === 'string' && token.length > 0 ? token : null;
}

const ALLOWED_METADATA_FIELDS = new Set([
  'name', 'title', 'primary_dialect', 'translation_target', 'auto_localize',
]);

interface UserProfile {
  email: string;
  name: string;
  title: string;
  primary_dialect: string;
  translation_target: string;
  auto_localize: boolean;
}

function buildProfile(email: string | undefined, metadata: Record<string, unknown>): UserProfile {
  return {
    email: email ?? '',
    name: typeof metadata.name === 'string' ? metadata.name : '',
    title: typeof metadata.title === 'string' ? metadata.title : '',
    primary_dialect: typeof metadata.primary_dialect === 'string' ? metadata.primary_dialect : 'English (UK)',
    translation_target: typeof metadata.translation_target === 'string' ? metadata.translation_target : 'French (Parisian)',
    auto_localize: typeof metadata.auto_localize === 'boolean' ? metadata.auto_localize : false,
  };
}

export const profileRouter = Router();

// GET /users/me
profileRouter.get('/users/me', async (_req: Request, res: Response): Promise<void> => {
  const user = getAuthenticatedUser(res);
  const accessToken = getVerifiedAccessToken(res);
  if (!user || !accessToken) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const supabase = createUserScopedSupabaseClient(accessToken);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const profile = buildProfile(data.user.email, (data.user.user_metadata ?? {}) as Record<string, unknown>);
  res.status(200).json({ success: true, data: profile });
});

// PATCH /users/me
profileRouter.patch('/users/me', async (req: Request, res: Response): Promise<void> => {
  const user = getAuthenticatedUser(res);
  const accessToken = getVerifiedAccessToken(res);
  if (!user || !accessToken) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  const body = req.body as Record<string, unknown>;

  // Validate: only allowlisted fields
  const unknownFields = Object.keys(body).filter((k) => !ALLOWED_METADATA_FIELDS.has(k));
  if (unknownFields.length > 0) {
    res.status(400).json({ success: false, error: `Invalid field(s): ${unknownFields.join(', ')}` });
    return;
  }

  // Validate types
  if ('auto_localize' in body && typeof body.auto_localize !== 'boolean') {
    res.status(400).json({ success: false, error: 'auto_localize must be a boolean' });
    return;
  }
  for (const field of ['name', 'title', 'primary_dialect', 'translation_target'] as const) {
    if (field in body && typeof body[field] !== 'string') {
      res.status(400).json({ success: false, error: `${field} must be a string` });
      return;
    }
  }

  const adminClient = createAdminSupabaseClient();
  const { data, error } = await adminClient.auth.admin.updateUserById(user.id, {
    user_metadata: body,
  });

  if (error || !data.user) {
    res.status(500).json({ success: false, error: error?.message ?? 'Failed to update profile' });
    return;
  }

  const profile = buildProfile(data.user.email, (data.user.user_metadata ?? {}) as Record<string, unknown>);
  res.status(200).json({ success: true, data: profile });
});
```

2. Register in `backend/src/server.ts`:
   ```typescript
   import { profileRouter } from './routes/profile.js';
   // add after existing routers:
   app.use('/api', profileRouter);
   ```

3. Run `npm run typecheck` in `backend/` — must pass.

_Requirements: 10.1–10.4_
_Skills: /code-writing-software-development — Express route, Supabase auth metadata_

---

## Acceptance Criteria
- [ ] `GET /api/users/me` with valid JWT returns `{ success: true, data: { email, name, title, primary_dialect, translation_target, auto_localize } }`.
- [ ] `PATCH /api/users/me` with `{ name: "Jane Doe" }` updates and returns updated profile.
- [ ] `PATCH /api/users/me` with unknown field returns 400 with descriptive error.
- [ ] `PATCH /api/users/me` with `auto_localize: "yes"` (not boolean) returns 400.
- [ ] Invalid/missing JWT returns 401 on both endpoints.
- [ ] `npm run typecheck` exits 0 in `backend/`.

---

## Handoff to Next Task
> Fill via /task-handoff after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
