import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

const listMock = vi.fn();

vi.mock('../../services/survey.service.js', () => ({
  surveyService: {
    list: (...args) => listMock(...args),
  },
  publicFormService: {
    get: vi.fn(),
    getByToken: vi.fn(),
    submit: vi.fn(),
  },
}));

import SurveyListView from '../../views/surveys/SurveyListView.vue';
import { PUBLIC_FORM_BASE_URL } from '../../config/env.js';

const Empty = { template: '<div />' };

const buildRouter = () => {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/app/surveys', name: 'surveys.list', component: SurveyListView },
      { path: '/app/surveys/:id/edit', name: 'surveys.builder', component: Empty },
    ],
  });
};

const sampleSurveys = [
  {
    id: 'survey-published',
    title: 'Customer feedback',
    slug: 'customer-feedback',
    status: 'published',
    updatedAt: '2026-04-01T12:00:00.000Z',
  },
  {
    id: 'survey-draft',
    title: 'Internal pulse',
    slug: 'internal-pulse',
    status: 'draft',
    updatedAt: '2026-04-02T12:00:00.000Z',
  },
];

describe('SurveyListView public link action', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    listMock.mockResolvedValue({ items: sampleSurveys });
  });

  afterEach(() => {
    listMock.mockReset();
  });

  it('renders a target=_blank link with rel="noopener noreferrer" for published surveys', async () => {
    const router = buildRouter();
    await router.push('/app/surveys');
    await router.isReady();

    const wrapper = mount(SurveyListView, {
      global: { plugins: [router] },
    });

    await flushPromises();

    const publicLinks = wrapper.findAll('[data-testid="open-public-form"]');
    expect(publicLinks).toHaveLength(1);

    const link = publicLinks[0];
    expect(link.attributes('href')).toBe(`${PUBLIC_FORM_BASE_URL}/f/customer-feedback`);
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
  });

  it('renders an "unavailable" notice for draft surveys with no public URL', async () => {
    const router = buildRouter();
    await router.push('/app/surveys');
    await router.isReady();

    const wrapper = mount(SurveyListView, {
      global: { plugins: [router] },
    });

    await flushPromises();

    const unavailable = wrapper.findAll('[data-testid="public-link-unavailable"]');
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0].text()).toContain('Public link unavailable');
  });
});
