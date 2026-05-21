<script setup>
// Reusable button. Props:
//   - variant: visual style. `primary` | `secondary` | `ghost` | `danger`
//   - size:    `sm` | `md` | `lg`
//   - type:    native button type
//   - loading: shows a spinner and disables the button
//   - disabled: standard disabled state
//   - fullWidth: stretches the button to its parent
// Slots:
//   - default: button label
//   - leading/trailing: optional icons
import { computed } from 'vue';

const props = defineProps({
  variant: {
    type: String,
    default: 'primary',
    validator: (value) => ['primary', 'secondary', 'ghost', 'danger'].includes(value),
  },
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
  type: { type: String, default: 'button' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  fullWidth: { type: Boolean, default: false },
});

const classes = computed(() => [
  'app-button',
  `app-button--${props.variant}`,
  `app-button--${props.size}`,
  { 'app-button--full': props.fullWidth, 'app-button--loading': props.loading },
]);

const isDisabled = computed(() => props.disabled || props.loading);
</script>

<template>
  <button :type="type" :class="classes" :disabled="isDisabled" :aria-busy="loading || undefined">
    <span v-if="loading" class="app-button__spinner" aria-hidden="true" />
    <span v-if="$slots.leading" class="app-button__leading"><slot name="leading" /></span>
    <span class="app-button__label"><slot /></span>
    <span v-if="$slots.trailing" class="app-button__trailing"><slot name="trailing" /></span>
  </button>
</template>

<style scoped>
.app-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition:
    background-color 120ms ease,
    border-color 120ms ease,
    color 120ms ease;
  white-space: nowrap;
}

.app-button:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 2px;
}

.app-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.app-button--sm {
  padding: 0.375rem 0.75rem;
  font-size: var(--font-size-sm);
}
.app-button--md {
  padding: 0.5rem 1rem;
  font-size: var(--font-size-md);
}
.app-button--lg {
  padding: 0.625rem 1.25rem;
  font-size: var(--font-size-lg);
}

.app-button--full {
  width: 100%;
}

.app-button--primary {
  background: var(--color-primary-600);
  color: var(--color-on-primary);
}
.app-button--primary:hover:not(:disabled) {
  background: var(--color-primary-700);
}

.app-button--secondary {
  background: var(--color-surface);
  color: var(--color-text);
  border-color: var(--color-border);
}
.app-button--secondary:hover:not(:disabled) {
  background: var(--color-surface-muted);
}

.app-button--ghost {
  background: transparent;
  color: var(--color-text);
}
.app-button--ghost:hover:not(:disabled) {
  background: var(--color-surface-muted);
}

.app-button--danger {
  background: var(--color-danger-600);
  color: var(--color-on-danger);
}
.app-button--danger:hover:not(:disabled) {
  background: var(--color-danger-700);
}

.app-button__spinner {
  width: 0.9em;
  height: 0.9em;
  border: 2px solid currentColor;
  border-bottom-color: transparent;
  border-radius: 50%;
  animation: app-button-spin 0.7s linear infinite;
}

@keyframes app-button-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
