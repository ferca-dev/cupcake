import { createMemoryHistory, createRouter as createVueRouter, createWebHistory } from 'vue-router';

import { navigationGuard } from './guards.js';
import { APP_NAME } from '../config/env.js';

import AuthLayout from '../layouts/AuthLayout.vue';
import DashboardLayout from '../layouts/DashboardLayout.vue';
import PublicFormLayout from '../layouts/PublicFormLayout.vue';

import LoginView from '../views/auth/LoginView.vue';
import RegisterView from '../views/auth/RegisterView.vue';
import ForgotPasswordView from '../views/auth/ForgotPasswordView.vue';
import DashboardView from '../views/dashboard/DashboardView.vue';
import SurveyListView from '../views/surveys/SurveyListView.vue';
import SurveyBuilderView from '../views/surveys/SurveyBuilderView.vue';
import SurveyStatsView from '../features/dashboard/SurveyStatsView.vue';
import ContactListView from '../views/contacts/ContactListView.vue';
import ContactGroupListView from '../views/contacts/ContactGroupListView.vue';
import CampaignListView from '../views/campaigns/CampaignListView.vue';
import CampaignDetailView from '../views/campaigns/CampaignDetailView.vue';
import TemplateListView from '../views/templates/TemplateListView.vue';
import TransactionHistoryView from '../views/billing/TransactionHistoryView.vue';
import ForbiddenView from '../views/ForbiddenView.vue';
import NotFoundView from '../views/NotFoundView.vue';
import PublicFormView from '../views/public/PublicFormView.vue';

export const routes = [
  {
    path: '/',
    redirect: () => ({ name: 'dashboard.home' }),
  },
  {
    path: '/auth',
    component: AuthLayout,
    meta: { requiresGuest: true },
    children: [
      {
        path: '',
        redirect: { name: 'auth.login' },
      },
      {
        path: 'login',
        name: 'auth.login',
        component: LoginView,
        meta: { title: 'Sign in', requiresGuest: true },
      },
      {
        path: 'register',
        name: 'auth.register',
        component: RegisterView,
        meta: { title: 'Create account', requiresGuest: true },
      },
      {
        path: 'forgot-password',
        name: 'auth.forgot',
        component: ForgotPasswordView,
        meta: { title: 'Recover account', requiresGuest: true },
      },
    ],
  },
  {
    path: '/app',
    component: DashboardLayout,
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'dashboard.home',
        component: DashboardView,
        meta: { title: 'Dashboard', requiresAuth: true },
      },
      {
        path: 'surveys',
        name: 'surveys.list',
        component: SurveyListView,
        meta: {
          title: 'Surveys',
          requiresAuth: true,
          permissions: ['surveys.view'],
        },
      },
      {
        path: 'surveys/:id/edit',
        name: 'surveys.builder',
        component: SurveyBuilderView,
        meta: {
          title: 'Edit survey',
          requiresAuth: true,
          permissions: ['surveys.update'],
        },
      },
      {
        path: 'surveys/:id/stats',
        name: 'surveys.stats',
        component: SurveyStatsView,
        meta: {
          title: 'Survey stats',
          requiresAuth: true,
          permissions: ['dashboard.view'],
        },
      },
      {
        path: 'contacts',
        name: 'contacts.list',
        component: ContactListView,
        meta: {
          title: 'Contacts',
          requiresAuth: true,
          permissions: ['contacts.manage'],
        },
      },
      {
        path: 'contact-groups',
        name: 'contact-groups.list',
        component: ContactGroupListView,
        meta: {
          title: 'Contact groups',
          requiresAuth: true,
          permissions: ['groups.manage'],
        },
      },
      {
        path: 'campaigns',
        name: 'campaigns.list',
        component: CampaignListView,
        meta: {
          title: 'Campaigns',
          requiresAuth: true,
          permissions: ['campaigns.send'],
        },
      },
      {
        path: 'templates',
        name: 'templates.list',
        component: TemplateListView,
        meta: {
          title: 'Templates',
          requiresAuth: true,
          permissions: ['surveys.view'],
        },
      },
      {
        path: 'campaigns/:id',
        name: 'campaigns.detail',
        component: CampaignDetailView,
        meta: {
          title: 'Campaign',
          requiresAuth: true,
          permissions: ['campaigns.send'],
        },
      },
      {
        path: 'billing/transactions',
        name: 'billing.transactions',
        component: TransactionHistoryView,
        meta: {
          title: 'Billing history',
          requiresAuth: true,
          permissions: ['billing.view'],
        },
      },
    ],
  },
  {
    path: '/forbidden',
    name: 'forbidden',
    component: ForbiddenView,
    meta: { title: 'Forbidden' },
  },
  {
    path: '/f/:slug',
    component: PublicFormLayout,
    children: [
      {
        path: '',
        name: 'public.form',
        component: PublicFormView,
        meta: { title: 'Form', public: true },
      },
      {
        path: 'r/:submissionToken',
        name: 'public.form.token',
        component: PublicFormView,
        meta: { title: 'Form', public: true },
      },
    ],
  },
  {
    path: '/forms/:slug',
    redirect: (to) => ({ name: 'public.form', params: { slug: to.params.slug } }),
  },
  {
    path: '/forms/:slug/r/:submissionToken',
    redirect: (to) => ({
      name: 'public.form.token',
      params: {
        slug: to.params.slug,
        submissionToken: to.params.submissionToken,
      },
    }),
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundView,
    meta: { title: 'Page not found' },
  },
];

export const createRouter = (options = {}) => {
  const history =
    options.history ?? (import.meta.env?.SSR ? createMemoryHistory() : createWebHistory());
  const router = createVueRouter({
    history,
    routes: options.routes ?? routes,
    scrollBehavior: () => ({ top: 0 }),
  });

  router.beforeEach(navigationGuard);

  router.afterEach((to) => {
    const segment = to.meta?.title;
    if (typeof document !== 'undefined') {
      document.title = segment ? `${segment} · ${APP_NAME}` : APP_NAME;
    }
  });

  return router;
};
