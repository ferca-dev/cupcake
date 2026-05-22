<script setup>
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useAuthStore } from '../stores/auth.store.js';
import { useI18n } from '../i18n/index.js';
import { APP_NAME } from '../config/env.js';
import AppButton from '../components/ui/AppButton.vue';

const STORAGE_KEY = 'cupcake.layout.sidebarCollapsed';
const DESKTOP_QUERY = '(min-width: 769px)';

const auth = useAuthStore();
const router = useRouter();
const { t } = useI18n();

const readPersistedCollapsed = () => {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage?.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const isDesktop = ref(
  typeof window !== 'undefined' ? window.matchMedia(DESKTOP_QUERY).matches : true,
);
const isSidebarCollapsed = ref(readPersistedCollapsed());
const isSidebarOpen = ref(false);

let mediaQuery = null;
const handleMediaChange = (event) => {
  isDesktop.value = event.matches;
  if (event.matches) isSidebarOpen.value = false;
};

onMounted(() => {
  if (typeof window === 'undefined') return;
  mediaQuery = window.matchMedia(DESKTOP_QUERY);
  isDesktop.value = mediaQuery.matches;
  mediaQuery.addEventListener?.('change', handleMediaChange);
});

onBeforeUnmount(() => {
  mediaQuery?.removeEventListener?.('change', handleMediaChange);
});

watch(isSidebarCollapsed, (value) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // Storage may be unavailable in private mode — ignore.
  }
});

const tenantName = computed(() => auth.tenant?.name ?? '');
const userName = computed(() => auth.displayName);
const userRole = computed(() => {
  const role = auth.role;
  if (!role) return '';
  const translated = t(`roles.${role}`);
  return translated === `roles.${role}` ? role.replace('_', ' ') : translated;
});

const toggleMobileSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value;
};

const toggleSidebarCollapse = () => {
  isSidebarCollapsed.value = !isSidebarCollapsed.value;
};

const closeMobileSidebar = () => {
  if (!isDesktop.value) isSidebarOpen.value = false;
};

const handleLogout = async () => {
  await auth.logout();
  router.push({ name: 'auth.login' });
};

const navItems = computed(() => {
  const items = [
    {
      to: { name: 'dashboard.home' },
      label: t('layout.dashboardHome'),
      icon: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-8.5Z',
      visible: true,
    },
    {
      to: { name: 'surveys.list' },
      label: t('surveys.list.title'),
      icon: 'M7 4h8l4 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm6 0v5h5',
      visible: true,
    },
    {
      to: { name: 'templates.list' },
      label: t('templates.list.title'),
      icon: 'M4 4h7v7H4Zm9 0h7v4h-7Zm0 6h7v10h-7ZM4 13h7v7H4Z',
      visible: auth.hasPermission('surveys.view'),
    },
    {
      to: { name: 'contacts.list' },
      label: t('contacts.list.title'),
      icon: 'M16 11a4 4 0 1 1-4-4 4 4 0 0 1 4 4Zm-4 2a7 7 0 0 0-7 7h14a7 7 0 0 0-7-7Z',
      visible: auth.hasPermission('contacts.manage'),
    },
    {
      to: { name: 'contact-groups.list' },
      label: t('contactGroups.list.title'),
      icon: 'M7 7a3 3 0 1 1 3 3 3 3 0 0 1-3-3Zm10 0a3 3 0 1 1 3 3 3 3 0 0 1-3-3Zm-7 11a5 5 0 0 1 10 0Zm-5 0a4 4 0 0 1 6-3.4',
      visible: auth.hasPermission('groups.manage'),
    },
    {
      to: { name: 'campaigns.list' },
      label: t('campaigns.list.title'),
      icon: 'M3 11 21 4l-3 16-7-4-3 4Z',
      visible: auth.hasPermission('campaigns.send'),
    },
    {
      to: { name: 'billing.transactions' },
      label: t('billing.nav'),
      icon: 'M3 7h18v10H3Zm0 4h18M7 15h3',
      visible: auth.hasPermission('billing.view'),
    },
    {
      to: { name: 'billing.tokens' },
      label: t('billingTokens.nav'),
      icon: 'M12 2 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7Z M9 12h6',
      visible: auth.hasPermission('billing.view'),
    },
    {
      to: { name: 'settings.account' },
      label: t('settings.nav'),
      icon: 'M12 8a4 4 0 1 0 4 4 4 4 0 0 0-4-4Zm9 4-2 1 1 2-2 2-2-1-1 2h-4l-1-2-2 1-2-2 1-2-2-1v-2l2-1-1-2 2-2 2 1 1-2h4l1 2 2-1 2 2-1 2 2 1Z',
      visible: true,
    },
  ];
  return items.filter((item) => item.visible);
});

