export type OperatingPersona =
  | 'inbound'
  | 'outbound'
  | 'churn'
  | 'onboarding'
  | 'affiliate'
  | 'diagnostic';

export interface CustomLinkItem {
  id: string;
  label: string;
  url: string;
}

export interface DossierPreset {
  id: string;
  name: string;
  fullName: string;
  email: string;
  website: string;
  linkedIn: string;
  twitter: string;
  youtube: string;
  instagram: string;
  substack: string;
  companyName: string;
  bio: string;
  toneArchetype: 'tactical_operator' | 'empathetic_mentor' | 'visionary_founder' | 'enterprise_advisor';
  customLexicon: string;
  customBannedTerms: string;
  customLinks?: CustomLinkItem[];
  isCustom?: boolean;
}
