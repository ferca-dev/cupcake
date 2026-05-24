import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import DashboardLayout from '../../layouts/DashboardLayout.vue';
import { useAuthStore } from '../../stores/auth.store.js';

const Empty = { template: '<div />' };

const buildRouter = () => {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/app',
        component: DashboardLayout,
        name: 'shell',
        children: [
          { path: '', name: 'dashboard.home', component: Empty },
          { path: 'surveys', name: 'surveys.list', component: Empty },
          { path: 'surveyor/surveys', name: 'surveyor.surveys', component: Empty },
          {
            path: 'surveys/:id/edit',
            name: 'surveys.builder',
            component: Empty,
            meta: { layout: 'full' },
          },
          { path: 'templates', name: 'templates.list', component: Empty },
          { path: 'contacts', name: 'contacts.list', component: Empty },
          { path: 'contact-groups', name: 'contact-groups.list', component: Empty },
          { path: 'suppression-list', name: 'suppression.list', component: Empty },
          { path: 'campaigns', name: 'campaigns.list', component: Empty },
          { path: 'billing/transactions', name: 'billing.transactions', component: Empty },
          { path: 'billing/tokens', name: 'billing.tokens', component: Empty },
          { path: 'billing/buy-tokens', name: 'billing.buyTokens', component: Empty },
          { path: 'billing/subscriptions', name: 'billing.subscriptions', component: Empty },
          {
            path: 'settings',
            name: 'settings.account',
            component: Empty,
            meta: { layout: 'reading' },
          },
          { path: 'team', name: 'team.manage', component: Empty },
          { path: 'developer', name: 'developer.home', component: Empty },
          { path: 'admin', name: 'admin.home', component: Empty },
          { path: 'admin/tenants', name: 'admin.tenants.list', component: Empty },
          {
            path: 'admin/tenants/new',
            name: 'admin.tenants.create',
            component: Empty,
            meta: { layout: 'reading' },
          },
          { path: 'admin/tokens', name: 'admin.tokens', component: Empty },
          { path: 'admin/payments', name: 'admin.payments', component: Empty },
          { path: 'admin/plans', name: 'admin.plans', component: Empty },
          { path: 'billing/plan', name: 'billing.plan', component: Empty },
        ],
      },
      { path: '/auth/login', name: 'auth.login', component: Empty },
    ],
  });
  return router;
};

const seedAuthStore = ({ role = 'client_admin', permissions = [], isSuperAdmin = false } = {}) => {
  const auth = useAuthStore();
  auth.user = { id: 'user-1', name: 'Test User', email: 'test@example.com', role };
  auth.tenant = { id: 'tenant-1', name: 'Test Workspace' };
  auth.permissions = permissions;
  auth.accessToken = 'token';
  auth.refreshToken = 'refresh';
  auth.isSuperAdmin = isSuperAdmin;
  auth.isInitialized = true;
  return auth;
};

let mediaState = { matches: true };

const installMatchMedia = () => {
  vi.stubGlobal('matchMedia', (query) => {
    const listeners = new Set();
    return {
      get matches() {
        return mediaState.matches;
      },
      media: query,
      addEventListener: (event, listener) => {
        if (event === 'change') listeners.add(listener);
      },
      removeEventListener: (event, listener) => {
        if (event === 'change') listeners.delete(listener);
      },
      addListener: (listener) => listeners.add(listener),
      removeListener: (listener) => listeners.delete(listener),
      dispatchEvent: () => false,
    };
  });
};

const STORAGE_KEY = 'cupcake.layout.sidebarCollapsed';

const mountLayout = async (router, { permissions } = {}) => {
  installMatchMedia();
  if (!router.hasRoute('shell')) router.addRoute(buildRouter().options.routes[0]);
  await router.push('/app');
  await router.isReady();
  seedAuthStore({ permissions });
  return mount(DashboardLayout, {
    global: {
      plugins: [router],
      stubs: { RouterView: true },
    },
  });
};