const adminItems = computed(() => {
  if (!auth.isSuperAdmin) return [];
  return [
    {
      to: { name: 'admin.home' },
      label: t('adminPanel.nav'),
      icon: 'M12 3 3 7v5c0 5 3.5 9 9 10 5.5-1 9-5 9-10V7Z',
    },
    {
      to: { name: 'admin.tenants.list' },
      label: t('adminPanel.tenants.title'),
      icon: 'M4 21V8l8-5 8 5v13h-5v-6h-6v6Z',
      nested: true,
    },
    {
      to: { name: 'admin.tokens' },
      label: t('adminTokens.nav'),
      icon: 'M12 2 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7Z',
      nested: true,
    },
  ];
});

const sidebarLabel = computed(() =>
  isSidebarCollapsed.value ? t('layout.expandNav') : t('layout.collapseNav'),
);
</script>

<template>
  <div
    class="dashboard-layout"
    :class="{
      'dashboard-layout--collapsed': isSidebarCollapsed && isDesktop,
      'dashboard-layout--mobile-open': isSidebarOpen && !isDesktop,
    }"
  >
    <a class="skip-link" href="#main">{{ t('layout.skipToContent') }}</a>

    <header class="dashboard-layout__topbar">
      <button
        type="button"
        class="dashboard-layout__icon-button dashboard-layout__nav-toggle"
        :aria-expanded="isSidebarOpen"
        aria-controls="dashboard-sidebar"
        :aria-label="t('layout.toggleNav')"
        @click="toggleMobileSidebar"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d="M4 6h16M4 12h16M4 18h16"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </button>
      <button
        type="button"
        class="dashboard-layout__icon-button dashboard-layout__collapse-toggle"
        :aria-pressed="isSidebarCollapsed"
        aria-controls="dashboard-sidebar"
        :aria-label="sidebarLabel"
        :title="sidebarLabel"
        @click="toggleSidebarCollapse"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path v-if="isSidebarCollapsed" d="M5 5h3v14H5zM10 12l6-5v10z" fill="currentColor" />
          <path v-else d="M16 5h3v14h-3zM14 12 8 7v10z" fill="currentColor" />
        </svg>
      </button>
      <RouterLink :to="{ name: 'dashboard.home' }" class="dashboard-layout__brand">
        <span class="dashboard-layout__brand-mark" aria-hidden="true">{{
          APP_NAME.charAt(0)
        }}</span>
        <span class="dashboard-layout__brand-text">{{ APP_NAME }}</span>
      </RouterLink>
      <div class="dashboard-layout__user">
        <span class="dashboard-layout__user-name">{{ userName }}</span>
        <span class="dashboard-layout__user-role">{{ userRole }}</span>
        <AppButton variant="ghost" size="sm" @click="handleLogout">
          {{ t('dashboard.logout') }}
        </AppButton>
      </div>
    </header>

    <aside
      id="dashboard-sidebar"
      class="dashboard-layout__sidebar"
      :aria-label="t('layout.primaryNav')"
      :data-collapsed="isSidebarCollapsed && isDesktop ? 'true' : 'false'"
    >
      <nav class="dashboard-layout__nav">
        <RouterLink
          v-for="item in navItems"
          :key="item.label"
          :to="item.to"
          class="dashboard-layout__nav-link"
          :title="isSidebarCollapsed && isDesktop ? item.label : undefined"
          @click="closeMobileSidebar"
        >
          <svg
            class="dashboard-layout__nav-icon"
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <path :d="item.icon" stroke="currentColor" stroke-width="1.6" fill="none" />
          </svg>
          <span class="dashboard-layout__nav-label">{{ item.label }}</span>
        </RouterLink>
        <template v-if="adminItems.length">
          <hr class="dashboard-layout__nav-divider" aria-hidden="true" />
          <RouterLink
            v-for="item in adminItems"
            :key="item.label"
            :to="item.to"
            class="dashboard-layout__nav-link"
            :class="{ 'dashboard-layout__nav-link--nested': item.nested }"
            :title="isSidebarCollapsed && isDesktop ? item.label : undefined"
            @click="closeMobileSidebar"
          >
            <svg
              class="dashboard-layout__nav-icon"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path :d="item.icon" stroke="currentColor" stroke-width="1.6" fill="none" />
            </svg>
            <span class="dashboard-layout__nav-label">{{ item.label }}</span>
          </RouterLink>
        </template>
      </nav>
      <div v-if="tenantName" class="dashboard-layout__tenant">
        <small>{{ tenantName }}</small>
      </div>
    </aside>

    <div
      v-if="isSidebarOpen && !isDesktop"
      class="dashboard-layout__scrim"
      aria-hidden="true"
      @click="closeMobileSidebar"
    ></div>

    <main id="main" class="dashboard-layout__main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.dashboard-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: var(--layout-sidebar-width) 1fr;
  grid-template-rows: var(--layout-topbar-height) 1fr;
  grid-template-areas:
    'topbar topbar'
    'sidebar main';
  background: var(--color-surface-muted);
}

