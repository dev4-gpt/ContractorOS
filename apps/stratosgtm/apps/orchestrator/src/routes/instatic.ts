import { Router, Request, Response } from 'express';
import { instaticService } from '../services/instaticService';
import { requireOwnerKey } from '../middleware/auth';

export const instaticRouter = Router();

/** Props a caller is permitted to set on a node. Anything else is refused. */
const ALLOWED_NODE_PROPS = new Set(['text', 'href', 'src', 'alt', 'level', 'align', 'variant']);

/** Keys that would walk the prototype chain when spread into an existing object. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const MAX_PROP_LENGTH = 5000;

/**
 * Validates a patch-node payload, returning sanitized props or an error string.
 * Values stay scalar — nested objects are refused rather than merged, since the
 * compiler only ever renders scalars.
 */
function validateNodeProps(input: unknown): { props: Record<string, unknown> } | { error: string } {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { error: 'newProps must be a JSON object' };
  }

  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) {
      return { error: `Illegal property name: ${key}` };
    }
    if (!ALLOWED_NODE_PROPS.has(key)) {
      return { error: `Unsupported property '${key}'. Allowed: ${[...ALLOWED_NODE_PROPS].join(', ')}` };
    }
    if (value !== null && typeof value === 'object') {
      return { error: `Property '${key}' must be a string, number, or boolean` };
    }
    if (typeof value === 'string' && value.length > MAX_PROP_LENGTH) {
      return { error: `Property '${key}' exceeds ${MAX_PROP_LENGTH} characters` };
    }
    props[key] = value;
  }

  if (Object.keys(props).length === 0) {
    return { error: 'newProps must contain at least one supported property' };
  }
  return { props };
}

// GET /api/instatic/pages
instaticRouter.get('/pages', requireOwnerKey, (req: Request, res: Response) => {
  try {
    const company = (req.query.company as string) || undefined;
    const pages = instaticService.getPages(company);
    res.json({
      status: 'success',
      count: pages.length,
      pages
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/instatic/pages/:pageId
instaticRouter.get('/pages/:pageId', requireOwnerKey, (req: Request, res: Response) => {
  try {
    const page = instaticService.getPage(req.params.pageId);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }
    res.json({ status: 'success', page });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/instatic/generate
instaticRouter.post('/generate', requireOwnerKey, (req: Request, res: Response) => {
  try {
    const { companyName, title, topic, thesis, hook, coreProblem, tacticalFramework } = req.body;
    const pageTitle = title || topic;
    if (!companyName || !pageTitle) {
      return res.status(400).json({ error: 'Missing companyName or title/topic' });
    }

    const newPage = instaticService.generatePageFromContentPack(companyName, pageTitle, {
      thesis: thesis || 'Autonomous Growth & Voice Inbound Engine',
      hook,
      coreProblem,
      tacticalFramework
    });

    res.json({
      status: 'success',
      page: newPage
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/instatic/patch-node
instaticRouter.post('/patch-node', requireOwnerKey, (req: Request, res: Response) => {
  try {
    const { pageId, nodeId, newProps } = req.body;
    if (!pageId || !nodeId || !newProps) {
      return res.status(400).json({ error: 'Missing pageId, nodeId, or newProps' });
    }

    const validated = validateNodeProps(newProps);
    if ('error' in validated) {
      return res.status(400).json({ error: validated.error });
    }

    const updated = instaticService.patchNode(pageId, nodeId, validated.props);
    if (!updated) {
      return res.status(404).json({ error: 'Page or node not found' });
    }

    res.json({ status: 'success', page: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/instatic/ai-assist
instaticRouter.post('/ai-assist', requireOwnerKey, async (req: Request, res: Response) => {
  try {
    const { pageId, nodeId, prompt } = req.body;
    if (!pageId || !nodeId || !prompt) {
      return res.status(400).json({ error: 'Missing pageId, nodeId, or prompt' });
    }

    const result = await instaticService.aiAssistNode(pageId, nodeId, prompt);
    res.json({
      status: 'success',
      explanation: result.explanation,
      page: result.updatedPage
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/instatic/preview/:pageId
instaticRouter.get('/preview/:pageId', (req: Request, res: Response) => {
  try {
    const page = instaticService.getPage(req.params.pageId);
    if (!page) {
      return res.status(404).send('Page not found');
    }

    const html = instaticService.compileToStaticHtml(page);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err: any) {
    res.status(500).send('Error compiling static preview: ' + err.message);
  }
});

// GET /api/instatic/status
instaticRouter.get('/status', (_req: Request, res: Response) => {
  res.json({
    status: 'operational',
    service: 'StratosGTM — Instatic Visual CMS Bridge',
    editorPort: 3001,
    standaloneServer: 'http://localhost:3001',
    features: [
      'AST JSON Document Representation',
      'RFC-6902-style Surgical Node Patching',
      'Anna AI Co-Pilot Node Rewrites',
      'Zero-Runtime Semantic Static HTML Compiler',
      'Auto-Injected StratosGTM Spoken Widget'
    ]
  });
});
