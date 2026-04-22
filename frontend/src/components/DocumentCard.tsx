import { useState } from 'react';
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

interface DeleteModalProps {
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
  errorMessage: string | null;
}

function DeleteModal({ filename, onConfirm, onCancel, isDeleting, errorMessage }: DeleteModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        background: 'rgba(26,27,46,0.36)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--color-surface-container-lowest)',
          borderRadius: 'var(--radius-card)',
          padding: '1.75rem',
          width: 'min(420px, 100%)',
          boxShadow: '0 24px 48px -12px rgba(19,27,46,0.22)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <span className="material-symbols-outlined" style={{ color: 'var(--color-error)', fontSize: '1.5rem' }}>delete_forever</span>
          <h2 id="delete-dialog-title" className="font-display" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-on-surface)' }}>
            Delete document?
          </h2>
        </div>
        <p style={{ margin: '0 0 1.25rem', fontSize: '0.875rem', color: 'var(--color-on-surface-variant)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--color-on-surface)' }}>"{filename}"</strong> will be permanently deleted. This cannot be undone.
        </p>
        {errorMessage && (
          <p className="feedback error" style={{ marginBottom: '1rem' }}>{errorMessage}</p>
        )}
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isDeleting}
            style={{
              border: '1px solid var(--color-outline-variant)',
              background: 'transparent',
              borderRadius: 'var(--radius-lg)',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              fontSize: '0.875rem',
              color: 'var(--color-on-surface)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            style={{
              border: 'none',
              background: 'var(--color-error)',
              borderRadius: 'var(--radius-lg)',
              padding: '0.5rem 1rem',
              cursor: isDeleting ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              fontWeight: 700,
              color: '#fff',
              opacity: isDeleting ? 0.7 : 1,
            }}
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function DocumentCard({ session, onClick, onDeleted }: DocumentCardProps) {
  const { session: authSession } = useAuth();
  const statusStyle = getStatusStyle(session.status);
  const truncatedName = session.filename.length > 40 ? session.filename.slice(0, 37) + '...' : session.filename;

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async (): Promise<void> => {
    if (!authSession) return;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions/${session.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authSession.access_token}` },
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (json.success) {
        setShowDeleteModal(false);
        onDeleted(session.id);
      } else {
        setDeleteError(json.error ?? 'Failed to delete document.');
      }
    } catch {
      setDeleteError('Network error. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {showDeleteModal && (
        <DeleteModal
          filename={session.filename}
          onConfirm={() => void handleDeleteConfirm()}
          onCancel={() => setShowDeleteModal(false)}
          isDeleting={isDeleting}
          errorMessage={deleteError}
        />
      )}

      <div
        className="document-card"
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
        {/* Delete button — always visible on touch devices, hover-reveal on pointer */}
        <button
          className="delete-btn"
          onClick={handleDeleteClick}
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
    </>
  );
}

export type { SessionListItem };
