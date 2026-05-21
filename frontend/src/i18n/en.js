// English string bundle. Keep keys grouped by feature so the catalogue stays
// scannable. Use `t('section.key', { value })` from the helper in
// `src/i18n/index.js` and never inline user-facing strings inside components.

export default {
  app: {
    tagline: 'Survey and form platform for modern teams',
    poweredBy: 'Powered by',
  },
  common: {
    loading: 'Loading…',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    close: 'Close',
    submit: 'Submit',
    back: 'Back',
    next: 'Next',
    required: 'Required',
    optional: 'Optional',
    yes: 'Yes',
    no: 'No',
    search: 'Search',
    actions: 'Actions',
    empty: 'Nothing to show yet.',
    error: 'Something went wrong.',
  },
  auth: {
    login: {
      title: 'Sign in to {appName}',
      subtitle: 'Welcome back. Enter your credentials to continue.',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      submit: 'Sign in',
      noAccount: 'Need an account?',
      registerCta: 'Create one',
      forgotCta: 'Forgot your password?',
    },
    register: {
      title: 'Create your {appName} workspace',
      subtitle: 'Sign up to start collecting responses in minutes.',
      nameLabel: 'Your name',
      tenantNameLabel: 'Workspace name',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      submit: 'Create account',
      hasAccount: 'Already have an account?',
      loginCta: 'Sign in',
      passwordHint: 'Use at least 8 characters.',
    },
    forgot: {
      title: 'Recover your account',
      subtitle: 'Enter your email and we will send instructions to reset your password.',
      emailLabel: 'Email',
      submit: 'Send instructions',
      backToLogin: 'Back to sign in',
      successHint:
        'If an account exists for that email, you will receive a message with the next steps.',
    },
    errors: {
      generic: 'We could not complete that request. Please try again.',
      invalidCredentials: 'Invalid email or password.',
      networkError: 'We could not reach the server. Check your connection and try again.',
      sessionExpired: 'Your session has expired. Please sign in again.',
    },
  },
  dashboard: {
    welcome: 'Welcome, {name}',
    summary: 'You are signed in as {role} for {tenant}.',
    placeholder:
      'This is the dashboard shell. Feature panels (surveys, contacts, campaigns, analytics) will be wired up in later phases.',
    logout: 'Sign out',
  },
  layout: {
    skipToContent: 'Skip to main content',
  },
  notFound: {
    title: 'Page not found',
    subtitle: 'The page you were looking for does not exist or has moved.',
    backHome: 'Go home',
  },
  validation: {
    required: 'This field is required.',
    email: 'Enter a valid email address.',
    minLength: 'Must be at least {min} characters.',
    maxLength: 'Must be at most {max} characters.',
    slug: 'Only lowercase letters, numbers, and hyphens are allowed.',
  },
};
