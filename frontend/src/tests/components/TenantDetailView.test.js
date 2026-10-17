import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import TenantDetailView from '../../views/admin/TenantDetailView.vue';
import { adminService } from '../../services/admin.service.js';

vi.mock('../../services/admin.service.js', () => ({
  adminService: {
    getTenant: vi.fn(),
    listTenantUsers: vi.fn(),
    listTenantInvitations: vi.fn(),
    updateTenant: vi.fn(),
  },
}));

let wrapper;
let savedTenant;
const mountDetail = async () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/admin/tenants/:id', component: TenantDetailView }],
  });
  await router.push('/admin/tenants/sierra');
  await router.isReady();
  wrapper = mount(TenantDetailView, { global: { plugins: [createPinia(), router] } });
  await flushPromises();
};
beforeEach(() => {
  vi.resetAllMocks();
  savedTenant = {
    id: 'sierra',
    name: 'Servicios Sierra',
    slug: 'servicios-sierra',
    status: 'active',
    settings: {
      timezone: 'America/Monterrey',
      locale: 'es-MX',
      branding: { primaryColor: '#14532d' },
    },
  };
  adminService.getTenant.mockImplementation(async () => ({ tenant: structuredClone(savedTenant) }));
  adminService.listTenantUsers.mockResolvedValue({ items: [] });
  adminService.listTenantInvitations.mockResolvedValue({ items: [] });
  adminService.updateTenant.mockImplementation(async (_id, payload) => {
    savedTenant.settings = { ...savedTenant.settings, ...payload.settings };
    return { tenant: structuredClone(savedTenant) };
  });
});
afterEach(() => wrapper?.unmount());

describe('admin public survey footer setting', () => {
  it('preserves existing clients until an explicit choice is saved', async () => {
    await mountDetail();
    expect(wrapper.get('#tenant-powered-by').element.value).toBe('default');
    await wrapper.get('form').trigger('submit');
    expect(adminService.updateTenant).not.toHaveBeenCalled();
  });

  it('saves hide, show, and default and restores each selection after reloading', async () => {
    await mountDetail();
    for (const [choice, value] of [
      ['hide', false],
      ['show', true],
      ['default', null],
    ]) {
      await wrapper.get('#tenant-powered-by').setValue(choice);
      await wrapper.get('form').trigger('submit');
      await flushPromises();
      expect(adminService.updateTenant).toHaveBeenLastCalledWith('sierra', {
        settings: { publicFormPoweredBy: value },
      });
      expect(savedTenant.settings.branding.primaryColor).toBe('#14532d');
      wrapper.unmount();
      await mountDetail();
      expect(wrapper.get('#tenant-powered-by').element.value).toBe(choice);
    }
  });

  it('keeps the pending choice and shows an error when saving fails', async () => {
    await mountDetail();
    adminService.updateTenant.mockRejectedValueOnce(new Error('Unable to save changes.'));
    await wrapper.get('#tenant-powered-by').setValue('hide');
    await wrapper.get('form').trigger('submit');
    await flushPromises();
    expect(wrapper.text()).toContain('Unable to save changes.');
    expect(wrapper.get('#tenant-powered-by').element.value).toBe('hide');
    expect(savedTenant.settings.publicFormPoweredBy).toBeUndefined();
  });
});
