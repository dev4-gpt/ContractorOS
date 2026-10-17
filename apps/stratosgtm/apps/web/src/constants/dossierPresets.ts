import { DossierPreset } from '../types/persona';

export const BUILT_IN_PRESETS: DossierPreset[] = [
  {
    id: 'default_demo',
    name: '🎯 Coaching & Consulting: Alex Kim (Acme Coaching Co.)',
    fullName: 'Alex Kim',
    email: 'alex.kim@acmecoaching.example',
    website: 'https://acmecoaching.example',
    linkedIn: 'https://linkedin.com/in/alexkim-coaching',
    twitter: 'https://x.com/alexkim_coaching',
    youtube: 'https://youtube.com/@acmecoaching',
    instagram: 'https://instagram.com/acmecoaching',
    substack: 'https://alexkim.substack.com',
    companyName: 'Acme Coaching Co.',
    bio: 'Founder of Acme Coaching Co. (15k community, 120k newsletter readers). Transitioning from $47 ebook sales into high-ticket $2,997 Pro Career Sprints and $10k/mo agency retainers. Needs 24/7 after-hours voice qualification to handle European and Asian inbound leads.',
    toneArchetype: 'tactical_operator',
    customLexicon: 'growth sprint, funnel velocity, high-ticket, cohort',
    customBannedTerms: 'cheap, guru, synergy, hard sell, magic bullet',
    isCustom: false
  },
  {
    id: 'creator_elena',
    name: '🎬 Creator VFX: Elena Rostova (NeuralCinema AI)',
    fullName: 'Elena Rostova',
    email: 'elena@neuralcinema.ai',
    website: 'https://neuralcinema.ai',
    linkedIn: 'https://linkedin.com/in/elena-rostova-ai',
    twitter: 'https://x.com/elena_cinema_ai',
    youtube: 'https://youtube.com/@NeuralCinemaAI',
    instagram: 'https://instagram.com/neuralcinema.ai',
    substack: 'https://neuralcinema.substack.com',
    companyName: 'NeuralCinema AI',
    bio: 'GenAI Filmmaker & Director. Running a private cohort for 50 commercial VFX artists and creative directors transitioning to diffusion pipelines and real-time NeRF workflows. Transitioning to $5k enterprise masterminds.',
    toneArchetype: 'visionary_founder',
    customLexicon: 'neural render, diffusion workflow, multimodal, latent space, high-ticket',
    customBannedTerms: 'cheap, prompt kiddie, clickbait, traditional CGI',
    isCustom: false
  },
  {
    id: 'saas_alex',
    name: '💼 Micro-SaaS: Alex Rivera (Solopreneur OS)',
    fullName: 'Alex Rivera',
    email: 'alex@solopreneuros.com',
    website: 'https://solopreneuros.com',
    linkedIn: 'https://linkedin.com/in/alexrivera-tech',
    twitter: 'https://x.com/alexrivera_dev',
    youtube: 'https://youtube.com/@solopreneuros',
    instagram: 'https://instagram.com/solopreneur.os',
    substack: 'https://alexrivera.substack.com',
    companyName: 'Solopreneur OS',
    bio: 'B2B Micro-SaaS founder building productivity systems for fractional executives and solo consultants. Scaled to $18k MRR, now expanding into high-touch onboarding and $12k/yr annual memberships.',
    toneArchetype: 'enterprise_advisor',
    customLexicon: 'unit economics, churn mitigation, LTV, net revenue retention, ROI',
    customBannedTerms: 'hustle, overnight riches, cheap, silver bullet',
    isCustom: false
  }
];

export const PACING_OPTIONS = {
  snappy: {
    id: 'snappy' as const,
    label: '0.8s Snappy',
    icon: '⚡',
    minSilence: 400,
    maxSilence: 1200,
    description: 'Rapid-fire qualification'
  },
  natural: {
    id: 'natural' as const,
    label: '1.8s Natural',
    icon: '🌿',
    minSilence: 800,
    maxSilence: 2200,
    description: 'Conversational breathing buffer'
  },
  patient: {
    id: 'patient' as const,
    label: '2.8s Patient',
    icon: '🧘',
    minSilence: 1400,
    maxSilence: 3200,
    description: 'Deliberative founder pacing'
  }
};
