import type { Estimate, Outcome, Persona, Progress, Project, ProjectDetail, Report, Run, Surface } from './types';

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export class BuyerLabApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'BuyerLabApiError';
  }
}

const send = (method: string, data?: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) });

export function createBuyerLabApi(fetcher: Fetcher) {
  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetcher(`/api/buyerlab${path}`, init);
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok) throw new BuyerLabApiError(body?.error ?? `The request failed (HTTP ${res.status}).`, res.status, body?.code);
    return body as T;
  }
  return {
    listProjects: () => call<{ projects: Project[] }>('/projects'),
    createProject: (i: { name: string; targetUrl?: string; selfTest?: boolean }) => call<{ project: Project }>('/projects', send('POST', i)),
    getProject: (id: string) => call<ProjectDetail>(`/projects/${id}`),
    ingestUrl: (id: string, url: string) => call<{ skipped: Array<{ url: string; reason: string }>; truncated: boolean }>(`/projects/${id}/ingest`, send('POST', { url })),
    ingestText: (id: string, i: { text: string; label: string; surface: Surface }) => call<unknown>(`/projects/${id}/ingest`, send('POST', i)),
    inferPanel: (id: string, force: boolean) => call<{ icp: string; personas: Persona[] }>(`/projects/${id}/panel`, send('POST', force ? { force: true } : {})),
    savePanel: (id: string, personas: Array<{ name: string; archetype: string; surfaces: Surface[]; role: string; goals: string[]; constraints: string[]; budgetAuthority: string; priorTools: string[]; reasonNotToBuy: string }>) =>
      call<{ personas: Persona[] }>(`/projects/${id}/panel`, send('PUT', { personas })),
    startRun: (projectId: string) => call<{ run: Run; estimate: Estimate }>('/runs', send('POST', { projectId })),
    pollRun: (id: string) => call<{ run: Run; progress: Progress | null }>(`/runs/${id}`),
    getOutcome: (id: string) => call<{ run: Run; outcome: Outcome }>(`/runs/${id}/outcome`),
    getReport: (runId: string) => call<{ report: Report; outcome: Outcome }>(`/runs/${runId}/report`),
    chat: (runId: string, personaId: string, message: string) => call<{ reply: string }>(`/runs/${runId}/chat`, send('POST', { personaId, message })),
    retest: (runId: string, sourceIds?: string[]) => call<{ run: Run }>(`/runs/${runId}/retest`, send('POST', sourceIds ? { sourceIds } : {}))
  };
}
export type BuyerLabApi = ReturnType<typeof createBuyerLabApi>;
