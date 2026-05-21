<script setup>
import { RouterLink, RouterView, useRouter } from 'vue-router';
import { computed, ref } from 'vue';

import { useAuthStore } from '../stores/auth.store.js';
import { useI18n } from '../i18n/index.js';
import { APP_NAME } from '../config/env.js';
import AppButton from '../components/ui/AppButton.vue';

const auth = useAuthStore();
const router = useRouter();
const { t } = useI18n();
const isSidebarOpen = ref(false);

const tenantName = computed(() => auth.tenant?.name ?? '');
const userName = computed(() => auth.displayName);
const userRole = computed(() => auth.role ?? '');

const toggleSidebar = () => {
  isSidebarOpen.value = !isSidebarOpen.value;
};

const handleLogout = async () => {
  await auth.logout();
  router.push({ name: 'auth.login' });
};
</script>

<template>
  <div class="dashboard-layout" :class="{ 'dashboard-layout--open': isSidebarOpen }">
    <a class="skip-link" href="#main">{{ t('layout.skipToContent') }}</a>

    <header class="dashboard-layout__topbar">
      <button
        type="button"
        class="dashboard-layout__nav-toggle"
        :aria-expanded="isSidebarOpen"
        aria-controls="dashboard-sidebar"
        :aria-label="t('common.actions')"
        @click="toggleSidebar"
      >
        <span aria-hidden="true">☰</span>
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

    <aside id="dashboard-sidebar" class="dashboard-layout__sidebar" aria-label="Primary">
      <nav class="dashboard-layout__nav">
        <RouterLink :to="{ name: 'dashboard.home' }" class="dashboard-layout__nav-link">
          {{ t('dashboard.welcome', { name: '' }).trim() || 'Dashboard' }}
        </RouterLink>
        <RouterLink :to="{ name: 'surveys.list' }" class="dashboard-layout__nav-link">
          {{ t('surveys.list.title') }}
        </RouterLink>
        <RouterLink
          v-if="auth.hasPermission('contacts.manage')"
          :to="{ name: 'contacts.list' }"
          class="dashboard-layout__nav-link"
        >
          {{ t('contacts.list.title') }}
        </RouterLink>
        <RouterLink
          v-if="auth.hasPermission('groups.manage')"
          :to="{ name: 'contact-groups.list' }"
          class="dashboard-layout__nav-link"
        >
          {{ t('contactGroups.list.title') }}
        </RouterLink>
        <RouterLink
          v-if="auth.hasPermission('campaigns.send')"
          :to="{ name: 'campaigns.list' }"
          class="dashboard-layout__nav-link"
        >
          {{ t('campaigns.list.title') }}
        </RouterLink>
      </nav>
      <div v-if="tenantName" class="dashboard-layout__tenant">
        <small>{{ tenantName }}</small>
      </div>
    </aside>

    <main id="main" class="dashboard-layout__main">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.dashboard-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 16rem 1fr;
  grid-template-rows: 4rem 1fr;
  grid-template-areas:
    'topbar topbar'
    'sidebar main';
  background: var(--color-surface-muted);
}

.dashboard-layout__topbar {
  grid-area: topbar;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: 0 var(--space-5);
}

.dashboard-layout__nav-toggle {
  display: none;
  background: transparent;
  border: 0;
  font-size: 1.25rem;
  cursor: pointer;
  color: var(--color-text);
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
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.dashboard-layout__nav {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.dashboard-layout__nav-link {
  display: block;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-text);
  text-decoration: none;
  font-weight: 500;
}

.dashboard-layout__nav-link.router-link-exact-active {
  background: var(--color-primary-50);
  color: var(--color-primary-700);
}

.dashboard-layout__nav-link:hover {
  background: var(--color-surface-muted);
}

.dashboard-layout__tenant {
  margin-top: auto;
  color: var(--color-text-muted);
}

.dashboard-layout__main {
  grid-area: main;
  padding: var(--space-6);
  min-width: 0;
}

@media (max-width: 768px) {
  .dashboard-layout {
    grid-template-columns: 1fr;
    grid-template-areas:
      'topbar'
      'main';
  }
  .dashboard-layout__nav-toggle {
    display: inline-flex;
  }
  .dashboard-layout__sidebar {
    position: fixed;
    inset: 4rem 0 0 0;
    transform: translateX(-100%);
    transition: transform 150ms ease;
    width: 16rem;
    z-index: 10;
  }
  .dashboard-layout--open .dashboard-layout__sidebar {
    transform: translateX(0);
    box-shadow: var(--shadow-lg);
  }
  .dashboard-layout__user-role {
    display: none;
  }
}
</style>
