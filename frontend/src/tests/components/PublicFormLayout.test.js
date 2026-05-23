import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

import PublicFormLayout from '../../layouts/PublicFormLayout.vue';

const Empty = { template: '<div class="public-form-stub" />' };

const buildRouter = () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/f',
        component: PublicFormLayout,
        children: [{ path: ':slug', name: 'public.form', component: Empty }],
      },
    ],
  });
  return router;
};

describe('PublicFormLayout centered fill-width shell', () => {
  it('renders the inner shell with the .app-page--narrow modifier so public forms stay centered', async () => {
    const router = buildRouter();
    await router.push('/f/demo');
    await router.isReady();
    const wrapper = mount(PublicFormLayout, {
      global: { plugins: [router], stubs: { RouterView: true } },
    });
    const shell = wrapper.find('.public-form-layout__shell');
    expect(shell.exists()).toBe(true);
    expect(shell.classes()).toContain('app-page');
    expect(shell.classes()).toContain('app-page--narrow');
    // The layout must not opt back into a left-aligned or full-bleed width;
    // a regression here would mean public forms grow to the entire viewport
    // on large desktops.
    expect(shell.classes()).not.toContain('app-page--full');
  });
});
