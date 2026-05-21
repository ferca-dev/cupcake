import { createApp } from 'vue';
import { createPinia } from 'pinia';

import App from './App.vue';
import { createRouter } from './router/index.js';
import { useAuthStore } from './stores/auth.store.js';

import './styles/theme.css';
import './styles/global.css';
import './styles/layout.css';
import './styles/utilities.css';

const bootstrap = async () => {
  const app = createApp(App);
  const pinia = createPinia();
  app.use(pinia);

  document.title = import.meta.env.VITE_APP_NAME || 'Cupcake';

  // Hydrate the auth store from persisted tokens before installing the router
  // so the first guard evaluation has accurate session state.
  const auth = useAuthStore();
  await auth.initialize();

  const router = createRouter();
  app.use(router);
  await router.isReady();

  app.mount('#app');
};

bootstrap().catch((err) => {
  console.error('Failed to bootstrap application', err);
});
