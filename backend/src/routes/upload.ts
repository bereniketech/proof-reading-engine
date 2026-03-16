import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { fileTypeFromBuffer } from 'file-type';
import multer, { MulterError } from 'multer';
import { createUserScopedSupabaseClient } from '../lib/supabase.js';
import { parseDocumentByType, type Section } from '../parsers/index.js';
import { runProofreadingOrchestrator } from '../services/proofreader.js';

interface AuthenticatedUser {
  id: string;
}

interface StoredUpload {
  path: string;
  originalName: string;
  mimeType: string;
}

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_CONCURRENT_PARSE_JOBS = 4;
const PROOFREAD_MAX_ATTEMPTS = 2;
const PROOFREAD_RETRY_DELAY_MS = 1_000;
const uploadDirectory = path.resolve('uploads');
const allowedMimeTypes = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/plain',
]);
const mimeToFileType: Record<string, 'docx' | 'pdf' | 'txt'> = {
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/pdf': 'pdf',
  'text/plain': 'txt',
};

const router = Router();
let activeParseJobs = 0;

function tryAcquireParseSlot(): boolean {
  if (activeParseJobs >= MAX_CONCURRENT_PARSE_JOBS) {
    return false;
  }

  activeParseJobs += 1;
  return true;
}

function releaseParseSlot(): void {
  activeParseJobs = Math.max(activeParseJobs - 1, 0);
}

class UploadValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadValidationError';
  }
}

function getBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }

  return token;
}

function getAuthenticatedUser(response: Response): AuthenticatedUser | null {
  const user = response.locals.user;

  if (!user || typeof user.id !== 'string') {
    return null;
  }

  return {
    id: user.id,
  };
}

async function ensureUploadDirectory(): Promise<void> {
  await mkdir(uploadDirectory, { recursive: true });
}

function getFileExtensionFromMimeType(mimeType: string): 'docx' | 'pdf' | 'txt' | null {
  return mimeToFileType[mimeType] ?? null;
}

function getOriginalFileExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}

async function cleanupUploadedFiles(files: Array<StoredUpload | null>): Promise<void> {
  await Promise.all(
    files
      .filter((file): file is StoredUpload => file !== null)
      .map(async (file) => {
        try {
          await rm(file.path, { force: true });
        } catch (error) {
          console.error('Failed to cleanup uploaded file', {
            filePath: file.path,
            error,
          });
        }
      }),
  );
}

async function validateUploadedContent(file: StoredUpload, fileType: 'docx' | 'pdf' | 'txt'): Promise<string | null> {
  if (fileType === 'txt') {
    const content = await readFile(file.path);
    if (content.includes(0x00)) {
      return 'Invalid TXT file content.';
    }

    return null;
  }

  const bytes = await readFile(file.path);
  const detected = await fileTypeFromBuffer(bytes);

  if (fileType === 'pdf') {
    if (!detected || detected.mime !== 'application/pdf') {
      return 'Uploaded PDF content does not match its declared type.';
    }

    return null;
  }

  if (!detected) {
    return 'Unable to verify DOCX file signature.';
  }

  if (detected.mime !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    if (detected.mime !== 'application/zip') {
      return 'Uploaded DOCX content does not match its declared type.';
    }

    try {
      await parseDocumentByType(file.path, 'docx');
    } catch {
      return 'Uploaded DOCX content does not match its declared type.';
    }
  }

  return null;
}

function createParseBusyErrorResponse(res: Response): void {
  res.status(503).json({
    success: false,
    error: 'Upload queue is busy. Please retry in a moment.',
  });
}

function createParseFailureResponse(res: Response): void {
  res.status(400).json({
    success: false,
    error: 'Unable to parse uploaded document content.',
  });
}

function createSectionPersistenceFailureResponse(res: Response): void {
  res.status(500).json({
    success: false,
    error: 'Failed to persist parsed sections and update session status.',
  });
}

function createUnexpectedUploadFailureResponse(res: Response): void {
  res.status(500).json({
    success: false,
    error: 'Unexpected upload failure.',
  });
}

