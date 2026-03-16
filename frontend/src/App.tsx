import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

type AuthMode = 'login' | 'signup';

function App() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

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

  const formTitle = useMemo(() => (mode === 'login' ? 'Login' : 'Create account'), [mode]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    setInfoMessage(null);

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage(error.message);
      }

      setIsSubmitting(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    if (!data.session) {
      setInfoMessage('Sign-up succeeded. Please check your email for confirmation before logging in.');
    } else {
      setInfoMessage('Account created and logged in successfully.');
    }

    setIsSubmitting(false);
  };

  const handleSignOut = async (): Promise<void> => {
    setErrorMessage(null);
    setInfoMessage(null);

    const { error } = await supabase.auth.signOut();
    if (error) {
      setErrorMessage(error.message);
    }
  };

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Proof-Reading Engine</p>
        <h1>Supabase Authentication</h1>

        {session ? (
          <div className="auth-state">
            <p className="state-label">Authenticated</p>
            <p className="state-value">{session.user.email ?? session.user.id}</p>
            <button className="primary-button" type="button" onClick={handleSignOut}>
              Logout
            </button>
          </div>
        ) : (
          <>
            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                className={mode === 'login' ? 'tab-button active' : 'tab-button'}
                onClick={() => setMode('login')}
              >
                Login
              </button>
              <button
                type="button"
                className={mode === 'signup' ? 'tab-button active' : 'tab-button'}
                onClick={() => setMode('signup')}
              >
                Sign Up
              </button>
            </div>

            <form className="auth-form" onSubmit={handleSubmit}>
              <h2>{formTitle}</h2>

              <label className="field">
                <span>Email</span>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>

              <label className="field">
                <span>Password</span>
                <input
                  required
                  minLength={8}
                  type="password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>

              <button className="primary-button" type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Please wait...' : formTitle}
              </button>
            </form>
          </>
        )}

        {errorMessage ? <p className="feedback error">{errorMessage}</p> : null}
        {infoMessage ? <p className="feedback info">{infoMessage}</p> : null}
      </section>
    </main>
  );
}

export default App;
