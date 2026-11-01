// Data shapes shared by more than one module. Keep this file small: a type belongs here only
// when two modules read or write the same stored data.


/** companies.profile: written on /pages/company-settings/ (recruiting), shown on /pages/company/ (jobs). */
export interface CompanyProfile {
  tagline?: string; mission?: string; vision?: string; office?: string; hr_email?: string; hotline?: string;
  program?: { title?: string; description?: string }; culture?: string[];
  mentors?: { name: string; title?: string; expertise?: string }[];
}

/**
 * cvs.content: written by the CV builder (profile-cv), frozen into applications.cv_snapshot when a
 * student applies, read by the public CV page (profile-cv) and by recruiters (recruiting, Phase 7).
 * `editor` keeps the builder's raw state so a CV reopens exactly as it was left.
 */
export interface CvContent {
  version: 1;
  personal: { name: string; title: string; email: string; phone: string; location: string; github: string; linkedin: string };
  summary: string;
  education: { school: string; major: string; period: string; gpa: string; courses: string }[];
  projects: { title: string; stack: string; link: string; description: string }[];
  skills: string[];
  activities: { title: string; detail: string }[];
  theme: 'modern' | 'minimal' | 'tech';
  color: string;
  avatar?: string;
  editor?: { fields: Record<string, string>; extras: { id: string; kind: string; title: string; detail: string }[]; removed: string[] };
}
