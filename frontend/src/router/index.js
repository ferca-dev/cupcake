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
import SurveyReportsView from '../features/reports/SurveyReportsView.vue';
import ContactListView from '../views/contacts/ContactListView.vue';
import ContactGroupListView from '../views/contacts/ContactGroupListView.vue';
import SuppressionListView from '../views/contacts/SuppressionListView.vue';
import CampaignListView from '../views/campaigns/CampaignListView.vue';
import CampaignDetailView from '../views/campaigns/CampaignDetailView.vue';
import TemplateListView from '../views/templates/TemplateListView.vue';
import TransactionHistoryView from '../views/billing/TransactionHistoryView.vue';
import TokenWalletView from '../views/billing/TokenWalletView.vue';
import BuyTokensView from '../views/billing/BuyTokensView.vue';
import SubscriptionsView from '../views/billing/SubscriptionsView.vue';
import PaymentStatusView from '../views/billing/PaymentStatusView.vue';
import AdminDashboardView from '../views/admin/AdminDashboardView.vue';
import TenantListView from '../views/admin/TenantListView.vue';
import TenantCreateView from '../views/admin/TenantCreateView.vue';
import TenantDetailView from '../views/admin/TenantDetailView.vue';
import TokenSettingsView from '../views/admin/TokenSettingsView.vue';
import PaymentsAdminView from '../views/admin/PaymentsAdminView.vue';
import PlansAdminView from '../views/admin/PlansAdminView.vue';
import PlanView from '../views/billing/PlanView.vue';
import SettingsView from '../views/settings/SettingsView.vue';
import TeamManagementView from '../views/team/TeamManagementView.vue';
import AcceptInvitationView from '../views/auth/AcceptInvitationView.vue';
import ForbiddenView from '../views/ForbiddenView.vue';
import NotFoundView from '../views/NotFoundView.vue';
import PublicFormView from '../views/public/PublicFormView.vue';
import EmailUnsubscribeView from '../views/public/EmailUnsubscribeView.vue';

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
      {
        path: 'accept-invitation',
        name: 'auth.acceptInvitation',
        component: AcceptInvitationView,
        // No `requiresGuest` — the page handles the "already signed in" case
        // itself so a deep-linked invite from email still renders.
        meta: { title: 'Accept invitation' },
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
          layout: 'full',
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
        path: 'surveys/:id/reports',
        name: 'surveys.reports',
        component: SurveyReportsView,
        meta: {
          title: 'Survey reports',
          requiresAuth: true,
          permissions: ['responses.view'],
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
        path: 'suppression-list',
        name: 'suppression.list',
        component: SuppressionListView,
        meta: {
          title: 'Suppression list',
          requiresAuth: true,
          permissions: ['contacts.manage'],
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
      {
        path: 'billing/tokens',
        name: 'billing.tokens',
        component: TokenWalletView,
        meta: {
          title: 'Token wallet',
          requiresAuth: true,
          permissions: ['billing.view'],
        },
      },
      {
        path: 'billing/buy-tokens',
        name: 'billing.buyTokens',
        component: BuyTokensView,
        meta: {
          title: 'Buy tokens',
          requiresAuth: true,
          permissions: ['billing.view'],
        },
      },
      {
        path: 'billing/subscriptions',
        name: 'billing.subscriptions',
        component: SubscriptionsView,
        meta: {
          title: 'Subscriptions',
          requiresAuth: true,
          permissions: ['billing.view'],
        },
      },
      {
        path: 'billing/payment/success',
        name: 'billing.payment.success',
        component: PaymentStatusView,
        props: { outcome: 'success' },
        meta: {
          title: 'Payment successful',
          requiresAuth: true,
          permissions: ['billing.view'],
        },
      },
      {
        path: 'billing/payment/failure',
        name: 'billing.payment.failure',
        component: PaymentStatusView,
        props: { outcome: 'failure' },
        meta: {
          title: 'Payment failed',
          requiresAuth: true,
          permissions: ['billing.view'],
        },
      },
      {
        path: 'billing/payment/pending',
        name: 'billing.payment.pending',
        component: PaymentStatusView,
        props: { outcome: 'pending' },
        meta: {
          title: 'Payment pending',
          requiresAuth: true,
          permissions: ['billing.view'],
        },
      },
      {
        path: 'settings',
        name: 'settings.account',
        component: SettingsView,
        meta: {
          title: 'Account settings',
          requiresAuth: true,
          layout: 'reading',
        },
      },
      {
        path: 'team',
        name: 'team.manage',
        component: TeamManagementView,
        meta: {
          title: 'Team',
          requiresAuth: true,
          permissions: ['users.manage'],
        },
      },
      {
        path: 'admin',
        name: 'admin.home',
        component: AdminDashboardView,
        meta: {
          title: 'Admin dashboard',
          requiresAuth: true,
          roles: ['super_admin'],
        },
      },
      {
        path: 'admin/tenants',
        name: 'admin.tenants.list',
        component: TenantListView,
        meta: {
          title: 'Clients',
          requiresAuth: true,
          roles: ['super_admin'],
        },
      },
      {
        path: 'admin/tenants/new',
        name: 'admin.tenants.create',
        component: TenantCreateView,
        meta: {
          title: 'New client',
          requiresAuth: true,
          roles: ['super_admin'],
          layout: 'reading',
        },
      },
      {
        path: 'admin/tenants/:id',
        name: 'admin.tenants.detail',
        component: TenantDetailView,
        meta: {
          title: 'Client',
          requiresAuth: true,
          roles: ['super_admin'],
          layout: 'reading',
        },
      },
      {
        path: 'admin/tokens',
        name: 'admin.tokens',
        component: TokenSettingsView,
        meta: {
          title: 'Token settings',
          requiresAuth: true,
          roles: ['super_admin'],
        },
      },
      {
        path: 'admin/payments',
        name: 'admin.payments',
        component: PaymentsAdminView,
        meta: {
          title: 'Mercado Pago',
          requiresAuth: true,
          roles: ['super_admin'],
        },
      },
      {
        path: 'admin/plans',
        name: 'admin.plans',
        component: PlansAdminView,
        meta: {
          title: 'Plans',
          requiresAuth: true,
          roles: ['super_admin'],
        },
      },
      {
        path: 'billing/plan',
        name: 'billing.plan',
        component: PlanView,
        meta: {
          title: 'Plan',
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
    path: '/unsubscribe/email/:token',
    component: PublicFormLayout,
    children: [
      {
        path: '',
        name: 'public.unsubscribe.email',
        component: EmailUnsubscribeView,
        meta: { title: 'Email unsubscribe', public: true },
      },
    ],
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
