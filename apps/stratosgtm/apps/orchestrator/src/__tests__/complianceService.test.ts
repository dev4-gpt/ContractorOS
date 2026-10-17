import { ComplianceService } from '../services/complianceService';

describe('ComplianceService — US disclosure & recording consent', () => {
  let service: ComplianceService;

  beforeEach(() => {
    service = new ComplianceService();
  });

  describe('policy resolution', () => {
    it('requires explicit opt-in in all-party-consent states', () => {
      // A live transcript can be treated as interception in these states.
      for (const state of ['CA', 'CT', 'DE', 'FL', 'IL', 'MD', 'MA', 'MI', 'MT', 'NV', 'NH', 'PA', 'WA']) {
        expect(service.getPolicy(state).consentRequirement).toBe('explicit_opt_in');
      }
    });

    it('requires only disclosure in one-party-consent states', () => {
      for (const state of ['NY', 'TX', 'CO', 'UT', 'GA']) {
        expect(service.getPolicy(state).consentRequirement).toBe('disclosure_only');
      }
    });

    it('applies the strictest policy when the location is unknown', () => {
      // A browser rarely knows the visitor's state. Guessing wrong in the
      // permissive direction is a statutory penalty, so unknown means strict.
      for (const input of [undefined, null, '', '  ', 'not-a-state', 'US-']) {
        const policy = service.getPolicy(input as any);
        expect(policy.consentRequirement).toBe('explicit_opt_in');
        expect(policy.region).toBe('US-UNKNOWN');
      }
    });

    it('always requires AI disclosure regardless of state', () => {
      for (const state of ['CA', 'NY', 'TX', undefined]) {
        expect(service.getPolicy(state as any).aiDisclosureRequired).toBe(true);
      }
    });

    it('carries the Texas 30-second disclosure deadline', () => {
      expect(service.getPolicy('TX').mustDiscloseWithinSeconds).toBe(30);
      expect(service.getPolicy('CA').mustDiscloseWithinSeconds).toBeNull();
    });

    it('normalizes case and the US- prefix', () => {
      expect(service.getPolicy('ca').region).toBe('US-CA');
      expect(service.getPolicy('US-CA').region).toBe('US-CA');
      expect(service.getPolicy(' Ca ').region).toBe('US-CA');
    });

    it('states that the caller is an AI in every disclosure', () => {
      for (const state of ['CA', 'NY', undefined]) {
        expect(service.getPolicy(state as any).disclosureText).toMatch(/\bAI\b/);
      }
    });
  });

  describe('capture gating', () => {
    it('blocks capture in opt-in states until consent is granted', () => {
      const policy = service.getPolicy('CA');
      expect(service.mayCapture(policy, false)).toBe(false);
      expect(service.mayCapture(policy, true)).toBe(true);
    });

    it('allows capture after disclosure in one-party states', () => {
      const policy = service.getPolicy('NY');
      expect(service.mayCapture(policy, false)).toBe(true);
    });
  });

  describe('greeting disclosure', () => {
    it('speaks the disclosure before the greeting', () => {
      const policy = service.getPolicy('CA');
      const greeting = service.applyDisclosureToGreeting('How can I help?', policy);
      expect(greeting.startsWith(policy.disclosureText)).toBe(true);
      expect(greeting).toContain('How can I help?');
    });

    it('does not stack the disclosure when applied twice', () => {
      const policy = service.getPolicy('CA');
      const once = service.applyDisclosureToGreeting('Hello.', policy);
      const twice = service.applyDisclosureToGreeting(once, policy);
      expect(twice).toBe(once);
    });
  });

  describe('consent records', () => {
    it('records a granted consent with a timestamp', () => {
      const record = service.recordConsent({
        sessionId: 'sess_1',
        companyName: 'Acme',
        stateCode: 'CA',
        consentGranted: true
      });

      expect(record.consentMethod).toBe('explicit_opt_in');
      expect(record.consentGrantedAt).not.toBeNull();
      expect(new Date(record.consentGrantedAt as string).toISOString()).toBe(record.consentGrantedAt);
      expect(record.disclosureText).toBe(service.getPolicy('CA').disclosureText);
    });

    it('leaves consentGrantedAt null when consent was not given', () => {
      const record = service.recordConsent({
        sessionId: 'sess_2',
        companyName: 'Acme',
        stateCode: 'NY',
        consentGranted: false
      });
      expect(record.consentGrantedAt).toBeNull();
    });

    it('filters the log by company', () => {
      service.recordConsent({ sessionId: 's1', companyName: 'Acme', stateCode: 'NY', consentGranted: true });
      service.recordConsent({ sessionId: 's2', companyName: 'Globex', stateCode: 'NY', consentGranted: true });

      expect(service.getConsentLog('Acme')).toHaveLength(1);
      expect(service.getConsentLog('Acme')[0].companyName).toBe('Acme');
      expect(service.getConsentLog()).toHaveLength(2);
    });
  });
});
