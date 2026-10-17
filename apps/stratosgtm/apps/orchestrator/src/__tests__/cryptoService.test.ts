describe('cryptoService — envelope encryption for stored credentials', () => {
  const ORIGINAL_KEY = process.env.MASTER_KEY;

  beforeEach(() => {
    process.env.MASTER_KEY = 'test-master-key-for-unit-tests-only';
    jest.resetModules();
  });

  afterAll(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.MASTER_KEY;
    else process.env.MASTER_KEY = ORIGINAL_KEY;
  });

  const load = () => require('../services/cryptoService');

  it('round-trips a secret', () => {
    const { encryptSecret, decryptSecret } = load();
    const secret = 'oauth-token-abc123';
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it('never stores the plaintext in any field', () => {
    const { encryptSecret } = load();
    const secret = 'super-secret-token-value';
    const record = encryptSecret(secret);

    // The whole point: nothing recoverable without the master key.
    for (const value of Object.values(record)) {
      expect(String(value)).not.toContain(secret);
    }
  });

  it('produces different ciphertext for the same input', () => {
    const { encryptSecret } = load();
    // Random IV and DEK per call, so identical secrets must not collide —
    // otherwise equal ciphertexts would leak that two tenants share a token.
    const a = encryptSecret('same-value');
    const b = encryptSecret('same-value');
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.wrappedDek).not.toBe(b.wrappedDek);
  });

  it('round-trips JSON credential blobs', () => {
    const { encryptJson, decryptJson } = load();
    const creds = { apiKey: 'k', apiSecret: 's', accessToken: 't', tokenSecret: 'ts' };
    expect(decryptJson(encryptJson(creds))).toEqual(creds);
  });

  it('fails loudly when the ciphertext has been tampered with', () => {
    const { encryptSecret, decryptSecret } = load();
    const record = encryptSecret('authentic-value');
    const forged = Buffer.from(record.ciphertext, 'base64');
    forged[0] = forged[0] ^ 0xff;

    // GCM authenticates, so a modified payload must throw rather than decrypt
    // to silent garbage that a caller would treat as a real credential.
    expect(() => decryptSecret({ ...record, ciphertext: forged.toString('base64') })).toThrow();
  });

  it('cannot decrypt with a different master key', () => {
    const { encryptSecret } = load();
    const record = encryptSecret('value-under-key-one');

    process.env.MASTER_KEY = 'a-completely-different-master-key';
    jest.resetModules();
    const { decryptSecret } = load();

    expect(() => decryptSecret(record)).toThrow();
  });

  it('reports whether encryption is configured', () => {
    const { isEncryptionConfigured } = load();
    expect(isEncryptionConfigured()).toBe(true);

    delete process.env.MASTER_KEY;
    jest.resetModules();
    expect(load().isEncryptionConfigured()).toBe(false);
  });

  it('refuses to encrypt without a master key rather than storing plaintext', () => {
    delete process.env.MASTER_KEY;
    jest.resetModules();
    const { encryptSecret } = load();
    expect(() => encryptSecret('x')).toThrow(/MASTER_KEY/);
  });
});
