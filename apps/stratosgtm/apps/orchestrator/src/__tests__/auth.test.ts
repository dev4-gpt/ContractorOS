import { Request, Response } from 'express';
import { requireOwnerKey } from '../middleware/auth';

function mockReqRes(authHeader?: string) {
  const req = { header: (name: string) => (name.toLowerCase() === 'authorization' ? authHeader : undefined) } as unknown as Request;
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status } as unknown as Response;
  const next = jest.fn();
  return { req, res, next, status, json };
}

describe('requireOwnerKey', () => {
  const original = process.env.ORCHESTRATOR_API_KEY;
  const originalEnv = process.env.NODE_ENV;
  afterEach(() => {
    process.env.ORCHESTRATOR_API_KEY = original;
    process.env.NODE_ENV = originalEnv;
  });

  it('fails closed with 503 in production when no key is configured', () => {
    delete process.env.ORCHESTRATOR_API_KEY;
    process.env.NODE_ENV = 'production';
    const { req, res, next, status, json } = mockReqRes();
    requireOwnerKey(req, res, next);
    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      error: 'Owner access is not configured on this server.',
      code: 'ADMIN_UNCONFIGURED'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('stays open outside production when no key is configured (local demo mode)', () => {
    delete process.env.ORCHESTRATOR_API_KEY;
    process.env.NODE_ENV = 'test';
    const { req, res, next, status } = mockReqRes();
    requireOwnerKey(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });

  it('rejects with 401 when a key is configured and missing/wrong', () => {
    process.env.ORCHESTRATOR_API_KEY = 'secret123';
    const { req, res, next, status, json } = mockReqRes('Bearer wrong');
    requireOwnerKey(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects with 401 when a key is configured and no header is sent', () => {
    process.env.ORCHESTRATOR_API_KEY = 'secret123';
    const { req, res, next, status, json } = mockReqRes();
    requireOwnerKey(req, res, next);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'Unauthorized' });
    expect(next).not.toHaveBeenCalled();
  });

  it('passes through when the correct bearer key is provided', () => {
    process.env.ORCHESTRATOR_API_KEY = 'secret123';
    const { req, res, next, status } = mockReqRes('Bearer secret123');
    requireOwnerKey(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(status).not.toHaveBeenCalled();
  });
});
