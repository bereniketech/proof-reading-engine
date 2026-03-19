ALTER TABLE sessions
  ADD COLUMN document_type text NOT NULL DEFAULT 'general'
  CONSTRAINT sessions_document_type_check CHECK (
    document_type IN (
      'general',
      'medical_journal',
      'legal_document',
      'academic_paper',
      'business_report',
      'creative_writing'
    )
  );