const storage = multer.diskStorage({
  destination: async (_req, _file, callback) => {
    try {
      await ensureUploadDirectory();
      callback(null, uploadDirectory);
    } catch (error) {
      callback(error as Error, uploadDirectory);
    }
  },
  filename: (_req, file, callback) => {
    const fileType = getFileExtensionFromMimeType(file.mimetype);

    if (!fileType) {
      callback(new Error(`Unsupported MIME type: ${file.mimetype}`), file.originalname);
      return;
    }

    callback(null, `${randomUUID()}.${fileType}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 2,
  },
  fileFilter: (_req, file, callback) => {
    const expectedFileExtension = getFileExtensionFromMimeType(file.mimetype);
    const originalFileExtension = getOriginalFileExtension(file.originalname);

    if (!allowedMimeTypes.has(file.mimetype) || !expectedFileExtension) {
      callback(
        new UploadValidationError(`Unsupported file type for "${file.fieldname}". Allowed types: DOCX, PDF, TXT.`),
      );
      return;
    }

    if (originalFileExtension !== `.${expectedFileExtension}`) {
      callback(
        new UploadValidationError(
          `File extension does not match MIME type for "${file.fieldname}". Expected .${expectedFileExtension}.`,
        ),
      );
      return;
    }

    callback(null, true);
  },
});

const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'reference', maxCount: 1 },
]);

function asStoredUpload(file: Express.Multer.File | undefined): StoredUpload | null {
  if (!file) {
    return null;
  }

  return {
    path: file.path,
    originalName: file.originalname,
    mimeType: file.mimetype,
  };
}

function createReferenceTextByPosition(referenceSections: Section[]): Map<number, string> {
  return new Map(referenceSections.map((section) => [section.position, section.original_text]));
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function triggerProofreadingWithRetry(input: { sessionId: string; accessToken: string }): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= PROOFREAD_MAX_ATTEMPTS; attempt += 1) {
    try {
      await runProofreadingOrchestrator({
        sessionId: input.sessionId,
        accessToken: input.accessToken,
      });
      return;
    } catch (error: unknown) {
      lastError = error;

      if (attempt < PROOFREAD_MAX_ATTEMPTS) {
        console.warn('Retrying proofreading orchestrator after failure', {
          sessionId: input.sessionId,
          attempt,
        });
        await delay(PROOFREAD_RETRY_DELAY_MS);
      }
    }
  }

  try {
    const supabase = createUserScopedSupabaseClient(input.accessToken);
    const { error } = await supabase
      .from('sessions')
      .update({ status: 'review' })
      .eq('id', input.sessionId);

    if (error) {
      console.error('Failed to set terminal session status after proofreading retries exhausted', {
        sessionId: input.sessionId,
        error,
      });
    }
  } catch (statusUpdateError: unknown) {
    console.error('Unexpected error while setting terminal session status after proofreading retries exhausted', {
      sessionId: input.sessionId,
      error: statusUpdateError,
    });
  }

  console.error('Proofreading orchestrator failed after retries', {
    sessionId: input.sessionId,
    error: lastError,
  });
}

router.post('/upload', uploadFields, async (req: Request, res: Response) => {
  const authToken = getBearerToken(req.header('authorization'));
  const authenticatedUser = getAuthenticatedUser(res);

  if (!authToken || !authenticatedUser) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
    return;
  }

  const uploadedFiles = req.files as Record<string, Express.Multer.File[]> | undefined;
  const mainFile = asStoredUpload(uploadedFiles?.file?.[0]);
  const referenceFile = asStoredUpload(uploadedFiles?.reference?.[0]);

  if (!mainFile) {
    await cleanupUploadedFiles([referenceFile]);
    res.status(400).json({
      success: false,
      error: 'The "file" field is required.',
    });
    return;
  }

  const fileType = getFileExtensionFromMimeType(mainFile.mimeType);
  if (!fileType) {
    await cleanupUploadedFiles([mainFile, referenceFile]);
    res.status(400).json({
      success: false,
      error: 'Unsupported uploaded file type. Allowed types: DOCX, PDF, TXT.',
    });
    return;
  }

  let mainFileValidationError: string | null;
  try {
    mainFileValidationError = await validateUploadedContent(mainFile, fileType);
  } catch (error) {
    await cleanupUploadedFiles([mainFile, referenceFile]);
    console.error('Failed while validating uploaded main file', {
      mimeType: mainFile.mimeType,
      fileType,
      error,
    });
    createUnexpectedUploadFailureResponse(res);
    return;
  }

  if (mainFileValidationError) {
    await cleanupUploadedFiles([mainFile, referenceFile]);
    res.status(400).json({
      success: false,
      error: mainFileValidationError,
    });
    return;
  }

  const referenceFileType = referenceFile ? getFileExtensionFromMimeType(referenceFile.mimeType) : null;
  if (referenceFile && !referenceFileType) {
    await cleanupUploadedFiles([mainFile, referenceFile]);
    res.status(400).json({
      success: false,
      error: 'Unsupported reference file type. Allowed types: DOCX, PDF, TXT.',
    });
    return;
  }

  if (referenceFile && referenceFileType) {
    let referenceValidationError: string | null;
    try {
      referenceValidationError = await validateUploadedContent(referenceFile, referenceFileType);
    } catch (error) {
      await cleanupUploadedFiles([mainFile, referenceFile]);
      console.error('Failed while validating reference file', {
        mimeType: referenceFile.mimeType,
        fileType: referenceFileType,
        error,
      });
      createUnexpectedUploadFailureResponse(res);
      return;
    }

    if (referenceValidationError) {
      await cleanupUploadedFiles([mainFile, referenceFile]);
      res.status(400).json({
        success: false,
        error: referenceValidationError,
      });
      return;
    }
  }

  try {
    const supabase = createUserScopedSupabaseClient(authToken);
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: authenticatedUser.id,
        filename: mainFile.originalName,
        file_type: fileType,
        status: 'parsing',
      })
      .select('id, status')
      .single();

    if (error || !data) {
      await cleanupUploadedFiles([mainFile, referenceFile]);
      res.status(500).json({
        success: false,
        error: 'Failed to create upload session.',
      });
      return;
    }

    if (!tryAcquireParseSlot()) {
      await supabase.from('sessions').delete().eq('id', data.id);
      await cleanupUploadedFiles([mainFile, referenceFile]);
      createParseBusyErrorResponse(res);
      return;
    }

    try {
      let sections: Section[] = [];
      let referenceSections: Section[] = [];

      try {
        [sections, referenceSections] = await Promise.all([
          parseDocumentByType(mainFile.path, fileType),
          referenceFile && referenceFileType
            ? parseDocumentByType(referenceFile.path, referenceFileType)
            : Promise.resolve<Section[]>([]),
        ]);
      } catch (error) {
        await supabase.from('sessions').delete().eq('id', data.id);
        console.error('Failed to parse uploaded document', {
          sessionId: data.id,
          fileType,
          referenceFileType,
          error,
        });
        createParseFailureResponse(res);
        return;
      }

      const referenceTextByPosition = createReferenceTextByPosition(referenceSections);
      const sectionRows = sections.map((section) => ({
        position: section.position,
        section_type: section.section_type,
        heading_level: section.heading_level,
        original_text: section.original_text,
        reference_text: referenceTextByPosition.get(section.position) ?? null,
      }));

      const { error: persistSectionsError } = await supabase.rpc('persist_session_sections', {
        p_session_id: data.id,
        p_sections: sectionRows,
      });

      if (persistSectionsError) {
        await supabase.from('sessions').delete().eq('id', data.id);
        console.error('Failed to persist parsed sections atomically', {
          sessionId: data.id,
          error: persistSectionsError,
        });
        createSectionPersistenceFailureResponse(res);
        return;
      }
    } catch (error) {
      await supabase.from('sessions').delete().eq('id', data.id);
      console.error('Failed while persisting parsed sections', {
        sessionId: data.id,
        error,
      });
      createSectionPersistenceFailureResponse(res);
      return;
    } finally {
      await cleanupUploadedFiles([mainFile, referenceFile]);
      releaseParseSlot();
    }

    void triggerProofreadingWithRetry({
      sessionId: data.id,
      accessToken: authToken,
    });

    res.status(201).json({
      sessionId: data.id,
      status: 'proofreading',
    });
  } catch (error) {
    await cleanupUploadedFiles([mainFile, referenceFile]);
    console.error('Unexpected upload failure', {
      userId: authenticatedUser.id,
      error,
    });
    createUnexpectedUploadFailureResponse(res);
  }
});

router.use((error: unknown, _req: Request, res: Response, next: () => void) => {
  void next;
  if (error instanceof MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        error: 'File exceeds the 20 MB limit.',
      });
      return;
    }

    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({
        success: false,
        error: 'Unexpected upload field. Use "file" and optional "reference".',
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: 'Upload limit exceeded.',
    });
    return;
  }

  if (error instanceof UploadValidationError) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
    return;
  }

  if (error instanceof Error) {
    res.status(500).json({
      success: false,
      error: 'Unexpected upload error.',
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Unexpected upload error.',
  });
});

export { router as uploadRouter };
