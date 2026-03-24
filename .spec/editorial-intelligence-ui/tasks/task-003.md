---
task: 003
feature: editorial-intelligence-ui
status: pending
depends_on: [002]
---

# Task 003: Create AuthContext and Update main.tsx

## Session Bootstrap
> Load these before reading anything else.

Skills: /build-website-web-app, /code-writing-software-development
Commands: /verify, /task-handoff

---

## Objective
Extract Supabase auth state management from `App.tsx` into a reusable `AuthContext` so all pages can read `session`, `user`, and `loading` without prop drilling. Update `main.tsx` to wrap the app in `<AuthProvider>`. The current `App.tsx` logic is preserved but moved — do not delete anything yet, just extract the auth part.

---

## Codebase Context

### Key Code Snippets

```typescript
// frontend/src/App.tsx:84-115 — auth logic to extract into AuthContext
useEffect(() => {
  let isMounted = true;

  const initializeSession = async (): Promise<void> => {
    const { data, error } = await supabase.auth.getSession();

    if (!isMounted) {
      return;
    }

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSession(data.session);
  };

  void initializeSession();

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, nextSession) => {
    setSession(nextSession);
    setErrorMessage(null);
  });

  return () => {
    isMounted = false;
    subscription.unsubscribe();
  };
}, []);
```

```typescript
// frontend/src/lib/supabase.ts:1-16 — supabase client (import in AuthContext)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in frontend environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

```typescript
// frontend/src/main.tsx — current entry point
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

### Key Patterns in Use
- **Supabase client** is imported from `./lib/supabase` — do not create a second client.
- **Session type** is `Session | null` from `@supabase/supabase-js`.
- **`loading` flag** prevents flash-of-unauthenticated-content: set `true` on init, `false` after `getSession()` resolves.

---

## Handoff from Previous Task
**Files changed by previous task:** `frontend/src/styles.css`
**Decisions made:** Syntactic Prism tokens applied; utility classes added.
**Context for this task:** Design tokens are ready. Now set up auth context.
**Open questions left:** _(none)_

---

## Implementation Steps

1. Create directory `frontend/src/context/` if it doesn't exist.
2. Create `frontend/src/context/AuthContext.tsx` with the following structure:

```typescript
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const initializeSession = async (): Promise<void> => {
      const { data } = await supabase.auth.getSession();
      if (isMounted) {
        setSession(data.session);
        setLoading(false);
      }
    };

    void initializeSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async (): Promise<void> => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return ctx;
}
```

3. Update `frontend/src/main.tsx` to wrap `<App />` with `<AuthProvider>`:

```typescript
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
```

4. Do NOT modify `App.tsx` yet — leave the duplicate auth logic in place. It will be removed in task-004 when the router is introduced.
5. Run `npm run typecheck` from `frontend/` — must pass with 0 errors.

_Requirements: 2.4, 2.5_
_Skills: /build-website-web-app — React context; /code-writing-software-development — TypeScript interfaces_

---

## Acceptance Criteria
- [ ] `frontend/src/context/AuthContext.tsx` exists and exports `AuthProvider` and `useAuth`.
- [ ] `AuthContextValue` interface has `session`, `user`, `loading`, `signOut`.
- [ ] `main.tsx` wraps `<App />` with `<AuthProvider>`.
- [ ] `loading` is `true` on initial render and `false` after `getSession()` resolves.
- [ ] `npm run typecheck` exits 0 in `frontend/`.
- [ ] App still works end-to-end (login/upload flow unchanged).

---

## Handoff to Next Task
> Fill via /task-handoff after completing this task.

**Files changed:** _(fill via /task-handoff)_
**Decisions made:** _(fill via /task-handoff)_
**Context for next task:** _(fill via /task-handoff)_
**Open questions:** _(fill via /task-handoff)_
