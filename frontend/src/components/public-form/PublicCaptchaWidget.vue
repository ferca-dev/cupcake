<script setup>
// Cloudflare Turnstile renderer. Loads the official script lazily and
// mounts the widget once the script signals it is ready. The component only
// renders when the public form metadata indicates the survey requires a
// CAPTCHA and a site key is provided — otherwise nothing is mounted, keeping
// surveys that do not opt in CAPTCHA-free.
//
// `tokenChange` emits the verified token (or null on reset/expiry). The
// parent posts it to the backend as `captchaToken`. The backend remains the
// source of truth — a missing or invalid token is rejected even if the
// widget thinks it succeeded.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  provider: { type: String, default: 'none' },
  siteKey: { type: String, default: null },
  theme: { type: String, default: 'light' },
});

const emit = defineEmits(['tokenChange', 'ready', 'error']);

const containerRef = ref(null);
const widgetId = ref(null);
const scriptLoaded = ref(false);
const scriptError = ref(false);

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

const ensureScript = () =>
  new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('window unavailable'));
      return;
    }
    if (window.turnstile) {
      resolve(window.turnstile);
      return;
    }
    let script = document.querySelector(`script[data-cupcake-turnstile]`);
    if (!script) {
      script = document.createElement('script');
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.cupcakeTurnstile = 'true';
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error('Turnstile script loaded without exposing the API'));
    });
    script.addEventListener('error', () => reject(new Error('Failed to load Turnstile script')));
  });

const renderWidget = async () => {
  if (props.provider !== 'turnstile') return;
  if (!props.siteKey) return;
  if (!containerRef.value) return;

  try {
    const turnstile = await ensureScript();
    scriptLoaded.value = true;
    widgetId.value = turnstile.render(containerRef.value, {
      sitekey: props.siteKey,
      theme: props.theme,
      callback: (token) => emit('tokenChange', token),
      'expired-callback': () => emit('tokenChange', null),
      'error-callback': () => {
        emit('tokenChange', null);
        emit('error');
      },
    });
    emit('ready');
  } catch (err) {
    scriptError.value = true;
    emit('error', err);
  }
};

const resetWidget = () => {
  if (typeof window === 'undefined') return;
  if (!window.turnstile || !widgetId.value) return;
  try {
    window.turnstile.reset(widgetId.value);
  } catch {
    // Cloudflare's runtime occasionally throws if the widget is torn down
    // mid-reset. Recovery is a full re-render on the next mount, which
    // happens automatically when the parent updates the key.
  }
};

defineExpose({ reset: resetWidget });

onMounted(renderWidget);

onBeforeUnmount(() => {
  if (typeof window !== 'undefined' && window.turnstile && widgetId.value) {
    try {
      window.turnstile.remove(widgetId.value);
    } catch {
      // Same recovery rationale as resetWidget.
    }
  }
});

watch(
  () => [props.provider, props.siteKey],
  () => {
    scriptError.value = false;
    renderWidget();
  },
);
</script>

<template>
  <div v-if="provider === 'turnstile' && siteKey" class="public-captcha" data-testid="captcha-widget">
    <div ref="containerRef" class="public-captcha__container" />
    <p v-if="scriptError" class="public-captcha__error" role="alert">
      <slot name="error" />
    </p>
    <p v-else-if="!scriptLoaded" class="public-captcha__hint">
      <slot name="loading" />
    </p>
  </div>
</template>

<style scoped>
.public-captcha {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.public-captcha__hint,
.public-captcha__error {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-muted);
}

.public-captcha__error {
  color: var(--color-danger, #b00020);
}
</style>