describe('DashboardLayout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mediaState = { matches: true };
    window.matchMedia =
      window.matchMedia ||
      (() => ({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the topbar with the workspace brand and user info', async () => {
    const router = buildRouter();
    const wrapper = await mountLayout(router);
    const topbar = wrapper.find('.dashboard-layout__topbar');
    expect(topbar.exists()).toBe(true);
    expect(topbar.text()).toContain('Test User');
    // Collapse toggle should sit in the topbar so the sticky bar stays usable.
    expect(topbar.find('.dashboard-layout__collapse-toggle').exists()).toBe(true);
  });

  it('toggles sidebar collapsed state and persists it to localStorage', async () => {
    const router = buildRouter();
    const wrapper = await mountLayout(router);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(wrapper.classes()).not.toContain('dashboard-layout--collapsed');

    await wrapper.find('.dashboard-layout__collapse-toggle').trigger('click');

    expect(wrapper.classes()).toContain('dashboard-layout--collapsed');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true');

    await wrapper.find('.dashboard-layout__collapse-toggle').trigger('click');

    expect(wrapper.classes()).not.toContain('dashboard-layout--collapsed');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('restores the collapsed state from localStorage on mount', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'true');
    const router = buildRouter();
    const wrapper = await mountLayout(router);
    expect(wrapper.classes()).toContain('dashboard-layout--collapsed');
  });

  it('shows admin links only for super admin users', async () => {
    setActivePinia(createPinia());
    const router = buildRouter();
    installMatchMedia();
    await router.push('/app');
    await router.isReady();
    seedAuthStore({ role: 'super_admin', isSuperAdmin: true });
    const wrapper = mount(DashboardLayout, {
      global: { plugins: [router], stubs: { RouterView: true } },
    });
    expect(wrapper.text()).toContain('Admin panel');
  });

  describe('centered fill-width shell', () => {
    it('renders content inside an .app-page shell with the default cap on standard routes', async () => {
      const router = buildRouter();
      const wrapper = await mountLayout(router);
      const shell = wrapper.find('.dashboard-layout__shell');
      expect(shell.exists()).toBe(true);
      expect(shell.classes()).toContain('app-page');
      expect(shell.classes()).not.toContain('app-page--full');
      expect(shell.classes()).not.toContain('app-page--reading');
      expect(shell.classes()).not.toContain('app-page--narrow');
      expect(wrapper.find('.dashboard-layout__main').attributes('data-layout')).toBe('default');
    });

    it('switches the shell to full-bleed when the route opts in to layout=full', async () => {
      const router = buildRouter();
      installMatchMedia();
      await router.push('/app/surveys/abc/edit');
      await router.isReady();
      setActivePinia(createPinia());
      seedAuthStore();
      const wrapper = mount(DashboardLayout, {
        global: { plugins: [router], stubs: { RouterView: true } },
      });
      const shell = wrapper.find('.dashboard-layout__shell');
      expect(shell.classes()).toContain('app-page');
      expect(shell.classes()).toContain('app-page--full');
      expect(wrapper.find('.dashboard-layout__main').attributes('data-layout')).toBe('full');
    });

    it('switches the shell to reading width on settings-style routes', async () => {
      const router = buildRouter();
      installMatchMedia();
      await router.push('/app/settings');
      await router.isReady();
      setActivePinia(createPinia());
      seedAuthStore();
      const wrapper = mount(DashboardLayout, {
        global: { plugins: [router], stubs: { RouterView: true } },
      });
      const shell = wrapper.find('.dashboard-layout__shell');
      expect(shell.classes()).toContain('app-page--reading');
      expect(wrapper.find('.dashboard-layout__main').attributes('data-layout')).toBe('reading');
    });

    it('falls back to the default shell when the route declares an unknown layout', async () => {
      const router = buildRouter();
      router.addRoute('shell', {
        path: 'mystery',
        name: 'mystery',
        component: Empty,
        meta: { layout: 'made-up-mode' },
      });
      installMatchMedia();
      await router.push('/app/mystery');
      await router.isReady();
      setActivePinia(createPinia());
      seedAuthStore();
      const wrapper = mount(DashboardLayout, {
        global: { plugins: [router], stubs: { RouterView: true } },
      });
      const shell = wrapper.find('.dashboard-layout__shell');
      expect(shell.classes()).toContain('app-page');
      expect(shell.classes()).not.toContain('app-page--full');
      expect(shell.classes()).not.toContain('app-page--reading');
      expect(shell.classes()).not.toContain('app-page--narrow');
      expect(wrapper.find('.dashboard-layout__main').attributes('data-layout')).toBe('default');
    });
  });
});
