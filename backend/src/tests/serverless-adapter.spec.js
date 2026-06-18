import { describe, expect, it } from 'vitest';

import { stripVercelRoutingQuery } from '../../api/[...path].js';

describe('Vercel serverless adapter', () => {
  it('strips catch-all route params before Express parses query strings', () => {
    const req = {
      query: {
        path: 'admin/plans',
        limit: '50',
      },
      url: '/api/v1/admin/plans?path=admin%2Fplans&limit=50',
      originalUrl: '/api/v1/admin/plans?path=admin%2Fplans&limit=50',
    };

    stripVercelRoutingQuery(req);

    expect(req.query).toEqual({ limit: '50' });
    expect(req.url).toBe('/api/v1/admin/plans?limit=50');
    expect(req.originalUrl).toBe('/api/v1/admin/plans?limit=50');
  });

  it('keeps normal query strings unchanged', () => {
    const req = {
      query: {
        limit: '50',
        search: 'pro',
      },
      url: '/api/v1/admin/plans?limit=50&search=pro',
      originalUrl: '/api/v1/admin/plans?limit=50&search=pro',
    };

    stripVercelRoutingQuery(req);

    expect(req.query).toEqual({ limit: '50', search: 'pro' });
    expect(req.url).toBe('/api/v1/admin/plans?limit=50&search=pro');
    expect(req.originalUrl).toBe('/api/v1/admin/plans?limit=50&search=pro');
  });
});
