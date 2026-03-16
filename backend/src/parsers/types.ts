export type SectionType = 'heading' | 'paragraph';

export interface Section {
  position: number;
  section_type: SectionType;
  heading_level: number | null;
  original_text: string;
}
