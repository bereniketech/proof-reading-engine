-- Drop the old CHECK constraint and replace it with one that covers all document types.
ALTER TABLE sessions DROP CONSTRAINT sessions_document_type_check;

ALTER TABLE sessions
  ADD CONSTRAINT sessions_document_type_check CHECK (
    document_type IN (
      -- General
      'general',
      -- Academic & Research
      'academic_paper',
      'thesis_dissertation',
      'research_proposal',
      'literature_review',
      'conference_abstract',
      'grant_proposal',
      -- Medical & Scientific
      'medical_journal',
      'clinical_report',
      'patient_case_study',
      'lab_report',
      'scientific_review',
      -- Legal
      'legal_document',
      'contract',
      'court_brief',
      'regulatory_filing',
      'policy_memo',
      -- Business & Professional
      'business_report',
      'executive_summary',
      'business_proposal',
      'white_paper',
      'case_study',
      'press_release',
      'internal_memo',
      -- Technical
      'technical_manual',
      'api_documentation',
      'user_guide',
      'software_spec',
      'engineering_report',
      -- Educational
      'textbook_chapter',
      'lesson_plan',
      'student_essay',
      -- Journalism & Media
      'news_article',
      'opinion_editorial',
      'feature_article',
      'blog_post',
      'newsletter',
      -- Marketing & Content
      'marketing_copy',
      'product_description',
      'social_media_post',
      'email_correspondence',
      'pitch_deck_script',
      -- Creative Writing
      'creative_writing',
      'short_story',
      'screenplay',
      'poetry',
      'personal_essay',
      -- Government & Public Sector
      'government_report',
      'environmental_impact',
      'public_comment'
    )
  );
