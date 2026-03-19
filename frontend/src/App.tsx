import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

type AuthMode = 'login' | 'signup';

interface UploadSuccessResponse {
  sessionId: string;
  status: string;
}

interface UploadErrorResponse {
  error?: string;
}

const DOCUMENT_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'medical_journal', label: 'Medical Journal' },
  { value: 'legal_document', label: 'Legal Document' },
  { value: 'academic_paper', label: 'Academic Paper' },
  { value: 'business_report', label: 'Business Report' },
  { value: 'creative_writing', label: 'Creative Writing' },
] as const;

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['docx', 'pdf', 'txt'] as const;
const apiBaseUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(fileName: string): string {
  const segments = fileName.split('.');
  return segments.length > 1 ? segments.at(-1)?.toLowerCase() ?? '' : '';
}

function validateUploadFile(file: File): string | null {
  const extension = getFileExtension(file.name);

  if (!ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
    return 'Unsupported file type. Please select a DOCX, PDF, or TXT file.';
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'File exceeds the 20 MB limit.';
  }

  return null;
}

function isUploadSuccessResponse(payload: unknown): payload is UploadSuccessResponse {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return typeof record.sessionId === 'string' && typeof record.status === 'string';
}

function App() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [documentType, setDocumentType] = useState('general');
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);

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

  const canUpload = !!mainFile && !isUploading;

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

  const assignFile = (file: File | null): void => {
    if (!file) {
      return;
    }

    const validationError = validateUploadFile(file);
    if (validationError) {
      setMainFile(null);
      setUploadError(validationError);
      return;
    }

    setUploadError(null);
    setMainFile(file);
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const selectedFile = event.target.files?.[0] ?? null;
    assignFile(selectedFile);
    event.target.value = '';
  };

  const handleDragOver = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    assignFile(droppedFile);
  };

  const handleUpload = async (): Promise<void> => {
    if (!session) {
      setUploadError('Please login before uploading files.');
      return;
    }

    if (!mainFile) {
      setUploadError('Please select a file to upload.');
      return;
    }

    const accessToken = session.access_token;
    if (!accessToken) {
      setUploadError('Missing access token. Please sign in again.');
      return;
    }

    setUploadError(null);
    setUploadProgress(0);
    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', mainFile);
      formData.append('document_type', documentType);

      const responsePayload = await new Promise<UploadSuccessResponse>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${apiBaseUrl}/api/upload`);
        xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

        xhr.upload.addEventListener('progress', (event: ProgressEvent<EventTarget>) => {
          if (event.lengthComputable) {
            const percentage = Math.round((event.loaded / event.total) * 100);
            setUploadProgress(percentage);
          }
        });

        xhr.onerror = () => {
          reject(new Error('Network error while uploading file.'));
        };

        xhr.onload = () => {
          let parsedPayload: unknown = null;
          try {
            parsedPayload = xhr.responseText ? (JSON.parse(xhr.responseText) as unknown) : null;
          } catch {
            parsedPayload = null;
          }

          if (xhr.status >= 200 && xhr.status < 300) {
            if (isUploadSuccessResponse(parsedPayload)) {
              resolve(parsedPayload);
              return;
            }

            reject(new Error('Unexpected upload response from server.'));
            return;
          }

          const responseError =
            parsedPayload && typeof parsedPayload === 'object'
              ? ((parsedPayload as UploadErrorResponse).error ?? 'Upload failed.')
              : 'Upload failed.';
          reject(new Error(responseError));
        };

        xhr.send(formData);
      });

      window.location.assign(`/review?sessionId=${encodeURIComponent(responsePayload.sessionId)}`);
    } catch (error: unknown) {
      if (error instanceof Error) {
        setUploadError(error.message);
      } else {
        setUploadError('Upload failed. Please try again.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Proof-Reading Engine</p>
        <h1>Upload Document</h1>

        {session ? (
          <div className="upload-state">
            <div className="auth-state compact">
              <p className="state-label">Authenticated</p>
              <p className="state-value">{session.user.email ?? session.user.id}</p>
              <button className="secondary-button" type="button" onClick={handleSignOut}>
                Logout
              </button>
            </div>

            <div className="upload-grid">
              <label
                className={isDragging ? 'dropzone active' : 'dropzone'}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".docx,.pdf,.txt"
                  onChange={handleFileInputChange}
                />
                <span className="dropzone-title">Upload document</span>
                <span className="dropzone-copy">Drag and drop or click to browse (.docx, .pdf, .txt)</span>
                {mainFile ? (
                  <span className="file-meta">
                    {mainFile.name} ({formatBytes(mainFile.size)})
                  </span>
                ) : null}
              </label>
            </div>

            <label className="field">
              <span>Document Type</span>
              <select
                className="field-select"
                value={documentType}
                onChange={(event) => setDocumentType(event.target.value)}
                disabled={isUploading}
              >
                {DOCUMENT_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>
                    {dt.label}
                  </option>
                ))}
              </select>
            </label>

            <button className="primary-button" type="button" disabled={!canUpload} onClick={handleUpload}>
              {isUploading ? 'Uploading...' : 'Start Proofreading'}
            </button>

            {isUploading ? (
              <div className="progress-block" aria-live="polite">
                <div className="progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress}>
                  <div className="progress-fill" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="progress-label">{uploadProgress}% uploaded</p>
              </div>
            ) : null}

            {uploadError ? (
              <p className="feedback error" role="alert" aria-live="assertive">
                {uploadError}
              </p>
            ) : null}
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

        {errorMessage ? (
          <p className="feedback error" role="alert" aria-live="assertive">
            {errorMessage}
          </p>
        ) : null}
        {infoMessage ? <p className="feedback info">{infoMessage}</p> : null}
      </section>
    </main>
  );
}

export default App;
