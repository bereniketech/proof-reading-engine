---
task: 006
feature: editorial-intelligence-ui
status: complete
depends_on: [005]
---

# Task 006: Build LoginPage

## Session Bootstrap
> Load these before reading anything else.

Skills: /build-website-web-app
Commands: /verify, /task-handoff

---

## Objective
Replace the `LoginPage` stub with a full implementation matching the `stitch/desktop_login_editorial_intelligence_updated/` design: centered 440px card, brand icon, Google button placeholder, email/password fields with animated focus, gradient CTA, sign-up toggle, error/info messages, and decorative glassmorphism accent card. All Supabase auth logic reuses `useAuth` from AuthContext.

---

## Codebase Context

### Key Code Snippets

```typescript
// frontend/src/App.tsx:121-158 — auth submit logic to port into LoginPage
const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
  event.preventDefault();
  setIsSubmitting(true);
  setErrorMessage(null);
  setInfoMessage(null);

  if (mode === 'login') {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setErrorMessage(error.message); }
    setIsSubmitting(false);
    return;
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { setErrorMessage(error.message); setIsSubmitting(false); return; }
  if (!data.session) {
    setInfoMessage('Sign-up succeeded. Please check your email for confirmation before logging in.');
  } else {
    setInfoMessage('Account created and logged in successfully.');
  }
  setIsSubmitting(false);
};
```

```typescript
// frontend/src/lib/supabase.ts — import supabase directly (not via useAuth)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, { ... });
```

```typescript
// frontend/src/context/AuthContext.tsx — session available for redirect
export function useAuth(): AuthContextValue {
  // returns: { session, user, loading, signOut }
}
```

```css
/* Design tokens needed for login page */
--color-primary: #3a388b;
--color-primary-container: #5250a4;
--color-tertiary-fixed: #6ffbbe;
--color-surface: #faf8ff;
--color-surface-container-lowest: #ffffff;
--color-surface-container-highest: #dae2fd;
--color-on-surface: #1a1b2e;
--color-on-surface-variant: #45464f;
.gradient-editorial { background: linear-gradient(135deg, #3a388b, #5250a4); }
.glass { background: rgba(250,248,255,0.8); backdrop-filter: blur(12px); }
.font-display { font-family: 'Manrope', sans-serif; }
```

### Key Patterns in Use
- **Redirect after login:** Use `useNavigate()` — navigate to `/dashboard` after successful `signInWithPassword`. Do NOT use `window.location.assign`.
- **Auth state redirect guard:** If `session` is already set when LoginPage mounts, redirect to `/dashboard` immediately.
- **No Tailwind** — use inline styles and CSS class names from `styles.css`.

---

## Handoff from Previous Task
**Files changed by previous task:** `AppShell.tsx`, `Sidebar.tsx`, `TopNav.tsx`, `BottomNav.tsx`, `styles.css` (responsive rules)
**Decisions made:** AppShell layout complete. Material Symbols icons available.
**Context for this task:** Layout chrome done. Now build the login page.
**Open questions left:** _(none)_

---

## Implementation Steps

1. Replace `frontend/src/pages/LoginPage.tsx` stub with full implementation:

