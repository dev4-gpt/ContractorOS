export type Surface = 'public' | 'signed_in';
export type Archetype = 'skeptic' | 'budget_holder' | 'champion' | 'technical_evaluator' | 'distracted_visitor' | 'other';

export interface Project { id: string; name: string; targetUrl: string | null; brief: string | null; createdAt: string; selfTest: boolean }
export interface SourceSummary { id: string; kind: string; surface: Surface; label: string; url: string | null; words: number; fetchedAt: string }
export interface PersonaSpec { name: string; role: string; goals: string[]; constraints: string[]; budgetAuthority: 'none' | 'influencer' | 'holder'; priorTools: string[]; reasonNotToBuy: string }
export interface Persona { id: string; archetype: Archetype; surfaces: Surface[]; spec: PersonaSpec; edited: boolean }
export interface Estimate { calls: number; approxInputTokens: number; approxOutputTokens: number; usdUpperBound: number; note: string }
export type RunStatus = 'queued' | 'running' | 'done' | 'failed' | 'budget_exhausted';
export interface Run { id: string; status: RunStatus; provider: 'native' | 'mirofish'; callsUsed: number; callBudget: number; fundedBy: 'byok' | 'server_grant'; errorCode: string | null }
export interface Progress { done: boolean; completedSteps: number; failedSteps: number; totalSteps: number; callsUsed: number; budgetExhausted: boolean }
export interface ProjectDetail { project: Project; sources: SourceSummary[]; personas: Persona[]; latestRun: Run | null; estimate: Estimate | null }

export interface Claim { id: string; kind: 'objection' | 'confusion' | 'delight'; text: string; severity: 'low' | 'medium' | 'high' | null; sourceId: string; surface: Surface; quote: string }
export interface DroppedClaim { text: string; reason: string }
export interface PersonaOutcome {
  personaId: string; name: string; archetype: Archetype; surfaces: Surface[];
  intent: { score: number; rationale: string }; sentiment: 'negative' | 'mixed' | 'positive'; claims: Claim[]; dropped: DroppedClaim[]; conversation: Claim[];
}
export interface Outcome {
  provider: 'native' | 'mirofish'; model: string | null; panelSize: number;
  coverage: { sources: Array<{ id: string; label: string; url: string | null; surface: Surface; words: number }> };
  personas: PersonaOutcome[];
  agreement: { intentMin: number; intentMax: number; split: boolean };
  verification: { kept: number; dropped: number };
  partial: { missingPersonaIds: string[] } | null;
  callsUsed: number; generatedAt: string; disclaimer: string;
}

export interface ReportFinding { text: string; claimIds: string[] }
export interface ReportRecommendation { text: string; claimIds: string[]; rewrite: string | null }
/** `conversationAttempted` is false when stage 4 (buyer-to-agent conversation) was never run for this project. */
export interface Report { headline: string; findings: ReportFinding[]; recommendations: ReportRecommendation[]; conversationAttempted?: boolean; disclaimer: string; generatedAt: string }
export interface ChatTurn { role: 'user' | 'persona'; text: string; createdAt: string }
