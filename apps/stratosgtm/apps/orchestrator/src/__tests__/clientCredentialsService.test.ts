import { ClientCredentialsService } from '../services/clientCredentialsService';

describe('ClientCredentialsService masking', () => {
  const service = new ClientCredentialsService();

  it('never leaks raw secret values in getMaskedCredentials output', () => {
    const masked = service.getMaskedCredentials('Acme Coaching Co.');
    const raw = service.getRawPlatformSecrets('Acme Coaching Co.', 'twitter');
    expect(raw).not.toBeNull();

    const serialized = JSON.stringify(masked);
    for (const value of Object.values(raw!.secrets)) {
      expect(serialized).not.toContain(value);
    }
  });

  it('masks each configured secret field for a platform', () => {
    const masked = service.getMaskedCredentials('Acme Coaching Co.');
    const twitter = masked.platforms.find((p: any) => p.platform === 'twitter')!;
    expect(twitter).toBeDefined();
    expect(twitter.hasSecrets).toBe(true);
    for (const maskedValue of Object.values(twitter.maskedFields)) {
      expect(maskedValue as string).toMatch(/•/);
    }
  });

  it('creates a fresh, credential-less record for an unknown client', () => {
    const masked = service.getMaskedCredentials('Some_Brand_New_Client_' + Date.now());
    expect(masked.platforms.every((p: any) => !p.hasSecrets && p.status === 'unconfigured')).toBe(true);
  });
});
