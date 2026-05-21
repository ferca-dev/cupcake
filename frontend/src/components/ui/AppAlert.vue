<script setup>
// Inline alert/banner. Used by forms to surface backend errors and inline
// notifications. `variant`s map onto status colours.
defineProps({
  variant: {
    type: String,
    default: 'info',
    validator: (value) => ['info', 'success', 'warning', 'error'].includes(value),
  },
  title: { type: String, default: '' },
});
</script>

<template>
  <div class="app-alert" :class="`app-alert--${variant}`" role="alert">
    <strong v-if="title" class="app-alert__title">{{ title }}</strong>
    <p class="app-alert__body"><slot /></p>
  </div>
</template>

<style scoped>
.app-alert {
  border-radius: var(--radius-md);
  padding: var(--space-3) var(--space-4);
  border: 1px solid transparent;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.app-alert__title {
  font-size: var(--font-size-sm);
}

.app-alert__body {
  margin: 0;
  font-size: var(--font-size-sm);
}

.app-alert--info {
  background: var(--color-primary-50);
  color: var(--color-primary-700);
  border-color: var(--color-primary-200);
}
.app-alert--success {
  background: var(--color-success-100);
  color: var(--color-success-700);
  border-color: var(--color-success-200);
}
.app-alert--warning {
  background: var(--color-warning-100);
  color: var(--color-warning-700);
  border-color: var(--color-warning-200);
}
.app-alert--error {
  background: var(--color-danger-100);
  color: var(--color-danger-700);
  border-color: var(--color-danger-200);
}
</style>
