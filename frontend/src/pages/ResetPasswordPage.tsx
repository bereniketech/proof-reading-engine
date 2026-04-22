import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    // Supabase appends #access_token=...&type=recovery to the URL
    const hash = window.location.hash;
    if (hash.includes('type=recovery') && hash.includes('access_token')) {
      setHasToken(true);
      // Let the Supabase client pick up the session from the hash fragment
      void supabase.auth.getSession();
    } else {
      // No recovery token — redirect to login
      navigate('/login', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMessage(error.message);
    } else {
      setInfoMessage('Password updated. Redirecting…');
      setTimeout(() => navigate('/dashboard', { replace: true }), 1500);
    }
    setIsSubmitting(false);
  };

  if (!hasToken) return null;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--color-surface)',
        padding: '1.25rem',
      }}
    >
      <div
        style={{
          width: 'min(440px, 100%)',
          background: 'var(--color-surface-container-lowest)',
          borderRadius: 'var(--radius-card)',
          padding: '2.5rem 2rem',
          boxShadow: '0 24px 48px -12px rgba(19,27,46,0.12)',
        }}
      >
        <h1 className="font-display" style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-on-surface)' }}>
          Set new password
        </h1>
        <p style={{ margin: '0 0 1.5rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
          Choose a password with at least 8 characters.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <label className="field" style={{ gap: '0.25rem' }}>
            <span>New password</span>
            <input
              className="field-input"
              required
              minLength={8}
              type="password"
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="gradient-editorial"
            style={{
              width: '100%',
              padding: '0.875rem',
              border: 'none',
              borderRadius: 'var(--radius-lg)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.95rem',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              opacity: isSubmitting ? 0.7 : 1,
            }}
          >
            {isSubmitting ? 'Updating…' : 'Update Password'}
          </button>
        </form>

        {errorMessage && (
          <p className="feedback error" role="alert" style={{ marginTop: '1rem' }}>{errorMessage}</p>
        )}
        {infoMessage && (
          <p className="feedback info" role="status" style={{ marginTop: '1rem' }}>{infoMessage}</p>
        )}
      </div>
    </main>
  );
}
