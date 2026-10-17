import { Router, Request, Response } from 'express';
import { complianceService } from '../services/complianceService';
import { requireOwnerKey } from '../middleware/auth';

export const complianceRouter = Router();

/**
 * GET /api/compliance/policy?state=CA
 *
 * Public: the embedded widget must read this before it opens a microphone, and
 * it runs on customer origins with no dashboard credentials. It returns policy
 * only — no tenant data.
 */
complianceRouter.get('/policy', (req: Request, res: Response) => {
  try {
    const policy = complianceService.getPolicy((req.query.state as string) || null);
    res.json({ status: 'success', policy });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/compliance/consent
 *
 * Public for the same reason: this is the visitor granting consent, and it must
 * be recorded before capture begins.
 */
complianceRouter.post('/consent', async (req: Request, res: Response) => {
  try {
    const { sessionId, companyName, state, consentGranted } = req.body;
    if (!sessionId || !companyName) {
      return res.status(400).json({ error: 'Missing sessionId or companyName' });
    }

    const policy = complianceService.getPolicy(state);
    const granted = Boolean(consentGranted);

    if (!complianceService.mayCapture(policy, granted)) {
      // Refuse rather than record a non-consenting session as consented.
      return res.status(403).json({
        error: 'Consent is required in this region before a call can start.',
        code: 'CONSENT_REQUIRED',
        policy
      });
    }

    const record = complianceService.recordConsent({
      sessionId,
      companyName,
      stateCode: state,
      consentGranted: granted,
      userAgent: req.header('user-agent') || ''
    });

    // The client starts capture on this 200, so the evidence must already be
    // stored. Returning first would let a serverless host drop the insert.
    await complianceService.flush();
    res.json({ status: 'success', record, policy });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/compliance/log — tenant evidence, so this one is gated. */
complianceRouter.get('/log', requireOwnerKey, (req: Request, res: Response) => {
  try {
    const company = (req.query.company as string) || undefined;
    const records = complianceService.getConsentLog(company);
    res.json({ status: 'success', count: records.length, records });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
