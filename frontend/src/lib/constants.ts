export const DOCUMENT_TYPES = [
  { value: 'general', label: 'General' },
  { value: 'medical_journal', label: 'Medical Journal' },
  { value: 'legal_document', label: 'Legal Document' },
  { value: 'academic_paper', label: 'Academic Paper' },
  { value: 'business_report', label: 'Business Report' },
  { value: 'creative_writing', label: 'Creative Writing' },
] as const;

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['docx', 'pdf', 'txt'] as const;
export const apiBaseUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';

/**
 * Get file extension from filename (e.g., "file.docx" → "docx")
 */
export function getFileExtension(fileName: string): string {
  const segments = fileName.split('.');
  return segments.length > 1 ? segments.at(-1)?.toLowerCase() ?? '' : '';
}

/**
 * Validate uploaded file. Returns error message if invalid, null if valid.
 */
export function validateUploadFile(file: File): string | null {
  const extension = getFileExtension(file.name);
  if (!ACCEPTED_EXTENSIONS.includes(extension as 'docx' | 'pdf' | 'txt')) {
    return 'Unsupported file type. Please select a DOCX, PDF, or TXT file.';
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'File exceeds the 20 MB limit.';
  }
  return null;
}

/**
 * Format bytes as human-readable string (e.g., 1024 → "1 KB")
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = (bytes / Math.pow(k, i)).toFixed(1);
  return `${value} ${sizes[i]}`;
}

/**
 * Type guard for upload success response
 */
export function isUploadSuccessResponse(obj: unknown): obj is { success: true; data: { sessionId: string } } {
  if (
    typeof obj !== 'object' ||
    obj === null ||
    !('success' in obj) ||
    obj.success !== true ||
    !('data' in obj) ||
    typeof obj.data !== 'object' ||
    obj.data === null ||
    !('sessionId' in obj.data)
  ) {
    return false;
  }
  const data = obj.data as Record<string, unknown>;
  return typeof data.sessionId === 'string';
}
