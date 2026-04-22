import { DOCUMENT_TYPES, apiBaseUrl } from '../lib/constants';
import { useAuth } from '../context/useAuth';

interface SessionListItem {
  id: string;
  filename: string;
  file_type: string;
  document_type: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface DocumentCardProps {
  session: SessionListItem;
  onClick: () => void;
  onDeleted: (id: string) => void;
}

function formatRelativeDate(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

function getStatusStyle(status: string): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'complete':
      return { bg: 'var(--color-badge-accepted-bg)', fg: 'var(--color-badge-accepted-fg)', label: 'Complete' };
    case 'proofreading':
      return { bg: 'var(--color-badge-ready-bg)', fg: 'var(--color-badge-ready-fg)', label: 'Processing' };
    default:
      return { bg: 'var(--color-badge-pending-bg)', fg: 'var(--color-badge-pending-fg)', label: 'Pending' };
  }
}

function getDocumentTypeLabel(value: string): string {
  const match = DOCUMENT_TYPES.find((dt) => dt.value === value);
  return match ? match.label : value.replace(/_/g, ' ');
}

export function DocumentCard({ session, onClick, onDeleted }: DocumentCardProps) {
  const { session: authSession } = useAuth();
  const statusStyle = getStatusStyle(session.status);
  const truncatedName = session.filename.length > 40 ? session.filename.slice(0, 37) + '...' : session.filename;

  const handleDelete = async (e: React.MouseEvent): Promise<void> => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${session.filename}"? This cannot be undone.`)) return;
    if (!authSession) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${session.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authSession.access_token}` },
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (json.success) {
        onDeleted(session.id);
      } else {
        window.alert(json.error ?? 'Failed to delete document.');
      }
    } catch {
      window.alert('Network error. Please try again.');
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--color-surface-container-lowest)',
        borderRadius: 'var(--radius-xl)',
        padding: '1.25rem',
        boxShadow: '0 2px 8px rgba(19,27,46,0.06)',
        transition: 'all var(--duration-base)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.625rem',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-container-highest)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(19,27,46,0.1)';
        const btn = e.currentTarget.querySelector<HTMLButtonElement>('.delete-btn');
        if (btn) btn.style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'var(--color-surface-container-lowest)';
        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(19,27,46,0.06)';
        const btn = e.currentTarget.querySelector<HTMLButtonElement>('.delete-btn');
        if (btn) btn.style.opacity = '0';
      }}
    >
      {/* Delete button */}
      <button
        className="delete-btn"
        onClick={handleDelete}
        title="Delete document"
        style={{
          position: 'absolute',
          top: '0.5rem',
          right: '0.5rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0.25rem',
          borderRadius: 'var(--radius-sm)',
          opacity: 0,
          transition: 'opacity 0.15s, background 0.15s',
          display: 'flex',
          alignItems: 'center',
          color: 'var(--color-error, #d32f2f)',
          zIndex: 1,
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(211,47,47,0.1)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>delete</span>
      </button>

      {/* Clickable area */}
      <button
        onClick={onClick}
        style={{
          all: 'unset',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.625rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)', fontSize: '1.5rem', flexShrink: 0 }}>
            description
          </span>
          <span
            style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              padding: '0.2rem 0.6rem',
              borderRadius: 'var(--radius-full)',
              background: statusStyle.bg,
              color: statusStyle.fg,
              textTransform: 'uppercase',
              letterSpacing: '0.05rem',
            }}
          >
            {statusStyle.label}
          </span>
        </div>

        <div className="font-display" style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)', lineHeight: 1.3 }}>
          {truncatedName}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)', textTransform: 'capitalize' }}>
            {getDocumentTypeLabel(session.document_type)}
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-on-surface-variant)' }}>
            {formatRelativeDate(session.created_at)}
          </span>
        </div>
      </button>
    </div>
  );
}

export type { SessionListItem };
