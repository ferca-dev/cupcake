<script setup>
// Inline status pill. `variant` picks the colour scheme.
defineProps({
  variant: {
    type: String,
    default: 'neutral',
    validator: (value) =>
      ['neutral', 'info', 'success', 'warning', 'danger', 'primary'].includes(value),
  },
});
</script>

<template>
  <span class="app-badge" :class="`app-badge--${variant}`">
    <slot />
  </span>
</template>

<style scoped>
.app-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: var(--font-size-xs);
  font-weight: 600;
  line-height: 1.4;
}

.app-badge--neutral {
  background: var(--color-surface-muted);
  color: var(--color-text);
}
.app-badge--info {
  background: var(--color-primary-50);
  color: var(--color-primary-700);
}
.app-badge--primary {
  background: var(--color-primary-600);
  color: var(--color-on-primary);
}
.app-badge--success {
  background: var(--color-success-100);
  color: var(--color-success-700);
}
.app-badge--warning {
  background: var(--color-warning-100);
  color: var(--color-warning-700);
}
.app-badge--danger {
  background: var(--color-danger-100);
  color: var(--color-danger-700);
}
</style>
