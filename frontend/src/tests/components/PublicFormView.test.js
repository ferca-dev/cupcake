import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

import PublicFormView from '../../views/public/PublicFormView.vue';
import { setAuthProvider } from '../../services/apiClient.js';

const buildJsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const publishedFormPayload = ({ status = 'published', acceptingResponses = true } = {}) => ({
  success: true,
  data: {
    survey: {
      id: 'survey-1',
      slug: 'feedback',
      title: 'Feedback',
      description: 'Tell us how it went',
      status,
      settings: {
        allowAnonymous: true,
        thankYouMessage: 'Thanks a lot!',
        pausedMessage: 'On break.',
        collectIp: false,
      },
    },
    version: {
      id: 'version-1',
      versionNumber: 1,
      schema: {
        fields: [
          {
            id: 'field_name',
            type: 'short_text',
            key: 'name',
            label: 'Your name',
            required: true,
            options: [],
            validation: {},
          },
          {
            id: 'field_email',
            type: 'email',
            key: 'email',
            label: 'Your email',
            required: true,
            options: [],
            validation: {},
          },
        ],
        sections: [],
        logicRules: [],
        layout: { mode: 'single_page', showProgress: true },
      },
    },
    acceptingResponses,
    pausedMessage: status === 'paused' ? 'On break.' : null,
  },
  message: 'Public form fetched',
});

const buildRouter = () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/f/:slug', name: 'public.form', component: PublicFormView }],
  });
  return router;
};

const mountForm = async (router) => {
  await router.push('/f/feedback');
  await router.isReady();
  const wrapper = mount(PublicFormView, {
    global: { plugins: [router] },
  });
  await flushPromises();
  return wrapper;
};

beforeEach(() => {
  setAuthProvider(null);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('PublicFormView', () => {
  it('loads the form and renders fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => buildJsonResponse(publishedFormPayload())),
    );

    const router = buildRouter();
    const wrapper = await mountForm(router);
    expect(wrapper.text()).toContain('Feedback');
    expect(wrapper.findAll('[data-field-id]')).toHaveLength(2);
  });

  it('shows a validation error when a required field is empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => buildJsonResponse(publishedFormPayload())),
    );
    const router = buildRouter();
    const wrapper = await mountForm(router);

    await wrapper.find('form').trigger('submit');
    await flushPromises();

    const nameField = wrapper.find('[data-field-id="field_name"]');
    expect(nameField.text()).toMatch(/required/i);
    expect(wrapper.text()).toMatch(/fix the highlighted/i);
  });

  it('submits a valid payload and switches to the thank-you state', async () => {
    const calls = [];
    const fetchMock = vi.fn(async (url, init) => {
      calls.push({ url: url.toString(), method: init?.method ?? 'GET', body: init?.body });
      if (init?.method === 'POST') {
        return buildJsonResponse({
          success: true,
          data: {
            response: {
              id: 'response-1',
              surveyId: 'survey-1',
              surveyVersionId: 'version-1',
              submittedAt: new Date().toISOString(),
              thankYouMessage: 'Thanks a lot!',
            },
          },
        });
      }
      return buildJsonResponse(publishedFormPayload());
    });
    vi.stubGlobal('fetch', fetchMock);

    const router = buildRouter();
    const wrapper = await mountForm(router);

    await wrapper.find('[data-field-id="field_name"] input').setValue('Ada');
    await wrapper.find('[data-field-id="field_email"] input').setValue('ada@example.com');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toMatch(/thanks for your response/i);
    expect(wrapper.text()).toContain('Thanks a lot!');

    const submitCall = calls.find((call) => call.method === 'POST');
    expect(submitCall).toBeTruthy();
    const body = JSON.parse(submitCall.body);
    expect(body.answers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: 'field_name', value: 'Ada' }),
        expect.objectContaining({ fieldId: 'field_email', value: 'ada@example.com' }),
      ]),
    );
  });

  it('renders the paused message and blocks submission when paused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        buildJsonResponse(publishedFormPayload({ status: 'paused', acceptingResponses: false })),
      ),
    );

    const router = buildRouter();
    const wrapper = await mountForm(router);

    expect(wrapper.text()).toMatch(/on break/i);
    const submitButton = wrapper.find('button[type="submit"]');
    expect(submitButton.attributes('disabled')).toBeDefined();
  });

  it('renders a not-found message when the API returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        buildJsonResponse(
          { success: false, error: { code: 'NOT_FOUND', message: 'Survey not found' } },
          { status: 404 },
        ),
      ),
    );
    const router = buildRouter();
    const wrapper = await mountForm(router);
    expect(wrapper.text()).toMatch(/no longer available|not found/i);
  });
});
