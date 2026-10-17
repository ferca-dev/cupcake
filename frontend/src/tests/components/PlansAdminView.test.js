import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';

import PlansAdminView from '../../views/admin/PlansAdminView.vue';
import { adminPlansService } from '../../services/admin-plans.service.js';
import { setLocale, t } from '../../i18n/index.js';

vi.mock('../../services/admin-plans.service.js', () => ({
  adminPlansService: {
    getCatalogue: vi.fn(),
    listPlans: vi.fn(),
    getPlan: vi.fn(),
    createPlan: vi.fn(),
    updatePlan: vi.fn(),
  },
}));

const catalogue = {
  features: [
    { key: 'surveys.publish', label: 'Publish surveys', description: 'Publish public forms.' },
    { key: 'surveys.exports', label: 'Response exports', description: 'Export responses.' },
  ],
  quotas: [{ key: 'surveys', label: 'Surveys' }],
};

let wrapper;
let savedPlan;

const button = (label, scope = wrapper) => {
  const match = scope.findAll('button').find((item) => item.text() === label);
  expect(match, `Expected button: ${label}`).toBeDefined();
  return match;
};

const featureCheckbox = (label) =>
  wrapper
    .get('[role="dialog"]')
    .findAll('label')
    .find((item) => item.text().includes(label))
    .get('input[type="checkbox"]');

const mountView = async () => {
  wrapper = mount(PlansAdminView, {
    attachTo: document.body,
    global: { stubs: { Teleport: true } },
  });
  await flushPromises();
};

beforeEach(() => {
  vi.resetAllMocks();
  setActivePinia(createPinia());
  setLocale('en');
  savedPlan = {
    id: 'plan-1',
    name: 'Starter',
    code: 'starter',
    description: 'Test plan',
    status: 'active',
    isDefault: false,
    price: { amountMinor: 1000, currency: 'USD', intervalUnit: 'months', intervalCount: 1 },
    features: { 'surveys.publish': true, 'surveys.exports': false },
    quotas: { surveys: 10 },
    sortOrder: 0,
  };
  adminPlansService.getCatalogue.mockResolvedValue(catalogue);
  adminPlansService.listPlans.mockResolvedValue({ items: [savedPlan] });
  adminPlansService.getPlan.mockImplementation(async () => ({ plan: savedPlan }));
  adminPlansService.updatePlan.mockImplementation(async (id, payload) => {
    savedPlan = { id, ...payload };
    return { plan: savedPlan };
  });
});

afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = '';
});

describe('Plan feature administration', () => {
  it('opens the actual editor, saves enabled and disabled features, and reloads them', async () => {
    await mountView();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await button(t('plans.admin.actions.edit')).trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true);
    expect(document.body.style.overflow).toBe('hidden');
    expect(featureCheckbox('Publish surveys').element.checked).toBe(true);
    expect(featureCheckbox('Response exports').element.checked).toBe(false);

    await featureCheckbox('Publish surveys').setValue(false);
    await featureCheckbox('Response exports').setValue(true);
    await button(t('plans.admin.form.save')).trigger('click');
    await flushPromises();

    expect(adminPlansService.updatePlan).toHaveBeenCalledWith(
      'plan-1',
      expect.objectContaining({
        features: { 'surveys.publish': false, 'surveys.exports': true },
        quotas: { surveys: 10 },
      }),
    );
    expect(savedPlan.features).toEqual({ 'surveys.publish': false, 'surveys.exports': true });
    expect(savedPlan.quotas).toEqual({ surveys: 10 });
    expect(savedPlan.price.amountMinor).toBe(1000);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(document.body.style.overflow).toBe('');

    await button(t('plans.admin.actions.edit')).trigger('click');
    await flushPromises();
    expect(featureCheckbox('Publish surveys').element.checked).toBe(false);
    expect(featureCheckbox('Response exports').element.checked).toBe(true);
  });

  it('opens the creation form and discards unsaved feature changes when cancelled', async () => {
    await mountView();
    await button(t('plans.admin.create')).trigger('click');
    expect(wrapper.get('[role="dialog"]').isVisible()).toBe(true);
    await featureCheckbox('Publish surveys').setValue(true);
    await button(t('plans.admin.form.cancel')).trigger('click');

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(adminPlansService.createPlan).not.toHaveBeenCalled();
    await button(t('plans.admin.create')).trigger('click');
    expect(featureCheckbox('Publish surveys').element.checked).toBe(false);
  });

  it('keeps the selected features available for retry when saving fails', async () => {
    await mountView();
    await button(t('plans.admin.actions.edit')).trigger('click');
    await flushPromises();
    await featureCheckbox('Publish surveys').setValue(false);
    adminPlansService.updatePlan.mockRejectedValueOnce(new Error('Unable to save plan'));
    await button(t('plans.admin.form.save')).trigger('click');
    await flushPromises();

    expect(wrapper.get('[role="dialog"]').text()).toContain('Unable to save plan');
    expect(featureCheckbox('Publish surveys').element.checked).toBe(false);
    await button(t('plans.admin.form.save')).trigger('click');
    await flushPromises();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    expect(savedPlan.features['surveys.publish']).toBe(false);
  });

  it('prevents editing before the feature catalogue loads', async () => {
    let resolveCatalogue;
    adminPlansService.getCatalogue.mockReturnValue(
      new Promise((resolve) => {
        resolveCatalogue = resolve;
      }),
    );
    await mountView();
    expect(button(t('plans.admin.create')).element.disabled).toBe(true);
    expect(button(t('plans.admin.actions.edit')).element.disabled).toBe(true);

    resolveCatalogue(catalogue);
    await flushPromises();
    expect(button(t('plans.admin.create')).element.disabled).toBe(false);
    expect(button(t('plans.admin.actions.edit')).element.disabled).toBe(false);
  });

  it('shows catalogue failures without allowing a save with empty feature definitions', async () => {
    adminPlansService.getCatalogue.mockRejectedValueOnce(new Error('Catalogue unavailable'));
    await mountView();
    expect(wrapper.text()).toContain('Catalogue unavailable');
    expect(button(t('plans.admin.create')).element.disabled).toBe(true);
    expect(button(t('plans.admin.actions.edit')).element.disabled).toBe(true);
    expect(adminPlansService.updatePlan).not.toHaveBeenCalled();
  });
});
