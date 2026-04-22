export const DOCUMENT_TYPES = [
  // General
  { value: 'general',               label: 'General' },
  // Academic & Research
  { value: 'academic_paper',        label: 'Academic Paper' },
  { value: 'thesis_dissertation',   label: 'Thesis / Dissertation' },
  { value: 'research_proposal',     label: 'Research Proposal' },
  { value: 'literature_review',     label: 'Literature Review' },
  { value: 'conference_abstract',   label: 'Conference Abstract' },
  { value: 'grant_proposal',        label: 'Grant Proposal' },
  // Medical & Scientific
  { value: 'medical_journal',       label: 'Medical Journal Article' },
  { value: 'clinical_report',       label: 'Clinical Report' },
  { value: 'patient_case_study',    label: 'Patient Case Study' },
  { value: 'lab_report',            label: 'Lab Report' },
  { value: 'scientific_review',     label: 'Scientific Review Article' },
  // Legal
  { value: 'legal_document',        label: 'Legal Document' },
  { value: 'contract',              label: 'Contract' },
  { value: 'court_brief',           label: 'Court Brief / Pleading' },
  { value: 'regulatory_filing',     label: 'Regulatory Filing' },
  { value: 'policy_memo',           label: 'Policy Memo' },
  // Business & Professional
  { value: 'business_report',       label: 'Business Report' },
  { value: 'executive_summary',     label: 'Executive Summary' },
  { value: 'business_proposal',     label: 'Business Proposal / RFP' },
  { value: 'white_paper',           label: 'White Paper' },
  { value: 'case_study',            label: 'Case Study' },
  { value: 'press_release',         label: 'Press Release' },
  { value: 'internal_memo',         label: 'Internal Memo' },
  // Technical
  { value: 'technical_manual',      label: 'Technical Manual' },
  { value: 'api_documentation',     label: 'API Documentation' },
  { value: 'user_guide',            label: 'User Guide / Help Article' },
  { value: 'software_spec',         label: 'Software Specification' },
  { value: 'engineering_report',    label: 'Engineering Report' },
  // Educational
  { value: 'textbook_chapter',      label: 'Textbook Chapter' },
  { value: 'lesson_plan',           label: 'Lesson Plan / Curriculum' },
  { value: 'student_essay',         label: 'Student Essay' },
  // Journalism & Media
  { value: 'news_article',          label: 'News Article' },
  { value: 'opinion_editorial',     label: 'Opinion / Editorial' },
  { value: 'feature_article',       label: 'Feature Article' },
  { value: 'blog_post',             label: 'Blog Post' },
  { value: 'newsletter',            label: 'Newsletter' },
  // Marketing & Content
  { value: 'marketing_copy',        label: 'Marketing Copy / Ad Copy' },
  { value: 'product_description',   label: 'Product Description' },
  { value: 'social_media_post',     label: 'Social Media Post' },
  { value: 'email_correspondence',  label: 'Email / Correspondence' },
  { value: 'pitch_deck_script',     label: 'Pitch Deck Script' },
  // Creative Writing
  { value: 'creative_writing',      label: 'Creative Writing (General)' },
  { value: 'short_story',           label: 'Short Story / Fiction' },
  { value: 'screenplay',            label: 'Screenplay / Script' },
  { value: 'poetry',                label: 'Poetry' },
  { value: 'personal_essay',        label: 'Personal Essay / Memoir' },
  // Government & Public Sector
  { value: 'government_report',     label: 'Government / Public Report' },
  { value: 'environmental_impact',  label: 'Environmental Impact Statement' },
  { value: 'public_comment',        label: 'Public Comment / Submission' },
] as const;

export type DocumentTypeValue = typeof DOCUMENT_TYPES[number]['value'];

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['docx', 'pdf', 'txt'] as const;
export const apiBaseUrl = (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3001';

export function getFileExtension(fileName: string): string {
  const segments = fileName.split('.');
  return segments.length > 1 ? segments.at(-1)?.toLowerCase() ?? '' : '';
}

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

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = (bytes / Math.pow(k, i)).toFixed(1);
  return `${value} ${sizes[i]}`;
}

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
