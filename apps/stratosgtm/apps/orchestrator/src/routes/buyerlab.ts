// apps/orchestrator/src/routes/buyerlab.ts
import { createHash } from 'crypto';
import { NextFunction, Request, RequestHandler, Response, Router } from 'express';
import type { AuthedRequest } from '../middleware/requireUser';
import type { PerUserRateLimiter } from '../services/keyTesters';
import { BuyerAccess, KeyRequiredError } from '../buyerlab/access';
import type { crawl as crawlFn } from '../buyerlab/crawler';
import { estimateRun } from '../buyerlab/estimate';
import { BuyerLlm, LlmOutputError, LlmUnavailableError } from '../buyerlab/llm';
import { availableSurfacesOf, inferPanel, PanelIncompleteError, sanitizePersonas } from '../buyerlab/panel';
import { advanceRun, ProviderUnavailableError, retestRun, RunNotReadyError, startRun } from '../buyerlab/runner';
import { FetchFailedError } from '../buyerlab/safeFetch';
import { UnsafeUrlError } from '../buyerlab/ssrf';
import { BuyerLabNotFoundError, BuyerLabStore } from '../buyerlab/store';
import { clip, cleanText } from '../buyerlab/text';
import { NewSource, ProviderId, Run, Source, SURFACES, Surface } from '../buyerlab/types';
import { generateReport } from '../buyerlab/report';
import { hasServerKeyAccess } from '../services/usageService';

export interface BuyerLabRouterDeps {
  requireUser: RequestHandler;
  store: BuyerLabStore;
  access: (tenantId: string) => Promise<BuyerAccess>;
  makeLlm: (apiKey?: string) => BuyerLlm;
  makeProvider: (id: ProviderId, ctx: { llm: BuyerLlm; apiKey?: string }) => import('../buyerlab/types').SimulationProvider | null;
  crawl: typeof crawlFn;
  writeLimiter: PerUserRateLimiter;
  pollLimiter: PerUserRateLimiter;
  hasServerKeyAccess?: (tenantId: string) => Promise<boolean>;
}

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_PROJECTS = 20;
const MAX_SOURCES = 40;
const MIN_PASTED_CHARS = 40;
const MAX_PASTED_CHARS = 200_000;
const MAX_SKIPPED_ECHOED = 50;
const MAX_SKIPPED_URL_CHARS = 200;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const isTerminal = (r: Run) => r.status === 'done' || r.status === 'failed' || r.status === 'budget_exhausted';
/** Echo at most 50 skipped entries, each url cut to 200 characters. */
const echoSkipped = (skipped: { url: string; reason: string }[]) =>
  skipped.slice(0, MAX_SKIPPED_ECHOED).map((s) => ({ url: clip(s.url, MAX_SKIPPED_URL_CHARS), reason: s.reason }));
const summarise = (s: Source) => ({ id: s.id, kind: s.kind, surface: s.surface, label: s.label, url: s.url, words: words(s.text), fetchedAt: s.fetchedAt });

