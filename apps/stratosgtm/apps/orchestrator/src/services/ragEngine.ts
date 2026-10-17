export interface KnowledgeDocument {
  id: string;
  category: 'pricing' | 'curriculum' | 'guarantee' | 'roi_case_study';
  title: string;
  content: string;
  tags: string[];
}

const KNOWLEDGE_BASE: KnowledgeDocument[] = [
  {
    id: 'kb_pricing_01',
    category: 'pricing',
    title: 'Creator Accelerator Pricing Tiers',
    content:
      'We offer three core programs: (1) Self-Paced Growth Sprint at $997 one-time; (2) Pro Mentorship at $2,997 ($497/mo for 6 months) including weekly cohort coaching; (3) Elite Mastermind at $7,500 by application only, including 1-on-1 access and direct funnel implementation.',
    tags: ['pricing', 'cost', 'tiers', 'plans', 'mastermind', 'self-paced']
  },
  {
    id: 'kb_curriculum_01',
    category: 'curriculum',
    title: 'Core Growth Operator Curriculum',
    content:
      'The curriculum covers: Module 1: Offer validation & high-ticket digital product design. Module 2: Automated acquisition funnels and paid media scaling. Module 3: High-converting webinar & VSL scripts. Module 4: Backend retention, community engagement, and reducing churn below 3%.',
    tags: ['curriculum', 'modules', 'course', 'content', 'syllabus']
  },
  {
    id: 'kb_guarantee_01',
    category: 'guarantee',
    title: '14-Day Action-Based Guarantee & Refund Policy',
    content:
      'All programs include an unconditional 14-day action-based refund guarantee. If you complete the Module 1 worksheets and attend the initial onboarding call within 14 days and do not see a clear path to 10x your investment, submit your worksheets for a full 100% refund. Subscriptions can be paused for up to 60 days without penalty.',
    tags: ['refund', 'guarantee', 'cancellation', 'money back', 'pause', 'policy']
  },
  {
    id: 'kb_case_study_01',
    category: 'roi_case_study',
    title: 'Creator ROI Case Studies',
    content:
      'Case Study: Marcus (YouTube Creator, 120k subs) launched the Operator Funnel and added $42,000 MRR within 60 days by converting 4% of his email list into the Pro Mentorship tier. Case Study: Elena (Tech Educator) dropped her community churn from 8.5% down to 2.1% using our proactive voice retention playbooks.',
    tags: ['case study', 'results', 'roi', 'proof', 'testimonials', 'examples']
  }
];

export class RAGEngine {
  public search(query: string, category?: string): KnowledgeDocument[] {
    const q = query.toLowerCase();
    const tokens = q.split(/\s+/).filter((t) => t.length > 2);

    let candidates = KNOWLEDGE_BASE;
    if (category) {
      candidates = candidates.filter((d) => d.category === category);
    }

    const scored = candidates.map((doc) => {
      let score = 0;
      const text = `${doc.title} ${doc.content} ${doc.tags.join(' ')}`.toLowerCase();

      // Keyword match score
      tokens.forEach((token) => {
        if (text.includes(token)) score += 2;
      });

      // Tag bonus
      doc.tags.forEach((tag) => {
        if (q.includes(tag)) score += 3;
      });

      return { doc, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.filter((s) => s.score > 0).map((s) => s.doc);
  }
}

export const ragEngine = new RAGEngine();
