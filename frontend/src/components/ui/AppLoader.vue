<script setup>
// Spinner indicator. Use inline (`size="sm"`) for buttons or as a page-level
// placeholder while data loads.
defineProps({
  size: {
    type: String,
    default: 'md',
    validator: (value) => ['sm', 'md', 'lg'].includes(value),
  },
  label: { type: String, default: 'Loading' },
});
</script>

<template>
  <span class="app-loader" :class="`app-loader--${size}`" role="status" :aria-label="label">
    <span class="app-loader__spinner" aria-hidden="true" />
    <span class="visually-hidden">{{ label }}</span>
  </span>
</template>

<style scoped>
.app-loader {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.app-loader__spinner {
  border-radius: 50%;
  border-style: solid;
  border-color: var(--color-border);
  border-top-color: var(--color-primary-600);
  animation: app-loader-spin 0.7s linear infinite;
}

.app-loader--sm .app-loader__spinner {
  width: 1rem;
  height: 1rem;
  border-width: 2px;
}
.app-loader--md .app-loader__spinner {
  width: 1.5rem;
  height: 1.5rem;
  border-width: 3px;
}
.app-loader--lg .app-loader__spinner {
  width: 2.25rem;
  height: 2.25rem;
  border-width: 4px;
}

@keyframes app-loader-spin {
  to {
    transform: rotate(360deg);
  }
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
