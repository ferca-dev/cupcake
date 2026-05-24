import { defineStore } from 'pinia';

import { contactService, contactGroupService } from '../services/contact.service.js';

const DEFAULT_FILTERS = Object.freeze({
  search: '',
  status: '',
  channel: '',
  tag: '',
  groupId: '',
  sort: '-updatedAt',
});

const DEFAULT_PAGINATION = Object.freeze({
  page: 1,
  limit: 20,
  total: 0,
  totalPages: 1,
});

const saveDownload = ({ blob, filename }) => {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename || 'download';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const cleanQuery = (filters, pagination) => {
  const params = {
    page: pagination.page,
    limit: pagination.limit,
    sort: filters.sort,
  };
  for (const key of ['search', 'status', 'channel', 'tag', 'groupId']) {
    if (filters[key]) params[key] = filters[key];
  }
  return params;
};

export const useContactsStore = defineStore('contacts', {
  state: () => ({
    contacts: [],
    groups: [],
    filters: { ...DEFAULT_FILTERS },
    pagination: { ...DEFAULT_PAGINATION },
    isLoadingContacts: false,
    isLoadingGroups: false,
    isImportingContacts: false,
    isExportingContacts: false,
    importJob: null,
    lastError: null,
  }),

  getters: {
    groupById: (state) => (id) => state.groups.find((group) => group.id === id) ?? null,
    activeGroups: (state) => state.groups.filter((group) => group.status === 'active'),
  },

  actions: {
    resetFilters() {
      this.filters = { ...DEFAULT_FILTERS };
      this.pagination = { ...DEFAULT_PAGINATION };
    },

    setFilters(partial) {
      this.filters = { ...this.filters, ...partial };
      this.pagination = { ...this.pagination, page: 1 };
    },

    setPage(page) {
      this.pagination = { ...this.pagination, page };
    },

    async fetchContacts() {
      this.isLoadingContacts = true;
      this.lastError = null;
      try {
        const data = await contactService.list(cleanQuery(this.filters, this.pagination));
        this.contacts = data?.items ?? [];
        this.pagination = {
          page: data?.pagination?.page ?? this.pagination.page,
          limit: data?.pagination?.limit ?? this.pagination.limit,
          total: data?.pagination?.total ?? this.contacts.length,
          totalPages: data?.pagination?.totalPages ?? 1,
        };
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to load contacts';
        throw err;
      } finally {
        this.isLoadingContacts = false;
      }
    },

    async fetchGroups() {
      this.isLoadingGroups = true;
      try {
        const data = await contactGroupService.list({ limit: 100, sort: 'name' });
        this.groups = data?.items ?? [];
      } finally {
        this.isLoadingGroups = false;
      }
    },

    async createContact(payload) {
      const data = await contactService.create(payload);
      if (data?.contact) {
        this.contacts = [data.contact, ...this.contacts];
      }
      return data?.contact ?? null;
    },

    async updateContact(id, payload) {
      const data = await contactService.update(id, payload);
      if (data?.contact) {
        this.contacts = this.contacts.map((c) => (c.id === id ? data.contact : c));
      }
      return data?.contact ?? null;
    },

    async updateContactConsent(id, payload) {
      const data = await contactService.updateConsent(id, payload);
      if (data?.contact) {
        this.contacts = this.contacts.map((c) => (c.id === id ? data.contact : c));
      }
      return data?.contact ?? null;
    },

    async archiveContact(id) {
      const data = await contactService.remove(id);
      // The contact stays in the list with status: archived so the filter
      // toggle can surface it again without a refetch.
      this.contacts = this.contacts.map((c) => (c.id === id ? { ...c, status: 'archived' } : c));
      return data;
    },

    async deleteContactHard(id) {
      await contactService.remove(id, { hard: true });
      this.contacts = this.contacts.filter((c) => c.id !== id);
    },

    async uploadContactImport(file) {
      this.isImportingContacts = true;
      this.lastError = null;
      try {
        const data = await contactService.createImport(file);
        this.importJob = data?.job ?? null;
        return this.importJob;
      } catch (err) {
        this.lastError = err?.message ?? 'Unable to upload contact import';
        throw err;
      } finally {
        this.isImportingContacts = false;
      }
    },

    async saveContactImportMapping(id, payload) {
      const data = await contactService.updateImportMapping(id, payload);
      this.importJob = data?.job ?? this.importJob;
      return this.importJob;
    },

    async confirmContactImport(id) {
      this.isImportingContacts = true;
      try {
        const data = await contactService.confirmImport(id);
        this.importJob = data?.job ?? this.importJob;
        await this.fetchContacts();
        return this.importJob;
      } finally {
        this.isImportingContacts = false;
      }
    },

    async downloadContactImportErrors(id) {
      const download = await contactService.downloadImportErrors(id);
      saveDownload(download);
      return download;
    },

    async downloadContacts(format = 'csv') {
      this.isExportingContacts = true;
      try {
        const download = await contactService.exportContacts({
          ...cleanQuery(this.filters, { ...this.pagination, page: 1, limit: 50000 }),
          format,
          limit: 50000,
        });
        saveDownload(download);
        return download;
      } finally {
        this.isExportingContacts = false;
      }
    },

    async createGroup(payload) {
      const data = await contactGroupService.create(payload);
      if (data?.group) {
        this.groups = [...this.groups, data.group].sort((a, b) => a.name.localeCompare(b.name));
      }
      return data?.group ?? null;
    },

    async updateGroup(id, payload) {
      const data = await contactGroupService.update(id, payload);
      if (data?.group) {
        this.groups = this.groups
          .map((g) => (g.id === id ? data.group : g))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
      return data?.group ?? null;
    },

    async deleteGroup(id) {
      await contactGroupService.remove(id);
      this.groups = this.groups.filter((g) => g.id !== id);
      // Remove the deleted group from any locally cached contact membership.
      this.contacts = this.contacts.map((c) =>
        c.groupIds?.includes(id)
          ? { ...c, groupIds: c.groupIds.filter((groupId) => groupId !== id) }
          : c,
      );
    },

    async addContactToGroup(groupId, contactId) {
      const data = await contactGroupService.addContact(groupId, contactId);
      if (data?.group) {
        this.groups = this.groups.map((g) => (g.id === groupId ? data.group : g));
      }
      if (data?.contact) {
        this.contacts = this.contacts.map((c) => (c.id === contactId ? data.contact : c));
      }
      return data;
    },

    async removeContactFromGroup(groupId, contactId) {
      const data = await contactGroupService.removeContact(groupId, contactId);
      if (data?.group) {
        this.groups = this.groups.map((g) => (g.id === groupId ? data.group : g));
      }
      if (data?.contact) {
        this.contacts = this.contacts.map((c) => (c.id === contactId ? data.contact : c));
      }
      return data;
    },
  },
});