/** Every route acts only on the workspace requireUser resolved from the token. */
export function createBuyerLabRouter(deps: BuyerLabRouterDeps): Router {
  const router = Router();
  const { store } = deps;
  router.use(deps.requireUser);

  const tenantOf = (req: Request) => (req as AuthedRequest).workspace.tenantId;
  const userOf = (req: Request) => (req as AuthedRequest).user.userId;
  const bad = (res: Response, error: string, code = 'VALIDATION', extra: object = {}) => res.status(400).json({ error, code, ...extra });
  const notFound = (res: Response) => res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' });

  const fail = (res: Response, err: unknown) => {
    if (err instanceof BuyerLabNotFoundError) return notFound(res);
    if (err instanceof KeyRequiredError) return res.status(402).json({ error: err.message, code: 'KEY_REQUIRED' });
    if (err instanceof UnsafeUrlError) return res.status(400).json({ error: err.message, code: 'UNSAFE_URL', reason: err.reason });
    if (err instanceof FetchFailedError) return res.status(502).json({ error: err.message, code: 'FETCH_FAILED', reason: err.reason });
    if (err instanceof RunNotReadyError) return res.status(409).json({ error: err.message, code: err.code });
    if (err instanceof ProviderUnavailableError) return res.status(501).json({ error: err.message, code: 'PROVIDER_UNAVAILABLE' });
    if (err instanceof PanelIncompleteError) return res.status(502).json({ error: err.message, code: 'PANEL_INCOMPLETE', missing: err.missing });
    if (err instanceof LlmOutputError) return res.status(502).json({ error: 'The model returned an unusable answer. Try again.', code: 'MODEL_OUTPUT_UNUSABLE' });
    if (err instanceof LlmUnavailableError) return res.status(503).json({ error: 'The language model is unavailable right now.', code: 'LLM_UNAVAILABLE' });
    const e = err as { name?: string; cause?: { code?: string } };
    if (e?.cause?.code === '22P02') return notFound(res); // a syntactically valid id that is not a uuid
    // Only a safe summary: a Drizzle error message can carry query parameters.
    console.error('[/api/buyerlab] Unexpected error:', e?.name, e?.cause?.code ?? '');
    return res.status(500).json({ error: 'Something went wrong.' });
  };

  const limited = (limiter: PerUserRateLimiter): RequestHandler => (req: Request, res: Response, next: NextFunction) =>
    limiter.allow(userOf(req)) ? next() : void res.status(429).json({ error: 'Too many requests. Wait a minute and try again.', code: 'RATE_LIMITED' });
  const write = limited(deps.writeLimiter);
  const poll = limited(deps.pollLimiter);
  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler => (req, res) => {
    fn(req, res).catch((err) => fail(res, err));
  };
  const idOf = (req: Request, res: Response): string | null => {
    if (!ID.test(req.params.id)) {
      notFound(res);
      return null;
    }
    return req.params.id;
  };

  const usable = (sources: Source[]) => sources.filter((s) => s.kind !== 'agent');
  const withLlm = async (tenantId: string) => {
    const access = await deps.access(tenantId);
    return { access, llm: deps.makeLlm(access.apiKey) };
  };

  router.get('/projects', wrap(async (req, res) => {
    res.json({ projects: await store.listProjects(tenantOf(req)) });
  }));

  router.post('/projects', write, wrap(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? cleanText(body.name).trim() : '';
    if (!name || name.length > 120) return bad(res, 'Give the project a name of 1 to 120 characters.');
    let targetUrl: string | null = null;
    if (body.targetUrl !== undefined && body.targetUrl !== null && body.targetUrl !== '') {
      const u = typeof body.targetUrl === 'string' ? cleanText(body.targetUrl).trim() : '';
      let ok = u.length > 0 && u.length <= 500 && /^https?:\/\//i.test(u);
      if (ok) {
        try {
          new URL(u);
        } catch {
          ok = false;
        }
      }
      if (!ok) return bad(res, 'The target URL must be a full http or https address.');
      targetUrl = u;
    }
    let brief: string | null = null;
    const briefText = typeof body.brief === 'string' ? cleanText(body.brief).trim() : '';
    if (briefText) {
      if (briefText.length > 5000) return bad(res, 'The brief is limited to 5,000 characters.');
      brief = briefText;
    }
    let selfTest = false;
    if (body.selfTest === true) {
      selfTest = await (deps.hasServerKeyAccess ?? hasServerKeyAccess)(tenantOf(req)).catch(() => false);
    }
    if ((await store.listProjects(tenantOf(req))).length >= MAX_PROJECTS) return res.status(409).json({ error: `A workspace can hold ${MAX_PROJECTS} projects.`, code: 'PROJECT_LIMIT' });
    res.status(201).json({ project: await store.createProject(tenantOf(req), { name, targetUrl, brief, selfTest }) });
  }));

  router.get('/projects/:id', wrap(async (req, res) => {
    const id = idOf(req, res);
    if (!id) return;
    const t = tenantOf(req);
    const project = await store.getProject(t, id);
    if (!project) return notFound(res);
    const [sources, personas, latestRun] = await Promise.all([store.listSources(t, id), store.listPersonas(t, id), store.latestRun(t, id)]);
    const runnable = usable(sources);
    res.json({
      project,
      sources: sources.map(summarise),
      personas,
      latestRun,
      estimate: runnable.length && personas.length ? estimateRun(runnable, personas) : null
    });
  }));

  router.delete('/projects/:id', write, wrap(async (req, res) => {
    const id = idOf(req, res);
    if (!id) return;
    return (await store.deleteProject(tenantOf(req), id)) ? void res.status(204).end() : notFound(res);
  }));

  router.post('/projects/:id/ingest', write, wrap(async (req, res) => {
    const id = idOf(req, res);
    if (!id) return;
    const t = tenantOf(req);
    if (!(await store.getProject(t, id))) return notFound(res);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const existing = await store.listSources(t, id);
    if (existing.length >= MAX_SOURCES) return res.status(409).json({ error: `A project can hold ${MAX_SOURCES} sources.`, code: 'SOURCE_LIMIT' });

    if (typeof body.url === 'string') {
      const target = cleanText(body.url).trim();
      try {
        new URL(target);
      } catch {
        return bad(res, 'That is not a valid URL.');
      }
      const result = await deps.crawl(target, { maxPages: 12, deadlineMs: 40_000 });
      const pages = result.pages
        .map((p) => ({
          url: cleanText(p.url),
          label: clip(cleanText(p.title || p.url), 120),
          text: clip(cleanText(p.text), MAX_PASTED_CHARS),
          status: p.status,
          headings: p.headings.map(cleanText)
        }))
        .filter((p) => p.text.length > 0);
      const skipped = echoSkipped(result.skipped);
      if (pages.length === 0) {
        const thin = result.skipped.some((s) => s.reason === 'thin_content');
        return res.status(422).json({
          error: thin ? 'This page builds its content in the browser, so there is no text to read from the server. Paste the page text instead.' : 'No readable pages were found at that address.',
          code: 'NO_READABLE_TEXT',
          skipped
        });
      }
      const fresh: NewSource[] = pages.slice(0, MAX_SOURCES - existing.length).map((p) => ({
        kind: 'crawl', surface: 'public', label: p.label || clip(p.url, 120), url: p.url, contentHash: sha(p.text), text: p.text, meta: { status: p.status, headings: p.headings }
      }));
      const saved = await store.addSources(t, id, fresh);
      return res.status(201).json({ added: saved.added.map(summarise), duplicates: saved.duplicates, skipped, truncated: result.truncated });
    }

    if (typeof body.text === 'string') {
      const text = cleanText(body.text).trim();
      if (text.length < MIN_PASTED_CHARS) return bad(res, `Paste at least ${MIN_PASTED_CHARS} characters of page text.`);
      if (text.length > MAX_PASTED_CHARS) return bad(res, 'That text is too long (200,000 characters at most).');
      const surface = (body.surface ?? 'public') as string;
      if (!(SURFACES as readonly string[]).includes(surface)) return bad(res, 'surface must be "public" or "signed_in".');
      const kind = (body.kind ?? 'upload') as string;
      if (kind !== 'upload' && kind !== 'brief') return bad(res, 'kind must be "upload" or "brief".');
      const label = (typeof body.label === 'string' && clip(cleanText(body.label), 120)) || 'Pasted text';
      const saved = await store.addSources(t, id, [{ kind: kind as NewSource['kind'], surface: surface as Surface, label, url: null, contentHash: sha(text), text, meta: {} }]);
      return res.status(201).json({ added: saved.added.map(summarise), duplicates: saved.duplicates, skipped: [], truncated: false });
    }
    return bad(res, 'Send either { url } to crawl or { text } to paste page text.');
  }));

  router.post('/projects/:id/panel', write, wrap(async (req, res) => {
    const id = idOf(req, res);
    if (!id) return;
    const t = tenantOf(req);
    const project = await store.getProject(t, id);
    if (!project) return notFound(res);
    const activeRun = await store.latestRun(t, id);
    if (activeRun && !isTerminal(activeRun)) {
      return res.status(409).json({ error: 'A run is in progress for this project. Wait for it to finish first.', code: 'RUN_ACTIVE' });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sources = usable(await store.listSources(t, id));
    if (sources.length === 0) return res.status(409).json({ error: 'Add at least one source first.', code: 'NO_SOURCES' });
    const current = await store.listPersonas(t, id);
    if (current.some((p) => p.edited) && body.force !== true) {
      return res.status(409).json({ error: 'This panel has your edits. Send force: true to replace it.', code: 'PANEL_EDITED' });
    }
    const { llm } = await withLlm(t);
    const size = typeof body.size === 'number' ? body.size : 6;
    const inferred = await inferPanel({ project, sources, size, llm });
    const personas = await store.replacePanel(t, id, inferred.personas);
    res.json({ icp: inferred.icp, personas, callsUsed: inferred.callsUsed });
  }));

  router.put('/projects/:id/panel', write, wrap(async (req, res) => {
    const id = idOf(req, res);
    if (!id) return;
    const t = tenantOf(req);
    if (!(await store.getProject(t, id))) return notFound(res);
    const activeRun = await store.latestRun(t, id);
    if (activeRun && !isTerminal(activeRun)) {
      return res.status(409).json({ error: 'A run is in progress for this project. Wait for it to finish first.', code: 'RUN_ACTIVE' });
    }
    const raw = (req.body ?? {}).personas;
    if (!Array.isArray(raw) || raw.length === 0 || raw.length > 12) return bad(res, 'Send between 1 and 12 personas.', 'INVALID_PERSONA');
    const cleaned = sanitizePersonas(raw, availableSurfacesOf(usable(await store.listSources(t, id))), 12);
    if (cleaned.length !== raw.length) return bad(res, 'Every persona needs a name.', 'INVALID_PERSONA');
    res.json({ personas: await store.replacePanel(t, id, cleaned.map((p) => ({ ...p, edited: true }))) });
  }));

  router.post('/runs', write, wrap(async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body.projectId !== 'string' || !ID.test(body.projectId)) return notFound(res);
    const provider = (body.provider ?? 'native') as string;
    if (provider !== 'native' && provider !== 'mirofish') return bad(res, 'provider must be "native" or "mirofish".');
    if (body.budget !== undefined && typeof body.budget !== 'number') return bad(res, 'budget must be a number.');
    const t = tenantOf(req);
    if (!(await store.getProject(t, body.projectId))) return notFound(res);

    const { access, llm } = await withLlm(t);
    const run = await startRun(
      { store, provider: (pid) => deps.makeProvider(pid, { llm, apiKey: access.apiKey }) },
      { tenantId: t, projectId: body.projectId, provider, fundedBy: access.fundedBy, callBudget: body.budget as number | undefined }
    );
    const [sources, personas] = await Promise.all([store.listSources(t, body.projectId), store.listPersonas(t, body.projectId)]);
    res.status(201).json({ run, estimate: estimateRun(usable(sources), personas) });
  }));

  router.get('/runs/:id', poll, wrap(async (req, res) => {
    const id = idOf(req, res);
    if (!id) return;
    const t = tenantOf(req);
    const run = await store.getRun(t, id);
    if (!run) return notFound(res);
    if (isTerminal(run)) return res.json({ run, progress: null });
    // Advancing spends model calls, so the caller must still be entitled to them.
    const { access, llm } = await withLlm(t);
    res.json(await advanceRun({ store, provider: (pid) => deps.makeProvider(pid, { llm, apiKey: access.apiKey }) }, t, id));
  }));

  router.get('/runs/:id/outcome', wrap(async (req, res) => {
    const id = idOf(req, res);
    if (!id) return;
    const t = tenantOf(req);
    const run = await store.getRun(t, id);
    if (!run) return notFound(res);
    const outcome = await store.getOutcome(t, id);
    if (!outcome) return res.status(404).json({ error: 'This run has no outcome yet.', code: 'NO_OUTCOME' });
    res.json({ run, outcome });
  }));

  // `write`-limited although it is a GET: a cache miss here spends a billable model call.
  router.get('/runs/:id/report', write, wrap(async (req, res) => {
    const id = idOf(req, res);
    if (!id) return;
    const t = tenantOf(req);
    const run = await store.getRun(t, id);
    if (!run) return notFound(res);
    const existing = await store.getReport(t, id);
    if (existing) return res.json({ report: existing, outcome: await store.getOutcome(t, id) });
    if (run.status !== 'done' && run.status !== 'budget_exhausted') {
      return res.status(409).json({ error: 'The run has not finished yet.', code: 'RUN_NOT_DONE' });
    }
    const outcome = await store.getOutcome(t, id);
    if (!outcome) return res.status(404).json({ error: 'This run has no outcome yet.', code: 'NO_OUTCOME' });
    const { llm } = await withLlm(t);
    // Only a self_test project's runs attempt stage 4, so the report must say so for every other project.
    const project = await store.getProject(t, run.projectId);
    const { report, model } = await generateReport(outcome, llm, { conversationAttempted: project?.selfTest === true });
    await store.saveReport(t, id, report, model);
    res.json({ report, outcome });
  }));

  router.post('/runs/:id/chat', write, wrap(async (req, res) => {
    const id = idOf(req, res);
    if (!id) return;
    const t = tenantOf(req);
    const run = await store.getRun(t, id);
    if (!run) return notFound(res);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const personaId = typeof body.personaId === 'string' ? body.personaId : '';
    if (!ID.test(personaId)) return notFound(res);
    const message = typeof body.message === 'string' ? cleanText(body.message).trim() : '';
    if (!message || message.length > 1000) return bad(res, 'Send a message of 1 to 1000 characters.');
    const { access, llm } = await withLlm(t);
    const provider = deps.makeProvider(run.provider, { llm, apiKey: access.apiKey });
    if (!provider) return res.status(501).json({ error: `The ${run.provider} engine is not available.`, code: 'PROVIDER_UNAVAILABLE' });
    const replyText = await provider.chat({ runId: id, tenantId: t }, personaId, message);
    res.json({ reply: replyText });
  }));

  router.post('/runs/:id/retest', write, wrap(async (req, res) => {
    const id = idOf(req, res);
    if (!id) return;
    const t = tenantOf(req);
    const base = await store.getRun(t, id);
    if (!base) return notFound(res);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const sourceIds = Array.isArray(body.sourceIds) ? body.sourceIds.filter((x): x is string => typeof x === 'string') : undefined;
    const { access, llm } = await withLlm(t);
    const run = await retestRun(
      { store, provider: (pid) => deps.makeProvider(pid, { llm, apiKey: access.apiKey }) },
      { tenantId: t, projectId: base.projectId, baseRunId: id, provider: base.provider, fundedBy: access.fundedBy, sourceIds }
    );
    res.status(201).json({ run });
  }));

  return router;
}
