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
