import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useContactsStore } from '../stores/contacts.store.js';

const jsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const contactFixture = (overrides = {}) => ({
  id: overrides.id ?? 'contact-1',
  tenantId: 'tenant-1',
  firstName: 'Ada',
  lastName: 'Lovelace',
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: null,
  whatsappPhone: null,
  tags: [],
  groupIds: [],
  metadata: {},
  status: 'active',
  channels: {
    email: { ready: true, reason: null },
    phone: { ready: false, reason: 'missing_phone' },
    whatsapp_phone: { ready: false, reason: 'missing_whatsapp_phone' },
  },
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
  ...overrides,
});

const groupFixture = (overrides = {}) => ({
  id: overrides.id ?? 'group-1',
  tenantId: 'tenant-1',
  name: 'Customers',
  description: null,
  status: 'active',
  contactCount: 0,
  createdAt: '2026-05-20T00:00:00.000Z',
  updatedAt: '2026-05-20T00:00:00.000Z',
  ...overrides,
});

describe('contacts store', () => {
  let fetchMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates contacts and pagination from the API response', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          items: [contactFixture()],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        },
      }),
    );

    const store = useContactsStore();
    await store.fetchContacts();
    expect(store.contacts).toHaveLength(1);
    expect(store.contacts[0].email).toBe('ada@example.com');
    expect(store.pagination.total).toBe(1);
  });

  it('builds a clean query string from filters and pagination', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } },
      }),
    );

    const store = useContactsStore();
    store.setFilters({ search: 'ada', status: 'active', tag: 'vip' });
    await store.fetchContacts();

    const requestUrl = fetchMock.mock.calls[0][0];
    expect(requestUrl).toContain('search=ada');
    expect(requestUrl).toContain('status=active');
    expect(requestUrl).toContain('tag=vip');
    // Empty filters must not be serialised as query parameters.
    expect(requestUrl).not.toContain('channel=');
    expect(requestUrl).not.toContain('groupId=');
  });

  it('prepends a new contact to the local cache on create', async () => {
    const created = contactFixture({ id: 'contact-new' });
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { contact: created } }));
    const store = useContactsStore();
    store.contacts = [contactFixture({ id: 'contact-existing' })];

    const result = await store.createContact({ email: 'new@example.com' });
    expect(result.id).toBe('contact-new');
    expect(store.contacts[0].id).toBe('contact-new');
    expect(store.contacts).toHaveLength(2);
  });

  it('marks a contact as archived on soft-delete', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ success: true, data: { id: 'contact-1', mode: 'soft' } }),
    );
    const store = useContactsStore();
    store.contacts = [contactFixture()];
    await store.archiveContact('contact-1');
    expect(store.contacts[0].status).toBe('archived');
  });

  it('removes a deleted group from cached contact membership', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'group-1' } }));
    const store = useContactsStore();
    store.groups = [groupFixture({ id: 'group-1' })];
    store.contacts = [contactFixture({ id: 'c1', groupIds: ['group-1', 'group-2'] })];

    await store.deleteGroup('group-1');
    expect(store.groups).toHaveLength(0);
    expect(store.contacts[0].groupIds).toEqual(['group-2']);
  });

  it('uploads a contact import as multipart form data', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: {
          job: {
            id: 'import-1',
            status: 'previewed',
            headers: ['email'],
            suggestedMapping: { email: 'email' },
            counts: { totalRows: 1 },
          },
        },
      }),
    );

    const store = useContactsStore();
    const file = new File(['email\nada@example.com'], 'contacts.csv', { type: 'text/csv' });
    const job = await store.uploadContactImport(file);

    expect(job.id).toBe('import-1');
    expect(store.importJob.id).toBe('import-1');
    expect(fetchMock.mock.calls[0][0]).toContain('/contacts/imports');
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
    expect(fetchMock.mock.calls[0][1].body).toBeInstanceOf(FormData);
  });
});