.dashboard-layout--collapsed {
  grid-template-columns: var(--layout-sidebar-collapsed-width, 4.5rem) 1fr;
}

.dashboard-layout__topbar {
  grid-area: topbar;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-5);
  position: sticky;
  top: 0;
  z-index: 40;
}

.dashboard-layout__icon-button {
  background: transparent;
  border: 0;
  color: var(--color-text);
  cursor: pointer;
  border-radius: var(--radius-sm);
  padding: var(--space-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.dashboard-layout__icon-button svg {
  width: 1.25rem;
  height: 1.25rem;
}

.dashboard-layout__icon-button:hover,
.dashboard-layout__icon-button:focus-visible {
  background: var(--color-surface-muted);
}

.dashboard-layout__icon-button:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.dashboard-layout__nav-toggle {
  display: none;
}

.dashboard-layout__brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  text-decoration: none;
  color: var(--color-text);
  font-weight: 600;
}

.dashboard-layout__brand-mark {
  background: var(--color-primary-600);
  color: var(--color-on-primary);
  border-radius: var(--radius-sm);
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
}

.dashboard-layout__user {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
}

.dashboard-layout__user-name {
  font-weight: 500;
}

.dashboard-layout__user-role {
  color: var(--color-text-muted);
  font-size: var(--font-size-sm);
  text-transform: capitalize;
}

.dashboard-layout__sidebar {
  grid-area: sidebar;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border);
  padding: var(--space-4) var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  position: sticky;
  top: var(--layout-topbar-height);
  align-self: start;
  height: calc(100vh - var(--layout-topbar-height));
  overflow-y: auto;
  z-index: 20;
  transition: width 150ms ease;
}

.dashboard-layout__nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.dashboard-layout__nav-link {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  text-decoration: none;
  font-weight: 500;
  white-space: nowrap;
}

.dashboard-layout__nav-icon {
  flex: 0 0 1.25rem;
  width: 1.25rem;
  height: 1.25rem;
  color: var(--color-text-muted);
}

.dashboard-layout__nav-link.router-link-active,
.dashboard-layout__nav-link.router-link-exact-active {
  background: var(--color-primary-50);
  color: var(--color-primary-700);
}

.dashboard-layout__nav-link.router-link-active .dashboard-layout__nav-icon,
.dashboard-layout__nav-link.router-link-exact-active .dashboard-layout__nav-icon {
  color: var(--color-primary-700);
}

.dashboard-layout__nav-link:hover {
  background: var(--color-surface-muted);
}

.dashboard-layout__nav-link:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.dashboard-layout__nav-link--nested {
  padding-left: var(--space-5);
}

.dashboard-layout__nav-divider {
  border: 0;
  border-top: 1px solid var(--color-border);
  margin: var(--space-2) 0;
}

.dashboard-layout__tenant {
  margin-top: auto;
  color: var(--color-text-muted);
  padding-left: var(--space-2);
}

.dashboard-layout__main {
  grid-area: main;
  padding: var(--space-6);
  min-width: 0;
}

.dashboard-layout__scrim {
  position: fixed;
  inset: var(--layout-topbar-height) 0 0 0;
  background: rgba(15, 23, 42, 0.4);
  z-index: 15;
}

.dashboard-layout__collapse-toggle {
  display: inline-flex;
}

/* Collapsed (desktop) — show only icons. */
.dashboard-layout--collapsed .dashboard-layout__sidebar {
  padding-inline: var(--space-2);
}

.dashboard-layout--collapsed .dashboard-layout__nav-label,
.dashboard-layout--collapsed .dashboard-layout__tenant {
  display: none;
}

.dashboard-layout--collapsed .dashboard-layout__nav-link {
  justify-content: center;
  padding-inline: var(--space-2);
}

@media (max-width: 768px) {
  .dashboard-layout,
  .dashboard-layout--collapsed {
    grid-template-columns: 1fr;
    grid-template-areas:
      'topbar'
      'main';
  }
  .dashboard-layout__nav-toggle {
    display: inline-flex;
  }
  .dashboard-layout__collapse-toggle {
    display: none;
  }
  .dashboard-layout__sidebar {
    position: fixed;
    inset: var(--layout-topbar-height) 0 0 0;
    transform: translateX(-100%);
    transition: transform 150ms ease;
    width: 16rem;
    height: calc(100vh - var(--layout-topbar-height));
  }
  .dashboard-layout--mobile-open .dashboard-layout__sidebar {
    transform: translateX(0);
    box-shadow: var(--shadow-lg);
  }
  .dashboard-layout__user-role {
    display: none;
  }
}
</style>
