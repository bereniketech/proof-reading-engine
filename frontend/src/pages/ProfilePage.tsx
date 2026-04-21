import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { CircularProgress } from '../components/CircularProgress';
import { apiBaseUrl } from '../lib/constants';

interface UserProfile {
  email: string; name: string; title: string;
  primary_dialect: string; translation_target: string; auto_localize: boolean;
}

const DIALECTS = ['English (UK)', 'English (US)', 'English (AU)', 'French', 'German', 'Spanish'];
const TRANSLATIONS = ['French (Parisian)', 'Spanish (Castilian)', 'German', 'Italian', 'Portuguese', 'Japanese'];

function getInitials(name: string, email: string): string {
  if (name.trim()) return name.trim().charAt(0).toUpperCase();
  return email.charAt(0).toUpperCase();
}

export function ProfilePage(): JSX.Element {
  const { session } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [draft, setDraft] = useState<Partial<UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchProfile = useCallback(async (): Promise<void> => {
    if (!session) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/users/me`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json() as { success: boolean; data?: UserProfile };
      if (json.success && json.data) { setProfile(json.data); setDraft(json.data); }
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [session]);

  useEffect(() => { void fetchProfile(); }, [fetchProfile]);

  const handleSave = async (): Promise<void> => {
    if (!session || !profile) return;
    setSaving(true); setSaveError(null);

    // Only send changed fields
    const changed: Partial<UserProfile> = {};
    for (const key of Object.keys(draft) as Array<keyof UserProfile>) {
      if (draft[key] !== profile[key]) { (changed as Record<string, unknown>)[key] = draft[key]; }
    }
    if (Object.keys(changed).length === 0) { setSaving(false); setSaveMessage('No changes to save.'); setTimeout(() => setSaveMessage(null), 2000); return; }

    try {
      const res = await fetch(`${apiBaseUrl}/api/users/me`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(changed),
      });
      const json = await res.json() as { success: boolean; data?: UserProfile; error?: string };
      if (json.success && json.data) {
        setProfile(json.data); setDraft(json.data);
        setSaveMessage('Saved!'); setTimeout(() => setSaveMessage(null), 2000);
      } else { setSaveError(json.error ?? 'Failed to save.'); }
    } catch { setSaveError('Failed to save.'); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: '2rem', color: 'var(--color-on-surface-variant)' }}>Loading profile…</div>;
  if (!profile) return <div style={{ padding: '2rem', color: 'var(--color-on-surface-variant)' }}>Could not load profile.</div>;

  const initials = getInitials(profile.name, profile.email);
  const qualityScore = 87; // Placeholder — could fetch from latest session insights

  return (
    <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
      {/* Avatar section */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div style={{
          width: '6rem', height: '6rem', borderRadius: 'var(--radius-xl)',
          background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))',
          display: 'grid', placeItems: 'center', color: '#fff', fontSize: '2rem', fontWeight: 800,
          fontFamily: 'Manrope, sans-serif', flexShrink: 0, position: 'relative',
        }}>
          {initials}
          {/* Verified badge */}
          <div style={{ position: 'absolute', bottom: '-0.375rem', right: '-0.375rem', width: '1.5rem', height: '1.5rem', borderRadius: '50%', background: 'var(--color-tertiary-fixed)', display: 'grid', placeItems: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '0.875rem', color: 'var(--color-on-tertiary-fixed)' }}>verified</span>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <h1 className="font-display" style={{ margin: 0, fontSize: '2rem', fontWeight: 800, color: 'var(--color-on-surface)' }}>
            {profile.name || profile.email}
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: 'var(--color-on-surface-variant)', fontSize: '0.9rem' }}>
            {profile.title || 'Editorial Professional'}
          </p>
        </div>
        <button
          onClick={handleSave} disabled={saving}
          className="gradient-editorial"
          style={{ border: 'none', borderRadius: 'var(--radius-lg)', padding: '0.625rem 1.25rem', color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '1rem' }}>save</span>
          {saving ? 'Saving…' : 'Save Profile'}
        </button>
      </div>

      {/* Save feedback */}
      {saveMessage && <p className="feedback info" style={{ marginBottom: '1rem' }}>{saveMessage}</p>}
      {saveError && <p className="feedback error" style={{ marginBottom: '1rem' }}>{saveError}</p>}

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '1.25rem' }} className="profile-grid">

        {/* Name + Title fields (col-span-6) */}
        <div style={{ gridColumn: 'span 6' }} className="profile-col-6">
          <div style={{ background: 'var(--color-surface-container-lowest)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 className="font-display" style={{ margin: 0, fontWeight: 700 }}>Personal Details</h3>
            <label className="field">
              <span>Full Name</span>
              <input type="text" value={draft.name ?? ''} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Your name" />
            </label>
            <label className="field">
              <span>Professional Title</span>
              <input type="text" value={draft.title ?? ''} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="e.g. Senior Manuscript Architect" />
            </label>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-on-surface-variant)' }}>Account: {profile.email}</p>
          </div>
        </div>

        {/* Subscription card (col-span-6) */}
        <div style={{ gridColumn: 'span 6' }} className="profile-col-6">
          <div style={{ background: 'var(--color-surface-container-low)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', height: '100%' }}>
            <h2 className="font-display" style={{ margin: '0 0 0.5rem', fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-primary)' }}>Editorial Pro+</h2>
            <ul style={{ margin: '0 0 1.25rem', paddingLeft: '0', listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {['Unlimited document uploads', 'Advanced AI proofreading', 'PDF export with citation styles', 'Linguistic insights dashboard', 'Priority support'].map((feature) => (
                <li key={feature} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: '1rem', color: 'var(--color-tertiary)' }}>check_circle</span>
                  {feature}
                </li>
              ))}
            </ul>
            <button style={{ border: '1px solid var(--color-outline-variant)', background: 'transparent', borderRadius: 'var(--radius-lg)', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.82rem', marginRight: '0.5rem' }}>Manage Billing</button>
            <button style={{ border: '1px solid var(--color-outline-variant)', background: 'transparent', borderRadius: 'var(--radius-lg)', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.82rem' }}>Change Plan</button>
          </div>
        </div>

        {/* Precision Score (col-span-4) */}
        <div style={{ gridColumn: 'span 4' }} className="profile-col-4">
          <div style={{ background: 'var(--color-surface-container-highest)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', borderBottom: '4px solid var(--color-tertiary-fixed)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <h3 className="font-display" style={{ margin: 0, fontWeight: 700, fontSize: '0.9rem' }}>Precision Score</h3>
            <CircularProgress value={qualityScore} size={96} />
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>Based on last analysis</p>
          </div>
        </div>

        {/* Language settings (col-span-8) */}
        <div style={{ gridColumn: 'span 8' }} className="profile-col-8">
          <div style={{ background: 'var(--color-surface-container-low)', borderRadius: 'var(--radius-xl)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 className="font-display" style={{ margin: 0, fontWeight: 700 }}>Language Settings</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <label className="field">
                <span>Primary Dialect</span>
                <select className="field-select" value={draft.primary_dialect ?? profile.primary_dialect} onChange={(e) => setDraft((d) => ({ ...d, primary_dialect: e.target.value }))}>
                  {DIALECTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Translation Target</span>
                <select className="field-select" value={draft.translation_target ?? profile.translation_target} onChange={(e) => setDraft((d) => ({ ...d, translation_target: e.target.value }))}>
                  {TRANSLATIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            {/* AI Auto-localize toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', cursor: 'pointer' }}>
              <div
                onClick={() => setDraft((d) => ({ ...d, auto_localize: !d.auto_localize }))}
                style={{
                  width: '2.75rem', height: '1.5rem', borderRadius: 'var(--radius-full)',
                  background: draft.auto_localize ? 'var(--color-tertiary)' : 'var(--color-surface-container-highest)',
                  position: 'relative', cursor: 'pointer', transition: 'background var(--duration-base)',
                }}
              >
                <div style={{
                  position: 'absolute', top: '0.2rem',
                  left: draft.auto_localize ? 'calc(100% - 1.1rem)' : '0.2rem',
                  width: '1.1rem', height: '1.1rem', borderRadius: '50%', background: '#fff',
                  transition: 'left var(--duration-base)',
                }} />
              </div>
              <span style={{ fontSize: '0.85rem', color: 'var(--color-on-surface)' }}>AI Auto-localize</span>
            </label>
          </div>
        </div>

        {/* Help & Support (col-span-12) */}
        <div style={{ gridColumn: 'span 12' }} className="profile-col-12">
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', background: 'var(--color-surface-container-highest)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>support_agent</span>
            </div>
            <div style={{ flex: 1 }}>
              <h3 className="font-display" style={{ margin: 0, fontWeight: 700 }}>Help & Support</h3>
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--color-on-surface-variant)' }}>24/7 editorial concierge — we're here to help.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button style={{ border: '1px solid var(--color-outline-variant)', background: 'transparent', borderRadius: 'var(--radius-lg)', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }}>Open Ticket</button>
              <button style={{ border: '1px solid var(--color-outline-variant)', background: 'transparent', borderRadius: 'var(--radius-lg)', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }}>Documentation</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
