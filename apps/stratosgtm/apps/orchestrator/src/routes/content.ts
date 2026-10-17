import { socialPublishingService } from '../services/socialPublishingService';
import * as fs from 'fs';
import * as path from 'path';
import { Router, Request, Response } from 'express';
import { contentFactoryEngine } from '../services/contentFactoryEngine';
import { outreachDispatcherService } from '../services/outreachDispatcherService';
import { antiSlopGuardrail } from '../services/antiSlopGuardrail';
import { requireOwnerKey } from '../middleware/auth';

export const contentRouter = Router();

contentRouter.get('/jobs', (_req: Request, res: Response) => {
  res.json({ jobs: contentFactoryEngine.getJobs() });
});

contentRouter.get('/jobs/:id', (req: Request, res: Response) => {
  const job = contentFactoryEngine.getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
});

contentRouter.post('/trigger', requireOwnerKey, async (req: Request, res: Response) => {
  const { topic, speaker } = req.body;
  if (!topic) {
    return res.status(400).json({ error: 'Topic is required to trigger Content Factory' });
  }

  const job = await contentFactoryEngine.startJob(topic, speaker || 'creator');
  res.json({
    status: 'queued',
    message: `Hermes Content Factory queued for topic: "${topic}". Drafts will appear in Content Studio.`,
    jobId: job.id
  });
});

contentRouter.post('/audit', requireOwnerKey, async (req: Request, res: Response) => {
  const { companyOrCreator, website, triggerEvent, socialLinks, socialBioText, speaker } = req.body;
  if (!companyOrCreator) {
    return res.status(400).json({ error: 'Company or Creator name is required to run conversion audit' });
  }

  const job = await contentFactoryEngine.startAuditJob({
    companyOrCreator,
    website,
    triggerEvent: triggerEvent || 'Scaling high-ticket inbound funnel',
    socialLinks,
    socialBioText,
    requestedBySpeaker: speaker || 'sdr_outbound'
  });

  res.json({
    status: 'queued',
    message: `SOP Outbound Lead Magnet & Conversion Audit queued for "${companyOrCreator}". Analysis will stream into Content Studio.`,
    jobId: job.id
  });
});

contentRouter.post('/dispatch', requireOwnerKey, async (req: Request, res: Response) => {
  const {
    companyName,
    recipientName,
    recipientEmail,
    emailSubject,
    emailBodyMarkdown,
    spokenAudioScript,
    linkedInMessage,
    webhookUrl
  } = req.body;

  if (!companyName || !recipientEmail) {
    return res.status(400).json({ error: 'Company name and recipient email are required' });
  }

  try {
    const result = await outreachDispatcherService.dispatchOutreachSequence({
      companyName,
      recipientName: recipientName || 'Founder',
      recipientEmail,
      emailSubject: emailSubject || `Quick Audit for ${companyName}`,
      emailBodyMarkdown: emailBodyMarkdown || 'Audit preview',
      spokenAudioScript: spokenAudioScript || 'Audio note script',
      linkedInMessage,
      webhookUrl
    });
    return res.json({ status: 'success', result });
  } catch (e: any) {
    return res.status(500).json({ error: 'Dispatch failed', message: e.message });
  }
});

contentRouter.post('/anti-slop/evaluate', (req: Request, res: Response) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Text is required for evaluation' });
  const evalResult = antiSlopGuardrail.evaluateCopyQuality(text);
  res.json({ evalResult });
});

contentRouter.post('/jobs/:id/approve', requireOwnerKey, (req: Request, res: Response) => {
  const job = contentFactoryEngine.approveJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ status: 'approved', job });
});

contentRouter.post('/jobs/:id/reject', requireOwnerKey, (req: Request, res: Response) => {
  const job = contentFactoryEngine.rejectJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ status: 'rejected', job });
});

// Automated Social Publishing Across Connected Platforms
contentRouter.post('/publish', requireOwnerKey, async (req: Request, res: Response) => {
  const { companyName, platforms, content, source } = req.body;
  if (!companyName || !platforms || !Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({ error: 'Company name and target platforms array are required' });
  }

  try {
    const result = await socialPublishingService.publishToConnectedPlatforms({
      companyName,
      platforms,
      content: content || { thesis: 'Autonomous Growth Architecture' },
      source: source || 'content_factory_studio'
    });
    res.json({ status: 'success', result });
  } catch (err: any) {
    res.status(500).json({ error: 'Publishing failed', message: err.message });
  }
});

// Autonomous End-to-End Social Pipeline: Research -> Anna Voice -> Create -> Publish
contentRouter.post('/auto-pipeline', requireOwnerKey, async (req: Request, res: Response) => {
  const { companyName, transcriptExcerpt, coreInsight, platforms } = req.body;
  if (!companyName) {
    return res.status(400).json({ error: 'Company name is required' });
  }

  try {
    const result = await socialPublishingService.runEndToEndPipeline({
      companyName,
      transcriptExcerpt,
      coreInsight,
      platforms
    });
    res.json({ status: 'success', result });
  } catch (err: any) {
    res.status(500).json({ error: 'Auto-pipeline failed', message: err.message });
  }
});

// Get publication history and Obsidian SocialFeed.md for client
contentRouter.get('/publications/:companyName', (req: Request, res: Response) => {
  const { companyName } = req.params;
  const safeName = companyName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const feedPath = path.resolve(process.cwd(), 'vault', 'Clients', safeName, 'SocialFeed.md');

  if (fs.existsSync(feedPath)) {
    const content = fs.readFileSync(feedPath, 'utf-8');
    res.json({ companyName, exists: true, feedMarkdown: content, vaultPath: `vault/Clients/${safeName}/SocialFeed.md` });
  } else {
    res.json({ companyName, exists: false, feedMarkdown: '', message: 'No publications recorded yet.' });
  }
});
