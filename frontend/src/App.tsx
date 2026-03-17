import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';

type AuthMode = 'login' | 'signup';
type UploadField = 'file' | 'reference';

interface UploadSuccessResponse {
  sessionId: string;
  status: string;
}

interface UploadErrorResponse {
  error?: string;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['docx', 'pdf', 'txt'] as const;
const apiBaseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001';

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
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [draggingField, setDraggingField] = useState<UploadField | null>(null);
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

  const assignFileToField = (field: UploadField, file: File | null): void => {
    if (!file) {
      return;
    }

    const validationError = validateUploadFile(file);
    if (validationError) {
      if (field === 'file') {
        setMainFile(null);
      } else {
        setReferenceFile(null);
      }
      setUploadError(validationError);
      return;
    }

    setUploadError(null);
    if (field === 'file') {
      setMainFile(file);
      return;
    }

    setReferenceFile(file);
  };

  const handleFileInputChange = (field: UploadField, event: React.ChangeEvent<HTMLInputElement>): void => {
    const selectedFile = event.target.files?.[0] ?? null;
    assignFileToField(field, selectedFile);
    event.target.value = '';
  };

  const handleDragOver = (field: UploadField, event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setDraggingField(field);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setDraggingField((current) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        return null;
      }

      return current;
    });
  };

  const handleDrop = (field: UploadField, event: React.DragEvent<HTMLLabelElement>): void => {
    event.preventDefault();
    setDraggingField(null);
    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    assignFileToField(field, droppedFile);
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

      if (referenceFile) {
        formData.append('reference', referenceFile);
      }

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
                className={draggingField === 'file' ? 'dropzone active' : 'dropzone'}
                onDragOver={(event) => handleDragOver('file', event)}
                onDragLeave={handleDragLeave}
                onDrop={(event) => handleDrop('file', event)}
              >
                <input
                  type="file"
                  accept=".docx,.pdf,.txt"
                  onChange={(event) => handleFileInputChange('file', event)}
                />
                <span className="dropzone-title">Main document</span>
                <span className="dropzone-copy">Drag and drop or click to browse (.docx, .pdf, .txt)</span>
                {mainFile ? (
                  <span className="file-meta">
                    {mainFile.name} ({formatBytes(mainFile.size)})
                  </span>
                ) : null}
              </label>

              <label
                className={draggingField === 'reference' ? 'dropzone active' : 'dropzone'}
                onDragOver={(event) => handleDragOver('reference', event)}
                onDragLeave={handleDragLeave}
                onDrop={(event) => handleDrop('reference', event)}
              >
                <input
                  type="file"
                  accept=".docx,.pdf,.txt"
                  onChange={(event) => handleFileInputChange('reference', event)}
                />
                <span className="dropzone-title">Reference document (optional)</span>
                <span className="dropzone-copy">Add a style/content reference document</span>
                {referenceFile ? (
                  <span className="file-meta">
                    {referenceFile.name} ({formatBytes(referenceFile.size)})
                  </span>
                ) : null}
              </label>
            </div>

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
