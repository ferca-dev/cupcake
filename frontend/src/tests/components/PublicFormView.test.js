import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

import PublicFormView from '../../views/public/PublicFormView.vue';
import { setAuthProvider } from '../../services/apiClient.js';

enableAutoUnmount(afterEach);

const buildJsonResponse = (body, init = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

const publishedFormPayload = ({
  status = 'published',
  acceptingResponses = true,
  antiAbuse = null,
} = {}) => ({
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
        antiAbuse: antiAbuse ?? {
          captcha: { required: false, provider: 'none', siteKey: null },
          honeypot: { enabled: true, fieldName: 'website_url' },
          minFillSeconds: 0,
        },
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
    attachTo: document.body,
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
  document.body.innerHTML = '';
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
    expect(document.activeElement.id).toBe('public-field-field_name');
    expect(wrapper.get('button[type="submit"]').attributes('disabled')).toBeUndefined();
    await wrapper.find('[data-field-id="field_name"] input').setValue('Marina');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(document.activeElement.id).toBe('public-field-field_email');
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
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
  });

  it('focuses a field rejected by the server and allows correcting it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url, init) => {
        if (init?.method === 'POST')
          return buildJsonResponse(
            {
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: 'Review your response.',
                details: [
                  {
                    path: ['answers', 'field_email'],
                    message: 'Please use a different email address.',
                  },
                ],
              },
            },
            { status: 422 },
          );
        return buildJsonResponse(publishedFormPayload());
      }),
    );
    const wrapper = await mountForm(buildRouter());
    await wrapper.find('[data-field-id="field_name"] input').setValue('Marina');
    await wrapper.find('[data-field-id="field_email"] input').setValue('marina@example.com');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(document.activeElement.id).toBe('public-field-field_email');
    expect(wrapper.get('[data-field-id="field_email"]').text()).toContain(
      'Please use a different email address.',
    );
    expect(wrapper.get('fieldset').attributes('disabled')).toBeUndefined();
    await wrapper.find('[data-field-id="field_email"] input').setValue('marina.rivera@example.com');
    expect(wrapper.find('.survey-fields__errors').exists()).toBe(false);
    expect(wrapper.text()).not.toMatch(/fix the highlighted/i);
  });

  it('renders an accessible honeypot input that real respondents can ignore', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => buildJsonResponse(publishedFormPayload())),
    );
    const router = buildRouter();
    const wrapper = await mountForm(router);

    const honeypot = wrapper.find('[data-testid="public-form-honeypot"]');
    expect(honeypot.exists()).toBe(true);
    // The wrapper must be hidden from assistive tech so screen-reader users
    // are not asked to fill the trap.
    expect(honeypot.attributes('aria-hidden')).toBe('true');
    const honeypotInput = honeypot.find('input');
    expect(honeypotInput.attributes('tabindex')).toBe('-1');
    expect(honeypotInput.attributes('autocomplete')).toBe('off');
  });

  it('sends an empty honeypot value alongside the submission', async () => {
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

    const submitCall = calls.find((call) => call.method === 'POST');
    const body = JSON.parse(submitCall.body);
    expect(body.honeypot).toEqual({ website_url: '' });
  });

  it('does not mount the CAPTCHA widget when the survey does not require it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => buildJsonResponse(publishedFormPayload())),
    );
    const router = buildRouter();
    const wrapper = await mountForm(router);

    expect(wrapper.find('[data-testid="public-form-captcha"]').exists()).toBe(false);
  });

  it('mounts the CAPTCHA widget when the survey opts in and a site key is provided', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        buildJsonResponse(
          publishedFormPayload({
            antiAbuse: {
              captcha: { required: true, provider: 'turnstile', siteKey: 'pub-key' },
              honeypot: { enabled: true, fieldName: 'website_url' },
              minFillSeconds: 0,
            },
          }),
        ),
      ),
    );
    const router = buildRouter();
    const wrapper = await mountForm(router);

    expect(wrapper.find('[data-testid="public-form-captcha"]').exists()).toBe(true);
  });

  it('blocks submission when the CAPTCHA token is missing', async () => {
    const fetchMock = vi.fn(async () =>
      buildJsonResponse(
        publishedFormPayload({
          antiAbuse: {
            captcha: { required: true, provider: 'turnstile', siteKey: 'pub-key' },
            honeypot: { enabled: true, fieldName: 'website_url' },
            minFillSeconds: 0,
          },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const router = buildRouter();
    const wrapper = await mountForm(router);

    await wrapper.find('[data-field-id="field_name"] input').setValue('Ada');
    await wrapper.find('[data-field-id="field_email"] input').setValue('ada@example.com');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.text()).toMatch(/security challenge/i);
    // Only the initial GET should have fired — no POST happens without a CAPTCHA token.
    const submitCall = fetchMock.mock.calls.find((args) => args[1]?.method === 'POST');
    expect(submitCall).toBeUndefined();
  });

  it('prevents duplicate submissions and editing while the response is sending', async () => {
    let finish;
    const fetchMock = vi.fn(async (_url, init) => {
      if (init?.method === 'POST')
        return new Promise((resolve) => {
          finish = resolve;
        });
      return buildJsonResponse(publishedFormPayload());
    });
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = await mountForm(buildRouter());
    await wrapper.find('[data-field-id="field_name"] input').setValue('Marina');
    await wrapper.find('[data-field-id="field_email"] input').setValue('marina@example.com');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    await wrapper.find('form').trigger('submit');
    expect(fetchMock.mock.calls.filter((args) => args[1]?.method === 'POST')).toHaveLength(1);
    expect(wrapper.get('fieldset').attributes('disabled')).toBeDefined();
    finish(buildJsonResponse({ success: true, data: { response: { id: 'response-2' } } }));
    await flushPromises();
    expect(wrapper.find('form').exists()).toBe(false);
    wrapper.unmount();
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
