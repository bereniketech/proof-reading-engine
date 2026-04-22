import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/useAuth';
import { DocumentCard, type SessionListItem } from '../components/DocumentCard';
import { DiffPanel } from '../components/DiffPanel';
import { DOCUMENT_TYPE_CATEGORIES, apiBaseUrl, validateUploadFile, formatBytes, isUploadSuccessResponse } from '../lib/constants';

export function DashboardPage(){
  const { session } = useAuth();
  const navigate = useNavigate();

  // Upload state
  const [docCategory, setDocCategory] = useState('general');
  const [documentType, setDocumentType] = useState('general');
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

  // Sessions list state
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Diff state
  const [diffBaseId, setDiffBaseId] = useState<string | null>(null);
  const [compareTarget, setCompareTarget] = useState<string | null>(null);

  // Fetch sessions on mount
  const fetchSessions = useCallback(async (): Promise<void> => {
    if (!session) return;
    setSessionsLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/sessions`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json() as { success: boolean; data?: { sessions: SessionListItem[] }; error?: string };
      if (json.success && json.data) {
        setSessions(json.data.sessions);
      } else {
        setSessionsError(json.error ?? 'Failed to load documents.');
      }
    } catch {
      setSessionsError('Failed to load documents.');
    } finally {
      setSessionsLoading(false);
    }
  }, [session]);

  useEffect(() => { void fetchSessions(); }, [fetchSessions]);

  const assignFile = (file: File | null): void => {
    if (file) {
      const error = validateUploadFile(file);
      if (error) {
        setUploadError(error);
        setMainFile(null);
      } else {
        setMainFile(file);
        setUploadError(null);
      }
    } else {
      setMainFile(null);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    assignFile(file ?? null);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>): void => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>): void => {
    e.preventDefault();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>): void => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    assignFile(file ?? null);
  };

  const handleUpload = async (): Promise<void> => {
    if (!mainFile || !session) return;
    setIsUploading(true);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', mainFile);
    formData.append('document_type', documentType);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percentComplete);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const responsePayload = JSON.parse(xhr.responseText) as unknown;
          if (isUploadSuccessResponse(responsePayload)) {
            navigate(`/editor/${encodeURIComponent(responsePayload.data.sessionId)}`);
          } else {
            setUploadError('Invalid response from server.');
            setIsUploading(false);
          }
        } catch {
          setUploadError('Failed to parse server response.');
          setIsUploading(false);
        }
      } else {
        try {
          const errorResponse = JSON.parse(xhr.responseText) as { error?: string };
          setUploadError(errorResponse.error ?? 'Upload failed.');
        } catch {
          setUploadError('Upload failed.');
        }
        setIsUploading(false);
      }
    });

    xhr.addEventListener('error', () => {
      setUploadError('Network error during upload.');
      setIsUploading(false);
    });

    xhr.addEventListener('abort', () => {
      setUploadError('Upload cancelled.');
      setIsUploading(false);
    });

    const url = `${apiBaseUrl}/api/upload`;
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);
    xhr.send(formData);
  };

  return (
    <div style={{ maxWidth: '72rem', margin: '0 auto' }}>
      {/* Page heading */}
      <div style={{ marginBottom: '2rem' }}>
        <h1 className="font-display" style={{ fontSize: '2.5rem', fontWeight: 800, margin: 0, color: 'var(--color-on-surface)' }}>
          Documents
        </h1>
        <p style={{ color: 'var(--color-on-surface-variant)', marginTop: '0.5rem' }}>
          Upload a document to begin AI-powered proofreading.
        </p>
      </div>

      {/* Bento grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '7fr 5fr', gap: '1.5rem', marginBottom: '2.5rem' }} className="dashboard-bento">

        {/* Upload panel (7/12) */}
        <div style={{ background: 'var(--color-surface-container-lowest)', borderRadius: 'var(--radius-card)', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <h2 className="font-display" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Upload Document</h2>

          {/* Document type — category then specific type */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <label className="field" style={{ flex: 1 }}>
              <span>Category</span>
              <select
                className="field-select"
                value={docCategory}
                disabled={isUploading}
                onChange={(e) => {
                  const cat = DOCUMENT_TYPE_CATEGORIES.find((c) => c.value === e.target.value);
                  setDocCategory(e.target.value);
                  setDocumentType(cat?.types[0].value ?? 'general');
                }}
              >
                {DOCUMENT_TYPE_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            {docCategory !== 'general' && (
              <label className="field" style={{ flex: 1 }}>
                <span>Document type</span>
                <select
                  className="field-select"
                  value={documentType}
                  disabled={isUploading}
                  onChange={(e) => setDocumentType(e.target.value)}
                >
                  {(DOCUMENT_TYPE_CATEGORIES.find((c) => c.value === docCategory)?.types ?? []).map((dt) => (
                    <option key={dt.value} value={dt.value}>{dt.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {/* Drag-drop zone */}
          <label
            className={isDragging ? 'dropzone active' : 'dropzone'}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{ cursor: 'pointer' }}
          >
            <input type="file" accept=".docx,.pdf,.txt" onChange={handleFileInputChange} />
            <span className="dropzone-icon" aria-hidden>
              <span className="material-symbols-outlined" style={{ fontSize: '2.5rem', color: 'var(--color-primary)' }}>cloud_upload</span>
            </span>
            <span className="dropzone-title">{mainFile ? mainFile.name : 'Tap to browse or drag & drop'}</span>
            <span className="dropzone-copy">{mainFile ? `${formatBytes(mainFile.size)} · tap to change` : 'DOCX, PDF, or TXT — up to 20 MB'}</span>
          </label>

          {/* Upload button */}
          <button
            className="gradient-editorial"
            disabled={!mainFile || isUploading}
            onClick={handleUpload}
            style={{
              border: 'none', borderRadius: 'var(--radius-lg)', padding: '0.875rem',
              color: '#fff', fontWeight: 700, cursor: (!mainFile || isUploading) ? 'not-allowed' : 'pointer',
              opacity: (!mainFile || isUploading) ? 0.6 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            }}
          >
            {isUploading ? 'Uploading...' : <><span>Analyze Document</span><span className="material-symbols-outlined" style={{ fontSize: '1.1rem' }}>arrow_forward</span></>}
          </button>

          {/* Progress bar */}
          {isUploading && (
            <div className="progress-block" aria-live="polite">
              <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}>
                <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
              </div>
              <p className="progress-label">{uploadProgress}% uploaded</p>
            </div>
          )}
          {uploadError && <p className="feedback error" role="alert">{uploadError}</p>}
        </div>

        {/* Guidance panel (5/12) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Smart Tips card */}
          <div style={{ background: 'var(--color-surface-container-highest)', borderRadius: 'var(--radius-xl)', padding: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <span style={{ background: 'var(--color-tertiary-fixed)', color: 'var(--color-on-tertiary-fixed)', fontSize: '0.65rem', fontWeight: 800, padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-full)', letterSpacing: '0.08rem', textTransform: 'uppercase' }}>SMART TIPS</span>
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--color-on-surface-variant)', fontSize: '0.85rem' }}>
              <li>Use "Academic Paper" type for research documents to improve citation formatting.</li>
              <li>Documents under 5MB process fastest — split large files if needed.</li>
              <li>Accept suggestions section-by-section for granular control.</li>
            </ul>
          </div>

          {/* Secure architecture card */}
          <div className="glass" style={{ borderRadius: 'var(--radius-xl)', padding: '1.5rem', borderLeft: '4px solid var(--color-primary)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
              <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)', fontSize: '1.25rem' }}>lock</span>
              <span className="font-display" style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--color-on-surface)' }}>Secure Architecture</span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--color-on-surface-variant)' }}>
              Your documents are processed with end-to-end encryption and never stored beyond your session.
            </p>
          </div>
        </div>
      </div>

      {/* Recent documents */}
      <div>
        <h2 className="font-display" style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem', color: 'var(--color-on-surface)' }}>Recent Documents</h2>
        {sessionsLoading ? (
          /* Skeleton placeholders */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ height: '8rem', background: 'var(--color-surface-container-highest)', borderRadius: 'var(--radius-xl)', animation: 'pulse 1.5s ease-in-out infinite' }} />
            ))}
          </div>
        ) : sessionsError ? (
          <p className="feedback error">{sessionsError}</p>
        ) : sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>upload_file</span>
            <p style={{ margin: 0 }}>Upload your first document to get started.</p>
          </div>
        ) : (
          <>
            {diffBaseId && compareTarget && session && (
              <DiffPanel
                baseSessionId={diffBaseId}
                compareSessionId={compareTarget}
                authToken={session.access_token}
                onClose={() => { setDiffBaseId(null); setCompareTarget(null); }}
              />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem' }}>
              {sessions.map((s, index) => (
                <div key={s.id}>
                  <DocumentCard
                    session={s}
                    onClick={() => navigate(`/editor/${s.id}`)}
                    onDeleted={(id) => setSessions((prev) => prev.filter((x) => x.id !== id))}
                  />
                  {index < sessions.length - 1 && (
                    <button
                      className="compare-btn"
                      onClick={() => {
                        setDiffBaseId(s.id);
                        const next = sessions[index + 1];
                        if (next) setCompareTarget(next.id);
                      }}
                    >
                      Compare with previous
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