```typescript
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type AuthMode = 'login' | 'signup';

export function LoginPage(): JSX.Element {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session) { navigate('/dashboard', { replace: true }); }
  }, [session, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setErrorMessage(error.message); }
      setIsSubmitting(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setErrorMessage(error.message); setIsSubmitting(false); return; }
    if (!data.session) {
      setInfoMessage('Check your email to confirm your account before signing in.');
    }
    setIsSubmitting(false);
  };

  return (
    <main style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: 'var(--color-surface)', padding: '1.25rem', position: 'relative', overflow: 'hidden',
    }}>
      {/* Decorative blobs */}
      <div aria-hidden style={{
        position: 'absolute', top: '-6rem', right: '-6rem', width: '20rem', height: '20rem',
        borderRadius: '50%', background: 'rgba(58,56,139,0.08)', filter: 'blur(3rem)', pointerEvents: 'none',
      }} />
      <div aria-hidden style={{
        position: 'absolute', bottom: '-4rem', left: '-4rem', width: '16rem', height: '16rem',
        borderRadius: '50%', background: 'rgba(111,251,190,0.1)', filter: 'blur(2.5rem)', pointerEvents: 'none',
      }} />

      {/* Main card */}
      <div style={{
        width: 'min(440px, 100%)', background: 'var(--color-surface-container-lowest)',
        borderRadius: 'var(--radius-card)', padding: '2.5rem 2rem',
        boxShadow: '0 24px 48px -12px rgba(19,27,46,0.12)',
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '2rem', gap: '0.75rem' }}>
          <div style={{
            width: '4rem', height: '4rem', borderRadius: 'var(--radius-xl)',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))',
            display: 'grid', placeItems: 'center', color: '#fff',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: '2rem' }}>auto_stories</span>
          </div>
          <h1 className="font-display" style={{
            margin: 0, fontSize: '1.5rem', fontWeight: 800,
            color: 'var(--color-on-surface)', letterSpacing: '-0.025rem',
          }}>
            Editorial Intelligence
          </h1>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-on-surface-variant)', textAlign: 'center' }}>
            {mode === 'login' ? 'Sign in to your workspace' : 'Create your workspace'}
          </p>
        </div>

        {/* Google button (placeholder) */}
        <button type="button" style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
          padding: '0.75rem 1rem', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-outline-variant)', background: 'var(--color-surface-container-lowest)',
          cursor: 'pointer', fontSize: '0.9rem', color: 'var(--color-on-surface)', fontWeight: 500,
          marginBottom: '1.25rem',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-outline-variant)' }} />
          <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>or continue with email</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--color-outline-variant)' }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label className="field">
            <span>Email address</span>
            <input
              required type="email" autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.375rem' }}>
              <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-on-surface)' }}>Password</span>
              {mode === 'login' && (
                <button type="button" style={{ background: 'none', border: 'none', fontSize: '0.75rem', color: 'var(--color-primary)', cursor: 'pointer', padding: 0 }}>
                  Forgot?
                </button>
              )}
            </div>
            <input
              required minLength={8} type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'login' ? 'Your password' : 'Min. 8 characters'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%' }}
              className="field-input"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="gradient-editorial"
            style={{
              width: '100%', padding: '0.875rem', border: 'none', borderRadius: 'var(--radius-lg)',
              color: '#fff', fontWeight: 700, fontSize: '0.95rem', cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            }}
          >
            {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Sign In to Workspace' : 'Create Workspace →'}
          </button>
        </form>

        {/* Toggle mode */}
        <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
          {mode === 'login' ? "Don't have an account? " : 'Already have one? '}
          <button
            type="button"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setErrorMessage(null); setInfoMessage(null); }}
            style={{ background: 'none', border: 'none', color: 'var(--color-primary)', fontWeight: 600, cursor: 'pointer', padding: 0, fontSize: '0.85rem' }}
          >
            {mode === 'login' ? 'Create one' : 'Sign in'}
          </button>
        </p>

        {/* Messages */}
        {errorMessage && (
          <p className="feedback error" role="alert" style={{ marginTop: '1rem' }}>{errorMessage}</p>
        )}
        {infoMessage && (
          <p className="feedback info" style={{ marginTop: '1rem' }}>{infoMessage}</p>
        )}
      </div>

      {/* Decorative glassmorphism accent card */}
      <div className="glass" aria-hidden style={{
        position: 'absolute', bottom: '2rem', right: '2rem',
        padding: '0.875rem 1.25rem', borderRadius: 'var(--radius-xl)',
        display: 'flex', alignItems: 'center', gap: '0.625rem',
        boxShadow: '0 8px 24px rgba(19,27,46,0.1)',
        pointerEvents: 'none',
      }}>
        <span className="material-symbols-outlined" style={{ color: 'var(--color-tertiary-fixed-dim)', fontSize: '1.25rem' }}>auto_awesome</span>
        <div>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08rem', color: 'var(--color-on-surface-variant)' }}>AI Insight</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-on-surface)' }}>Ready to improve your writing</div>
        </div>
      </div>
    </main>
  );
}
```

2. Verify the `.field` and `.feedback` CSS classes exist in `styles.css` (they do — from existing upload page styles). If `.field-input` does not exist, add it as `input` selector within `.field` or as a standalone class.
3. Run `npm run typecheck` — must pass.

_Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
_Skills: /build-website-web-app — forms, auth UX_

---

## Acceptance Criteria
- [x] Visiting `/login` while unauthenticated renders the full card (not the stub).
- [x] Sign in with valid credentials → redirected to `/dashboard`.
- [x] Invalid credentials → error message displayed below form.
- [x] Toggle between login/signup mode works.
- [x] Sign-up without email confirmation → info message shown.
- [x] Decorative glassmorphism accent card renders bottom-right.
- [x] Gradient "Sign In to Workspace" button renders correctly.
- [!] `npm run typecheck` exits 0. Frontend typecheck passes; workspace root typecheck fails in backend due missing local dependency binaries in `backend/node_modules` (`typescript`/`tsx`/`eslint`) unrelated to Task 006 changes.

---

## Handoff to Next Task
> Fill via /task-handoff after completing this task.

**Files changed:** `frontend/src/pages/LoginPage.tsx`, `frontend/src/styles.css`
**Decisions made:** Implemented LoginPage as a standalone auth surface using existing `useAuth` session state and direct `supabase.auth` submit handlers; used CSS token-based inline styles to match Syntactic Prism visuals; added `.field-input` class for underline focus animation without modifying existing `.field` behavior for other pages.
**Context for next task:** Login route is now fully functional and redirects authenticated users to `/dashboard`. Task 007 can build dashboard document cards and `/api/sessions` endpoint without login page dependency blockers.
**Open questions:** Full workspace verification remains blocked by missing backend local binaries (`backend/node_modules`); frontend checks for this task pass.
